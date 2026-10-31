import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminService } from '../src/services/admin-service.ts';
import { setup } from './helpers/admin-operations-fixture.ts';

const storedReason = (db: any) =>
  (db.prepare("SELECT reason FROM audit_events WHERE action='execution:reactivate' ORDER BY rowid DESC LIMIT 1").get() as any).reason;

// Admins describe incidents in plain words; only actual secrets and contact details are redacted.
test('audit reasons keep ordinary words like "password reset" readable', (t) => {
  const { db, cleanup } = setup(); t.after(cleanup); const admin = new AdminService(db);
  admin.setExecutionPaused('user-admin-1', false, 'reporter ada@zur.internal says password reset page broke');
  assert.equal(storedReason(db), 'reporter [redacted email] says password reset page broke');
  assert.equal(admin.listAudit('user-admin-1', { action: 'execution:reactivate' }).items[0].reason,
    'reporter [redacted email] says password reset page broke');
});

test('audit reasons redact a credential value exactly once', (t) => {
  const { db, cleanup } = setup(); t.after(cleanup); const admin = new AdminService(db);
  admin.setExecutionPaused('user-admin-1', false, 'learner posted password: hunter2 in a report');
  assert.equal(storedReason(db), 'learner posted [redacted credential] in a report');
  assert.equal(admin.listAudit('user-admin-1', { action: 'execution:reactivate' }).items[0].reason,
    'learner posted [redacted credential] in a report');
});

test('audit reasons redact the token after an Authorization: Bearer header', (t) => {
  const { db, cleanup } = setup(); t.after(cleanup); const admin = new AdminService(db);
  admin.setExecutionPaused('user-admin-1', false, 'leaked header Authorization: Bearer 9f8e7d6c5b4a in a log');
  assert.equal(storedReason(db), 'leaked header [redacted credential] in a log');
});
