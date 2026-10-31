import { getSafeReturnDestination } from '../router/routes.ts';
import { renderPublicShell, renderAdminShell, renderAppShell } from '../components/shells/index.ts';
import { renderPageSkeleton } from '../components/states/UniversalStates.ts';
import { escapeHtml } from './helpers.ts';
import { navigateTo, renderApp } from './navigation.ts';
import { authClient, appEl } from './state.ts';

let routeLoadingTimer: ReturnType<typeof setTimeout> | null = null;
let routeLoadingObserver: MutationObserver | null = null;
const ROUTE_LOADING_DELAY_MS = 150;

export function cancelRouteLoading(): void {
  if (routeLoadingTimer) clearTimeout(routeLoadingTimer);
  routeLoadingTimer = null;
  routeLoadingObserver?.disconnect();
  routeLoadingObserver = null;
}

function renderRouteLoadingNow(label: string): void {
  const user = authClient.getUser();
  const pathname = window.location.pathname;
  const variant = /^\/admin/.test(pathname) ? 'table'
    : /\/steps\/|^\/teach\/[^/]+\/steps/.test(pathname) ? 'workspace'
      : 'cards';
  const content = renderPageSkeleton(label, variant);
  if (!user) {
    appEl.innerHTML = renderPublicShell({ activePath: pathname, user: null, content });
  } else if (pathname.startsWith('/admin') && user.capabilities.includes('admin')) {
    appEl.innerHTML = renderAdminShell({ activePath: pathname, adminUser: user, headerTitle: label, content });
  } else {
    const isAuthor = pathname.startsWith('/teach') || pathname.startsWith('/settings/ai-connections');
    appEl.innerHTML = renderAppShell({ user: user as any, activeMode: isAuthor ? 'teach' : 'learn', activePath: pathname, content });
  }
}

/**
 * Keeps the previous screen until loading lasts longer than ROUTE_LOADING_DELAY_MS,
 * then shows the real shell with a page-shaped skeleton. Any real render cancels it.
 */
export function showRouteLoading(label: string): void {
  cancelRouteLoading();
  routeLoadingObserver = new MutationObserver(cancelRouteLoading);
  routeLoadingObserver.observe(appEl, { childList: true, subtree: true });
  routeLoadingTimer = setTimeout(() => {
    cancelRouteLoading();
    renderRouteLoadingNow(label);
  }, ROUTE_LOADING_DELAY_MS);
}

export function showRouteFailure(message: string, retryPath: string): void {
  const isAuthError = message.toLowerCase().includes('session') || message.toLowerCase().includes('unauthorized') || message.toLowerCase().includes('expired');
  if (isAuthError) {
    authClient.clearSession();
    const returnTo = getSafeReturnDestination(retryPath);
    navigateTo(`/sign-in?returnTo=${encodeURIComponent(returnTo)}&notice=session-expired`);
    return;
  }
  const user = authClient.getUser();
  const isAuthor = retryPath.startsWith('/teach') || retryPath.startsWith('/settings/ai-connections');
  if (user && isAuthor) {
    appEl.innerHTML = renderAppShell({
      user: user as any,
      activeMode: 'teach',
      activePath: retryPath,
      content: `
        <div class="author-courses-container container py-12">
          <div class="state-container state-failure max-w-md mx-auto text-center" role="alert">
            <h1 class="page-title text-xl font-semibold mb-2">Couldn't load this page</h1>
            <p class="text-secondary mb-4">${escapeHtml(message)}</p>
            <div class="flex items-center justify-center gap-3">
              <button class="btn btn-primary btn-compact" id="route-retry">Try again</button>
              <a href="/teach" class="btn btn-secondary btn-compact">Return to Your courses</a>
            </div>
          </div>
        </div>
      `,
    });
    document.getElementById('route-retry')?.addEventListener('click', () => renderApp(retryPath));
    return;
  }
  appEl.innerHTML = `<main class="container py-8"><section class="state-container" role="alert"><h1 class="page-title">Couldn't load this page</h1><p class="text-secondary">${escapeHtml(message)}</p><button class="btn btn-secondary" id="route-retry">Try again</button></section></main>`;
  document.getElementById('route-retry')?.addEventListener('click', () => renderApp(retryPath));
}
