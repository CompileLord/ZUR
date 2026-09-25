import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../src/db/database.ts';
import { TeacherRosterService } from '../src/services/teacher-roster-service.ts';
import { EnrollmentService } from '../src/services/enrollment-service.ts';
import { InvitationService } from '../src/services/invitation-service.ts';
import { ProductAnalyticsService } from '../src/services/product-analytics-service.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { NotFoundError } from 'zur-shared';
import { createServer } from '../src/server.ts';
import { EmailDeliveryService } from '../src/services/email-delivery-service.ts';
import type { AddressInfo } from 'node:net';

function setupTestDb(dbPath = ':memory:'): DatabaseSync {
  runMigrations(dbPath);
  seedDatabase(dbPath);
  return getDatabase(dbPath);
}

test('TeacherRosterService: listRoster and privacy masking (T073)', async (t) => {
  const db = setupTestDb();
  const rosterService = new TeacherRosterService(db);

  const courseId = 'course-python-foundations';
  const authorId = 'user-author-1';
  const studentId = 'user-student-1';

  await t.test('course owner can list roster with correct progress and masked emails', () => {
    const res = rosterService.listRoster(authorId, courseId);
    assert.ok(res.students.length >= 2, 'Should have seeded students (ada, grace)');
    assert.equal(res.total, res.students.length);

    const ada = res.students.find(i => i.studentId === 'user-student-1');
    assert.ok(ada, 'Ada should be enrolled');
    assert.equal(ada.displayName, 'Ada Lovelace');
    // Verify email privacy masking: local part must be masked
    assert.ok(ada.maskedEmail?.includes('***'), 'Email should be masked for privacy in roster');
    assert.ok(!ada.maskedEmail?.startsWith('ada@'), 'Full email should not be exposed');
    assert.equal(ada.status, 'active');
    assert.ok(typeof ada.completedStepsCount === 'number');
    assert.ok(typeof ada.totalRequiredStepsCount === 'number');
    assert.ok(typeof ada.progressPercent === 'number');
  });

  await t.test('filtering by status works', () => {
    const activeRes = rosterService.listRoster(authorId, courseId, { status: 'active' });
    assert.ok(activeRes.students.every(i => i.status === 'active'));

    const revokedRes = rosterService.listRoster(authorId, courseId, { status: 'revoked' });
    assert.equal(revokedRes.students.length, 0);
  });

  await t.test('searching by student display name works', () => {
    const searchRes = rosterService.listRoster(authorId, courseId, { search: 'Ada' });
    assert.equal(searchRes.students.length, 1);
    assert.equal(searchRes.students[0].displayName, 'Ada Lovelace');
  });

  await t.test('non-owner non-admin cannot access roster (authorization enforcement)', () => {
    assert.throws(
      () => rosterService.listRoster(studentId, courseId),
      (err: any) => err instanceof NotFoundError
    );
  });

  await t.test('admin needs explicit audited support access for roster', () => {
    const adminId = 'user-admin-1';
    assert.throws(() => rosterService.listRoster(adminId, courseId), NotFoundError);
  });
});

