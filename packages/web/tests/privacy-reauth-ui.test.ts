import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPrivacySettingsPage } from '../src/pages/settings/PrivacySettingsPage.ts';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k), key: () => null, get length() { return store.size; },
};
const { AuthClient } = await import('../src/services/auth-client.ts');

// The server requires the current password for export and deletion; the page must ask for it.
test('export form and delete dialog each ask for the current password', () => {
  const html = renderPrivacySettingsPage({});
  const exportForm = html.slice(html.indexOf('id="export-data-form"'), html.indexOf('</form>', html.indexOf('id="export-data-form"')));
  assert.match(exportForm, /type="password"[^>]*autocomplete="current-password"/);
  const dialog = html.slice(html.indexOf('id="delete-account-modal"'));
  assert.match(dialog, /id="delete-current-password"[^>]*type="password"|type="password"[^>]*id="delete-current-password"/);
});

test('privacy requests send the current password', async () => {
  const bodies: any[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_u: any, init: any) => { bodies.push(JSON.parse(init.body)); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }); }) as any;
  try {
    const client: any = AuthClient.getInstance();
    await client.requestDataExport('Secret-pass-1');
    await client.requestAccountDeletion(true, 'Secret-pass-2');
  } finally { globalThis.fetch = realFetch; }
  assert.equal(bodies[0].currentPassword, 'Secret-pass-1');
  assert.deepEqual(bodies[1], { consequenceAcknowledged: true, currentPassword: 'Secret-pass-2' });
});
