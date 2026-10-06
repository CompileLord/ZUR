import { escapeHtml } from '../../utils/escape-html.ts';
import { renderAccountShell } from '../../components/shells/AccountShell.ts';
import { renderTextInput, renderButton, renderIcon } from '../../components/common/index.ts';

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
          <span aria-hidden="true">⚠</span> <span>${escapeHtml(opts.error)}</span>
        </div>
      `
          : '<div id="sign-in-error" class="sr-only" role="alert" aria-live="polite"></div>'
      }

      <div class="form-group mb-4" id="group-email">
        <label for="email" class="form-label">
          Email <span class="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          type="email"
          id="email"
          name="email"
          class="form-input"
          value="${escapeHtml(opts.email || '')}"
          placeholder="you@example.com"
          autocomplete="username"
          required
        />
      </div>

      <div class="form-group mb-6" id="group-password">
        <div class="flex justify-between items-center mb-1">
          <label for="password" class="form-label mb-0">
            Password <span class="text-danger" aria-hidden="true">*</span>
          </label>
          <a href="/forgot-password" class="text-xs text-secondary hover-underline">Forgot password?</a>
        </div>
        <div class="password-input-wrapper relative">
          <input
            type="password"
            id="password"
            name="password"
            class="form-input pr-10"
            autocomplete="current-password"
            required
          />
          <button
            type="button"
            id="toggle-password"
            class="password-toggle-btn"
            aria-label="Show password"
            title="Show password"
          >
            ${renderIcon('eye', { size: 16 })}
          </button>
        </div>
      </div>

      <input type="hidden" name="returnTo" value="${escapeHtml(opts.returnTo)}" />

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
    formContent,
  });
}
