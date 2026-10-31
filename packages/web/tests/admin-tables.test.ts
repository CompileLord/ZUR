import test from 'node:test';
import assert from 'node:assert/strict';
import { table } from '../src/pages/admin/admin-page-helpers.ts';
import { adminStyles } from '../src/pages/admin/admin-styles.ts';

test('admin tables sit in a focusable, labelled scroll region', () => {
  const html = table(['User', 'Email', { label: 'Count', align: 'right' }, 'State'], ['<tr><td>a</td><td>b</td><td>1</td><td>c</td></tr>'], 'None');
  assert.match(html, /<div class="data-table-wrapper" role="region" tabindex="0" aria-label="Table with columns User, Email, Count">/);
  assert.match(table(['A'], [], 'None'), /role="region" tabindex="0" aria-label="Table with columns A"/);
});

test('the scroll region shows edge shadows and narrow screens keep first-column names on one line', () => {
  assert.match(adminStyles, /\.data-table-wrapper[^}]*background-attachment: local, local, scroll, scroll/);
  assert.match(adminStyles, /\.data-table-wrapper:focus-visible/);
  assert.match(adminStyles, /@media \(max-width: 760px\)[\s\S]*\.data-table td:first-child[\s\S]*white-space: nowrap/);
});