test('TeacherRosterService: student detail and privacy invariants (T074)', async (t) => {
  const db = setupTestDb();
  const rosterService = new TeacherRosterService(db);
  const courseId = 'course-python-foundations';
  const authorId = 'user-author-1';

  const enrollment = db.prepare(`SELECT id FROM enrollments WHERE user_id = 'user-student-1' AND course_id = ?`).get(courseId) as any;
  assert.ok(enrollment, 'Enrollment must exist');

  await t.test('getStudentDetail returns curriculum, progress, attempts, waivers', () => {
    const detail = rosterService.getStudentDetail(authorId, courseId, enrollment.id);
    assert.equal(detail.enrollment.id, enrollment.id);
    assert.equal(detail.student.displayName, 'Ada Lovelace');
    assert.ok(detail.curriculum.length > 0, 'Curriculum modules should be populated');
    assert.ok(Object.keys(detail.stepProgress).length > 0, 'Step progress should be populated');
    assert.ok(detail.overallProgress.totalRequiredSteps > 0);
  });

  await t.test('never leaks unsent code drafts or IP addresses', () => {
    db.prepare(`UPDATE code_drafts SET code = 'SECRET_UNSENT_DRAFT = 42' WHERE enrollment_id = ?`).run(enrollment.id);

    const detail = rosterService.getStudentDetail(authorId, courseId, enrollment.id);
    const jsonStr = JSON.stringify(detail);
    assert.ok(!jsonStr.includes('SECRET_UNSENT_DRAFT'), 'Student detail MUST NEVER leak unsent drafts from code_drafts table');
    assert.ok(!jsonStr.includes('ip_address'), 'Student detail MUST NEVER expose IP addresses');
  });

  await t.test('attempt list is paginated and step-scoped; snapshots load only by selected id', () => {
    const versionId = (db.prepare('SELECT pinned_version_id FROM enrollments WHERE id = ?').get(enrollment.id) as any).pinned_version_id;
    for (let n = 1; n <= 3; n++) db.prepare(`INSERT INTO assessment_attempts
      (id, user_id, enrollment_id, step_id, course_version_id, attempt_number, type, verdict, code_snapshot, is_infrastructure_failure, created_at)
      VALUES (?, 'user-student-1', ?, 'step-4-python-echo', ?, ?, 'python', 'WRONG_ANSWER', ?, 0, datetime('now', ?))`)
      .run(`paged-${n}`, enrollment.id, versionId, n, `secret-${n}`, `-${n} minutes`);
    const page = rosterService.listStudentAttempts(authorId, courseId, enrollment.id, 'step-4-python-echo', 2, 0);
    assert.equal(page.total, 3);
    assert.equal(page.items.length, 2);
    assert.ok(!JSON.stringify(page).includes('secret-'));
    assert.equal(rosterService.getStudentDetail(authorId, courseId, enrollment.id).attemptList?.length, 0);
    const selected = rosterService.getStudentAttempt(authorId, courseId, enrollment.id, 'step-4-python-echo', page.items[0].id);
    assert.equal(selected.submittedCode, `secret-${page.items[0].attemptNumber}`);
    assert.throws(() => rosterService.listStudentAttempts('user-student-1', courseId, enrollment.id, 'step-4-python-echo'), NotFoundError);
  });

  await t.test('admin waiver is explicitly flagged and distinguished from a pass', () => {
    db.prepare(`INSERT OR IGNORE INTO step_progress (id, user_id, enrollment_id, step_id) VALUES ('prog-ada-waiver-test', 'user-student-1', ?, 'step-4-python-echo')`).run(enrollment.id);
    db.prepare(`
      UPDATE step_progress
      SET is_waived = 1, updated_at = datetime('now'), waiver_reason = 'Waived due to upstream runtime upgrade', waived_by_id = 'user-admin-1'
      WHERE enrollment_id = ? AND step_id = 'step-4-python-echo'
    `).run(enrollment.id);

    const detail = rosterService.getStudentDetail(authorId, courseId, enrollment.id);
    assert.ok(detail.stepProgress['step-4-python-echo'].isWaived, 'isWaived must be true');
    assert.equal(detail.stepProgress['step-4-python-echo'].waiverReason, 'Waived due to upstream runtime upgrade');
  });
});

test('EnrollmentService: revoking and reinstating access (T073)', async (t) => {
  const db = setupTestDb();
  const enrollmentService = new EnrollmentService(db);
  const courseId = 'course-python-foundations';
  const authorId = 'user-author-1';
  const studentId = 'user-student-1';

  await t.test('revoking access marks enrollment as revoked without deleting user account', () => {
    const res = enrollmentService.revokeStudent(authorId, courseId, studentId);
    assert.equal(res.status, 'revoked');

    const enr = db.prepare(`SELECT status FROM enrollments WHERE user_id = ? AND course_id = ?`).get(studentId, courseId) as any;
    assert.equal(enr.status, 'revoked');

    // Confirm student account still exists
    const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(studentId) as any;
    assert.ok(user, 'User account MUST NOT be deleted upon enrollment revocation');
  });

  await t.test('reinstating access restores enrollment to active', () => {
    const res = enrollmentService.reinstateStudent(authorId, courseId, studentId);
    assert.equal(res.status, 'active');

    const enr = db.prepare(`SELECT status FROM enrollments WHERE user_id = ? AND course_id = ?`).get(studentId, courseId) as any;
    assert.equal(enr.status, 'active');
  });
});

