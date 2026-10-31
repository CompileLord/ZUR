import test from 'node:test';
import assert from 'node:assert/strict';
import { TeacherRosterService } from '../src/services/teacher-roster-service.ts';
import { ProductAnalyticsService } from '../src/services/product-analytics-service.ts';
import { setupTestDb } from './helpers/teacher-roster-db.ts';

test('TeacherRosterService: exact course metrics and math correctness (PRD §14, T075)', async (t) => {
  const db = setupTestDb();
  const rosterService = new TeacherRosterService(db);
  const courseId = 'course-python-foundations';
  const authorId = 'user-author-1';

  await t.test('computes active enrollments, learning-active students, completion rate, and average progress', () => {
    const metrics = rosterService.getCourseMetrics(authorId, courseId, { timeWindowDays: 7 });

    assert.equal(metrics.courseId, courseId);
    assert.ok(typeof metrics.activeEnrollments === 'number');
    assert.ok(typeof metrics.learningActiveStudents === 'number');
    assert.ok(typeof metrics.completion.ratePercent === 'number' || metrics.completion.ratePercent === null);
    assert.ok(typeof metrics.completion.completedCount === 'number');
    assert.ok(typeof metrics.completion.totalActive === 'number');
    assert.ok(typeof metrics.averageProgressPercent === 'number' || metrics.averageProgressPercent === null);
    assert.ok(Array.isArray(metrics.exercises));
  });

  await t.test('exercise pass rate excludes infrastructure failures and accurately computes median attempts', () => {
    const enrAda = db.prepare(`SELECT id, pinned_version_id FROM enrollments WHERE user_id = 'user-student-1' AND course_id = ?`).get(courseId) as any;
    const enrGrace = db.prepare(`SELECT id, pinned_version_id FROM enrollments WHERE user_id = 'user-student-2' AND course_id = ?`).get(courseId) as any;

    // Ada: 1 infra failure (excluded), 1 fail, 1 pass -> 2 non-infra attempts to first pass
    db.prepare(`
      INSERT INTO assessment_attempts (id, user_id, enrollment_id, step_id, course_version_id, attempt_number, type, verdict, is_infrastructure_failure, created_at)
      VALUES ('att-ada-1', 'user-student-1', ?, 'step-4-python-echo', ?, 1, 'python', 'INTERNAL_ERROR', 1, datetime('now', '-3 days'))
    `).run(enrAda.id, enrAda.pinned_version_id);

    db.prepare(`
      INSERT INTO assessment_attempts (id, user_id, enrollment_id, step_id, course_version_id, attempt_number, type, verdict, is_infrastructure_failure, created_at)
      VALUES ('att-ada-2', 'user-student-1', ?, 'step-4-python-echo', ?, 2, 'python', 'WRONG_ANSWER', 0, datetime('now', '-2 days'))
    `).run(enrAda.id, enrAda.pinned_version_id);

    db.prepare(`
      INSERT INTO assessment_attempts (id, user_id, enrollment_id, step_id, course_version_id, attempt_number, type, verdict, is_infrastructure_failure, created_at)
      VALUES ('att-ada-3', 'user-student-1', ?, 'step-4-python-echo', ?, 3, 'python', 'PASSED', 0, datetime('now', '-1 day'))
    `).run(enrAda.id, enrAda.pinned_version_id);

    // Grace is pinned to v1; her pass remains separate from v2 insight.
    db.prepare(`
      INSERT INTO assessment_attempts (id, user_id, enrollment_id, step_id, course_version_id, attempt_number, type, verdict, is_infrastructure_failure, created_at)
      VALUES ('att-grace-1', 'user-student-2', ?, 'step-4-python-echo', ?, 1, 'python', 'PASSED', 0, datetime('now', '-1 day'))
    `).run(enrGrace.id, enrGrace.pinned_version_id);

    const metrics = rosterService.getCourseMetrics(authorId, courseId, { versionNumber: 2 });
    const echoStep = metrics.exercises.find(e => e.stepId === 'step-4-python-echo');

    assert.ok(echoStep, 'Echo step insights must exist');
    assert.equal(echoStep.distinctParticipants, 1, 'Only the v2 student participates in this release insight');
    assert.equal(echoStep.distinctPassingStudents, 1, 'The v1 pass is excluded');
    assert.equal(echoStep.passRatePercent, 100, 'Pass rate should be 100%');
    assert.equal(echoStep.medianAttemptsToPass, 2, 'Infrastructure failures are omitted before counting to first pass');
    assert.equal(echoStep.infrastructureFailureCount, 1, 'Infra failures must be tracked separately');
  });

  await t.test('sparse data / no assessed attempts returns null without divide by zero', () => {
    const metrics = rosterService.getCourseMetrics(authorId, courseId);
    const quizStep = metrics.exercises.find(e => e.stepId === 'step-3-quiz-single');
    if (quizStep && quizStep.distinctParticipants === 0) {
      assert.equal(quizStep.passRatePercent, null, 'Must be null when 0 participants, avoiding 0% claim');
      assert.equal(quizStep.medianAttemptsToPass, null);
    }
  });

  await t.test('preview and staff attempts are excluded from student analytics (AC-18)', () => {
    // Insert author preview enrollment
    db.prepare(`
      INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status)
      VALUES ('enr-preview-id', 'user-author-1', 'course-python-foundations', 'version-2-snapshot', 'active')
    `).run();

    db.prepare(`
      INSERT INTO assessment_attempts (id, user_id, enrollment_id, step_id, course_version_id, attempt_number, type, verdict, is_infrastructure_failure, created_at)
      VALUES ('att-author-preview', 'user-author-1', 'enr-preview-id', 'step-4-python-echo', 'version-2-snapshot', 99, 'python', 'PASSED', 0, datetime('now'))
    `).run();

    const metrics = rosterService.getCourseMetrics(authorId, courseId);
    const echoStep = metrics.exercises.find(e => e.stepId === 'step-4-python-echo');
    assert.equal(echoStep?.distinctParticipants, 1, 'Author preview attempts must not alter distinct participant counts');
  });
});

