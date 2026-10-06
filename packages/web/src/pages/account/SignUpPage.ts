import { escapeHtml } from '../../utils/escape-html.ts';
import { renderAccountShell } from '../../components/shells/AccountShell.ts';
import { renderTextInput, renderButton, renderIcon } from '../../components/common/index.ts';

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
          <span aria-hidden="true">⚠</span> <span>${escapeHtml(opts.error)}</span>
        </div>
      `
          : '<div id="sign-up-error" class="sr-only" role="alert" aria-live="polite"></div>'
      }

      <div class="form-group mb-4" id="group-displayName">
        <label for="displayName" class="form-label">
          Display name <span class="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          type="text"
          id="displayName"
          name="displayName"
          class="form-input"
          value="${escapeHtml(opts.displayName || '')}"
          placeholder="Ada Lovelace"
          autocomplete="name"
          required
        />
      </div>

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

      <div class="form-group mb-4" id="group-password">
        <label for="password" class="form-label">
          Password <span class="text-danger" aria-hidden="true">*</span>
        </label>
        <div class="password-input-wrapper relative">
          <input
            type="password"
            id="password"
            name="password"
            class="form-input pr-10"
            autocomplete="new-password"
            required
            aria-describedby="password-hint"
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
        <span id="password-hint" class="form-hint">At least 8 characters</span>
      </div>

      <div class="consent-row">
        <input type="checkbox" id="adultConfirmed" name="adultConfirmed" class="consent-checkbox" required />
        <label for="adultConfirmed" class="consent-label">
          I confirm that I am at least 18 years of age and agree to the <a href="/terms" class="consent-link">Terms of Service</a> and <a href="/privacy" class="consent-link">Privacy Policy</a>.
        </label>
      </div>

      <input type="hidden" name="returnTo" value="${escapeHtml(opts.returnTo)}" />

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
    formContent,
  });
}
