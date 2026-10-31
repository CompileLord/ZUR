import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminService } from '../src/services/admin-service.ts';
import { ConflictError, ValidationError } from 'zur-shared';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setup, useDeletionRegistry } from './helpers/admin-operations-fixture.ts';

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
