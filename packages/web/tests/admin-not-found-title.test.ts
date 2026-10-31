import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAdminPageContent } from '../src/pages/admin/AdminPages.ts';

test('a missing admin record is titled as not found, not as the list it came from', () => {
  assert.equal(renderAdminPageContent('/admin/users/nope', null, { message: 'x', status: 404 }).title, 'User not found');
  assert.equal(renderAdminPageContent('/admin/reports/nope', null, { message: 'x', status: 404 }).title, 'Report not found');
});
