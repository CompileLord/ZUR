import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
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
  const testUploadDir = path.join(os.tmpdir(), 'zur-test-uploads');
  const mediaService = new MediaService(db, testUploadDir);
  const quizService = new QuizService(db);
    const exerciseService = new ExerciseAuthoringService(db);

  const authorId = 'user-author-1'; // Seeded author: Charles Babbage
  const studentId = 'user-student-1'; // Seeded student: Ada Lovelace

  await t.test('Pinned quiz answers stay immutable and draft quiz access requires authorization', () => {
    const pinned = quizService.getStudentQuiz(studentId, 'enr-ada', 'step-3-quiz-single');
    assert.equal(pinned.prompt, 'Which of the following correctly assigns the integer 10 to variable `n` in Python?');
    assert.throws(() => quizService.getStudentQuiz(studentId, null, 'step-3-quiz-single'), NotFoundError);
    assert.throws(() => quizService.getStudentQuiz('user-student-2', 'enr-ada', 'step-3-quiz-single'), NotFoundError);
    const current = quizService.getAuthorQuiz(authorId, 'step-3-quiz-single');
    quizService.updateQuiz(authorId, 'step-3-quiz-single', current.revision, {
      ...current.quiz,
      prompt: 'Unpublished changed question',
      options: current.quiz.options.map(option => ({ ...option, isCorrect: option.id === 'opt-2' })),
    });
    assert.equal(quizService.getStudentQuiz(studentId, 'enr-ada', 'step-3-quiz-single').prompt, pinned.prompt);
    assert.equal(quizService.gradeQuiz(studentId, 'enr-ada', 'step-3-quiz-single', ['opt-1']).isPassed, true);
    assert.equal(quizService.gradeQuiz(studentId, 'enr-ada', 'step-3-quiz-single', ['opt-2']).isPassed, false);
  });

  // Create a course for Charles
  const course = courseService.createCourseDraft(authorId, {
    title: 'Computer Architecture Fundamentals',
  });
  const courseTree = structureService.getCourseTree(authorId, course.id);
  const lessonId = courseTree.modules[0].lessons[0].id;

  await t.test('T033: Media asset upload, validation (size, MIME), and dimensions', () => {
    // 1. Valid PNG upload
    // Complete 1x1 PNG; header-only files must never be marked ready.
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC', 'base64');

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
    assert.equal(asset.dimensions?.width, 1);
    assert.equal(asset.dimensions?.height, 1);

    assert.throws(() => mediaService.uploadAsset(authorId, course.id, {
      buffer: pngBuffer.subarray(0, 33), filename: 'truncated.png', mimeType: 'image/png',
    }), ValidationError, 'Header-only PNG must fail a full decode');

    // 2. Reject SVG (PRD §11: Do not allow SVG uploads in P0)
    assert.throws(
      () => {
        mediaService.uploadAsset(authorId, course.id, {
          buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
          filename: 'image.svg',
          mimeType: 'image/svg+xml',
        });
      },
      ValidationError,
      'Must reject SVG upload'
    );

    // 3. Reject file exceeding 10 MB budget (PRD §11)
    assert.throws(
      () => {
        const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB
        mediaService.uploadAsset(authorId, course.id, {
          buffer: largeBuffer,
          filename: 'huge.png',
          mimeType: 'image/png',
        });
      },
      (err: any) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /10 MB limit/);
        return true;
      }
    );

    // 4. Reject spoofed content type / malformed bytes without fallback dimensions
    assert.throws(
      () => {
        mediaService.uploadAsset(authorId, course.id, {
          buffer: Buffer.from('Not a real PNG but claiming to be one'),
          filename: 'fake.png',
          mimeType: 'image/png',
        });
      },
      (err: any) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /Invalid image/);
        return true;
      }
    );

    // 5. Valid JPEG upload with decoded dimensions
    const jpegBuffer = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');
    const jpegAsset = mediaService.uploadAsset(authorId, course.id, {
      buffer: jpegBuffer,
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      altText: 'Sample photo',
    });
    assert.equal(jpegAsset.mimeType, 'image/jpeg');
    assert.equal(jpegAsset.dimensions?.width, 1);
    assert.equal(jpegAsset.dimensions?.height, 1);
    assert.equal(jpegAsset.processingStatus, 'ready');

    // 6. Valid WebP upload with decoded dimensions
    const webpBuffer = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAA=', 'base64');
    const webpAsset = mediaService.uploadAsset(authorId, course.id, {
      buffer: webpBuffer,
      filename: 'diagram.webp',
      mimeType: 'image/webp',
      altText: 'WebP diagram',
    });
    assert.equal(webpAsset.mimeType, 'image/webp');
    assert.equal(webpAsset.dimensions?.width, 1);
    assert.equal(webpAsset.dimensions?.height, 1);
    assert.equal(webpAsset.processingStatus, 'ready');

    // 7. Reject MIME mismatch (JPEG claiming to be PNG)
    assert.throws(
      () => {
        mediaService.uploadAsset(authorId, course.id, {
          buffer: jpegBuffer,
          filename: 'photo.png',
          mimeType: 'image/png',
        });
      },
      ValidationError,
      'Must reject MIME mismatch'
    );

    // 8. Reject decompression limit violation (> 25 megapixels)
    const giantPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x17, 0x70, // width: 6000
      0x00, 0x00, 0x13, 0x88, // height: 5000 (30 megapixels > 25 MP limit)
      0x08, 0x06, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);
    assert.throws(
      () => {
        mediaService.uploadAsset(authorId, course.id, {
          buffer: giantPngBuffer,
          filename: 'giant.png',
          mimeType: 'image/png',
        });
      },
      (err: any) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /25 megapixels/);
        return true;
      }
    );

    // 4. Update asset metadata
    const updated = mediaService.updateAssetMetadata(authorId, asset.id, {
      altText: 'Updated ALU diagram',
      caption: 'Figure 1.1 revised',
    });
    assert.equal(updated.altText, 'Updated ALU diagram');

    const privateExerciseAsset = mediaService.uploadAsset(authorId, course.id, {
      buffer: pngBuffer, filename: 'private-exercise-only.png', mimeType: 'image/png', altText: 'Private exercise fixture',
    });
    const snapshotMetadataAsset = mediaService.uploadAsset(authorId, course.id, {
      buffer: pngBuffer, filename: 'snapshot-metadata-only.png', mimeType: 'image/png', altText: 'Private snapshot metadata fixture',
    });
    const now = new Date().toISOString();
    const mediaVersionId = 'version-media-access';
    const mediaSnapshot = {
      internalMediaMetadata: `zur-asset:${snapshotMetadataAsset.id}`,
      modules: [{ lessons: [{ steps: [{
        id: 'step-media-visible',
        type: 'python',
        content: {
          markdownContent: `![diagram](zur-asset:${asset.id})`,
          referenceSolution: `print('zur-asset:${privateExerciseAsset.id}')`,
          testCases: [{ id: 'hidden-case', isHidden: true, expectedStdout: `zur-asset:${privateExerciseAsset.id}` }],
        },
      }] }] }],
    };
    db.prepare('INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at) VALUES (?, ?, 2, ?, ?)').run(mediaVersionId, course.id, JSON.stringify(mediaSnapshot), now);
    db.prepare("UPDATE courses SET visibility = 'private', publication_status = 'published', current_version_id = ? WHERE id = ?").run(mediaVersionId, course.id);
    db.prepare("INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at) VALUES ('enr-media-active', ?, ?, ?, 'active', ?, ?)").run('user-student-2', course.id, mediaVersionId, now, now);

    assert.equal(mediaService.getAssetFile(asset.id, { userId: authorId, capabilities: ['student', 'author'], isSuspended: false }).mimeType, 'image/png');
    assert.equal(mediaService.getAssetFile(asset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }).mimeType, 'image/png');
    const unreferencedAsset = mediaService.uploadAsset(authorId, course.id, { buffer: pngBuffer, filename: 'private-unused.png', mimeType: 'image/png', altText: 'Private unused image' });
    assert.throws(() => mediaService.getAssetFile(unreferencedAsset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }), NotFoundError, 'enrolled students cannot fetch unrelated private uploads');
    assert.throws(() => mediaService.getAssetFile(privateExerciseAsset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }), NotFoundError, 'hidden Python solution/test data and step metadata do not authorize student media access');
    assert.throws(() => mediaService.getAssetFile(snapshotMetadataAsset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }), NotFoundError, 'snapshot-level metadata does not authorize student media access');
    assert.throws(() => mediaService.getAssetFile(asset.id, { userId: 'user-student-1', capabilities: ['student'], isSuspended: false }), NotFoundError, 'another enrollment cannot authorize access to this course asset');
    assert.throws(() => mediaService.getAssetFile(asset.id, { userId: null, capabilities: ['student'], isSuspended: false }), NotFoundError);

    const currentAsset = mediaService.uploadAsset(authorId, course.id, { buffer: pngBuffer, filename: 'current-version.png', mimeType: 'image/png', altText: 'Current version image' });
    const currentVersionId = 'version-media-current';
    db.prepare('INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at) VALUES (?, ?, 3, ?, ?)').run(currentVersionId, course.id, JSON.stringify({ modules: [{ lessons: [{ steps: [{ content: { markdown: `![diagram](zur-asset:${currentAsset.id})` } }] }] }] }), now);
    db.prepare("UPDATE courses SET visibility = 'public', current_version_id = ? WHERE id = ?").run(currentVersionId, course.id);
    db.prepare("INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at) VALUES ('enr-media-current', 'user-student-3', ?, ?, 'active', ?, ?)").run(course.id, currentVersionId, now, now);
    assert.equal(mediaService.getAssetFile(asset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }).mimeType, 'image/png', 'existing learners use references in their pinned version after publication advances');
    assert.throws(() => mediaService.getAssetFile(asset.id, { userId: 'user-student-3', capabilities: ['student'], isSuspended: false }), NotFoundError, 'new learners cannot use an image referenced only by an older version');
    assert.equal(mediaService.getAssetFile(currentAsset.id, { userId: 'user-student-3', capabilities: ['student'], isSuspended: false }).mimeType, 'image/png');
    assert.throws(() => mediaService.getAssetFile(currentAsset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }), NotFoundError, 'existing learners cannot use an image that only exists in the latest version');
    assert.throws(() => mediaService.getAssetFile(currentAsset.id, { userId: 'user-student-1', capabilities: ['student'], isSuspended: false }), NotFoundError, 'public visibility does not expose course media to non-enrolled visitors');
    assert.throws(() => mediaService.getAssetFile(currentAsset.id, { userId: null, capabilities: ['student'], isSuspended: false }), NotFoundError, 'public visibility does not expose course media to anonymous visitors');

    const processingAsset = mediaService.uploadAsset(authorId, course.id, { buffer: pngBuffer, filename: 'processing.png', mimeType: 'image/png', altText: 'Not ready yet' });
    db.prepare("UPDATE media_assets SET processing_status='processing' WHERE id=?").run(processingAsset.id);
    assert.throws(() => mediaService.getAssetFile(processingAsset.id, { userId: authorId, capabilities: ['author'], isSuspended: false }), NotFoundError, 'course owners cannot fetch a media asset before it is ready');

    const lookalikeVersionId = 'version-media-lookalike';
    db.prepare('INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at) VALUES (?, ?, 4, ?, ?)').run(lookalikeVersionId, course.id, JSON.stringify({ modules: [{ lessons: [{ steps: [{ content: { markdown: `![diagram](zur-asset:${asset.id}abc)` } }] }] }] }), now);
    db.prepare('UPDATE enrollments SET pinned_version_id = ? WHERE id = ?').run(lookalikeVersionId, 'enr-media-current');
    assert.throws(() => mediaService.getAssetFile(asset.id, { userId: 'user-student-3', capabilities: ['student'], isSuspended: false }), NotFoundError, 'a longer lookalike media identifier does not reference the asset');

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
    const studentView = quizService.getStudentQuiz(authorId, null, quizStepId, true);
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
    ).run(versionId, course.id, JSON.stringify({ modules: [{ lessons: [{ steps: [{ id: quizStepId, type: 'quiz', title: 'Logic Gates Checkpoint', content: quizService.getAuthorQuiz(authorId, quizStepId).quiz }] }] }] }));

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
