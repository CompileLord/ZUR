import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

const { AuthClient, ApiTimeoutError, SESSION_EXPIRED_EVENT } = await import('../src/services/auth-client.ts');

const user: any = { id: 'u1', email: 'a@b.co', displayName: 'A', emailVerified: true, capabilities: ['student'] };
const realFetch = globalThis.fetch;
const realDispatch = (globalThis as any).dispatchEvent;

function json(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup() {
  const client: any = AuthClient.getInstance();
  client.clearSession();
  const events: CustomEvent[] = [];
  (globalThis as any).dispatchEvent = (e: CustomEvent) => { events.push(e); return true; };
  return { client, events };
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
  (globalThis as any).dispatchEvent = realDispatch;
});

test('AuthClient.fetchApi', async (t) => {
  await t.test('omits Authorization when signed out', async () => {
    const { client } = setup();
    let seen: Record<string, string> = {};
    globalThis.fetch = (async (_u: any, init: any) => { seen = init.headers; return json(200, { ok: true }); }) as any;
    await client.fetchApi('/api/public');
    assert.equal('Authorization' in seen, false);
  });

  await t.test('never sends an empty Bearer header (caller-supplied empty header)', async () => {
    const { client } = setup();
    client.setSession(user);
    let seen: Record<string, string> = {};
    globalThis.fetch = (async (_u: any, init: any) => { seen = init.headers; return json(200); }) as any;
    await client.fetchApi('/api/x', { headers: { authorization: 'Bearer ' } });
    assert.equal(Object.keys(seen).some((k) => k.toLowerCase() === 'authorization'), false);
  });

  await t.test('relies on the HttpOnly session cookie: no Authorization header, same-origin credentials', async () => {
    const { client } = setup();
    client.setSession(user);
    let seen: any = {};
    globalThis.fetch = (async (_u: any, init: any) => { seen = init; return json(200); }) as any;
    await client.fetchApi('/api/x');
    assert.equal('Authorization' in seen.headers, false);
    assert.equal(seen.credentials, 'same-origin');
  });

  await t.test('sign-in never persists the session token in browser storage', async () => {
    const { client } = setup();
    globalThis.fetch = (async () => json(200, { token: 'secret-session-token', user })) as any;
    await client.signIn('a@b.co', 'pw');
    assert.equal(client.isAuthenticated(), true);
    assert.equal([...store.values()].some((v) => v.includes('secret-session-token')), false);
  });

  await t.test('401 clears the session and emits exactly one zur:session-expired with the path', async () => {
    const { client, events } = setup();
    client.setSession(user);
    globalThis.fetch = (async () => json(401, { error: { code: 'UNAUTHENTICATED', message: 'nope' } })) as any;
    const results = await Promise.allSettled([client.fetchApi('/api/a'), client.fetchApi('/api/b'), client.fetchApi('/api/c')]);
    assert.ok(results.every((r) => r.status === 'rejected'));
    assert.equal((results[0] as PromiseRejectedResult).reason.status, 401);
    assert.equal(client.isAuthenticated(), false);
    assert.equal(store.get('zur_session_token'), undefined);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, SESSION_EXPIRED_EVENT);
    assert.equal(events[0].type, 'zur:session-expired');
    assert.ok(['/api/a', '/api/b', '/api/c'].includes(events[0].detail.path));
  });

  await t.test('401 from sign-in (bad credentials) neither clears nor emits', async () => {
    const { client, events } = setup();
    globalThis.fetch = (async () => json(401, { error: { code: 'INVALID', message: 'bad' } })) as any;
    await assert.rejects(client.signIn('a@b.co', 'x'), /bad/);
    assert.equal(events.length, 0);
  });

  await t.test('401 while signed out does not emit', async () => {
    const { client, events } = setup();
    globalThis.fetch = (async () => json(401)) as any;
    await assert.rejects(client.fetchApi('/api/x'));
    assert.equal(events.length, 0);
  });

  await t.test('non-401 errors keep the session and carry code/status', async () => {
    const { client, events } = setup();
    client.setSession(user);
    globalThis.fetch = (async () => json(403, { error: { code: 'FORBIDDEN', message: 'no' } })) as any;
    await assert.rejects(client.fetchApi('/api/x'), (e: any) => e.code === 'FORBIDDEN' && e.status === 403);
    assert.equal(client.isAuthenticated(), true);
    assert.equal(events.length, 0);
  });

  await t.test('times out with ApiTimeoutError and aborts the request', async () => {
    const { client } = setup();
    let aborted = false;
    globalThis.fetch = ((_u: any, init: any) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => { aborted = true; rej(new DOMException('aborted', 'AbortError')); });
    })) as any;
    await assert.rejects(client.fetchApi('/api/slow', { timeoutMs: 20 }), (e: any) => e instanceof ApiTimeoutError && e.code === 'REQUEST_TIMEOUT');
    assert.equal(aborted, true);
  });

  await t.test('caller abort is not reported as a timeout', async () => {
    const { client } = setup();
    globalThis.fetch = ((_u: any, init: any) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    })) as any;
    const ac = new AbortController();
    const p = client.fetchApi('/api/slow', { signal: ac.signal });
    ac.abort();
    await assert.rejects(p, (e: any) => !(e instanceof ApiTimeoutError) && e.name === 'AbortError');
  });
});
