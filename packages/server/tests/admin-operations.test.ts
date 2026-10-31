import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminService } from '../src/services/admin-service.ts';
import { AuthorizationService } from '../src/services/auth-service.ts';
import { AttemptService } from '../src/services/attempt-service.ts';
import { OperationalMetricsService } from '../src/services/operational-metrics-service.ts';
import { NotFoundError, ConflictError, ValidationError } from 'zur-shared';
import { setup, useDeletionRegistry } from './helpers/admin-operations-fixture.ts';

test('AdminService enforces role boundaries, audited access, and real operations state',(t)=>{
  const {db,cleanup}=setup();t.after(cleanup);
  const metrics = new OperationalMetricsService();
  const admin=new AdminService(db, metrics);
  assert.throws(()=>admin.listUsers('user-student-1'),NotFoundError);
  const before=admin.getOperationsOverview('user-admin-1');
  assert.equal(typeof before.execution.paused,'boolean');
  assert.equal(typeof before.refreshedAt,'string');
  assert.ok(before.internalErrorRate);
  assert.equal(before.internalErrorRate.window, '5m');
  assert.equal(before.internalErrorRate.windowLabel, 'Last 5 minutes');
  assert.equal(before.internalErrorRate.windowSeconds, 300);
  assert.equal(before.internalErrorRate.numerator, 0);
  assert.equal(before.internalErrorRate.denominator, 0);
  // Initially insufficient telemetry when no request samples exist in metrics buffer
  assert.equal(before.internalErrorRate.status, 'insufficient_telemetry');
  assert.equal(before.internalErrorRate.rate, null);
  assert.equal(before.internalErrorRate.rateFormatted, 'Unavailable');

  // Record successful requests and 4xx client errors (401, 404)
  // 4xx client errors MUST be excluded from the numerator
  metrics.recordRequest('GET', '/api/courses', 200, 15);
  metrics.recordRequest('POST', '/api/auth/sign-in', 401, 20); // 4xx client error
  metrics.recordRequest('GET', '/api/not-found', 404, 5);     // 4xx client error
  const withClientErrors = admin.getOperationsOverview('user-admin-1');
  assert.equal(withClientErrors.internalErrorRate.status, 'available');
  assert.equal(withClientErrors.internalErrorRate.numerator, 0); // strictly excludes 4xx!
  assert.equal(withClientErrors.internalErrorRate.denominator, 3);
  assert.equal(withClientErrors.internalErrorRate.rate, 0.0);
  assert.equal(withClientErrors.internalErrorRate.rateFormatted, '0.00%');
  assert.equal(withClientErrors.internalErrorRate.client4xxErrors, 2);

  // Now record a genuine platform 5xx server error
  metrics.recordRequest('POST', '/api/autosave', 500, 45); // 5xx server error
  const withServerError = admin.getOperationsOverview('user-admin-1');
  assert.equal(withServerError.internalErrorRate.status, 'available');
  assert.equal(withServerError.internalErrorRate.numerator, 1);
  assert.equal(withServerError.internalErrorRate.denominator, 4);
  assert.equal(withServerError.internalErrorRate.rate, 0.25);
  assert.equal(withServerError.internalErrorRate.rateFormatted, '25.00%');

  // Verify DB execution infrastructure failure is tracked separately in executionInfrastructureErrors
  const nowStr = new Date().toISOString();
  const enrRow = db.prepare('SELECT id, user_id, pinned_version_id FROM enrollments WHERE user_id = ? LIMIT 1').get('user-student-1') as any;
  db.prepare(`INSERT INTO assessment_attempts (id, enrollment_id, user_id, step_id, course_version_id, attempt_number, type, verdict, is_infrastructure_failure, created_at)
    VALUES ('test-att-infra-1', ?, ?, 'step-4-python-echo', ?, 1, 'python', 'infrastructure_failure', 1, ?)`).run(enrRow.id, enrRow.user_id, enrRow.pinned_version_id, nowStr);
  const withInfra = admin.getOperationsOverview('user-admin-1');
  assert.equal(withInfra.executionInfrastructureErrors.failures, 1);
  assert.equal(withInfra.executionInfrastructureErrors.attempts.errors, 1);
  // internalErrorRate numerator remains 1 (not polluted by execution event)
  assert.equal(withInfra.internalErrorRate.numerator, 1);
  assert.equal(withInfra.internalErrorRate.denominator, 4);

  assert.throws(()=>admin.setExecutionPaused('user-admin-1',true,'short'),ValidationError);
  const paused=admin.setExecutionPaused('user-admin-1',true,'Runner incident review');
  assert.equal(paused.executionPaused,true);
  assert.equal(admin.getOperationsOverview('user-admin-1').execution.paused,true);
  assert.ok(admin.listAudit('user-admin-1',{action:'execution:disable_new'}).items.length);

  const userPage=admin.listUsers('user-admin-1',{search:'Ada'});
  assert.equal(userPage.items[0].displayName,'Ada Lovelace');
  assert.equal(JSON.stringify(userPage).includes('password_hash'),false);
  admin.changeUserState('user-admin-1','user-student-1','grant_author','Verified pilot teacher onboarding');
  const granted=admin.getUserDetail('user-admin-1','user-student-1');
  assert.ok(granted.user.capabilities.includes('author'));
  admin.changeUserState('user-admin-1','user-student-1','suspend','Abuse investigation confirmed');
  assert.equal(admin.getUserDetail('user-admin-1','user-student-1').user.accountStatus,'suspended');
});

