import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSignInPage } from '../src/pages/account/SignInPage.ts';
import { renderSignUpPage } from '../src/pages/account/SignUpPage.ts';
import { renderVerifyEmailPage } from '../src/pages/account/VerifyEmailPage.ts';
import { renderForgotPasswordPage, renderResetPasswordPage } from '../src/pages/account/PasswordRecoveryPages.ts';
import { renderProfileSettingsPage } from '../src/pages/settings/ProfileSettingsPage.ts';
import { renderAppearanceSettingsPage } from '../src/pages/settings/AppearanceSettingsPage.ts';
import { renderSecuritySettingsPage } from '../src/pages/settings/SecuritySettingsPage.ts';
import { renderPrivacySettingsPage } from '../src/pages/settings/PrivacySettingsPage.ts';
import { renderSafeDenialPage } from '../src/pages/status/SafeDenialPage.ts';
import { getSafeReturnDestination } from '../src/router/routes.ts';
import type { User } from 'zur-shared';

const testUser: User = {
  id: 'user-test-1',
  email: 'ada@zur.internal',
  displayName: 'Ada Lovelace',
  emailVerified: true,
  capabilities: ['student', 'author'],
  accountStatus: 'active',
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
};

test('Identity and Account Client Pages (S1-M01, P04-P08, P17-P20, P42)', async (t) => {
  await t.test('Untrusted account text is escaped in fields and status messages', () => {
    const payload = '\"><img src=x onerror=alert(1)>';
    const verify = renderVerifyEmailPage({ email: payload, error: payload, infoMessage: payload });
    const signUp = renderSignUpPage({ email: payload, returnTo: payload, error: payload });
    assert.ok(!verify.includes('<img'));
    assert.ok(!signUp.includes('<img'));
    assert.ok(verify.includes('&lt;img'));
    assert.ok(signUp.includes('&lt;img'));
    assert.ok(renderVerifyEmailPage({ isVerified: true, returnTo: 'javascript:alert(1)' }).includes('href="/learn"'));
  });
  await t.test('P04: Sign-in renders accessible labels, recovery link, and aria-live error region', () => {
    const html = renderSignInPage({ email: 'ada@zur.internal', returnTo: '/learn' });

    assert.ok(html.includes('Welcome back'), 'Title should be Welcome back');
    assert.ok(html.includes('action="/api/auth/sign-in"'), 'Submits to sign-in endpoint');
    assert.ok(html.includes('type="email"'), 'Has email input');
    assert.ok(html.includes('type="password"'), 'Has password input');
    assert.ok(html.includes('id="toggle-password"'), 'Has show password toggle');
    assert.ok(html.includes('Forgot password?'), 'Has recovery link');
    assert.ok(html.includes('aria-live="polite"'), 'Has live region for error announcements');
    assert.ok(html.includes('Create an account'), 'Links to registration');
  });

  await t.test('P05: Sign-up renders display name, email, password requirements, and pilot terms', () => {
    const html = renderSignUpPage();

    assert.ok(html.includes('Create your account'), 'Title matches P05');
    assert.ok(html.includes('name="displayName"'), 'Collects display name');
    assert.ok(html.includes('name="email"'), 'Collects email');
    assert.ok(html.includes('At least 8 characters'), 'Displays password requirements hint');
    assert.ok(html.includes('/terms') && html.includes('/privacy'), 'Links to terms and privacy policy');
    assert.ok(html.includes('at least 18 years of age'), 'Explicitly notes adult pilot requirement per ADR-001');
  });

  await t.test('P06: Verify-email masks destination address and presents cooldown resend', () => {
    const html = renderVerifyEmailPage({
      email: 'student@example.com',
      cooldownRemaining: 45,
    });

    assert.ok(html.includes('Check your email'), 'Title matches P06');
    assert.ok(html.includes('s***t@e***.com'), 'Email is masked');
    assert.ok(html.includes('Resend email (45s)'), 'Shows remaining cooldown seconds');
    assert.ok(html.includes('disabled'), 'Resend button disabled during cooldown');
    assert.ok(html.includes('Use a different account'), 'Provides safe exit to switch accounts');
  });

  await t.test('P07: Password recovery renders generic response and reset verification', () => {
    // Forgot password view
    const forgotHtml = renderForgotPasswordPage();
    assert.ok(forgotHtml.includes('Reset password'), 'Title matches');
    assert.ok(forgotHtml.includes('name="email"'), 'Collects target email');

    // Submitted state (generic protection against enumeration)
    const submittedHtml = renderForgotPasswordPage({ isSubmitted: true });
    assert.ok(submittedHtml.includes('If an account matches that email address, a password reset link has been sent'));

    // Reset password form
    const resetHtml = renderResetPasswordPage({ token: 'test-token-123' });
    assert.ok(resetHtml.includes('Update password'), 'Title matches');
    assert.ok(resetHtml.includes('name="newPassword"'), 'Collects new password');
    assert.ok(resetHtml.includes('name="confirmNewPassword"'), 'Confirms password');
    assert.ok(resetHtml.includes('value="test-token-123"'), 'Preserves token safely');

    // Expired token state
    const expiredHtml = renderResetPasswordPage({ isInvalidToken: true });
    assert.ok(expiredHtml.includes('Invalid or expired link'), 'Explains expiry');
    assert.ok(expiredHtml.includes('Request a new reset link'), 'Offers recovery path');
  });

  await t.test('P17: Profile settings renders display name and read-only verified email', () => {
    const html = renderProfileSettingsPage({ user: testUser });

    assert.ok(html.includes('Profile settings'), 'Heading present');
    assert.ok(html.includes('name="displayName"'), 'Editable display name');
    assert.ok(html.includes('value="Ada Lovelace"'), 'Populated with user display name');
    assert.ok(html.includes('readonly'), 'Email is read-only');
    assert.ok(html.includes('Verified'), 'Displays verified status badge');
    assert.ok(html.includes('Save changes'), 'Has primary submit button');
  });

  await t.test('P18: Appearance settings renders Dark, Light, System and editor options', () => {
    const html = renderAppearanceSettingsPage({
      preferences: {
        userId: testUser.id,
        theme: 'system',
        editorFontSize: 16,
        indentationSpaces: 2,
        updatedAt: '2026-09-24T00:00:00.000Z',
      },
      resolvedSystemTheme: 'dark',
    });

    assert.ok(html.includes('Appearance settings'), 'Heading present');
    assert.ok(html.includes('Dark') && html.includes('Light') && html.includes('System'), 'All 3 themes supported');
    assert.ok(html.includes('Resolved:'), 'Displays resolved system theme');
    assert.ok(html.includes('editorFontSize'), 'Has font size select');
    assert.ok(html.includes('indentationSpaces'), 'Has indentation depth select');
    assert.ok(html.includes('Save preferences'), 'Has save button');
  });

  await t.test('P19: Security settings renders password change and all-devices sign-out modal', () => {
    const html = renderSecuritySettingsPage({ user: testUser });

    assert.ok(html.includes('Security settings'), 'Heading present');
    assert.ok(html.includes('name="currentPassword"'), 'Requires current password reauth');
    assert.ok(html.includes('name="newPassword"'), 'Collects new password');
    assert.ok(html.includes('Sign out of all devices'), 'Provides global session revocation');
    assert.ok(html.includes('id="sign-out-all-modal"'), 'Contains accessible confirmation dialog');
  });

  await t.test('P20: Privacy settings renders data export, sole-owner blocker, and consequence modal', () => {
    // 1. Author with owned courses sees Sole-Owner Blocker
    const ownerHtml = renderPrivacySettingsPage({ ownedCourseCount: 2 });
    assert.ok(ownerHtml.includes('Course ownership transfer required'), 'Sole owner blocker displayed');
    assert.ok(ownerHtml.includes('Manage your courses'), 'Directs author to manage courses');

    // 2. Normal student without owned courses sees deletion button and consequence modal
    const studentHtml = renderPrivacySettingsPage({ ownedCourseCount: 0 });
    assert.ok(studentHtml.includes('btn-open-delete-modal'), 'Deletion button rendered');
    assert.ok(studentHtml.includes('delete-account-modal'), 'Consequence dialog rendered');
    assert.ok(studentHtml.includes('acknowledge-deletion-consequences'), 'Requires explicit consequence check');
    assert.ok(studentHtml.includes('btn-export-data'), 'Provides data export button');
  });

  await t.test('P42: Safe Denial renders clean safe denial states without leaking private information', () => {
    // Not found
    const notFoundHtml = renderSafeDenialPage({ type: 'not-found' });
    assert.ok(notFoundHtml.includes("This page isn't available."), 'Generic safe message');

    // Access denied
    const deniedHtml = renderSafeDenialPage({ type: 'access-denied' });
    assert.ok(deniedHtml.includes("This page isn't available."), 'Denial avoids revealing existence');

    // Suspended account
    const suspendedHtml = renderSafeDenialPage({ type: 'suspended' });
    assert.ok(suspendedHtml.includes('This account is suspended'), 'Explains account suspension');
    assert.ok(suspendedHtml.includes('/help'), 'Links to support');
  });

  await t.test('Safe Return Destination prevents open redirects', () => {
    assert.equal(getSafeReturnDestination('/learn/courses'), '/learn/courses');
    assert.equal(getSafeReturnDestination('/settings/profile'), '/settings/profile');
    assert.equal(getSafeReturnDestination('https://malicious.com'), '/learn');
    assert.equal(getSafeReturnDestination('//malicious.com'), '/learn');
    assert.equal(getSafeReturnDestination('\\\\malicious.com'), '/learn');
    assert.equal(getSafeReturnDestination(null), '/learn');
  });
});
