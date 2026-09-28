import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { AdminService } from '../src/services/admin-service.ts';
import { AuthorizationService } from '../src/services/auth-service.ts';
import { AttemptService } from '../src/services/attempt-service.ts';
import { IdentityService } from '../src/services/identity-service.ts';
import { OperationalMetricsService } from '../src/services/operational-metrics-service.ts';
import { NotFoundError, ConflictError, ValidationError } from 'zur-shared';
import crypto from 'node:crypto';
import { closeDatabase } from '../src/db/database.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createJsonZip } from '../src/services/export-archive.ts';

function setup(){const path=`file:admin-${crypto.randomUUID()}?mode=memory&cache=shared`;runMigrations(path);seedDatabase(path);return {db:getDatabase(path),cleanup:()=>closeDatabase(path)};}
function useDeletionRegistry(t: any) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-admin-registry-'));
  const previous = process.env.DELETION_REGISTRY_PATH;
  process.env.DELETION_REGISTRY_PATH = path.join(directory, 'tombstones.jsonl');
  t.after(() => { if (previous === undefined) delete process.env.DELETION_REGISTRY_PATH; else process.env.DELETION_REGISTRY_PATH = previous; fs.rmSync(directory, { recursive: true, force: true }); });
}

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
  assert.equal(records.enrollments[0].versionNumber,db.prepare('SELECT version_number FROM course_versions WHERE id=?').get(enrollment.pinned_version_id).version_number);
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

test('Categories reject normalized duplicates and require explicit in-use reassignment',(t)=>{
  const {db,cleanup}=setup();t.after(cleanup);const admin=new AdminService(db);
  assert.throws(()=>admin.saveCategory('user-admin-1','  PROGRAMMING  '),ConflictError);
  admin.saveCategory('user-admin-1','Foundations');
  const cat=admin.listCategories('user-admin-1').find((x:any)=>x.usageCount>0) as any;
  assert.throws(()=>admin.removeCategory('user-admin-1',cat.id),ConflictError);
  const replacement=admin.listCategories('user-admin-1').find((x:any)=>x.id!==cat.id) as any;
  assert.ok(replacement);
  const result=admin.removeCategory('user-admin-1',cat.id,replacement.id,'Consolidate course taxonomy');
  assert.ok(result.reassigned>0);
  assert.ok(admin.listAudit('user-admin-1',{action:'category:remove'}).items.length);
});

test('Report resolution requires an outcome and audit reason; list omits submitted code',(t)=>{
  const {db,cleanup}=setup();t.after(cleanup);const admin=new AdminService(db), now=new Date().toISOString();
  db.prepare(`INSERT INTO reports(id,reporter_id,course_id,type,description,submitted_code,status,created_at,updated_at)
    VALUES('rep-admin-test','user-student-1','course-python-foundations','broken_exercise','Sample report','PRIVATE_CODE','open',?,?)`).run(now,now);
  const list=admin.listReports('user-admin-1');
  assert.equal(JSON.stringify(list).includes('PRIVATE_CODE'),false);
  assert.throws(()=>admin.updateReport('user-admin-1','rep-admin-test','resolved','','','Reviewed'),ValidationError);
  const updated=admin.updateReport('user-admin-1','rep-admin-test','resolved','Reproduced and fixed in version 3','Internal note','Issue verified and resolved');
  assert.equal(updated.status,'resolved');
  const repWithoutVer = admin.getReport('user-admin-1','rep-admin-test');
  assert.ok(repWithoutVer.resolutionOutcome);
  assert.equal(repWithoutVer.versionNumber, null);
  assert.equal(repWithoutVer.versionDetails, null);

  // Exact immutable version and step linking test
  const versionRow = db.prepare('SELECT id, version_number, snapshot_data FROM course_versions WHERE course_id = ? LIMIT 1').get('course-python-foundations') as any;
  const snapshot = JSON.parse(versionRow.snapshot_data);
  const firstStep = (snapshot.modules || []).flatMap((m: any) => m.lessons || []).flatMap((l: any) => l.steps || [])[0];

  db.prepare(`INSERT INTO reports(id,reporter_id,course_id,course_version_id,step_id,type,description,status,created_at,updated_at)
    VALUES('rep-admin-exact-ver','user-student-1','course-python-foundations',?,?,'broken_exercise','Step issue in immutable version','open',?,?)`).run(versionRow.id, firstStep.id, now, now);
  const repWithVer = admin.getReport('user-admin-1', 'rep-admin-exact-ver');
  assert.equal(repWithVer.courseVersionId, versionRow.id);
  assert.equal(repWithVer.versionNumber, versionRow.version_number);
  assert.ok(repWithVer.versionDetails);
  assert.equal(repWithVer.versionDetails.id, versionRow.id);
  assert.equal(repWithVer.versionDetails.versionNumber, versionRow.version_number);
  assert.equal(repWithVer.stepTitle, firstStep.title);

  // Missing snapshot test: report has courseVersionId but row is not in course_versions
  db.exec('PRAGMA foreign_keys = OFF;');
  db.prepare(`INSERT INTO reports(id,reporter_id,course_id,course_version_id,step_id,type,description,status,created_at,updated_at)
    VALUES('rep-admin-missing-snap','user-student-1','course-python-foundations','nonexistent-ver-id',?,'broken_exercise','Snapshot missing','open',?,?)`).run(firstStep.id, now, now);
  db.exec('PRAGMA foreign_keys = ON;');
  const repMissingSnap = admin.getReport('user-admin-1', 'rep-admin-missing-snap');
  assert.equal(repMissingSnap.courseVersionId, 'nonexistent-ver-id');
  assert.equal(repMissingSnap.versionNumber, null);
  assert.equal(repMissingSnap.versionDetails, null);
  assert.equal(repMissingSnap.stepTitle, null);
});

