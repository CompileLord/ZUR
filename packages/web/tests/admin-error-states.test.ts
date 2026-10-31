import test from 'node:test';
import assert from 'node:assert/strict';
import { installAppDom } from './helpers/app-dom.ts';

async function loadWith(path: string, respond: (url: string) => { status: number; body: unknown }) {
  const dom = installAppDom({ id: 'a1', email: 'margaret@zur.internal', displayName: 'Margaret', capabilities: ['admin'] });
  const g = globalThis as any;
  g.window.location.pathname = path.split('?')[0];
  g.window.location.search = path.includes('?') ? `?${path.split('?')[1]}` : '';
  const requested: string[] = [];
  g.fetch = async (url: string) => {
    requested.push(url);
    const { status, body } = respond(url);
    return { ok: status < 400, status, json: async () => body };
  };
  const { loadAdminPage } = await import('../src/app/pages/admin-controller.ts');
  await loadAdminPage(path, 'Margaret', 'margaret@zur.internal');
  return { html: dom.appEl.innerHTML, requested };
}

const notFound = () => ({ status: 404, body: { error: { message: "This page isn't available." } } });

for (const [path, section, list] of [
  ['/admin/reports/nope', 'Report', '/admin/reports'],
  ['/admin/users/nope', 'User', '/admin/users'],
  ['/admin/audit/nope', 'Audit event', '/admin/audit'],
] as const) {
  test(`${path} shows a titled not-found state with a way back and no retry or loading text`, async () => {
    const { html } = await loadWith(path, notFound);
    assert.match(html, new RegExp(`<h1[^>]*>${section} not found</h1>`));
    assert.match(html, new RegExp(`href="${list}"`));
    assert.doesNotMatch(html, /data-admin-retry/);
    assert.doesNotMatch(html, /Loading operational records/);
  });
}

test('a server failure keeps Retry, a title and no loading text', async () => {
  const { html } = await loadWith('/admin/reports', () => ({ status: 500, body: { error: { message: 'Try again shortly.' } } }));
  assert.match(html, /<h1[^>]*>Reports<\/h1>/);
  assert.match(html, /data-admin-retry/);
  assert.doesNotMatch(html, /Loading operational records/);
});

test('unknown status and malformed paging fall back to defaults before the request', async () => {
  const ok = () => ({ status: 200, body: { items: [], total: 0, limit: 20, offset: 0 } });
  const reports = await loadWith('/admin/reports?status=bogus&limit=abc&offset=-3', ok);
  assert.deepEqual(reports.requested, ['/api/admin/reports']);
  assert.doesNotMatch(reports.html, /isn't available/);
  const users = await loadWith('/admin/users?status=active&limit=500&search=ada', ok);
  assert.deepEqual(users.requested, ['/api/admin/users?status=active&search=ada']);
});
