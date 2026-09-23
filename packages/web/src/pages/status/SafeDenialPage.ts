import { renderPublicShell } from '../../components/shells/PublicShell.ts';
import {
  renderNotFoundState,
  renderAccessDeniedState,
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
      content = renderAccessDeniedState(opts.message || 'You do not have permission to view this content.');
      break;
    case 'suspended':
      content = `
        <div class="state-container state-suspended" role="alert">
          <div class="empty-icon text-warning text-3xl mb-3" aria-hidden="true">⚠</div>
          <h2 class="state-heading">This account is suspended.</h2>
          <p class="state-message">
            ${opts.message || 'An administrative hold is placed on this account. Contact platform support for assistance.'}
          </p>
          <div class="state-actions mt-6">
            <a href="/help" class="btn btn-secondary btn-compact">Contact support</a>
            <a href="/courses" class="btn btn-ghost btn-compact ml-2">Browse public catalog</a>
          </div>
        </div>
      `;
      break;
    case 'rate-limited':
      content = `
        <div class="state-container state-rate-limited max-w-lg mx-auto py-12" role="alert">
          ${renderRateLimitAlert(opts.retryAfterSeconds || 60)}
          <div class="state-actions mt-6 text-center">
            <a href="/courses" class="btn btn-secondary btn-compact">Return to courses</a>
          </div>
        </div>
      `;
      break;
  }

  return renderPublicShell({
    content: `<div class="container py-12">${content}</div>`,
  });
}