test('Media preview and deletion enforce quarantine and retained-reference checks',(t)=>{
  const {db,cleanup}=setup();t.after(cleanup);const admin=new AdminService(db);
  const file=`/tmp/zur-admin-media-${crypto.randomUUID()}.png`;fs.writeFileSync(file,'fixture');
  t.after(()=>{if(fs.existsSync(file))fs.unlinkSync(file);});
  db.prepare(`INSERT INTO media_assets(id,course_id,uploader_id,file_path,file_size,mime_type,processing_status)
    VALUES('asset-admin-test','course-python-foundations','user-author-1',?,7,'image/png','ready')`).run(file);
  assert.throws(()=>admin.deleteMedia('user-admin-1','asset-admin-test','Remove duplicate upload after review'),ConflictError);
  db.prepare(`UPDATE media_assets SET processing_status='quarantined' WHERE id='asset-admin-test'`).run();
  const existingContent=db.prepare(`SELECT id,content_payload FROM step_contents WHERE step_id='step-4-python-echo'`).get() as any;
  db.prepare(`UPDATE step_contents SET content_payload=? WHERE step_id='step-4-python-echo'`)
    .run(JSON.stringify({image:{assetId:'asset-admin-test'}}));
  assert.throws(()=>admin.deleteMedia('user-admin-1','asset-admin-test','Remove duplicate upload after review'),ConflictError);
  db.prepare(`UPDATE step_contents SET content_payload=? WHERE id=?`).run(existingContent.content_payload,existingContent.id);
  const result=admin.deleteMedia('user-admin-1','asset-admin-test','Remove duplicate upload after review');
  assert.equal(result.deleted,true);assert.equal(fs.existsSync(file),false);
  assert.ok(admin.listAudit('user-admin-1',{action:'media:delete'}).items.length);
});

