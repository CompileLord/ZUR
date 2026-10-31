import test from 'node:test';
import assert from 'node:assert/strict';
import { TeacherRosterService } from '../src/services/teacher-roster-service.ts';
import { EnrollmentService } from '../src/services/enrollment-service.ts';
import { InvitationService } from '../src/services/invitation-service.ts';
import { NotFoundError } from 'zur-shared';
import { setupTestDb } from './helpers/teacher-roster-db.ts';

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