test('InvitationService: course invitations management (T073)', async (t) => {
  const db = setupTestDb();
  const invitationService = new InvitationService(db);
  const courseId = 'course-python-foundations';
  const authorId = 'user-author-1';

  let emailInvId: string;
  let linkInvId: string;

  await t.test('create email invitation', () => {
    const res = invitationService.createInvitation(authorId, courseId, {
      type: 'email',
      recipientEmail: 'newstudent@zur.internal',
      expiresInDays: 14,
    });
    assert.equal(res.invitation.type, 'email');
    assert.equal(res.invitation.recipientEmail, 'newstudent@zur.internal');
    assert.ok(res.token);
    assert.equal(res.invitation.isRevoked, false);
    emailInvId = res.invitation.id;
  });

  await t.test('create shareable link invitation with max uses', () => {
    const res = invitationService.createInvitation(authorId, courseId, {
      type: 'shareable_link',
      expiresInDays: 7,
      maxUses: 10,
    });
    assert.equal(res.invitation.type, 'shareable_link');
    assert.equal(res.invitation.maxUses, 10);
    assert.equal(res.invitation.usesCount, 0);
    linkInvId = res.invitation.id;
  });

  await t.test('list invitations returns all generated invitations for course', () => {
    const list = invitationService.listInvitations(authorId, courseId);
    assert.equal(list.length, 2);
  });

  await t.test('revoke invitation prevents future enrollments', () => {
    const res = invitationService.revokeInvitation(authorId, linkInvId);
    assert.equal(res.success, true);

    const list = invitationService.listInvitations(authorId, courseId);
    const found = list.find(i => i.id === linkInvId);
    assert.equal(found?.isRevoked, true);
  });

  await t.test('resend invitation updates sent timestamp', () => {
    const res = invitationService.resendOrRegenerateInvitation(authorId, emailInvId);
    assert.ok(res.token);
    assert.equal(res.invitation.id, emailInvId);
  });
});

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

test('HTTP Hint Reveal: strict pinned version and hint existence validation (Finding 4)', async (t) => {
  const db = setupTestDb();
  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  // Sign in as student
  const signRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ada@zur.internal', password: 'StudentPass123!' }),
  });
  assert.equal(signRes.status, 200);
  const { token: studentToken } = await signRes.json() as any;
  assert.ok(studentToken);

  const enr = db.prepare(`SELECT id, pinned_version_id FROM enrollments WHERE user_id = 'user-student-1' AND course_id = 'course-python-foundations'`).get() as any;
  assert.ok(enr);

  // Published snapshots are the source of truth for version-pinned learning content.
  const snapshotRow = db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(enr.pinned_version_id) as any;
  const pinnedSnapshot = JSON.parse(snapshotRow.snapshot_data);
  const pinnedExercise = pinnedSnapshot.modules.flatMap((module: any) => module.lessons)
    .flatMap((lesson: any) => lesson.steps).find((step: any) => step.id === 'step-4-python-echo');
  pinnedExercise.content = { hints: ['Read the input as a string first.', 'Convert it to an integer before multiplying.'] };
  db.prepare('UPDATE course_versions SET snapshot_data = ? WHERE id = ?').run(JSON.stringify(pinnedSnapshot), enr.pinned_version_id);

  await t.test('rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-4-python-echo/hint-reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hintIndex: 0 }),
    });
    assert.equal(res.status, 401);
  });

  await t.test('rejects arbitrary fabricated stepId not in pinned version with 404', async () => {
    const res = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/fake-step-does-not-exist/hint-reveal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ hintIndex: 0 }),
    });
    assert.equal(res.status, 404);
  });

  await t.test('rejects step without hints (theory step) with 400 validation error', async () => {
    const res = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-1-theory/hint-reveal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ hintIndex: 0 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.ok(body.error?.message?.includes('hints'));
  });

  await t.test('rejects missing hintIndex and ignores hints from mutable current content', async () => {
    const originalContent = db.prepare('SELECT content_payload FROM step_contents WHERE step_id = ?').get('step-4-python-echo') as any;
    const payload = JSON.parse(originalContent.content_payload);
    payload.hints = [];
    db.prepare('UPDATE step_contents SET content_payload = ? WHERE step_id = ?').run(JSON.stringify(payload), 'step-4-python-echo');
    try {
      const missingIndex = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-4-python-echo/hint-reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({}),
      });
      assert.equal(missingIndex.status, 400, 'An event must name a real, selected pinned-version hint');

      const pinnedHint = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-4-python-echo/hint-reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({ hintIndex: 0 }),
      });
      assert.equal(pinnedHint.status, 200, 'Pinned version hint remains available despite current draft content changes');
    } finally {
      db.prepare('UPDATE step_contents SET content_payload = ? WHERE step_id = ?').run(originalContent.content_payload, 'step-4-python-echo');
    }
  });

  await t.test('rejects out-of-bounds hintIndex with 400 validation error', async () => {
    // Step 4 has hints in seeded data; test invalid index
    const res = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-4-python-echo/hint-reveal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ hintIndex: 999 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.ok(body.error?.message?.includes('Invalid hint index'));
  });

  await t.test('records product analytics event on valid reveal', async () => {
    const res = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-4-python-echo/hint-reveal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ hintIndex: 0 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.success, true);
    assert.equal(body.hintIndex, 0);

    const repeated = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-4-python-echo/hint-reveal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ hintIndex: 0 }),
    });
    assert.equal(repeated.status, 200, 'Repeat reveal requests remain safe for the learner');

    // Verify product analytics event was recorded in DB
    const evts = db.prepare(`SELECT * FROM product_analytics_events WHERE event_name = 'hint.revealed' AND step_id = 'step-4-python-echo'`).all() as any[];
    assert.equal(evts.length, 1, 'Repeated direct reveal requests must not duplicate analytics');
    const latest = evts[evts.length - 1];
    const meta = JSON.parse(latest.metadata);
    assert.equal(meta.hintIndex, 0);
  });
});