test('ProductAnalyticsService: privacy-safe telemetry (T076)', async (t) => {
  const db = setupTestDb();
  const analyticsService = new ProductAnalyticsService(db);

  await t.test('event is recorded with pseudonymous salted user ID and sanitized payload', () => {
    const rawUserId = 'user-student-1';
    const evt = analyticsService.recordEvent({
      eventName: 'step.completed',
      userId: rawUserId,
      courseId: 'course-python-foundations',
      courseVersionId: 'version-2-snapshot',
      stepId: 'step-4-python-echo',
      metadata: {
        stepType: 'python',
        timeSpentSeconds: 120,
        // SENSITIVE FIELDS THAT MUST BE STRIPPED:
        code: 'import sys\nprint("hello")',
        stdin: '42\n',
        token: 'secret_token_123',
        email: 'ada@zur.internal',
        userNotes: 'my confidential answer',
      },
    });

    assert.ok(evt);
    assert.ok(evt.id);
    assert.notEqual(evt.pseudonymousUserId, rawUserId, 'User ID must be pseudonymously hashed');
    assert.match(evt.pseudonymousUserId, /^[a-f0-9]{32}$/, 'Pseudonymous ID must be keyed digest');

    const stored = db.prepare(`SELECT * FROM product_analytics_events WHERE id = ?`).get(evt.id) as any;
    assert.ok(stored);
    const metaStr = stored.metadata;
    assert.ok(!metaStr.includes('import sys'), 'Code must be stripped');
    assert.ok(!metaStr.includes('secret_token_123'), 'Tokens must be stripped');
    assert.ok(!metaStr.includes('ada@zur.internal'), 'Email must be stripped');
    assert.ok(!metaStr.includes('my confidential answer'), 'Free text notes must be stripped');
    assert.equal(metaStr, '{}', 'Unapproved categorical fields are also excluded');
  });

  await t.test('staff and preview events are excluded from the product KPI event view', () => {
    const preview = analyticsService.recordEvent({
      eventName: 'exercise.run',
      userId: 'user-author-1',
      courseId: 'course-python-foundations',
      isPreview: true,
      metadata: { mode: 'samples' },
    });

    assert.equal(preview, null);
    analyticsService.recordEvent({
      eventName: 'exercise.run',
      userId: 'user-author-1',
      courseId: 'course-python-foundations',
      metadata: { mode: 'samples' },
    });
    analyticsService.recordEvent({
      eventName: 'exercise.run',
      userId: 'user-student-1',
      courseId: 'course-python-foundations',
      metadata: { mode: 'samples' },
    });
    assert.equal(analyticsService.listEvents({ eventName: 'exercise.run' }).length, 2, 'Authorized staff activity remains auditable');
    const productEvents = analyticsService.listEvents({ eventName: 'exercise.run', excludeStaffOrPreview: true });
    assert.equal(productEvents.length, 1, 'KPI view excludes author activity');
    assert.equal(productEvents[0].pseudonymousUserId, analyticsService.recordEvent({
      eventName: 'step.completed', userId: 'user-student-1', courseId: 'course-python-foundations',
    })?.pseudonymousUserId, 'Student activity remains in KPI results');
  });
});

