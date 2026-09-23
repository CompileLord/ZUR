import { renderAccountShell } from '../../components/shells/AccountShell.ts';
import { renderTextInput, renderButton } from '../../components/common/index.ts';

export interface SignInPageOptions {
  email?: string;
  error?: string;
  returnTo?: string;
  isLoading?: boolean;
}

export function renderSignInPage(opts: SignInPageOptions = {}): string {
  const returnToParam = opts.returnTo ? `?returnTo=${encodeURIComponent(opts.returnTo)}` : '';
  const formContent = `
    <form id="sign-in-form" action="/api/auth/sign-in" method="POST" novalidate>
      ${
        opts.error
          ? `
        <div id="sign-in-error" class="form-error mb-4 p-3 border border-danger rounded" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span> <span>${opts.error}</span>
        </div>
      `
          : '<div id="sign-in-error" class="sr-only" role="alert" aria-live="polite"></div>'
      }

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
        })}
        <div class="flex justify-end mt-1">
          <button type="button" id="toggle-password" class="btn btn-ghost btn-compact text-xs" aria-label="Show password">
            Show password
          </button>
        </div>
      </div>

      <div class="flex justify-between items-center mb-6">
        <a href="/forgot-password" class="text-sm text-secondary hover-underline">Forgot password?</a>
      </div>

      <input type="hidden" name="returnTo" value="${opts.returnTo || ''}" />

      ${renderButton({
        id: 'submit-sign-in',
        label: opts.isLoading ? 'Signing in…' : 'Sign in',
        variant: 'primary',
        type: 'submit',
        className: 'w-full',
        disabled: opts.isLoading,
      })}

      <p class="text-sm text-muted text-center mt-6">
        Don’t have an account? <a href="/sign-up${returnToParam}" class="text-primary font-semibold hover-underline">Create an account</a>
      </p>
    </form>
  `;

  return renderAccountShell({
    title: 'Welcome back',
    subtitle: 'Sign in to your ZUR learning account',
    formContent,
  });
}
