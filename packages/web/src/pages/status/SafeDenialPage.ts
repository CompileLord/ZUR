import { renderPublicShell } from '../../components/shells/PublicShell.ts';
import { renderIcon } from '../../components/common/icons.ts';
import { escapeHtml } from '../../utils/escape-html.ts';
import {
  renderNotFoundState,
  renderRateLimitAlert,
} from '../../components/states/UniversalStates.ts';

export interface SafeDenialPageOptions {
  type: 'not-found' | 'access-denied' | 'suspended' | 'rate-limited';
  message?: string;
  retryAfterSeconds?: number;
}

export function renderSafeDenialPage(opts: SafeDenialPageOptions): string {
  let content = '';

  switch (opts.type) {
    case 'not-found':
      content = renderNotFoundState();
      break;
    case 'access-denied':
      content = `
        <div class="state-container state-denied" role="alert">
          <div class="state-icon text-muted mb-4" aria-hidden="true">
            ${renderIcon('shield', { size: 36, strokeWidth: 1.5 })}
          </div>
          <h1 class="state-heading page-title text-xl font-semibold mb-2">This page isn't available.</h1>
          <p class="state-message text-secondary text-sm mb-6 max-w-sm mx-auto">
            ${escapeHtml(opts.message || 'You do not have permission to view this content.')}
          </p>
          <div class="state-actions flex items-center justify-center gap-3">
            <a href="/courses" class="btn btn-primary btn-compact">Browse courses</a>
            <button type="button" class="btn btn-ghost btn-compact" onclick="window.history.length > 1 ? window.history.back() : window.location.href='/courses'">Go back</button>
          </div>
        </div>
      `;
      break;
    case 'suspended':
      content = `
        <div class="state-container state-suspended" role="alert">
          <div class="state-icon text-warning mb-4" aria-hidden="true">
            ${renderIcon('alert-triangle', { size: 36, strokeWidth: 1.5 })}
          </div>
          <h1 class="state-heading page-title text-xl font-semibold mb-2">This account is suspended.</h1>
          <p class="state-message text-secondary text-sm mb-6 max-w-sm mx-auto">
            ${escapeHtml(opts.message || 'An administrative hold is placed on this account. Contact support for assistance.')}
          </p>
          <div class="state-actions flex items-center justify-center gap-3">
            <a href="/help" class="btn btn-primary btn-compact">Help and support</a>
            <a href="/courses" class="btn btn-secondary btn-compact">Browse courses</a>
          </div>
        </div>
      `;
      break;
    case 'rate-limited':
      content = `
        <div class="state-container state-rate-limited max-w-lg mx-auto py-6" role="alert">
          ${renderRateLimitAlert(opts.retryAfterSeconds || 60)}
          <div class="state-actions mt-6 text-center">
            <a href="/courses" class="btn btn-secondary btn-compact">Return to courses</a>
          </div>
        </div>
      `;
      break;
  }

  const wrapperClass = 'status-page container flex flex-col items-center justify-center py-24 text-center';

  return renderPublicShell({
    content: `<div class="${wrapperClass}">${content}</div>`,
  });
}
