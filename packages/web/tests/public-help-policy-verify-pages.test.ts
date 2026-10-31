import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHelpPage } from '../src/pages/public/HelpPage.ts';
import { renderPolicyPage } from '../src/pages/public/PolicyPage.ts';
import { renderVerifyEmailPage } from '../src/pages/account/VerifyEmailPage.ts';

test('Help Page P40 (T072)', async (t) => {
  await t.test('renders table of contents, honest support status, and contextual report modal', () => {
    const html = renderHelpPage({ courseId: 'course-py-101', isSignedIn: true, courses: [{ id: 'course-py-101', title: 'Python 101' }] });

    // Table of contents anchors
    assert.ok(html.includes('Help and support'));
    assert.ok(html.includes('href="#account"'));
    assert.ok(html.includes('href="#enrollment"'));
    assert.ok(html.includes('href="#saving"'));
    assert.ok(html.includes('href="#run-vs-submit"'));
    assert.ok(html.includes('href="#reporting"'));
    assert.ok(html.includes('href="#contact"'));

    // Truthful policy explanations per redesign plan
    assert.ok(html.includes('Run or Submit?'));
    assert.ok(html.includes('Support channels'));
    assert.ok(!html.includes('support@zur.internal'), 'Must not expose internal address as public contact');
    assert.ok(!html.includes('Public external support pending launch'), 'Must remove operational-launch prose');

    // Contextual report modal
    assert.ok(html.includes('id="report-issue-modal"'));
    assert.ok(html.includes('role="dialog"'));
    assert.ok(html.includes('id="report-course-id"'));
    assert.ok(html.includes('<option value="course-py-101" selected>Python 101</option>'));
    assert.ok(html.includes('Broken exercise or test case'));
    assert.ok(html.includes('Inappropriate or abusive content'));
  });

  await t.test('renders submission confirmation when reportSuccessReference is provided', () => {
    const html = renderHelpPage({
      isReportModalOpen: true,
      reportSuccessReference: 'REF-2026-XYZ987',
    });

    assert.ok(html.includes('Report submitted'));
    assert.ok(html.includes('REF-2026-XYZ987'));
  });

  await t.test('escapes untrusted values in help page and report modal', () => {
    // 1. Error state in active report form
    const htmlError = renderHelpPage({
      isSignedIn: true,
      courses: [{ id: 'c-1', title: '<b>Evil</b> course' }],
      courseId: 'course-101" autofocus onfocus="alert(1)"',
      courseVersionId: 'ver-101" autofocus onfocus="alert(2)"',
      stepId: 'step-101" autofocus onfocus="alert(3)"',
      reportError: '<script>alert("error-xss")</script>Server failure',
    });

    assert.ok(!htmlError.includes('<script>alert("error-xss")</script>'));
    assert.ok(!htmlError.includes('course-101" autofocus'));
    assert.ok(htmlError.includes('&lt;script&gt;alert(&quot;error-xss&quot;)&lt;/script&gt;'));
    assert.ok(htmlError.includes('course-101&quot; autofocus'));
    assert.ok(htmlError.includes('&lt;b&gt;Evil&lt;/b&gt; course'));

    // 2. Success reference state
    const htmlSuccess = renderHelpPage({
      isReportModalOpen: true,
      reportSuccessReference: '<script>alert("ref-xss")</script>REF-001',
    });
    assert.ok(!htmlSuccess.includes('<script>alert("ref-xss")</script>'));
    assert.ok(htmlSuccess.includes('&lt;script&gt;alert(&quot;ref-xss&quot;)&lt;/script&gt;'));
  });

  await t.test('preserves user input description and type on failed report submit', () => {
    const html = renderHelpPage({
      isSignedIn: true,
      courses: [{ id: 'course-py-101', title: 'Python 101' }],
      courseId: 'course-py-101',
      type: 'inappropriate_content',
      description: 'The course contains abusive text in lesson 2.',
      reportError: 'Submission failed due to a server error.',
      isReportModalOpen: true,
    });

    assert.ok(html.includes('The course contains abusive text in lesson 2.'));
    assert.ok(html.includes('value="inappropriate_content" selected'));
    assert.ok(html.includes('Submission failed due to a server error.'));
  });
});

