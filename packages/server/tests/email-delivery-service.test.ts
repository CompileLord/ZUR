import test from 'node:test';
import assert from 'node:assert/strict';
import { EmailDeliveryService, InMemoryEmailMock } from '../src/services/email-delivery-service.ts';

const invitation = {
  recipientEmail: 'learner@example.test', courseTitle: 'Python basics', inviterName: 'Teacher',
  invitationUrl: '/join/opaque-token', expiresAt: '2026-10-01T00:00:00.000Z',
};
const baseConfig = { from: 'ZUR <noreply@example.test>', appBaseUrl: 'https://zur.example.test' };

test('Postmark reports configured delivery outcomes without changing invitation validity', async () => {
  const absent = await new EmailDeliveryService({ ...baseConfig, provider: 'postmark', runtime: 'test' }).sendInvitation(invitation);
  assert.equal(absent.status, 'not_configured');
  assert.match(absent.message, /invitation remains valid/i);

  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const success = await new EmailDeliveryService({
    ...baseConfig, provider: 'postmark', serverToken: 'test-token', runtime: 'test',
    fetcher: async (url, init) => { requestUrl = url; requestInit = init; return { ok: true, status: 200 }; },
  }).sendInvitation(invitation);
  assert.equal(success.status, 'sent');
  assert.ok(success.sentAt);
  assert.equal(requestUrl, 'https://api.postmarkapp.com/email');
  assert.equal((requestInit?.headers as Record<string, string>)['X-Postmark-Server-Token'], 'test-token');
  assert.equal((requestInit?.headers as Record<string, string>).Authorization, undefined);
  const body = JSON.parse(String(requestInit?.body));
  assert.equal(body.To, invitation.recipientEmail);
  assert.ok(body.TextBody.includes('https://zur.example.test/join/opaque-token'));
  const escaped = await new EmailDeliveryService({
    ...baseConfig, provider: 'postmark', serverToken: 'test-token', runtime: 'test',
    fetcher: async (_url, init) => { requestInit = init; return { ok: true, status: 200 }; },
  }).sendInvitation({ ...invitation, courseTitle: '<Foundations & practice>' });
  assert.equal(escaped.status, 'sent');
  assert.ok(JSON.parse(String(requestInit?.body)).HtmlBody.includes('&lt;Foundations &amp; practice&gt;'));
  assert.match(success.message, /accepted.*for delivery/i);

  const failure = await new EmailDeliveryService({
    ...baseConfig, provider: 'postmark', serverToken: 'test-token', runtime: 'test',
    fetcher: async () => ({ ok: false, status: 503 }),
  }).sendInvitation(invitation);
  assert.equal(failure.status, 'failed');
  assert.equal(failure.sentAt, null);
  assert.match(failure.message, /invitation remains valid/i);
});

test('local in-memory mock captures invitations and never claims an email was sent', async () => {
  const mock = new InMemoryEmailMock();
  const result = await new EmailDeliveryService({
    ...baseConfig, provider: 'mock', runtime: 'development', mock,
  }).sendInvitation(invitation);
  assert.equal(result.status, 'not_configured');
  assert.equal(result.sentAt, null);
  assert.match(result.message, /no email was sent/i);
  assert.equal(mock.messages.length, 1);
  assert.equal(mock.messages[0].email.recipientEmail, invitation.recipientEmail);
  assert.ok(mock.messages[0].message.text.includes('/join/opaque-token'));

  const blocked = await new EmailDeliveryService({
    ...baseConfig, provider: 'mock', runtime: 'production', mock,
  }).sendInvitation(invitation);
  assert.equal(blocked.status, 'not_configured');
  assert.equal(mock.messages.length, 1);
});