test('Support records require a scoped, expiring, reasoned grant and are audited',(t)=>{
  const {db,cleanup}=setup();t.after(cleanup);const admin=new AdminService(db), auth=new AuthorizationService(db);
  const courseId='course-python-foundations';
  const enrollment=db.prepare(`SELECT id,pinned_version_id FROM enrollments WHERE user_id='user-student-1' AND course_id=?`).get(courseId) as any;
  const grant=admin.beginSupportAccess('user-admin-1','user-student-1',courseId,'Investigate learner report about a broken attempt');
  assert.equal(auth.getCourseAccess({userId:'user-admin-1',capabilities:['student','admin'],isSuspended:false},courseId).allowed,false);
  const records=admin.getSupportedStudentRecords('user-admin-1',grant.id);
  assert.equal(records.support.reason,'Investigate learner report about a broken attempt');
  assert.equal(records.support.expiresAt,grant.expiresAt);
  assert.equal(records.student.displayName,'Ada Lovelace');
  assert.equal(records.enrollments[0].versionNumber,(db.prepare('SELECT version_number FROM course_versions WHERE id=?').get(enrollment.pinned_version_id) as any).version_number);
  assert.ok(admin.listAudit('user-admin-1',{action:'support:records_viewed'}).items.length);
  admin.revokeSupportAccess('user-admin-1',grant.id,'Support investigation completed');
  assert.equal(auth.getCourseAccess({userId:'user-admin-1',capabilities:['admin'],isSuspended:false},courseId).allowed,false);
  assert.throws(()=>admin.getSupportedStudentRecords('user-admin-1',grant.id),NotFoundError);
  assert.ok(enrollment.pinned_version_id);
});

test('Admin support grant confines learner records to the reasoned and expiring support page',(t)=>{
  const {db,cleanup}=setup();t.after(cleanup);const attempts=new AttemptService(db),admin=new AdminService(db);
  const enrollment=db.prepare(`SELECT id,pinned_version_id FROM enrollments WHERE user_id='user-student-1' AND course_id='course-python-foundations'`).get() as any;
  const step=db.prepare(`SELECT s.id FROM steps s JOIN lessons l ON l.id=s.lesson_id JOIN modules m ON m.id=l.module_id WHERE m.course_id='course-python-foundations' LIMIT 1`).get() as any;
  const id='admin-scoped-attempt';
  db.prepare(`INSERT INTO assessment_attempts(id,user_id,enrollment_id,step_id,course_version_id,attempt_number,type,verdict,code_snapshot,created_at)
    VALUES(?,?,?,?,?,1,'python','WRONG_ANSWER','PRIVATE_SUBMISSION',?)`).run(id,'user-student-1',enrollment.id,step.id,enrollment.pinned_version_id,new Date().toISOString());
  assert.throws(()=>attempts.listAttempts({enrollmentId:enrollment.id,stepId:step.id,requestingUserId:'user-admin-1'}),NotFoundError);
  assert.throws(()=>attempts.getAttempt(id,'user-admin-1'),NotFoundError);
  const grant=admin.beginSupportAccess('user-admin-1','user-student-1','course-python-foundations','Review a reported missing attempt result');
  assert.throws(()=>attempts.listAttempts({enrollmentId:enrollment.id,stepId:step.id,requestingUserId:'user-admin-1'}),NotFoundError);
  assert.throws(()=>attempts.getAttempt(id,'user-admin-1'),NotFoundError);
  const supported=admin.getSupportedStudentRecords('user-admin-1',grant.id);
  assert.equal(supported.support.reason,'Review a reported missing attempt result');
  assert.ok(supported.support.expiresAt);
  admin.revokeSupportAccess('user-admin-1',grant.id,'Support review completed successfully');
  assert.throws(()=>attempts.getAttempt(id,'user-admin-1'),NotFoundError);
});

test('Course waiver review is version-scoped, count-checked, and never creates a pass',(t)=>{
  const {db,cleanup}=setup();t.after(cleanup);const admin=new AdminService(db), courseId='course-python-foundations';
  const version=db.prepare('SELECT id,snapshot_data FROM course_versions WHERE course_id=? ORDER BY version_number LIMIT 1').get(courseId) as any;
  const step=JSON.parse(version.snapshot_data).modules.flatMap((m:any)=>m.lessons).flatMap((l:any)=>l.steps).find((s:any)=>s.isRequired);
  const preview=admin.previewWaiver('user-admin-1',courseId,version.id,step.id);
  assert.ok(preview.affectedCount>0);
  assert.throws(()=>admin.waiveStep('user-admin-1',courseId,version.id,step.id,'Exercise tests are broken',undefined,preview.affectedCount+1),ConflictError);
  const result=admin.waiveStep('user-admin-1',courseId,version.id,step.id,'Exercise tests are broken',undefined,preview.affectedCount);
  assert.equal(result.affectedCount,preview.affectedCount);
  const progress=db.prepare('SELECT is_completed,is_waived,waiver_reason,waived_by_id FROM step_progress WHERE step_id=? AND is_waived=1 LIMIT 1').get(step.id) as any;
  assert.equal(progress.is_completed,0);assert.equal(progress.is_waived,1);assert.equal(progress.waived_by_id,'user-admin-1');
});
