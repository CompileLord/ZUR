import { escapeHtml } from '../../utils/escape-html.ts';
import { renderAccountShell } from '../../components/shells/AccountShell.ts';
import { renderTextInput, renderButton, renderIcon } from '../../components/common/index.ts';

export interface SignInPageOptions {
  email?: string;
  error?: string;
  returnTo?: string;
  isLoading?: boolean;
  notice?: string;
}

const BENEFITS = [
  ['book', 'Short lessons', 'Read a concept, then use it right away.'],
  ['code', 'Run Python in the browser', 'No setup, no installs.'],
  ['list-checks', 'Instant feedback', 'Tests tell you what to fix next.'],
] as const;

export function renderAuthValuePanel(): string {
  return `
    <aside class="auth-value" aria-label="Why ZUR">
      <ul class="auth-value-list">
        ${BENEFITS.map(
          ([icon, title, text]) => `
          <li>
            <span class="auth-value-icon" aria-hidden="true">${renderIcon(icon, { size: 16 })}</span>
            <span><strong>${title}</strong><br />${text}</span>
          </li>`
        ).join('')}
      </ul>
      <pre class="auth-value-code" aria-hidden="true"><code><span class="c">&gt;&gt;&gt; </span>squares = [n * n for n in range(1, 6)]
<span class="c">&gt;&gt;&gt; </span>print(squares)
[1, 4, 9, 16, 25]
<span class="ok">&check; Tests passed (2/2)</span></code></pre>
    </aside>
  `;
}

export function renderSignInPage(opts: SignInPageOptions = {}): string {
  const returnToParam = opts.returnTo ? `?returnTo=${encodeURIComponent(opts.returnTo)}` : '';
  const formContent = `
    <form id="sign-in-form" action="/api/auth/sign-in" method="POST" novalidate>
      ${opts.notice ? `<div id="sign-in-notice" class="form-notice mb-4 p-3 border rounded" role="status">${escapeHtml(opts.notice)}</div>` : ''}
      ${
        opts.error
          ? `
        <div id="sign-in-error" class="form-error mb-4 p-3 border border-danger rounded" role="alert" aria-live="polite" style="overflow-wrap: anywhere; word-break: break-word;">
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
    formContent: `<div class="auth-split"><div class="auth-form-col">${formContent}</div>${renderAuthValuePanel()}</div>`,
  });
}
