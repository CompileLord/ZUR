import { matchRoute, getSafeReturnDestination, getSignedInAccountRedirect } from '../router/routes.ts';
import { renderSafeDenialPage } from '../pages/status/SafeDenialPage.ts';
import { type RouteContext } from './context.ts';
import { cleanupActiveModals } from './helpers.ts';
import { releaseLessonMediaObjectUrls } from './lesson-media.ts';
import { navigateTo, loadS2Page } from './navigation.ts';
import { loadAdminPage } from './pages/admin-controller.ts';
import { loadAttemptHistory } from './pages/attempt-history-controller.ts';
import { renderAccountRoute } from './pages/auth-controller.ts';
import { renderAuthorRoute } from './pages/author-controller.ts';
import { loadEnrolledStep } from './pages/enrolled-step-controller.ts';
import { renderPublicRoute } from './pages/public-controller.ts';
import { renderSettingsRoute } from './pages/settings-controller.ts';
import { cancelRouteLoading, showRouteLoading } from './route-loading.ts';
import { appEl, app, authClient } from './state.ts';
import { initTheme } from './theme.ts';

let routeSwapObserver: MutationObserver | null = null;
let routeSwapTimer: ReturnType<typeof setTimeout> | null = null;
let lastSwapPathname: string | null = null;

/**
 * Per-route polish: document title, scroll to top, focus on the page heading and a short fade-in.
 * Runs once the new content (not the loading skeleton) has rendered; same-path updates
 * (filters, retries) only refresh the title so scroll position and typing focus survive.
 */
function beginRouteSwap(routeTitle: string, preferHeading: boolean, pathname: string): void {
  routeSwapObserver?.disconnect();
  if (routeSwapTimer) clearTimeout(routeSwapTimer);
  const baseTitle = `${routeTitle} · ZUR`;
  document.title = baseTitle;
  const isNewPage = pathname !== lastSwapPathname;
  lastSwapPathname = pathname;
  if (isNewPage) window.scrollTo(0, 0);
  let applied: HTMLElement | null = null;

  const apply = () => {
    const heading = appEl.querySelector<HTMLElement>('h1');
    if (!heading || heading.closest('[aria-busy="true"]')) return;
    if (applied === heading) return;
    const refocus = applied !== null && !applied.isConnected;
    applied = heading;
    if (!refocus && document.title === baseTitle) {
      const headingText = heading.textContent?.trim();
      document.title = `${preferHeading && headingText ? headingText : routeTitle} · ZUR`;
    }
    if (!isNewPage) return;
    heading.setAttribute('tabindex', '-1');
    heading.classList.add('route-heading-focus');
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) heading.focus({ preventScroll: true });
    if (!refocus) {
      const region = appEl.querySelector<HTMLElement>('#main-content, main, [role="main"]');
      if (region) {
        region.classList.add('route-enter');
        region.addEventListener('animationend', () => region.classList.remove('route-enter'), { once: true });
      }
    }
  };

  routeSwapObserver = new MutationObserver(apply);
  routeSwapObserver.observe(appEl, { childList: true, subtree: true });
  routeSwapTimer = setTimeout(() => { routeSwapObserver?.disconnect(); routeSwapObserver = null; }, 8000);
  queueMicrotask(apply);
}

export function renderAppNow(path: string = window.location.pathname + window.location.search): void {
  app.activeRouteLifecycle++;
  cleanupActiveModals();
  app.cleanupLandingHero?.();
  app.cleanupLandingHero = null;
  releaseLessonMediaObjectUrls();
  app.workspaceResizeController?.abort();
  app.workspaceResizeController = null;
  const match = matchRoute(path);

  if (!match) {
    beginRouteSwap('Page not found', false, path.split('?')[0]);
    appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
    initTheme();
    return;
  }

  const { route, params } = match;
  const searchParams = path.includes('?')
    ? new URL(path, window.location.origin).searchParams
    : new URLSearchParams(window.location.search);
  const currentUser = authClient.getUser();

  const signedInRedirect = getSignedInAccountRedirect(path, currentUser);
  if (signedInRedirect) {
    window.history.replaceState({}, '', signedInRedirect);
    renderAppNow(signedInRedirect);
    return;
  }

  // Authentication guards for S3 (settings/learning), S4, S5, S6
  if (route.requiredCapability && !currentUser) {
    const returnTo = getSafeReturnDestination(path);
    navigateTo(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }
  if (route.shell === 'S6' && !currentUser?.capabilities?.includes('admin')) {
    beginRouteSwap('Access denied', false, path.split('?')[0]);
    appEl.innerHTML = renderSafeDenialPage({ type: 'access-denied', user: currentUser });
    initTheme();
    return;
  }

  cancelRouteLoading();
  beginRouteSwap(route.title, route.paramNames.length > 0, path.split('?')[0]);

  const ctx: RouteContext = { route, params, searchParams, currentUser, path };
  switch (route.shell) {
    case 'S1': renderPublicRoute(ctx); break;
    case 'S2': renderAccountRoute(ctx); break;
    case 'S3': renderSettingsRoute(ctx); break;
    case 'S4': {
      if (route.pageId === 'P26') { void loadS2Page(route.pageId, params, path); break; }
      if (route.pageId === 'P12') {
        void loadEnrolledStep(params.enrollmentId, params.stepId, path);
        break;
      }
      if (route.pageId === 'P16') {
        void loadAttemptHistory(params.enrollmentId, params.stepId, params.attemptId, path);
        break;
      }
      break;
    }

    case 'S5': renderAuthorRoute(ctx); break;

    case 'S6': {
      const actor = currentUser!;
      const isShellMounted = Boolean(appEl.querySelector('.shell-admin'));
      if (!isShellMounted) {
        showRouteLoading('Admin');
      }
      void loadAdminPage(path, actor.displayName, actor.email);
      break;
    }
  }

  initTheme();
}
