import { renderSafeDenialPage } from '../../pages/status/SafeDenialPage.ts';
import { type CoursePublishPageOptions, renderCoursePublishPage } from '../../pages/author/CoursePublishPage.ts';
import { showRouteLoading, showRouteFailure } from '../route-loading.ts';
import { authClient, appEl } from '../state.ts';
import { initTheme } from '../theme.ts';

export async function loadPublishReview(courseId: string, requestedPath: string, staleRevision = false): Promise<void> {
  const isCurrent = () => window.location.pathname + window.location.search === requestedPath;
  const encodedCourseId = encodeURIComponent(courseId);
  showRouteLoading('Review publication');
  try {
    const [course, validation, structure] = await Promise.all([
      authClient.fetchApi(`/api/author/courses/${encodedCourseId}`),
      authClient.fetchApi(`/api/author/courses/${encodedCourseId}/validate`, { method: 'POST', body: JSON.stringify({}) }),
      authClient.fetchApi(`/api/author/courses/${encodedCourseId}/structure`).catch(() => null),
    ]);
    if (!isCurrent()) return;
    if (validation.draftRevision !== course.draftRevision) {
      return loadPublishReview(courseId, requestedPath, true);
    }
    const stepTypeMap: Record<string, string> = {};
    if (structure?.modules) {
      for (const mod of structure.modules) {
        for (const les of mod.lessons || []) {
          for (const st of les.steps || []) {
            if (st.id && st.type) {
              stepTypeMap[st.id] = st.type;
            }
          }
        }
      }
    }
    const options: CoursePublishPageOptions = {
      courseId,
      courseTitle: course.title,
      publicationState: course.publicationStatus,
      hasUnpublishedChanges: course.hasUnpublishedChanges,
      draftRevision: course.draftRevision,
      currentVersionNumber: course.currentVersionNumber,
      newVersionNumber: (course.currentVersionNumber || 0) + 1,
      activeEnrolledStudents: course.studentCount,
      visibility: course.visibility,
      enrollmentPolicy: course.enrollmentPolicy,
      validation,
      staleRevision,
      stepTypeMap,
      modules: structure?.modules,
    };
    const render = (overrides: Partial<CoursePublishPageOptions> = {}) => {
      appEl.innerHTML = renderCoursePublishPage({ ...options, ...overrides });
      initTheme();
      attachPublishReviewListeners(courseId, requestedPath, options, render);
    };
    render();
  } catch (error: any) {
    if (!isCurrent()) return;
    if (error.statusCode === 404 || error.statusCode === 403) appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
    else showRouteFailure('We could not validate this saved draft. Retry after the service is available.', requestedPath);
  }
}

function attachPublishReviewListeners(
  courseId: string,
  requestedPath: string,
  options: CoursePublishPageOptions,
  render: (overrides?: Partial<CoursePublishPageOptions>) => void,
): void {
  const open = document.getElementById('publish-open-confirm');
  open?.addEventListener('click', () => {
    if (!options.validation.isValid) return;
    render({ showConfirmModal: true });
    document.getElementById('publish-confirm-submit')?.focus();
  });
  const cancel = () => {
    render({ showConfirmModal: false });
    document.getElementById('publish-open-confirm')?.focus();
  };
  document.getElementById('publish-cancel-confirm')?.addEventListener('click', cancel);
  const dialog = document.querySelector('[role="dialog"][aria-labelledby="publish-dialog-title"]');
  dialog?.addEventListener('keydown', (event) => { if ((event as KeyboardEvent).key === 'Escape') cancel(); });
  document.getElementById('publish-confirm-submit')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    if (button.disabled || !options.validation.isValid) return;
    button.disabled = true;
    button.textContent = 'Publishing…';
    try {
      const receipt = await authClient.fetchApi(`/api/author/courses/${encodeURIComponent(courseId)}/publish`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: options.draftRevision, idempotencyKey: crypto.randomUUID() }),
      });
      if (window.location.pathname + window.location.search !== requestedPath) return;
      appEl.innerHTML = renderCoursePublishPage({ ...options, publicationState: 'published', hasUnpublishedChanges: false, receipt });
      initTheme();
    } catch (error: any) {
      if (error.code === 'STALE_REVISION' || error.statusCode === 409) {
        void loadPublishReview(courseId, requestedPath, true);
      } else if (error.statusCode === 400) {
        void loadPublishReview(courseId, requestedPath);
      } else {
        const currentButton = document.getElementById('publish-confirm-submit') as HTMLButtonElement | null;
        if (currentButton) { currentButton.disabled = false; currentButton.textContent = options.currentVersionNumber ? `Publish Version ${options.newVersionNumber}` : 'Publish course'; }
        const warning = document.createElement('p'); warning.className = 'text-danger'; warning.setAttribute('role', 'alert');
        warning.textContent = 'Publication failed. The course remains on its current released version; retry after checking the draft status.';
        document.querySelector('[role="dialog"] .dialog-card')?.append(warning);
      }
    }
  });
}
