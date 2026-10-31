import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminService } from '../src/services/admin-service.ts';
import { IdentityService } from '../src/services/identity-service.ts';
import { NotFoundError, ConflictError } from 'zur-shared';
import { inflateRawSync } from 'node:zlib';
import { createJsonZip } from '../src/services/export-archive.ts';
import { setup, useDeletionRegistry } from './helpers/admin-operations-fixture.ts';

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
