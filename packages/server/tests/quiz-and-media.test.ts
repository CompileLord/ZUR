import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { CourseService } from '../src/services/course-service.ts';
import { CourseStructureService } from '../src/services/course-structure-service.ts';
import { MediaService } from '../src/services/media-service.ts';
import { QuizService } from '../src/services/quiz-service.ts';
import { ExerciseAuthoringService } from '../src/services/exercise-authoring-service.ts';
import { ValidationError, NotFoundError } from 'zur-shared';

test('Media Assets, Quizzes & Python Exercises (T033, T036, T037, T039)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const courseService = new CourseService(db);
  const structureService = new CourseStructureService(db);
  const mediaService = new MediaService(db, 'data/test-uploads');
  const quizService = new QuizService(db);
    const exerciseService = new ExerciseAuthoringService(db);

  const authorId = 'user-author-1'; // Seeded author: Charles Babbage
  const studentId = 'user-student-1'; // Seeded student: Ada Lovelace

  // Create a course for Charles
  const course = courseService.createCourseDraft(authorId, {
    title: 'Computer Architecture Fundamentals',
  });
  const courseTree = structureService.getCourseTree(authorId, course.id);
  const lessonId = courseTree.modules[0].lessons[0].id;

  await t.test('T033: Media asset upload, validation (size, MIME), and dimensions', () => {
    // 1. Valid PNG upload
    // Create a 1x1 PNG dummy buffer
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, // IHDR length
      0x49, 0x48, 0x44, 0x52, // IHDR
      0x00, 0x00, 0x02, 0x80, // width: 640
      0x00, 0x00, 0x01, 0xe0, // height: 480
      0x08, 0x06, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);

    const asset = mediaService.uploadAsset(authorId, course.id, {
      buffer: pngBuffer,
      filename: 'diagram.png',
      mimeType: 'image/png',
      altText: 'Block diagram of arithmetic logic unit',
      caption: 'Figure 1.1: ALU Architecture',
    });

    assert.ok(asset.id);
    assert.equal(asset.mimeType, 'image/png');
    assert.equal(asset.altText, 'Block diagram of arithmetic logic unit');
    assert.equal(asset.isDecorative, false);
    assert.equal(asset.processingStatus, 'ready');
    assert.equal(asset.dimensions?.width, 640);
    assert.equal(asset.dimensions?.height, 480);

    // 2. Reject SVG (PRD §11: Do not allow SVG uploads in P0)
    assert.throws(
      () => {
        mediaService.uploadAsset(authorId, course.id, {
          buffer: Buffer.from('<svg></svg>'),
          filename: 'image.svg',
          mimeType: 'image/svg+xml',
        });
      },
      ValidationError,
      'Must reject SVG upload'
    );

    // 3. Reject file exceeding 5 MiB
    assert.throws(
      () => {
        const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6 MiB
        mediaService.uploadAsset(authorId, course.id, {
          buffer: largeBuffer,
          filename: 'huge.png',
          mimeType: 'image/png',
        });
      },
      ValidationError,
      'Must reject files larger than 5 MiB'
    );

    // 4. Update asset metadata
    const updated = mediaService.updateAssetMetadata(authorId, asset.id, {
      altText: 'Updated ALU diagram',
      caption: 'Figure 1.1 revised',
    });
    assert.equal(updated.altText, 'Updated ALU diagram');

    const now = new Date().toISOString();
    const mediaVersionId = 'version-media-access';
    db.prepare('INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at) VALUES (?, ?, 2, ?, ?)').run(mediaVersionId, course.id, JSON.stringify({ modules: [{ lessons: [{ steps: [{ content: { markdownContent: `![diagram](zur-asset:${asset.id})` } }] }] }] }), now);
    db.prepare("UPDATE courses SET visibility = 'private', publication_status = 'published', current_version_id = ? WHERE id = ?").run(mediaVersionId, course.id);
    db.prepare("INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at) VALUES ('enr-media-active', ?, ?, ?, 'active', ?, ?)").run('user-student-2', course.id, mediaVersionId, now, now);

    assert.equal(mediaService.getAssetFile(asset.id, { userId: authorId, capabilities: ['student', 'author'], isSuspended: false }).mimeType, 'image/png');
    assert.equal(mediaService.getAssetFile(asset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }).mimeType, 'image/png');
    const unreferencedAsset = mediaService.uploadAsset(authorId, course.id, { buffer: pngBuffer, filename: 'private-unused.png', mimeType: 'image/png', altText: 'Private unused image' });
    assert.throws(() => mediaService.getAssetFile(unreferencedAsset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }), NotFoundError, 'enrolled students cannot fetch unrelated private uploads');
    assert.throws(() => mediaService.getAssetFile(asset.id, { userId: 'user-student-1', capabilities: ['student'], isSuspended: false }), NotFoundError, 'another enrollment cannot authorize access to this course asset');
    assert.throws(() => mediaService.getAssetFile(asset.id, { userId: null, capabilities: ['student'], isSuspended: false }), NotFoundError);
    db.prepare("UPDATE enrollments SET status = 'revoked', updated_at = ? WHERE id = 'enr-media-active'").run(now);
    assert.throws(() => mediaService.getAssetFile(asset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }), NotFoundError);
  });

  let quizStepId = '';

  await t.test('T036: Quiz creation, validation rules, and answer-key stripping', () => {
    // Add quiz step
    const step = structureService.addStep(authorId, course.id, lessonId, {
      title: 'Logic Gates Checkpoint',
      type: 'quiz',
    });
    quizStepId = step.id;

    // 1. Author updates quiz definition
    const updated = quizService.updateQuiz(authorId, quizStepId, 1, {
      kind: 'quiz',
      quizType: 'single_choice',
      prompt: 'Which logic gate outputs 1 only when both inputs are 1?',
      options: [
        { id: 'opt-and', text: 'AND Gate', isCorrect: true },
        { id: 'opt-or', text: 'OR Gate', isCorrect: false },
        { id: 'opt-xor', text: 'XOR Gate', isCorrect: false },
      ],
      explanation: 'An AND gate requires both inputs to be high.',
    });

    assert.equal(updated.revision, 2);
    assert.equal(updated.quiz.options.length, 3);

    // 2. Invalid quiz: single choice with 2 correct answers rejected
    assert.throws(
      () => {
        quizService.updateQuiz(authorId, quizStepId, 2, {
          kind: 'quiz',
          quizType: 'single_choice',
          prompt: 'Question',
          options: [
            { id: '1', text: 'A', isCorrect: true },
            { id: '2', text: 'B', isCorrect: true },
          ],
        });
      },
      ValidationError,
      'Single choice must have exactly 1 correct answer'
    );

    // 3. Student view strips isCorrect flags (PRD §11.2)
    const studentView = quizService.getStudentQuiz(quizStepId);
    assert.equal(studentView.title, 'Logic Gates Checkpoint');
    assert.equal(studentView.options.length, 3);
    for (const opt of studentView.options) {
      assert.equal((opt as any).isCorrect, undefined, 'isCorrect must be stripped for students');
    }
  });

  await t.test('T036: Quiz exact-set grading, attempt recording, and preview isolation', () => {
    // Create version and enrollment for Ada
    const versionId = 'version-arch-1';
    db.prepare(
      `INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at)
       VALUES (?, ?, 1, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    ).run(versionId, course.id, JSON.stringify({ modules: [{ lessons: [{ steps: [{ id: quizStepId, type: 'quiz' }] }] }] }));

    const enrollmentId = 'enroll-ada-arch';
    db.prepare(
      `INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    ).run(enrollmentId, studentId, course.id, versionId);

    // 1. Wrong answer
    const failResult = quizService.gradeQuiz(studentId, enrollmentId, quizStepId, ['opt-or'], false);
    assert.equal(failResult.verdict, 'WRONG_ANSWER');
    assert.equal(failResult.isPassed, false);
    assert.equal(failResult.explanation, undefined, 'Must not disclose explanation before passing');
    assert.equal(failResult.correctOptionIds, undefined, 'Must not disclose correct answer key');

    // 2. Correct answer
    const passResult = quizService.gradeQuiz(studentId, enrollmentId, quizStepId, ['opt-and'], false);
    assert.equal(passResult.verdict, 'PASSED');
    assert.equal(passResult.isPassed, true);
    assert.ok(passResult.explanation?.includes('AND gate requires both inputs'));
    assert.deepEqual(passResult.correctOptionIds, ['opt-and']);

    const attemptsCountAfterPass = (
      db.prepare('SELECT COUNT(*) as cnt FROM assessment_attempts WHERE step_id = ?').get(quizStepId) as any
    ).cnt;
    assert.equal(attemptsCountAfterPass, 2, '2 attempts recorded');

    // Verify step progress was marked completed
    const progress = db.prepare('SELECT is_completed FROM step_progress WHERE enrollment_id = ? AND step_id = ?').get(enrollmentId, quizStepId) as any;
    assert.equal(progress?.is_completed, 1);

    // 3. Preview mode isolation: isPreview=true does not mutate database
    const previewResult = quizService.gradeQuiz(authorId, null, quizStepId, ['opt-and'], true);
    assert.equal(previewResult.verdict, 'PASSED');

    const attemptsCountAfterPreview = (
      db.prepare('SELECT COUNT(*) as cnt FROM assessment_attempts WHERE step_id = ?').get(quizStepId) as any
    ).cnt;

    assert.equal(attemptsCountAfterPreview, attemptsCountAfterPass, 'Preview mode must not write assessment attempts');
  });

  let pythonStepId = '';

  await t.test('T037: Python exercise authoring: tests, reference solution, and limits', () => {
    const step = structureService.addStep(authorId, course.id, lessonId, {
      title: 'Sum of Two Numbers',
      type: 'python',
    });
    pythonStepId = step.id;

    // Update exercise definition with public and hidden tests
    const exercise = exerciseService.updateExercise(authorId, pythonStepId, 1, {
      title: 'Sum of Two Numbers',
      problemStatement: 'Read two integers a and b from stdin and print their sum.',
      inputFormat: 'Two space-separated integers on a single line.',
      outputFormat: 'A single integer representing the sum.',
      constraints: '-1000 <= a, b <= 1000',
      starterCode: 'import sys\n# Complete the solution\n',
      referenceSolution: 'import sys\na, b = map(int, sys.stdin.read().split())\nprint(a + b)\n',
      hints: ['Use sys.stdin.read().split() to read integers', 'Use the + operator'],
      solutionExplanation: 'The problem can be solved by reading whitespace-separated tokens and casting to int.',
      runtimeLimits: {
        cpuTimeoutSeconds: 2,
        wallTimeoutSeconds: 5,
        memoryLimitMib: 64,
      },
      publicTests: [
        { stdin: '2 3\n', expectedStdout: '5\n' },
        { stdin: '10 -5\n', expectedStdout: '5\n' },
      ],
      hiddenTests: [
        { stdin: '0 0\n', expectedStdout: '0\n' },
        { stdin: '1000 1000\n', expectedStdout: '2000\n' },
      ],
    });

    assert.equal(exercise.revision, 2);
    assert.equal(exercise.publicTests.length, 2);
    assert.equal(exercise.hiddenTests.length, 2);
    assert.equal(exercise.runtimeLimits.cpuTimeoutSeconds, 2);

    // Author payload includes reference solution and hidden tests
    const authorPayload = exerciseService.getAuthorExercise(authorId, pythonStepId);
    assert.ok(authorPayload.referenceSolution.includes('print(a + b)'));
    assert.equal(authorPayload.hiddenTests.length, 2);
  });

  await t.test('T039: Student preview payload strips hidden tests and reference solution', () => {
    const studentPayload = exerciseService.getStudentExercise(pythonStepId);
    assert.equal((studentPayload as any).referenceSolution, undefined, 'Student payload must NOT contain reference solution');
    assert.equal(studentPayload.publicTests.length, 2);
    assert.equal((studentPayload as any).hiddenTests, undefined, 'Student payload must NOT contain hidden tests');
    assert.equal(studentPayload.problemStatement, 'Read two integers a and b from stdin and print their sum.');
  });
});
