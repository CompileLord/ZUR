import { escapeHtml } from '../../utils/escape-html.ts';
import { renderAccountShell } from '../../components/shells/AccountShell.ts';
import { renderButton } from '../../components/common/index.ts';

export interface VerifyEmailPageOptions {
  email?: string;
  isVerified?: boolean;
  cooldownRemaining?: number;
  error?: string;
  infoMessage?: string;
  returnTo?: string;
}

function maskEmail(email?: string): string {
  if (!email) return 'your email';
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const [user, domain] = parts;
  const maskedUser = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : `${user[0]}***`;
  const domainParts = domain.split('.');
  const maskedDomain = domainParts.length > 1
    ? `${domainParts[0][0]}***.${domainParts.slice(1).join('.')}`
    : domain;
  return `${maskedUser}@${maskedDomain}`;
}

export function renderVerifyEmailPage(opts: VerifyEmailPageOptions = {}): string {
  if (opts.isVerified) {
    const continueHref = opts.returnTo?.startsWith('/') && !opts.returnTo.startsWith('//')
      ? opts.returnTo : '/learn';
    const formContent = `
      <div class="verification-success text-center py-4">
        <div class="success-icon text-3xl mb-3 text-success" aria-hidden="true">✓</div>
        <h2 class="text-lg font-semibold mb-2">Email confirmed</h2>
        <p class="text-sm text-secondary mb-6">Your email address has been verified. You can now enroll in courses and practice exercises.</p>
        <a href="${escapeHtml(continueHref)}" class="btn btn-primary w-full">Continue to learning</a>
      </div>
    `;

    return renderAccountShell({
      title: 'Email verified',
      formContent,
    });
  }

  const masked = maskEmail(opts.email);
  const cooldown = opts.cooldownRemaining || 0;
  const isCooldownActive = cooldown > 0;

  const formContent = `
    <div class="verification-pending text-center py-2">
      <div class="mail-icon text-3xl mb-3 text-secondary" aria-hidden="true">✉</div>
      
      ${
        opts.error
          ? `
        <div id="verify-error" class="form-error mb-4 p-3 border border-danger rounded text-left" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span> <span>${escapeHtml(opts.error)}</span>
        </div>
      `
          : '<div id="verify-error" class="sr-only" role="alert" aria-live="polite"></div>'
      }

      ${
        opts.infoMessage
          ? `
        <div id="verify-info" class="mb-4 p-3 bg-surface border border-accent rounded text-sm text-left" role="status" aria-live="polite">
          <span>${escapeHtml(opts.infoMessage)}</span>
        </div>
      `
          : ''
      }

      <p class="text-sm text-secondary mb-4 text-left">
        We sent a verification link to <strong class="text-primary font-mono">${escapeHtml(masked)}</strong>. Click the link in the message to activate your account.
      </p>

      <form id="resend-verification-form" class="mt-6 mb-4">
        <input type="hidden" name="email" value="${escapeHtml(opts.email)}" />
        ${renderButton({
          id: 'btn-resend-verification',
          label: isCooldownActive ? `Resend email (${cooldown}s)` : 'Resend email',
          variant: 'secondary',
          type: 'submit',
          className: 'w-full',
          disabled: isCooldownActive,
        })}
      </form>

      <div class="mt-6 pt-4 border-t border-subtle">
        <a href="/api/auth/sign-out" id="use-different-account" class="text-xs text-secondary hover-underline">
          Use a different account
        </a>
      </div>
    </div>
  `;

  return renderAccountShell({
    title: 'Check your email',
    subtitle: 'Verify your email address to continue',
    formContent,
  });
}
