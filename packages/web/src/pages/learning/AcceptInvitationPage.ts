import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAccountShell } from '../../components/shells/AccountShell.ts';

export interface AcceptInvitationPageOptions {
  token: string;
  valid: boolean;
  reason?: 'revoked' | 'expired' | 'exhausted' | 'wrong_email' | null;
  courseTitle?: string;
  courseDescription?: string;
  inviterName?: string;
  expiresAt?: string;
  recipientEmailMasked?: string | null;
  currentUser?: {
    displayName: string;
    email: string;
  } | null;
  error?: string | null;
}

export function renderAcceptInvitationPage(opts: AcceptInvitationPageOptions): string {
  opts = safeTemplateData(opts);
  if (!opts.valid) {
    let message = 'This invitation is not valid.';
    if (opts.reason === 'revoked') {
      message = 'This invitation has been revoked by the course instructor.';
    } else if (opts.reason === 'expired') {
      message = 'This invitation has expired.';
    } else if (opts.reason === 'exhausted') {
      message = 'This invitation has reached its maximum number of uses.';
    } else if (opts.reason === 'wrong_email') {
      message = 'This invitation was issued to another email address that does not match your signed-in account.';
    }

    const formContent = `
      <div class="invitation-status-panel invalid" role="alert">
        <p class="status-message">${message}</p>
        <p class="status-subtext">If you believe this is an error, please request a new invitation from your instructor.</p>
        <div class="invitation-actions">
          <a href="/learn" class="btn btn-secondary">Go to dashboard</a>
        </div>
      </div>
    `;

    return renderAccountShell({
      title: 'Invitation unavailable',
      subtitle: 'Unable to join course',
      formContent,
    });
  }

  const courseTitle = opts.courseTitle || 'Python Course';
  const inviterName = opts.inviterName || 'Course Instructor';

  let emailNoticeHtml = '';
  if (opts.recipientEmailMasked) {
    emailNoticeHtml = `
      <div class="invitation-notice">
        <span class="notice-label">Issued for:</span>
        <span class="notice-value">${opts.recipientEmailMasked}</span>
      </div>
    `;
  }

  let actionSectionHtml = '';
  if (opts.currentUser) {
    actionSectionHtml = `
      <div class="current-user-banner">
        <span>Signing in as <strong>${opts.currentUser.displayName}</strong> (${opts.currentUser.email})</span>
        <a href="/api/auth/sign-out" class="account-link switch-account-link">Switch account</a>
      </div>

      <form method="POST" action="/api/invitations/${opts.token}/accept" class="invitation-accept-form">
        ${opts.error ? `<div class="form-error" role="alert">${opts.error}</div>` : ''}
        <button type="submit" class="btn btn-primary btn-block">
          Accept and start learning
        </button>
      </form>
    `;
  } else {
    actionSectionHtml = `
      <div class="invitation-auth-prompt">
        <p class="auth-prompt-text">To accept this invitation and begin the course, sign in to your account or create a new one.</p>
        <div class="button-group-vertical">
          <a href="/sign-in?returnTo=/join/${opts.token}" class="btn btn-primary btn-block">
            Sign in to accept
          </a>
          <a href="/sign-up?returnTo=/join/${opts.token}" class="btn btn-secondary btn-block">
            Create account
          </a>
        </div>
      </div>
    `;
  }

  const formContent = `
    <div class="invitation-preview-card">
      <div class="invitation-meta">
        <span class="inviter-line">Invited by <strong>${inviterName}</strong></span>
        ${opts.expiresAt ? `<span class="expiry-line">Expires ${new Date(opts.expiresAt).toLocaleDateString()}</span>` : ''}
      </div>

      ${opts.courseDescription ? `<p class="course-brief">${opts.courseDescription}</p>` : ''}
      ${emailNoticeHtml}

      ${actionSectionHtml}
    </div>
  `;

  return renderAccountShell({
    title: `Join ${courseTitle}`,
    subtitle: 'You have been invited to participate in this course.',
    formContent,
  });
}
