import { renderPublicShell } from '../../components/shells/PublicShell.ts';
import { renderAppShell } from '../../components/shells/AppShell.ts';
import { renderIcon, type IconName } from '../../components/common/icons.ts';
import { escapeHtml } from '../../utils/escape-html.ts';
import {
  renderRateLimitAlert,
} from '../../components/states/UniversalStates.ts';

export interface SafeDenialPageOptions {
  type: 'not-found' | 'access-denied' | 'suspended' | 'rate-limited';
  message?: string;
  retryAfterSeconds?: number;
  user?: any;
}

interface StatusStateOptions {
  stateClass: string;
  icon: IconName;
  tone: 'neutral' | 'warning';
  heading: string;
  message: string;
  actions: string;
}

const BACK_BUTTON = `<button type="button" class="btn btn-ghost btn-compact" data-action="go-back">Go back</button>`;

function renderStatusState(o: StatusStateOptions): string {
  return `
    <div class="state-container status-state ${o.stateClass}" role="alert">
      <div class="status-state-icon status-state-icon-${o.tone}" aria-hidden="true">
        ${renderIcon(o.icon, { size: 32, strokeWidth: 1.5 })}
      </div>
      <h1 class="status-state-heading">${o.heading}</h1>
      <p class="status-state-message">${o.message}</p>
      <div class="status-state-actions">${o.actions}</div>
    </div>
  `;
}

export function renderSafeDenialPage(opts: SafeDenialPageOptions): string {
  let content = '';

  switch (opts.type) {
    case 'not-found':
      content = renderStatusState({
        stateClass: 'state-not-found',
        icon: 'compass',
        tone: 'neutral',
        heading: "This page isn't available.",
        message: 'The link may be out of date, or the page has moved. Let\'s get you back on track.',
        actions: `<a href="/courses" class="btn btn-primary btn-compact">Browse courses</a>${BACK_BUTTON}`,
      });
      break;
    case 'access-denied':
      content = renderStatusState({
        stateClass: 'state-denied',
        icon: 'shield',
        tone: 'neutral',
        heading: "This page isn't available.",
        message: escapeHtml(opts.message || 'You may need a different account or an invitation to see this.'),
        actions: `<a href="/courses" class="btn btn-primary btn-compact">Browse courses</a>${BACK_BUTTON}`,
      });
      break;
    case 'suspended':
      content = renderStatusState({
        stateClass: 'state-suspended',
        icon: 'alert-triangle',
        tone: 'warning',
        heading: 'This account is suspended.',
        message: escapeHtml(opts.message || 'An administrative hold is placed on this account. Contact support for assistance.'),
        actions: `<a href="/help" class="btn btn-primary btn-compact">Help and support</a><a href="/courses" class="btn btn-secondary btn-compact">Browse courses</a>`,
      });
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

  const pageContent = `<div class="status-page">${content}</div>`;

  if (opts.user) {
    return renderAppShell({
      activePath: '/courses',
      user: opts.user,
      currentMode: 'learn',
      content: pageContent,
    });
  }

  return renderPublicShell({
    content: pageContent,
  });
}
