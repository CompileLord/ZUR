import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { createServer } from '../src/server.ts';
import { EmailDeliveryService, InMemoryEmailMock } from '../src/services/email-delivery-service.ts';

test('Account verification and recovery secrets are delivered only to email', async () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  const mock = new InMemoryEmailMock();
  const server = createServer(db, { emailDeliveryService: new EmailDeliveryService({
    provider: 'mock', mock, runtime: 'development', from: 'noreply@zur.local', appBaseUrl: 'http://localhost:5173',
  }) });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = async (path: string, body: object) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  try {
    const denied = await post('/api/auth/sign-up', { email: 'new@example.com', displayName: 'New Student',
      password: 'StrongPass123!' });
    assert.equal(denied.status, 400);
    const signup = await post('/api/auth/sign-up', { email: 'new@example.com', displayName: 'New Student',
      password: 'StrongPass123!', adultConfirmed: true });
    assert.equal(signup.status, 201);
    assert.equal(signup.data.verificationToken, undefined);
    assert.equal(mock.messages.length, 1);
    const verificationUrl = new URL(mock.messages[0].email.invitationUrl, 'http://localhost:5173');
    const verify = await post('/api/auth/verify-email', { token: verificationUrl.searchParams.get('token') });
    assert.equal(verify.status, 200);
    const unknown = await post('/api/auth/forgot-password', { email: 'absent@example.com' });
    const known = await post('/api/auth/forgot-password', { email: 'new@example.com' });
    assert.deepEqual(known, unknown);
    assert.equal(known.data.resetToken, undefined);
    assert.equal(mock.messages.length, 2);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
