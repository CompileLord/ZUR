import test from 'node:test';
import assert from 'node:assert/strict';
import { adminForm } from '../src/pages/admin/admin-page-helpers.ts';

test('an admin form names its target only when one is given, never a guess from the URL', () => {
  assert.doesNotMatch(adminForm('/api/admin/categories', '', 'Create category'), /Target:/);
  assert.match(adminForm('/api/admin/users/u1/suspend', '', 'Suspend', 'post', 'danger', { target: 'ada@zur.internal' }), /Target:<\/span> <span[^>]*>ada@zur\.internal</);
});
