import test from 'node:test';
import assert from 'node:assert/strict';
import { actionLabel, stateLabel } from '../src/pages/admin/admin-labels.ts';
import { renderAdminPage } from '../src/pages/admin/AdminPages.ts';

test('audit action codes read as plain sentences', () => {
  assert.equal(actionLabel('report:status'), 'Report status changed');
  assert.equal(actionLabel('enrollment.reinstate'), 'Enrollment reinstated');
  assert.equal(actionLabel('enrollment.revoke'), 'Enrollment revoked');
  assert.equal(actionLabel('user:grant-author'), 'Author access granted');
  assert.equal(actionLabel('user:suspend'), 'Account suspended');
  assert.equal(actionLabel('course:waive_step'), 'Step waived');
  assert.equal(actionLabel('execution:disable_new'), 'New runs paused');
  assert.equal(actionLabel('support:records_viewed'), 'Support records viewed');
});

test('unknown action codes still read as words, never as the raw code', () => {
  assert.equal(actionLabel('widget:frobnicate_all'), 'Widget frobnicate all');
  assert.equal(actionLabel('agent:update_step'), 'Agent update step');
  assert.equal(actionLabel('thing.happened'), 'Thing happened');
  assert.equal(actionLabel(''), '');
});

test('state values lose underscores and odd capitals', () => {
  assert.equal(stateLabel('pending_deletion'), 'Pending deletion');
  assert.equal(stateLabel('investigating'), 'Investigating');
  assert.equal(stateLabel('admin'), 'Admin');
  assert.equal(stateLabel(undefined), '');
});

test('users, audit and detail pages render the mapped labels', () => {
  const users = renderAdminPage('/admin/users', { items: [{ id: 'u1', displayName: 'Ana', email: 'a@x.test', emailVerified: true, capabilities: ['student'], accountStatus: 'pending_deletion', createdAt: '2026-10-01T00:00:00.000Z' }], total: 1, limit: 20, offset: 0 });
  assert.match(users, /Pending deletion/);
  assert.doesNotMatch(users, /Pending_deletion/);
  const audit = renderAdminPage('/admin/audit', { items: [{ id: 'e1', createdAt: '2026-10-01T00:00:00.000Z', actorName: 'M', action: 'enrollment.reinstate', targetType: 'enrollment', targetId: 'x', reason: 'because', correlationId: 'c' }], total: 1, limit: 50, offset: 0 });
  assert.match(audit, /Enrollment reinstated/);
  assert.doesNotMatch(audit, /Enrollment\.reinstate/);
});
