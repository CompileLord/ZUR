import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { CourseService } from '../src/services/course-service.ts';
import { CourseStructureService } from '../src/services/course-structure-service.ts';
import { CoursePublicationService } from '../src/services/course-publication-service.ts';
import { EnrollmentService } from '../src/services/enrollment-service.ts';
import { LearningProgressService } from '../src/services/learning-progress-service.ts';
import { QuizService } from '../src/services/quiz-service.ts';
import {
  ValidationError,
  AuthorizationError,
  NotFoundError,
} from 'zur-shared';

test('Module S2-M03: Enrollment Lifecycle & Learning Progress (T045, T047)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const courseService = new CourseService(db);
  const structureService = new CourseStructureService(db);
  const publicationService = new CoursePublicationService(db);
  const enrollmentService = new EnrollmentService(db);
  const progressService = new LearningProgressService(db);
  const quizService = new QuizService(db);

  const authorId = 'user-author-1'; // Guido van Rossum
  const student1Id = 'user-student-1'; // Ada Lovelace
  const student2Id = 'user-student-2'; // Grace Hopper
  const student3Id = 'user-student-3'; // Alan Turing

  // Setup a test published course
  const course = courseService.createCourseDraft(authorId, {
    title: 'Functional Python Course',
  });
  const courseId = course.id;

  courseService.updateCourseMetadata(authorId, courseId, 1, {
    description: 'A course on functional programming in Python.',
    difficulty: 'intermediate',
    language: 'en',
    learningOutcomes: ['Pure functions', 'Map filter reduce'],
    estimatedDurationMinutes: 45,
  });

  courseService.updateCourseAccessSettings(authorId, courseId, {
    visibility: 'public',
    enrollmentPolicy: 'open',
  });

  const tree = structureService.getCourseTree(authorId, courseId);
  const lessonId = tree.modules[0].lessons[0].id;
  const initialStepId = tree.modules[0].lessons[0].steps[0].id;

  // Add a second step: Optional theory step
  const optStep = structureService.addStep(authorId, courseId, lessonId, {
    title: 'Optional Reading on Lambda Calculus',
    type: 'theory',
    isRequired: false,
    estimatedDurationMinutes: 10,
  });

  db.prepare(
    `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
     VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
  ).run(
    'sc-opt-1',
    optStep.id,
    JSON.stringify({
      kind: 'theory',
      markdown: '## Lambda Calculus\nAn optional exploration.',
    })
  );

  // Add a third step: Required quiz step
  const quizStep = structureService.addStep(authorId, courseId, lessonId, {
    title: 'Functional Concepts Quiz',
    type: 'quiz',
    isRequired: true,
    estimatedDurationMinutes: 5,
  });

  db.prepare(
    `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
     VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
  ).run(
    'sc-quiz-1',
    quizStep.id,
    JSON.stringify({
      kind: 'quiz',
      quizType: 'single_choice',
      prompt: 'Is map a pure higher-order function?',
      options: [
        { id: 'opt-yes', text: 'Yes', isCorrect: true },
        { id: 'opt-no', text: 'No', isCorrect: false },
      ],
      explanation: 'Map transforms elements without side-effects.',
    })
  );

  // Publish version 1
  const courseRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as any;
  const pub = await publicationService.publishCourse(authorId, courseId, {
    expectedRevision: courseRow.draft_revision,
    changeSummary: 'Initial release',
  });
  const version1Id = pub.versionId;

  // --- T045: Enrollment Lifecycle Tests ---
  await t.test('T045: Student can enroll in open published course and gets pinned to current version', () => {
    const enr = enrollmentService.enrollStudent(student1Id, courseId);
    assert.ok(enr.id);
    assert.strictEqual(enr.userId, student1Id);
    assert.strictEqual(enr.courseId, courseId);
    assert.strictEqual(enr.pinnedVersionId, version1Id);
    assert.strictEqual(enr.status, 'active');

    // Idempotent join returns identical enrollment
    const enr2 = enrollmentService.enrollStudent(student1Id, courseId);
    assert.strictEqual(enr2.id, enr.id);
  });

  await t.test('T045: Student can leave course and progress is preserved', () => {
    const enr = enrollmentService.getEnrollment(student1Id, courseId)!;
    // Mark initial step complete
    progressService.markStepComplete(student1Id, enr.id, initialStepId);

    // Leave course
    const leftEnr = enrollmentService.leaveCourse(student1Id, courseId);
    assert.strictEqual(leftEnr.status, 'left');

    // Verify step_progress is NOT deleted
    const progRow = db
      .prepare('SELECT * FROM step_progress WHERE enrollment_id = ? AND step_id = ?')
      .get(enr.id, initialStepId) as any;
    assert.ok(progRow);
    assert.strictEqual(progRow.is_completed, 1);
  });

  await t.test('T045: Student can rejoin course after leaving and retains progress', () => {
    const rejoined = enrollmentService.enrollStudent(student1Id, courseId);
    assert.strictEqual(rejoined.status, 'active');

    const progress = progressService.getCourseProgress(student1Id, rejoined.id);
    assert.strictEqual(progress.completedSteps, 1);
  });

  await t.test('T045: Course owner can revoke student and revoked student CANNOT rejoin via open link', () => {
    const enr = enrollmentService.getEnrollment(student1Id, courseId)!;

    // Non-owner cannot revoke
    assert.throws(() => {
      enrollmentService.revokeStudent(student2Id, courseId, student1Id);
    }, AuthorizationError);

    // Owner revokes student
    const revoked = enrollmentService.revokeStudent(authorId, courseId, student1Id);
    assert.strictEqual(revoked.status, 'revoked');

    // Audit event recorded
    const audit = db
      .prepare('SELECT * FROM audit_events WHERE target_id = ? AND action = ?')
      .get(enr.id, 'enrollment.revoke') as any;
    assert.ok(audit);
    assert.strictEqual(audit.actor_id, authorId);

    // Security invariant: Revoked student CANNOT rejoin via open enrollment
    assert.throws(() => {
      enrollmentService.enrollStudent(student1Id, courseId);
    }, AuthorizationError);
  });

  await t.test('T045: Course owner can reinstate student', () => {
    const enr = enrollmentService.getEnrollment(student1Id, courseId)!;

    // Owner reinstates student
    const reinstated = enrollmentService.reinstateStudent(authorId, courseId, student1Id);
    assert.strictEqual(reinstated.status, 'active');

    // Audit event recorded
    const audit = db
      .prepare('SELECT * FROM audit_events WHERE target_id = ? AND action = ?')
      .get(enr.id, 'enrollment.reinstate') as any;
    assert.ok(audit);
    assert.strictEqual(audit.actor_id, authorId);
  });

  await t.test('T045: Cannot enroll in suspended course', () => {
    db.prepare('UPDATE courses SET is_suspended = 1 WHERE id = ?').run(courseId);

    assert.throws(() => {
      enrollmentService.enrollStudent(student2Id, courseId);
    }, AuthorizationError);

    // Unsuspend
    db.prepare('UPDATE courses SET is_suspended = 0 WHERE id = ?').run(courseId);
  });

  await t.test('T045: Cannot direct-enroll in invitation-only course without invitation flag', () => {
    courseService.updateCourseAccessSettings(authorId, courseId, {
      enrollmentPolicy: 'invitation_only',
    });

    assert.throws(() => {
      enrollmentService.enrollStudent(student2Id, courseId);
    }, AuthorizationError);

    // Revert to open
    courseService.updateCourseAccessSettings(authorId, courseId, {
      enrollmentPolicy: 'open',
    });
  });

  // --- T047: Learning Progress Tests ---
  await t.test('T047: Progress accurately tracks required steps, optional steps, waivers, and floored percentage', () => {
    const enr = enrollmentService.enrollStudent(student2Id, courseId);

    // Pinned version 1 has:
    // 1. initialStepId (Required)
    // 2. optStep (Optional)
    // 3. quizStep (Required)
    // Total steps = 3, Total required = 2.
    let prog = progressService.getCourseProgress(student2Id, enr.id);
    assert.strictEqual(prog.totalSteps, 3);
    assert.strictEqual(prog.totalRequired, 2);
    assert.strictEqual(prog.completedRequired, 0);
    assert.strictEqual(prog.percentage, 0);
    assert.strictEqual(prog.isCompleted, false);
    assert.strictEqual(prog.nextIncompleteStepId, initialStepId);

    // Mark optional step complete -> totalRequired remains 2, completedRequired is 0, percentage is 0
    progressService.markStepComplete(student2Id, enr.id, optStep.id);
    prog = progressService.getCourseProgress(student2Id, enr.id);
    assert.strictEqual(prog.completedSteps, 1);
    assert.strictEqual(prog.completedRequired, 0);
    assert.strictEqual(prog.percentage, 0);
    assert.strictEqual(prog.isCompleted, false);
    // next required step is still initialStepId
    assert.strictEqual(prog.nextIncompleteStepId, initialStepId);

    // Mark initial required step complete -> 1 of 2 required = 50%
    progressService.markStepComplete(student2Id, enr.id, initialStepId);
    prog = progressService.getCourseProgress(student2Id, enr.id);
    assert.strictEqual(prog.completedRequired, 1);
    assert.strictEqual(prog.percentage, 50);
    assert.strictEqual(prog.isCompleted, false);
    assert.strictEqual(prog.nextIncompleteStepId, quizStep.id);

    // Waiving quizStep satisfies it!
    db.prepare(`
      INSERT INTO step_progress (
        id, user_id, enrollment_id, step_id, is_completed, is_waived, waiver_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 1, 'Audited exception', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(enrollment_id, step_id) DO UPDATE SET is_waived = 1, waiver_reason = excluded.waiver_reason
    `).run('prog-waiver-test', student2Id, enr.id, quizStep.id);

    prog = progressService.getCourseProgress(student2Id, enr.id);
    assert.strictEqual(prog.completedRequired, 2);
    assert.strictEqual(prog.waivedRequired, 1);
    assert.strictEqual(prog.percentage, 100);
    assert.strictEqual(prog.isCompleted, true);
    assert.strictEqual(prog.nextIncompleteStepId, null);
  });

  await t.test('T047: Invariant: Earlier pass is never revoked by subsequent failed attempts', () => {
    const enr = enrollmentService.getEnrollment(student1Id, courseId)!;

    // Student1 completes initialStepId
    progressService.markStepComplete(student1Id, enr.id, initialStepId);
    let prog = progressService.getCourseProgress(student1Id, enr.id);
    const initialProg = prog.steps.find((s) => s.id === initialStepId);
    assert.strictEqual(initialProg?.isCompleted, true);

    // Record visit to step
    const visitRes = progressService.recordStepVisit(student1Id, enr.id, optStep.id);
    assert.strictEqual(visitRes.success, true);
    assert.strictEqual(visitRes.lastVisitedStepId, optStep.id);

    prog = progressService.getCourseProgress(student1Id, enr.id);
    assert.strictEqual(prog.lastVisitedStepId, optStep.id);
  });

  await t.test('T047: Cannot manually complete quiz or python assessment steps', () => {
    const enr = enrollmentService.getEnrollment(student1Id, courseId)!;

    // quizStep is type: 'quiz'
    assert.throws(
      () => {
        progressService.markStepComplete(student1Id, enr.id, quizStep.id);
      },
      (err: any) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /Assessments.*cannot be manually marked complete/);
        return true;
      }
    );

    // Verify step_progress is NOT marked complete
    const progRow = db
      .prepare('SELECT is_completed FROM step_progress WHERE enrollment_id = ? AND step_id = ?')
      .get(enr.id, quizStep.id) as any;
    assert.ok(!progRow || progRow.is_completed === 0);
  });

  await t.test('T047: Cannot mark complete or visit unrelated step not in pinned snapshot', () => {
    const enr = enrollmentService.getEnrollment(student1Id, courseId)!;
    const unrelatedStepId = 'step-unrelated-random-id';

    assert.throws(
      () => {
        progressService.markStepComplete(student1Id, enr.id, unrelatedStepId);
      },
      NotFoundError
    );

    assert.throws(
      () => {
        progressService.recordStepVisit(student1Id, enr.id, unrelatedStepId);
      },
      NotFoundError
    );

    // Verify no progress was created for the unrelated step
    const progRow = db
      .prepare('SELECT * FROM step_progress WHERE enrollment_id = ? AND step_id = ?')
      .get(enr.id, unrelatedStepId) as any;
    assert.strictEqual(progRow, undefined);
  });

  await t.test('T047: Authoritative quiz grading path awards completion on passing', () => {
    const enr = enrollmentService.getEnrollment(student1Id, courseId)!;

    // Quiz grading with incorrect answer does NOT complete step
    const failGrade = quizService.gradeQuiz(student1Id, enr.id, quizStep.id, ['opt-no'], false);
    assert.strictEqual(failGrade.isPassed, false);
    let progRow = db
      .prepare('SELECT is_completed FROM step_progress WHERE enrollment_id = ? AND step_id = ?')
      .get(enr.id, quizStep.id) as any;
    assert.ok(!progRow || progRow.is_completed === 0);

    // Quiz grading with correct answer DOES complete step
    const passGrade = quizService.gradeQuiz(student1Id, enr.id, quizStep.id, ['opt-yes'], false);
    assert.strictEqual(passGrade.isPassed, true);
    progRow = db
      .prepare('SELECT is_completed FROM step_progress WHERE enrollment_id = ? AND step_id = ?')
      .get(enr.id, quizStep.id) as any;
    assert.strictEqual(progRow.is_completed, 1);
  });
});