test('Audit search scopes actor, target, reason, time, and correlation while removing sensitive metadata',(t)=>{
  const {db,cleanup}=setup();t.after(cleanup);const admin=new AdminService(db),now=new Date().toISOString();
  db.prepare(`INSERT INTO audit_events(id,actor_id,action,target_type,target_id,reason,metadata,correlation_id,created_at)
    VALUES('audit-private-test','user-admin-1','support:review','user','user-student-1','Investigate learner report','{"safe":"ok","code":"SECRET_CODE","nested":{"signedUrl":"https://x.test/?token=SECRET_TOKEN"}}','correlation-private',?)`).run(now);
  const found=admin.listAudit('user-admin-1',{targetType:'user',targetId:'user-student-1',reason:'learner report',correlationId:'correlation-private'});
  assert.equal(found.total,1);assert.equal(found.items[0].id,'audit-private-test');
  const detail=admin.getAuditEvent('user-admin-1','audit-private-test');
  assert.doesNotMatch(JSON.stringify(detail),/SECRET_CODE|SECRET_TOKEN/);assert.equal(detail.metadata.safe,'ok');
  admin.setExecutionPaused('user-admin-1',false,'Investigate API_TOKEN=supersecret and learner@example.test\n```python\nprint("PRIVATE_CODE")\n```');
  const stored=db.prepare("SELECT reason FROM audit_events WHERE action='execution:reactivate' ORDER BY created_at DESC LIMIT 1").get() as any;
  assert.doesNotMatch(stored.reason,/supersecret|learner@example\.test|PRIVATE_CODE/);
  assert.match(stored.reason,/redacted/);
  admin.setExecutionPaused('user-admin-1',false,'Review learner issue x = 2 and print(2) after report');
  const inlineStored=db.prepare("SELECT reason FROM audit_events WHERE action='execution:reactivate' ORDER BY rowid DESC LIMIT 1").get() as any;
  assert.doesNotMatch(inlineStored.reason,/x = 2|print\(2\)/);
  assert.match(inlineStored.reason,/reason redacted/);
  db.prepare(`INSERT INTO audit_events(id,actor_id,action,target_type,target_id,reason,created_at) VALUES('audit-legacy-reason','user-admin-1','legacy:test','user','user-student-1','token=older-secret and private@example.test',?)`).run(now);
  assert.doesNotMatch(JSON.stringify(admin.listAudit('user-admin-1',{targetId:'user-student-1'}).items.find((item:any)=>item.id==='audit-legacy-reason')),/older-secret|private@example\.test/);
  assert.doesNotMatch(JSON.stringify(admin.getAuditEvent('user-admin-1','audit-legacy-reason')),/older-secret|private@example\.test/);
  db.prepare(`INSERT INTO audit_events(id,actor_id,action,target_type,target_id,reason,created_at) VALUES('audit-legacy-code','user-admin-1','legacy:code','user','user-student-1','Review learner issue x = 2 and print(2) from notes',?)`).run(now);
  const legacyCodeList=admin.listAudit('user-admin-1',{targetId:'user-student-1'}).items.find((item:any)=>item.id==='audit-legacy-code');
  assert.doesNotMatch(JSON.stringify(legacyCodeList),/x = 2|print\(2\)/);
  assert.doesNotMatch(JSON.stringify(admin.getAuditEvent('user-admin-1','audit-legacy-code')),/x = 2|print\(2\)/);
  db.prepare(`INSERT INTO agent_mutations(id,token_id,author_id,course_id,tool_name,idempotency_key,base_revision,new_revision,affected_entities,prior_content,new_content,outcome,correlation_id,created_at)
    VALUES('agent-private-test','tok-guido-1','user-author-1','course-python-foundations','update_step','idem-private',2,3,'["step-4-python-echo"]','{"code":"PRIVATE_OLD"}','{"code":"PRIVATE_NEW"}','applied','agent-correlation',?)`).run(now);
  const agentRows=admin.listAudit('user-admin-1',{action:'agent:update_step',targetType:'course',correlationId:'agent-correlation'});
  assert.equal(agentRows.total,1);assert.equal(agentRows.items[0].source,'agent');
  const agentDetail=admin.getAuditEvent('user-admin-1','agent-private-test');
  assert.equal(agentDetail.affectedEntities[0],'step-4-python-echo');assert.doesNotMatch(JSON.stringify(agentDetail),/PRIVATE_OLD|PRIVATE_NEW/);
});

