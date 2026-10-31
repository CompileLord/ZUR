import test from 'node:test';
import assert from 'node:assert/strict';
import { installAppDom } from './helpers/app-dom.ts';

test('a signed-in non-admin opening /admin sees the denial inside the signed-in shell', async () => {
  const dom = installAppDom({ id: 'u1', email: 'ada@zur.internal', displayName: 'Ada', capabilities: ['student'] });
  const { renderAppNow } = await import('../src/app/render-app.ts');
  renderAppNow('/admin/users');
  assert.match(dom.appEl.innerHTML, /This page isn't available/);
  assert.match(dom.appEl.innerHTML, /Account Menu/);
  assert.doesNotMatch(dom.appEl.innerHTML, /href="\/sign-in"/);
});