test('Policy Page P41 (T072)', async (t) => {
  await t.test('renders honest blocked launch state without fabricated legal contract text', () => {
    const privacyHtml = renderPolicyPage({ type: 'privacy' });
    const termsHtml = renderPolicyPage({ type: 'terms' });

    // Both pages must display honest pending notice without internal doc references per redesign plan
    assert.ok(privacyHtml.includes('The privacy policy is not yet available'));
    assert.ok(privacyHtml.includes('Status: Pending publication'));
    assert.ok(!privacyHtml.includes('PRD_V2.md'), 'Must not expose internal document filenames');
    assert.ok(!privacyHtml.includes('engineering invariants'), 'Must not expose engineering rules');

    assert.ok(termsHtml.includes('The terms of service are not yet available'));
    assert.ok(termsHtml.includes('Status: Pending publication'));
    assert.ok(!termsHtml.includes('PRD_V2.md'), 'Must not expose internal document filenames');

    // Assert that internal email is NOT presented as public contact
    assert.ok(!privacyHtml.includes('support@zur.internal'));
    assert.ok(!termsHtml.includes('support@zur.internal'));

    // Assert no fake effective dates or broken /docs links
    assert.ok(!privacyHtml.includes('Effective date:'));
    assert.ok(!termsHtml.includes('Effective date:'));
    assert.ok(!privacyHtml.includes('/docs'));
    assert.ok(!termsHtml.includes('/docs'));
  });
});

test('Verify Email Page P06 (T071)', async (t) => {
  await t.test('renders expired or invalid token failure prominently and actionably without pretending sent', () => {
    const errorHtml = renderVerifyEmailPage({
      error: 'Verification link expired or invalid.',
    });

    assert.ok(errorHtml.includes('id="verify-error"'), 'Contains verify-error element');
    assert.ok(errorHtml.includes('Verification link expired or invalid.'), 'Displays the real failure message');
    assert.ok(errorHtml.includes('role="alert"'), 'Announced as alert');
    assert.ok(!errorHtml.includes('We sent a verification link'), 'Does not falsely claim an email was sent');
    assert.ok(errorHtml.includes('href="/sign-in"'), 'Offers actionable sign-in navigation');
    assert.ok(errorHtml.includes('href="/sign-up"'), 'Offers actionable sign-up navigation');
  });

  await t.test('renders truthful unprompted status on direct entry without context', () => {
    const directHtml = renderVerifyEmailPage({});

    assert.ok(directHtml.includes('No pending email verification context was found'));
    assert.ok(!directHtml.includes('We sent a verification link'));
    assert.ok(directHtml.includes('href="/sign-in"'));
    assert.ok(directHtml.includes('href="/sign-up"'));
  });

  await t.test('renders masked destination, cooldown resend, and change account when email is provided', () => {
    const pendingHtml = renderVerifyEmailPage({
      email: 'alex@example.org',
      cooldownRemaining: 30,
    });

    assert.ok(pendingHtml.includes('Check your email'));
    assert.ok(pendingHtml.includes('a***x@e***.org'));
    assert.ok(pendingHtml.includes('Resend email (30s)'));
    assert.ok(pendingHtml.includes('disabled'));
    assert.ok(pendingHtml.includes('Use a different account'));
  });

  await t.test('renders verified success state with destination link', () => {
    const verifiedHtml = renderVerifyEmailPage({
      isVerified: true,
      returnTo: '/courses/python-intro',
    });

    assert.ok(verifiedHtml.includes('Email confirmed'));
    assert.ok(verifiedHtml.includes('href="/courses/python-intro"'));
  });
});
