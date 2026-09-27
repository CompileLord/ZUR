import { escapeHtml } from '../../utils/escape-html.ts';
import { renderAccountShell } from '../../components/shells/AccountShell.ts';
import { renderTextInput, renderButton } from '../../components/common/index.ts';

export interface ForgotPasswordPageOptions {
  email?: string;
  isSubmitted?: boolean;
  error?: string;
  isLoading?: boolean;
}

export function renderForgotPasswordPage(opts: ForgotPasswordPageOptions = {}): string {
  if (opts.isSubmitted) {
    const formContent = `
      <div class="recovery-submitted py-2">
        <p class="text-sm text-secondary mb-6">
          If an account matches that email address, a password reset link has been sent. Check your inbox and spam folder.
        </p>
        <a href="/sign-in" class="btn btn-secondary w-full">Back to sign in</a>
      </div>
    `;

    return renderAccountShell({
      title: 'Check your email',
      formContent,
    });
  }

  const formContent = `
    <form id="forgot-password-form" action="/api/auth/forgot-password" method="POST" novalidate>
      ${
        opts.error
          ? `
        <div id="forgot-error" class="form-error mb-4 p-3 border border-danger rounded" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span> <span>${escapeHtml(opts.error)}</span>
        </div>
      `
          : '<div id="forgot-error" class="sr-only" role="alert" aria-live="polite"></div>'
      }

      <p class="text-sm text-secondary mb-4">
        Enter the email address associated with your ZUR account and we'll send you a password reset link.
      </p>

      ${renderTextInput({
        id: 'email',
        name: 'email',
        label: 'Email',
        type: 'email',
        value: opts.email || '',
        required: true,
        placeholder: 'you@example.com',
      })}

      ${renderButton({
        id: 'submit-forgot-password',
        label: opts.isLoading ? 'Sending reset link…' : 'Send reset link',
        variant: 'primary',
        type: 'submit',
        className: 'w-full mt-4',
        disabled: opts.isLoading,
      })}

      <div class="mt-6 text-center">
        <a href="/sign-in" class="text-sm text-secondary hover-underline">Back to sign in</a>
      </div>
    </form>
  `;

  return renderAccountShell({
    title: 'Reset password',
    subtitle: 'Recover access to your account',
    formContent,
  });
}

export interface ResetPasswordPageOptions {
  token?: string;
  isInvalidToken?: boolean;
  isSuccess?: boolean;
  error?: string;
  isLoading?: boolean;
}

export function renderResetPasswordPage(opts: ResetPasswordPageOptions = {}): string {
  if (opts.isInvalidToken) {
    const formContent = `
      <div class="recovery-invalid py-2 text-center">
        <div class="text-3xl mb-3 text-warning" aria-hidden="true">⚠</div>
        <h2 class="text-lg font-semibold mb-2">Invalid or expired link</h2>
        <p class="text-sm text-secondary mb-6">This password reset link is invalid or has expired. Recovery links expire after one hour.</p>
        <a href="/forgot-password" class="btn btn-primary w-full">Request a new reset link</a>
      </div>
    `;

    return renderAccountShell({
      title: 'Reset link expired',
      formContent,
    });
  }

  if (opts.isSuccess) {
    const formContent = `
      <div class="recovery-success py-2 text-center">
        <div class="text-3xl mb-3 text-success" aria-hidden="true">✓</div>
        <h2 class="text-lg font-semibold mb-2">Password updated</h2>
        <p class="text-sm text-secondary mb-6">Your password has been changed. You can now sign in with your new credentials.</p>
        <a href="/sign-in" class="btn btn-primary w-full">Sign in</a>
      </div>
    `;

    return renderAccountShell({
      title: 'Password updated',
      formContent,
    });
  }

  const formContent = `
    <form id="reset-password-form" action="/api/auth/reset-password" method="POST" novalidate>
      <input type="hidden" name="token" value="${opts.token || ''}" />

      ${
        opts.error
          ? `
        <div id="reset-error" class="form-error mb-4 p-3 border border-danger rounded" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span> <span>${escapeHtml(opts.error)}</span>
        </div>
      `
          : '<div id="reset-error" class="sr-only" role="alert" aria-live="polite"></div>'
      }

      <div class="password-field-wrapper mb-4">
        ${renderTextInput({
          id: 'newPassword',
          name: 'newPassword',
          label: 'New password',
          type: 'password',
          required: true,
          hint: 'At least 8 characters',
        })}
      </div>

      <div class="password-field-wrapper mb-6">
        ${renderTextInput({
          id: 'confirmNewPassword',
          name: 'confirmNewPassword',
          label: 'Confirm new password',
          type: 'password',
          required: true,
        })}
        <div class="flex justify-end mt-1">
          <button type="button" id="toggle-reset-passwords" class="btn btn-ghost btn-compact text-xs" aria-label="Show passwords">
            Show passwords
          </button>
        </div>
      </div>

      ${renderButton({
        id: 'submit-reset-password',
        label: opts.isLoading ? 'Updating password…' : 'Update password',
        variant: 'primary',
        type: 'submit',
        className: 'w-full',
        disabled: opts.isLoading,
      })}
    </form>
  `;

  return renderAccountShell({
    title: 'Update password',
    subtitle: 'Create a new, strong password',
    formContent,
  });
}