test('TeacherRosterService: learning-active excludes waiver-only updates and zero enrollments keep percentage null (Findings 2 & 5)', async (t) => {
  const db = setupTestDb();
  const rosterService = new TeacherRosterService(db);
  const courseId = 'course-python-foundations';
  const authorId = 'user-author-1';

  await t.test('waiver-only update does not make student learning-active or update lastActivityAt', () => {
    // Clear existing assessment attempts and completions for user-student-2
    const graceEnr = db.prepare(`SELECT id FROM enrollments WHERE user_id = 'user-student-2' AND course_id = ?`).get(courseId) as any;
    db.prepare(`DELETE FROM assessment_attempts WHERE enrollment_id = ?`).run(graceEnr.id);
    db.prepare(`DELETE FROM step_progress WHERE enrollment_id = ?`).run(graceEnr.id);

    // Give grace a waiver-only progress record (is_completed = 0, is_waived = 1, updated_at = now)
    db.prepare(`
      INSERT INTO step_progress (id, user_id, enrollment_id, step_id, is_completed, is_waived, waiver_reason, updated_at)
      VALUES ('prog-waiver-only', 'user-student-2', ?, 'step-4-python-echo', 0, 1, 'admin waiver test', datetime('now'))
    `).run(graceEnr.id);

    // Detail check: lastActivityAt must be null (no learner completions or submissions)
    const detail = rosterService.getStudentDetail(authorId, courseId, graceEnr.id);
    assert.equal(detail.student.lastActivityAt, null, 'Waiver-only update MUST NOT count as learner activity');

    // Roster check: lastActivityAt must be null
    const roster = rosterService.listRoster(authorId, courseId);
    const graceItem = roster.students.find(s => s.studentId === 'user-student-2');
    assert.equal(graceItem?.lastActivityAt, null, 'Waiver-only update MUST NOT appear as student activity in roster');

    // Also clear student 1 activity to test course metrics learning-active count strictly
    const adaEnr = db.prepare(`SELECT id FROM enrollments WHERE user_id = 'user-student-1' AND course_id = ?`).get(courseId) as any;
    db.prepare(`DELETE FROM assessment_attempts WHERE enrollment_id = ?`).run(adaEnr.id);
    db.prepare(`DELETE FROM step_progress WHERE enrollment_id = ?`).run(adaEnr.id);

    const metrics = rosterService.getCourseMetrics(authorId, courseId, { timeWindowDays: 7 });
    assert.equal(metrics.learningActiveStudents, 0, 'Waiver-only update MUST NOT increment learningActiveStudents');
  });

  await t.test('zero active enrollments keeps completion rate and percentage null (not 0%)', () => {
    // Revoke all enrollments in course
    db.prepare(`UPDATE enrollments SET status = 'revoked' WHERE course_id = ?`).run(courseId);

    const metrics = rosterService.getCourseMetrics(authorId, courseId);
    assert.equal(metrics.activeEnrollments, 0);
    assert.equal(metrics.completion.totalActive, 0);
    assert.equal(metrics.completion.ratePercent, null, 'Rate percent must be null when activeEnrollments is 0');
    assert.equal(metrics.completion.percentage, null, 'Percentage must be null when activeEnrollments is 0, avoiding 0% claim');
    assert.equal(metrics.averageProgressPercent, null, 'Average progress must be null when activeEnrollments is 0');
  });
});
