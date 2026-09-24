import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { CourseService } from '../src/services/course-service.ts';
import { CourseStructureService } from '../src/services/course-structure-service.ts';
import { CourseValidationService } from '../src/services/course-validation-service.ts';
import { CoursePublicationService } from '../src/services/course-publication-service.ts';
import { EnrollmentService } from '../src/services/enrollment-service.ts';
import { InvitationService } from '../src/services/invitation-service.ts';
import { LearningProgressService } from '../src/services/learning-progress-service.ts';
import { QuizService } from '../src/services/quiz-service.ts';
import { ExecutionService } from '../src/services/execution-service.ts';

test('Task T052: Mixed-lesson vertical slice verification (Phase B exit)', async () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const courseService = new CourseService(db);
  const structureService = new CourseStructureService(db);
  const validationService = new CourseValidationService(db);
  const publicationService = new CoursePublicationService(db);
  const enrollmentService = new EnrollmentService(db);
  const invitationService = new InvitationService(db, enrollmentService);
  const progressService = new LearningProgressService(db);
  const quizService = new QuizService(db);
  const executionService = new ExecutionService(db);

  const authorId = 'user-author-1'; // Guido van Rossum
  const studentId = 'user-student-1'; // Ada Lovelace

  // 1. Author creates draft course
  const course = courseService.createCourseDraft(authorId, {
    title: 'Python Mastery: Functions & Data',
  });
  const courseId = course.id;

  courseService.updateCourseMetadata(authorId, courseId, 1, {
    description: 'Learn function anatomy, video walkthroughs, conceptual checks, and real code execution.',
    difficulty: 'beginner',
    language: 'en',
    learningOutcomes: ['Define functions', 'Pass parameters', 'Return computed values'],
    estimatedDurationMinutes: 60,
  });

  courseService.updateCourseAccessSettings(authorId, courseId, {
    visibility: 'unlisted',
    enrollmentPolicy: 'invitation_only',
  });

  const tree = structureService.getCourseTree(authorId, courseId);
  const lessonId = tree.modules[0].lessons[0].id;
  // Step 1: Initial theory step created with draft
  const theoryStepId = tree.modules[0].lessons[0].steps[0].id;
  structureService.updateStep(authorId, courseId, theoryStepId, {
    title: 'Understanding Python Functions',
    isRequired: true,
  });

  db.prepare(
    `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
     VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
  ).run(
    'sc-theory-vslice',
    theoryStepId,
    JSON.stringify({
      kind: 'theory',
      markdown: '## Python Functions\nFunctions allow reusability and encapsulation in Python.',
    })
  );

  // 2. Add Step 2: Video step
  const videoStep = structureService.addStep(authorId, courseId, lessonId, {
    title: 'Function Execution Walkthrough',
    type: 'video',
    isRequired: true,
    estimatedDurationMinutes: 10,
  });
  const videoStepId = videoStep.id;

  db.prepare(
    `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
     VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
  ).run(
    'sc-video-vslice',
    videoStepId,
    JSON.stringify({
      kind: 'video',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      provider: 'youtube',
      transcript: 'In this video, we trace the Python execution stack during a function call.',
      captionVerified: true,
    })
  );

  // 3. Add Step 3: Quiz step
  const quizStep = structureService.addStep(authorId, courseId, lessonId, {
    title: 'Function Return Values Quiz',
    type: 'quiz',
    isRequired: true,
    estimatedDurationMinutes: 5,
  });
  const quizStepId = quizStep.id;

  db.prepare(
    `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
     VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
  ).run(
    'sc-quiz-vslice',
    quizStepId,
    JSON.stringify({
      kind: 'quiz',
      quizType: 'single_choice',
      prompt: 'What does a Python function return by default if no return statement is specified?',
      options: [
        { id: 'opt-none', text: 'None', isCorrect: true },
        { id: 'opt-zero', text: '0', isCorrect: false },
        { id: 'opt-error', text: 'It raises an error', isCorrect: false },
      ],
      explanation: 'In Python, functions without an explicit return statement implicitly return None.',
    })
  );

  // 4. Add Step 4: Python exercise step
  const pyStep = structureService.addStep(authorId, courseId, lessonId, {
    title: 'Double the Integer',
    type: 'python',
    isRequired: true,
    estimatedDurationMinutes: 15,
  });
  const pyStepId = pyStep.id;

  db.prepare(
    `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
     VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
  ).run(
    'sc-py-vslice',
    pyStepId,
    JSON.stringify({
      kind: 'python',
      problemStatement: 'Read an integer from standard input and print its double.',
      inputFormat: 'A single integer.',
      outputFormat: 'The doubled integer.',
      constraints: '-10^6 <= n <= 10^6',
      starterCode: 'import sys\n# Read input and print double\n',
      referenceSolution: 'import sys\nval = int(sys.stdin.read().strip())\nprint(val * 2)\n',
      hints: ['Use int() to parse input', 'Multiply by 2 and print'],
      solutionExplanation: 'Multiply the integer by 2 using the * operator.',
      runtimeLimits: {
        cpuTimeoutSeconds: 5,
        wallTimeoutSeconds: 10,
        memoryLimitMib: 64,
      },
    })
  );

  // Add test cases for Python step (1 public, 1 hidden)
  db.prepare(`
    INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
    VALUES ('tc-pub-1', ?, '5', '10', 0, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  `).run(pyStepId);

  db.prepare(`
    INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
    VALUES ('tc-hid-1', ?, '-12', '-24', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  `).run(pyStepId);

  // 5. Author validates draft and reference solution
  const valResult = await validationService.validateCourseDraft(authorId, courseId);
  assert.strictEqual(valResult.isValid, true, 'Course must pass all validations');
  assert.strictEqual(valResult.errors.length, 0);

  // 6. Author publishes Version 1
  const draftRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as any;
  const pub = await publicationService.publishCourse(authorId, courseId, {
    expectedRevision: draftRow.draft_revision,
    changeSummary: 'Version 1.0 Release with 4 mixed steps',
  });
  const version1Id = pub.versionId;
  assert.strictEqual(pub.versionNumber, 1);

  // 7. Author creates shareable link invite
  const { invitation, token } = invitationService.createInvitation(authorId, courseId, {
    type: 'shareable_link',
    maxUses: 10,
  });
  assert.ok(token);

  // 8. Student accepts invite and enrolls in Version 1
  const acceptResult = invitationService.acceptInvitation(studentId, token);
  assert.strictEqual(acceptResult.success, true);
  const enrollmentId = acceptResult.enrollment.id;
  assert.strictEqual(acceptResult.enrollment.pinnedVersionId, version1Id);

  // Check initial progress: 0 of 4 required completed (0%)
  let prog = progressService.getCourseProgress(studentId, enrollmentId);
  assert.strictEqual(prog.totalRequired, 4);
  assert.strictEqual(prog.completedRequired, 0);
  assert.strictEqual(prog.percentage, 0);
  assert.strictEqual(prog.isCompleted, false);
  assert.strictEqual(prog.nextIncompleteStepId, theoryStepId);

  // 9. Student completes Theory step
  progressService.markStepComplete(studentId, enrollmentId, theoryStepId);
  prog = progressService.getCourseProgress(studentId, enrollmentId);
  assert.strictEqual(prog.completedRequired, 1);
  assert.strictEqual(prog.percentage, 25);
  assert.strictEqual(prog.nextIncompleteStepId, videoStepId);

  // 10. Student completes Video step
  progressService.markStepComplete(studentId, enrollmentId, videoStepId);
  prog = progressService.getCourseProgress(studentId, enrollmentId);
  assert.strictEqual(prog.completedRequired, 2);
  assert.strictEqual(prog.percentage, 50);
  assert.strictEqual(prog.nextIncompleteStepId, quizStepId);

  // 11. Student attempts Quiz with wrong answer
  const wrongQuiz = quizService.gradeQuiz(studentId, enrollmentId, quizStepId, ['opt-zero'], false);
  assert.strictEqual(wrongQuiz.isPassed, false);
  assert.strictEqual(wrongQuiz.verdict, 'WRONG_ANSWER');
  assert.strictEqual(wrongQuiz.explanation, undefined, 'Must not leak explanation on failure');

  prog = progressService.getCourseProgress(studentId, enrollmentId);
  assert.strictEqual(prog.completedRequired, 2, 'Quiz failure does not advance progress');

  // Student retries Quiz with correct answer
  const rightQuiz = quizService.gradeQuiz(studentId, enrollmentId, quizStepId, ['opt-none'], false);
  assert.strictEqual(rightQuiz.isPassed, true);
  assert.strictEqual(rightQuiz.verdict, 'PASSED');
  assert.ok(rightQuiz.explanation?.includes('implicitly return None'));

  prog = progressService.getCourseProgress(studentId, enrollmentId);
  assert.strictEqual(prog.completedRequired, 3);
  assert.strictEqual(prog.percentage, 75);
  assert.strictEqual(prog.nextIncompleteStepId, pyStepId);

  // 12. Student runs samples for Python step
  const sampleCode = `
import sys
val = int(sys.stdin.read().strip())
print(val * 2)
`;
  const sampleRun = await executionService.executeJobSynchronously({
    userId: studentId,
    enrollmentId,
    stepId: pyStepId,
    jobType: 'run_samples',
    code: sampleCode,
  });
  assert.strictEqual(sampleRun.result.verdict, 'PASSED');

  // Run samples must NOT complete progress
  prog = progressService.getCourseProgress(studentId, enrollmentId);
  assert.strictEqual(prog.completedRequired, 3);

  // 13. Student submits solution for Python step
  const submitRun = await executionService.executeJobSynchronously({
    userId: studentId,
    enrollmentId,
    stepId: pyStepId,
    jobType: 'submit',
    code: sampleCode,
  });
  assert.strictEqual(submitRun.result.verdict, 'PASSED');

  // 14. Verify Course Progress reaches 100% completion!
  prog = progressService.getCourseProgress(studentId, enrollmentId);
  assert.strictEqual(prog.completedRequired, 4);
  assert.strictEqual(prog.totalRequired, 4);
  assert.strictEqual(prog.percentage, 100);
  assert.strictEqual(prog.isCompleted, true);
  assert.strictEqual(prog.nextIncompleteStepId, null);

  const advStep = structureService.addStep(authorId, courseId, lessonId, {
    title: 'Advanced Recursion Theory',
    type: 'theory',
    isRequired: true,
    estimatedDurationMinutes: 10,
  });

  db.prepare(
    `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
     VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
  ).run(
    'sc-adv-vslice',
    advStep.id,
    JSON.stringify({
      kind: 'theory',
      markdown: '## Advanced Recursion\nRecursion requires a base case and recursive step.',
    })
  );

  const updatedDraft = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as any;
  const pub2 = await publicationService.publishCourse(authorId, courseId, {
    expectedRevision: updatedDraft.draft_revision,
    changeSummary: 'Version 2.0 with advanced recursion',
  });
  const version2Id = pub2.versionId;
  assert.strictEqual(pub2.versionNumber, 2);

  // 16. Verify existing student remains pinned to Version 1 with 100% completion preserved
  const studentEnr = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(enrollmentId) as any;
  assert.strictEqual(studentEnr.pinned_version_id, version1Id);
  assert.notStrictEqual(studentEnr.pinned_version_id, version2Id);

  // Student progress calculation against pinned Version 1 is still 100%
  const studentProgAfterV2 = progressService.getCourseProgress(studentId, enrollmentId);
  assert.strictEqual(studentProgAfterV2.pinnedVersionNumber, 1);
  assert.strictEqual(studentProgAfterV2.totalRequired, 4);
  assert.strictEqual(studentProgAfterV2.completedRequired, 4);
  assert.strictEqual(studentProgAfterV2.percentage, 100);
  assert.strictEqual(studentProgAfterV2.isCompleted, true);

  // Student attempts remain intact
  const attempts = db
    .prepare('SELECT * FROM assessment_attempts WHERE enrollment_id = ?')
    .all(enrollmentId);
  assert.ok(attempts.length >= 3); // 2 quiz attempts + 1 python submit attempt
});
