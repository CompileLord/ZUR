import { renderAppShell } from '../../components/shells/index.ts';
import { s2Request } from '../api.ts';
import { s2Current, escapeHtml } from '../helpers.ts';
import { renderApp } from '../navigation.ts';
import { loadCourseBuilderPage, loadAuthorPreviewPage } from './author-builder-controller.ts';
import { loadCourseSettingsPage } from './author-course-settings-controller.ts';
import { loadAuthorCoursesPage } from './author-courses-controller.ts';
import { loadStepEditorPage } from './author-step-editor-controller.ts';
import { loadHomePage, loadLearnRedirect, loadEnrolledCoursePage } from './learner-home-controller.ts';
import { showRouteFailure } from '../route-loading.ts';
import { authClient, appEl } from '../state.ts';

export async function loadS2PageNow(pageId: string, params: Record<string, string>, path: string): Promise<void> {
  const user = authClient.getUser()!;
  const courseId = params.courseId;
  try {
    if (pageId === 'P21') { await loadAuthorCoursesPage(user, path); return; }
    if (pageId === 'P09') { await loadHomePage(user, path); return; }
    if (pageId === 'P10') { loadLearnRedirect(path); return; }
    if (pageId === 'P11') { await loadEnrolledCoursePage(user, params, path); return; }
    if (!courseId) return;
    const course = await s2Request(`/api/author/courses/${courseId}`);
    if (!s2Current(path)) return;
    if (pageId === 'P31') { await loadCourseSettingsPage(path, courseId, course); return; }
    const tree = await s2Request(`/api/author/courses/${courseId}/structure`);
    if (!s2Current(path)) return;
    if (pageId === 'P22') { await loadCourseBuilderPage(path, courseId, course, tree); return; }
    if (pageId === 'P26') { await loadAuthorPreviewPage(path, courseId, tree); return; }
    if (['P23', 'P24', 'P25'].includes(pageId)) { await loadStepEditorPage(path, params, courseId, course, tree); return; }
  } catch (err: any) {
    if (err?.status === 401 || err?.statusCode === 401) return;
    if (!s2Current(path)) return;
    const status = err?.status || err?.statusCode || 500;
    const isAuthorRoute = path.startsWith('/teach') || path.startsWith('/settings/ai-connections');
    if (isAuthorRoute && user) {
      if (status === 403) {
        appEl.innerHTML = renderAppShell({
          user: user as any,
          activeMode: 'teach',
          activePath: path,
          content: `
            <div class="author-courses-container container py-12">
              <div class="state-container state-denied text-center max-w-md mx-auto" role="alert">
                <h1 class="page-title text-xl font-semibold mb-2">This course isn't available</h1>
                <p class="text-secondary mb-4">You do not have permission to view or edit this course.</p>
                <div class="flex items-center justify-center gap-3">
                  <a href="/teach" class="btn btn-primary btn-compact">Return to Your courses</a>
                  <a href="/courses" class="btn btn-secondary btn-compact">Browse courses</a>
                </div>
              </div>
            </div>
          `,
        });
        return;
      }
      if (status === 404) {
        appEl.innerHTML = renderAppShell({
          user: user as any,
          activeMode: 'teach',
          activePath: path,
          content: `
            <div class="author-courses-container container py-12">
              <div class="state-container state-not-found text-center max-w-md mx-auto" role="alert">
                <h1 class="page-title text-xl font-semibold mb-2">Course not found</h1>
                <p class="text-secondary mb-4">The requested course or content could not be found.</p>
                <div class="flex items-center justify-center gap-3">
                  <a href="/teach" class="btn btn-primary btn-compact">Return to Your courses</a>
                </div>
              </div>
            </div>
          `,
        });
        return;
      }
      appEl.innerHTML = renderAppShell({
        user: user as any,
        activeMode: 'teach',
        activePath: path,
        content: `
          <div class="author-courses-container container py-12">
            <div class="state-container state-failure max-w-md mx-auto" role="alert">
              <h1 class="page-title text-xl font-semibold mb-2">Couldn't load course content</h1>
              <p class="text-secondary mb-4">${escapeHtml(err.message || 'A temporary server error prevented loading. Your drafts are preserved.')}</p>
              <div class="flex items-center gap-3">
                <button class="btn btn-primary btn-compact" id="author-route-retry">Try again</button>
                <a href="/teach" class="btn btn-secondary btn-compact">Return to Your courses</a>
              </div>
            </div>
          </div>
        `,
      });
      document.getElementById('author-route-retry')?.addEventListener('click', () => renderApp(path));
      return;
    }
    showRouteFailure(err.message || 'Could not load this page.', path);
  }
}
