import { renderAccountShell } from '../../components/shells/AccountShell.ts';
import { renderTextInput, renderButton } from '../../components/common/index.ts';

export interface SignUpPageOptions {
  displayName?: string;
  email?: string;
  error?: string;
  returnTo?: string;
  isLoading?: boolean;
}

export function renderSignUpPage(opts: SignUpPageOptions = {}): string {
  const returnToParam = opts.returnTo ? `?returnTo=${encodeURIComponent(opts.returnTo)}` : '';
  const formContent = `
    <form id="sign-up-form" action="/api/auth/sign-up" method="POST" novalidate>
      ${
        opts.error
          ? `
        <div id="sign-up-error" class="form-error mb-4 p-3 border border-danger rounded" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span> <span>${opts.error}</span>
        </div>
      `
          : '<div id="sign-up-error" class="sr-only" role="alert" aria-live="polite"></div>'
      }

      ${renderTextInput({
        id: 'displayName',
        name: 'displayName',
        label: 'Display name',
        type: 'text',
        value: opts.displayName || '',
        required: true,
        placeholder: 'Ada Lovelace',
        hint: 'Your public name on course rosters',
      })}

      ${renderTextInput({
        id: 'email',
        name: 'email',
        label: 'Email',
        type: 'email',
        value: opts.email || '',
        required: true,
        placeholder: 'you@example.com',
      })}

      <div class="password-field-wrapper mb-4">
        ${renderTextInput({
          id: 'password',
          name: 'password',
          label: 'Password',
          type: 'password',
          required: true,
          hint: 'At least 8 characters',
        })}
        <div class="flex justify-end mt-1">
          <button type="button" id="toggle-password" class="btn btn-ghost btn-compact text-xs" aria-label="Show password">
            Show password
          </button>
        </div>
      </div>

      <div class="pilot-eligibility-note mb-4 p-3 bg-surface border border-subtle rounded text-xs text-secondary">
        <label><input type="checkbox" name="adultConfirmed" required /> I confirm that I am at least 18 years of age and agree to the <a href="/terms" class="text-primary underline">Terms of Service</a> and <a href="/privacy" class="text-primary underline">Privacy Policy</a>.</label>
      </div>

      <input type="hidden" name="returnTo" value="${opts.returnTo || ''}" />

      ${renderButton({
        id: 'submit-sign-up',
        label: opts.isLoading ? 'Creating account…' : 'Create account',
        variant: 'primary',
        type: 'submit',
        className: 'w-full',
        disabled: opts.isLoading,
      })}

      <p class="text-sm text-muted text-center mt-6">
        Already have an account? <a href="/sign-in${returnToParam}" class="text-primary font-semibold hover-underline">Sign in</a>
      </p>
    </form>
  `;

  return renderAccountShell({
    title: 'Create your account',
    subtitle: 'Start learning and practicing Python in the browser',
    formContent,
  });
}