test('HTTP publication analytics stores the exact version from its publication receipt', async (t) => {
  const db = setupTestDb();
  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const signIn = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'guido@zur.internal', password: 'AuthorPass123!' }),
  });
  assert.equal(signIn.status, 200);
  const { token } = await signIn.json() as any;
  const courseId = 'course-python-foundations';
  const draft = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as { draft_revision: number };
  const publish = await fetch(`${baseUrl}/api/author/courses/${courseId}/publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expectedRevision: draft.draft_revision, changeSummary: 'Audit publication event' }),
  });
  assert.equal(publish.status, 200);
  const receipt = await publish.json() as { versionId: string };
  const event = db.prepare(`SELECT course_version_id FROM product_analytics_events WHERE event_name = 'course.published' AND course_id = ? ORDER BY created_at DESC LIMIT 1`).get(courseId) as any;
  assert.equal(event.course_version_id, receipt.versionId);
});

test('HTTP email invitations report provider delivery separately from invitation validity', async (t) => {
  const db = setupTestDb();
  let providerOkay = true;
  const mailer = new EmailDeliveryService({
    provider: 'postmark', serverToken: 'test-token', from: 'noreply@example.test',
    appBaseUrl: 'https://zur.example.test', runtime: 'test',
    fetcher: async () => ({ ok: providerOkay, status: providerOkay ? 200 : 503 }),
  });
  const server = createServer(db, { emailDeliveryService: mailer });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const signIn = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'guido@zur.internal', password: 'AuthorPass123!' }),
  });
  const { token } = await signIn.json() as any;
  const create = async (email: string) => fetch(`${baseUrl}/api/author/courses/course-python-foundations/invitations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: 'email', recipientEmail: email }),
  });
  const sent = await create('sent@example.test');
  assert.equal(sent.status, 201);
  const sentBody = await sent.json() as any;
  assert.equal(sentBody.delivery.status, 'sent');
  assert.equal(sentBody.invitation.isRevoked, false);
  assert.equal(sentBody.invitation.emailDeliveryStatus, 'sent');

  providerOkay = false;
  const failed = await create('failed@example.test');
  assert.equal(failed.status, 201);
  const failedBody = await failed.json() as any;
  assert.equal(failedBody.delivery.status, 'failed');
  assert.equal(failedBody.invitation.isRevoked, false);
  assert.equal(failedBody.invitation.emailDeliveryStatus, 'failed');
  assert.match(failedBody.delivery.message, /remains valid/i);
});
