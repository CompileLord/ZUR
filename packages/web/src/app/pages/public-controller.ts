import { matchRoute } from '../../router/routes.ts';
import { renderPublicShell, renderAppShell } from '../../components/shells/index.ts';
import { renderSafeDenialPage } from '../../pages/status/SafeDenialPage.ts';
import { renderLandingPage } from '../../pages/public/LandingPage.ts';
import { startHeroTyping } from '../../pages/public/LandingHero.ts';
import { type CatalogPageProps, renderCatalogPage } from '../../pages/public/CatalogPage.ts';
import { renderCourseOverviewPage } from '../../pages/public/CourseOverviewPage.ts';
import { type ReportCourse, renderHelpPage } from '../../pages/public/HelpPage.ts';
import { renderPolicyPage } from '../../pages/public/PolicyPage.ts';
import { type RouteContext } from '../context.ts';
import {
  attachCatalogListeners,
  attachCourseOverviewListeners,
} from './public-listeners.ts';
import { attachHelpListeners } from './help-listeners.ts';
import { showRouteLoading } from '../route-loading.ts';
import { appEl, app, authClient, courseClient } from '../state.ts';

let activeCatalogRequestId = 0;

export function renderPublicRoute(ctx: RouteContext): void {
  const { route, params, searchParams, currentUser, path } = ctx;
  if (route.pageId === 'P42') {
    const isAccessDenied = path === '/access-denied';
    appEl.innerHTML = renderSafeDenialPage({
      type: isAccessDenied ? 'access-denied' : 'not-found',
    });
    return;
  }

  if (route.pageId === 'P01') {
    const content = renderLandingPage({ isSignedIn: Boolean(currentUser) });
    appEl.innerHTML = renderPublicShell({
      activePath: path,
      user: currentUser,
      content,
    });
    const hero = appEl.querySelector<HTMLElement>('[data-landing-hero]');
    if (hero) {
      const finishTyping = startHeroTyping(hero.querySelector('[data-hero-typewriter]')!, hero.querySelector<HTMLElement>('.hero-cursor')!,
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      app.cleanupLandingHero = finishTyping;
      void import('../../pages/public/LandingHeroController.ts').then(({ initLandingHero }) => {
        if (hero.isConnected) app.cleanupLandingHero = initLandingHero(hero, finishTyping);
      }).catch(error => { finishTyping(); console.error('Landing interactions could not load', error); });
    }
    return;
  }

  const renderDiscoveryShell = (options: Parameters<typeof renderPublicShell>[0]) =>
    currentUser
      ? renderAppShell({ activePath: '/courses', user: currentUser, currentMode: 'learn', content: options.content })
      : renderPublicShell(options);

  if (route.pageId === 'P02') {
    const q = searchParams.get('q') || '';
    const category = searchParams.get('category') || '';
    const level = searchParams.get('level') || '';
    const language = searchParams.get('language') || '';
    const page = Number(searchParams.get('page') || 1);

    const requestId = ++activeCatalogRequestId;

    const catalogState: CatalogPageProps = {
      courses: [],
      categories: [],
      total: 0,
      isLoading: true,
      filters: { q, category, level, language, page, limit: 12 },
    };

    const initialContent = renderCatalogPage(catalogState);
    appEl.innerHTML = renderDiscoveryShell({
      activePath: '/courses',
      user: currentUser,
      content: initialContent,
    });
    attachCatalogListeners(catalogState);

    Promise.all([
      courseClient.listCategories().catch(() => []),
      courseClient.listCatalog({
        search: q || undefined,
        categoryId: category || undefined,
        level: level || undefined,
        language: language || undefined,
        limit: 12,
        offset: (page - 1) * 12,
      }),
    ])
      .then(([cats, catRes]) => {
        if (requestId !== activeCatalogRequestId || window.location.pathname !== '/courses') return;
        const isSheetOpen = Boolean(document.getElementById('mobile-filter-sheet')?.classList.contains('open'));
        catalogState.categories = cats;
        catalogState.courses = catRes.courses;
        catalogState.languages = catRes.languages || [];
        catalogState.total = catRes.total;
        catalogState.isLoading = false;
        catalogState.isMobileFilterOpen = isSheetOpen || Boolean(catalogState.isMobileFilterOpen);
        const updatedContent = renderCatalogPage(catalogState);
        appEl.innerHTML = renderDiscoveryShell({
          activePath: '/courses',
          user: currentUser,
          content: updatedContent,
        });
        attachCatalogListeners(catalogState);
      })
      .catch((err) => {
        if (requestId !== activeCatalogRequestId || window.location.pathname !== '/courses') return;
        const isSheetOpen = Boolean(document.getElementById('mobile-filter-sheet')?.classList.contains('open'));
        catalogState.isLoading = false;
        catalogState.error = err.message || 'Failed to load course catalog';
        catalogState.isMobileFilterOpen = isSheetOpen || Boolean(catalogState.isMobileFilterOpen);
        const updatedContent = renderCatalogPage(catalogState);
        appEl.innerHTML = renderDiscoveryShell({
          activePath: '/courses',
          user: currentUser,
          content: updatedContent,
        });
        attachCatalogListeners(catalogState);
      });
    return;
  }

  if (route.pageId === 'P03') {
    const courseId = params.courseId;
    const isCurrentOverview = () => {
      const current = matchRoute(window.location.pathname);
      return current?.route.pageId === 'P03' && current.params.courseId === courseId;
    };
    const initialContent = renderCourseOverviewPage({ isLoading: true });
    appEl.innerHTML = renderDiscoveryShell({
      activePath: path,
      user: currentUser,
      content: initialContent,
    });

    courseClient
      .getCourseOverview(courseId)
      .then((data) => {
        if (!isCurrentOverview()) return;
        const updatedContent = renderCourseOverviewPage({
          data,
          currentUser,
          isLoading: false,
        });
        appEl.innerHTML = renderDiscoveryShell({
          activePath: path,
          user: currentUser,
          content: updatedContent,
        });

        let robotsMeta = document.querySelector('meta[name="robots"]');
        if (data.course.visibility === 'unlisted') {
          if (!robotsMeta) {
            robotsMeta = document.createElement('meta');
            robotsMeta.setAttribute('name', 'robots');
            document.head.appendChild(robotsMeta);
          }
          robotsMeta.setAttribute('content', 'noindex, nofollow');
        } else if (robotsMeta) {
          robotsMeta.removeAttribute('content');
        }

        attachCourseOverviewListeners(courseId);
      })
      .catch((err: any) => {
        if (!isCurrentOverview()) return;
        const isServiceError = (typeof err.status === 'number' && err.status >= 500 && err.status < 600) || err.status === 0 || Boolean(err.isNetworkError);
        const isDenial = !isServiceError && (err.status === 404 || err.status === 403 || (!err.status && err.message === "This page isn't available."));
        if (isDenial) {
          appEl.innerHTML = renderSafeDenialPage({ type: 'not-found', user: currentUser });
        } else {
          const errorContent = renderCourseOverviewPage({
            isLoading: false,
            isServiceError: true,
          });
          appEl.innerHTML = renderDiscoveryShell({
            activePath: path,
            user: currentUser,
            content: errorContent,
          });
          attachCourseOverviewListeners(courseId);
        }
      });
    return;
  }

  if (route.pageId === 'P40') {
    const courseId = searchParams.get('courseId') || '';
    const courseVersionId = searchParams.get('courseVersionId') || '';
    const stepId = searchParams.get('stepId') || '';
    const report = searchParams.get('report') || '';
    const isReportModalOpen = Boolean(report || courseId || stepId);
    const type = report === 'broken_exercise' ? 'broken_exercise' : report === 'inappropriate_content' ? 'inappropriate_content' : 'other';
    const lifecycle = app.activeRouteLifecycle;
    const renderHelp = (courses: ReportCourse[] | null) => {
      if (app.activeRouteLifecycle !== lifecycle) return;
      appEl.innerHTML = renderPublicShell({
        activePath: path,
        user: currentUser,
        content: renderHelpPage({
          isSignedIn: Boolean(currentUser),
          courses,
          returnTo: path,
          courseId,
          courseVersionId,
          stepId,
          type,
          isReportModalOpen,
        }),
      });
      attachHelpListeners(courseId, null, courses);
    };
    if (!currentUser) {
      renderHelp([]);
      return;
    }
    showRouteLoading('Help');
    void authClient.fetchApi('/api/student/courses').then((res: any) => {
      const seen = new Set<string>();
      renderHelp(
        (res?.enrollments || [])
          .filter((e: any) => e.courseId && !seen.has(e.courseId) && seen.add(e.courseId))
          .map((e: any) => ({ id: e.courseId, title: e.courseTitle || e.title || 'Untitled course' })),
      );
    }).catch(() => renderHelp(null));
    return;
  }

  if (route.pageId === 'P41') {
    const isTerms = path === '/terms';
    const content = renderPolicyPage({ type: isTerms ? 'terms' : 'privacy' });
    appEl.innerHTML = renderPublicShell({
      activePath: path,
      user: currentUser,
      content,
    });
    return;
  }

  const content = `<div class="container py-8"><h1 class="h1">${route.title}</h1></div>`;
  appEl.innerHTML = renderPublicShell({
    activePath: path,
    user: currentUser,
    content,
  });
  return;
}