test('Deletion purge waits 30 days, blocks ownership, scrubs identity, and writes re-deletion marker',(t)=>{
  useDeletionRegistry(t);
  const {db,cleanup}=setup();t.after(cleanup);const admin=new AdminService(db), old=new Date(Date.now()-31*86400000).toISOString(),now=new Date().toISOString();
  db.prepare(`INSERT INTO privacy_requests(id,user_id,request_type,status,consequence_acknowledged,created_at,updated_at) VALUES('priv-old','user-student-1','deletion','pending',1,?,?)`).run(old,now);
  const result=admin.purgeAccount('user-admin-1','priv-old','Verified account deletion after retention period');
  assert.equal(result.status,'completed');assert.equal(result.backupRedactionRequired,true);
  const user=db.prepare('SELECT email,display_name,account_status FROM users WHERE id=?').get('user-student-1') as any;
  assert.equal(user.account_status,'purged');assert.equal(user.display_name,'Deleted learner');assert.match(user.email,/purged\.invalid$/);
  assert.equal((db.prepare('SELECT COUNT(*) count FROM deletion_registry WHERE user_id=?').get('user-student-1') as any).count,1);
});

test('Export request creates a scoped data package before setting completed status',(t)=>{
  const {db,cleanup}=setup();t.after(cleanup);const admin=new AdminService(db),identity=new IdentityService(db),now=new Date().toISOString();
  db.prepare(`INSERT INTO privacy_requests(id,user_id,request_type,status,consequence_acknowledged,created_at,updated_at) VALUES('priv-export','user-student-1','export','pending',1,?,?)`).run(now,now);
  assert.throws(()=>admin.updatePrivacyRequest('user-admin-1','priv-export','completed','Export sent to requester'),ConflictError);
  const ready=admin.exportAccount('user-admin-1','priv-export','Fulfill verified learner data export request');
  const bundle=JSON.parse(identity.getPrivacyExport('user-student-1','priv-export'));
  assert.equal(bundle.profile.displayName,'Ada Lovelace');assert.ok(bundle.enrollments.length>0);assert.equal(bundle.privacyRequestId,'priv-export');
  assert.equal(ready.status,'completed');assert.equal(ready.downloadUrl,'/api/settings/privacy/exports/priv-export');assert.throws(()=>identity.getPrivacyExport('user-admin-1','priv-export'),NotFoundError);
  assert.equal((db.prepare(`SELECT status FROM privacy_requests WHERE id='priv-export'`).get() as any).status,'completed');
  assert.ok(identity.getPrivacyStatus('user-student-1').requests[0].exportExpiresAt);
  assert.ok(admin.listAudit('user-admin-1',{action:'privacy_request:export'}).items.length);
});

test('ZIP export contains a valid compressed JSON member',(t)=>{
  const json=JSON.stringify({profile:{displayName:'Ada Lovelace'},attempts:[{codeSnapshot:'print(1)'}]});
  const zip=createJsonZip('account-export.json',json);assert.equal(zip.readUInt32LE(0),0x04034b50);
  const nameLength=zip.readUInt16LE(26),compressedLength=zip.readUInt32LE(18),offset=30+nameLength;
  assert.equal(zip.subarray(30,offset).toString(),'account-export.json');
  assert.equal(inflateRawSync(zip.subarray(offset,offset+compressedLength)).toString(),json);
  assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);
});

test('Deletion reports owner blockers and admin can resolve them by archived courses',(t)=>{
  useDeletionRegistry(t);
  const {db,cleanup}=setup();t.after(cleanup);const admin=new AdminService(db),old=new Date(Date.now()-31*86400000).toISOString(),now=new Date().toISOString();
  db.prepare(`INSERT INTO privacy_requests(id,user_id,request_type,status,consequence_acknowledged,created_at,updated_at) VALUES('priv-owner-delete','user-author-1','deletion','pending',1,?,?)`).run(old,now);
  assert.throws(()=>admin.purgeAccount('user-admin-1','priv-owner-delete','Review ownership before deletion request'),ConflictError);
  assert.match((db.prepare(`SELECT blocker_reason FROM privacy_requests WHERE id='priv-owner-delete'`).get() as any).blocker_reason,/owned courses/);
  const courses=db.prepare(`SELECT id FROM courses WHERE owner_id='user-author-1' AND publication_status!='archived'`).all() as any[];
  assert.ok(courses.length>0);
  for(const course of courses)admin.archiveCourseForDeletion('user-admin-1',course.id,'Resolve account deletion ownership blocker');
  const purge=admin.purgeAccount('user-admin-1','priv-owner-delete','Complete deletion after ownership resolution');
  assert.equal(purge.status,'completed');assert.ok(admin.listAudit('user-admin-1',{action:'course:archive_for_deletion'}).items.length);
});
