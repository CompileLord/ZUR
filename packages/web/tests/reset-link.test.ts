import test from 'node:test';
import assert from 'node:assert/strict';
import { isInvalidResetLinkError, validateNewPassword } from '../src/pages/account/reset-link.ts';
import { renderResetPasswordPage } from '../src/pages/account/PasswordRecoveryPages.ts';

test('Reset links rejected by the server are treated as invalid or expired', () => {
  assert.equal(isInvalidResetLinkError({ code: 'VALIDATION_ERROR', status: 400 }), true);
  assert.equal(isInvalidResetLinkError({ code: 'RATE_LIMITED', status: 429 }), false);
  assert.equal(isInvalidResetLinkError(new TypeError('Failed to fetch')), false);
  assert.equal(isInvalidResetLinkError(null), false);
});

test('A weak new password is rejected locally so server validation errors always mean a bad link', () => {
  assert.match(validateNewPassword('short') ?? '', /at least 8 characters/);
  assert.equal(validateNewPassword('long-enough-1'), null);
});

test('The invalid link state offers a way to request a new link', () => {
  const html = renderResetPasswordPage({ isInvalidToken: true });
  assert.match(html, /href="\/forgot-password"[^>]*>Request a new reset link/);
});
