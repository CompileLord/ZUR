import { s2Request } from '../api.ts';
import { type AppUser } from '../context.ts';
import { s2Current, cleanupActiveModals } from '../helpers.ts';
import { renderApp, navigateTo } from '../navigation.ts';
import { showRouteLoading } from '../route-loading.ts';
import { appEl, app } from '../state.ts';

export async function loadAuthorCoursesPage(user: AppUser, path: string): Promise<void> {
  showRouteLoading('Your courses');
  const { renderAuthorCoursesPage, buildAuthorFilterUrl } = await import('../../pages/author/AuthorCoursesPage.ts');
  const data = await s2Request('/api/author/courses?limit=100');
  if (!s2Current(path)) return;
  let modal = false;
  let enteredTitle = '';
  let isSubmitting = false;
  let lastTrigger: HTMLElement | null = null;
  let modalInstanceId = 0;

  const removeInert = () => {
    ['.app-sidebar', '.author-page-header', '.author-toolbar', '.author-courses-content'].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.removeAttribute('inert'));
    });
  };

  const applyInert = () => {
    ['.app-sidebar', '.author-page-header', '.author-toolbar', '.author-courses-content'].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.setAttribute('inert', ''));
    });
  };

  const closeModal = (currentId?: number) => {
    if (isSubmitting) return;
    if (currentId !== undefined && currentId !== modalInstanceId) return;
    modal = false;
    enteredTitle = '';
    cleanupActiveModals();
    removeInert();
    draw();
    const openBtn = appEl.querySelector('[data-action="open-new-course-modal"]') as HTMLElement | null;
    (lastTrigger && lastTrigger.isConnected ? lastTrigger : openBtn)?.focus();
  };

  const draw = (error?: string) => {
    const query = new URLSearchParams(window.location.search || path.split('?')[1] || '');
    const rawStatus = query.get('status') || 'all';
    const status = ['all', 'draft', 'published', 'archived'].includes(rawStatus) ? rawStatus : 'all';
    const searchQuery = query.get('search') || '';
    appEl.innerHTML = renderAuthorCoursesPage({
      user,
      courses: data.courses,
      activeFilter: status as any,
      searchQuery,
      showNewCourseModal: modal,
      newCourseTitle: enteredTitle,
      newCourseError: error,
      isSubmitting,
    });

    if (modal) {
      applyInert();
      app.activeModalCleanup = removeInert;

      const titleInput = appEl.querySelector('#course-title-input') as HTMLInputElement | null;
      if (titleInput) {
        titleInput.addEventListener('input', () => {
          enteredTitle = titleInput.value;
        });
        if (!isSubmitting) {
          titleInput.focus();
          if (enteredTitle) {
            titleInput.setSelectionRange(enteredTitle.length, enteredTitle.length);
          }
        }
      }

      if (app.activeModalKeydownListener) {
        document.removeEventListener('keydown', app.activeModalKeydownListener);
      }
      const currentInstance = modalInstanceId;
      app.activeModalKeydownListener = (e: KeyboardEvent) => {
        if (!modal || modalInstanceId !== currentInstance) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          if (!isSubmitting) {
            closeModal(currentInstance);
          }
          return;
        }
        if (e.key === 'Tab') {
          const modalDialog = appEl.querySelector('.author-modal-440') as HTMLElement | null;
          if (!modalDialog) return;
          const focusable = Array.from(modalDialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )).filter(el => el.offsetParent !== null || el === document.activeElement);
          if (focusable.length === 0) {
            e.preventDefault();
            return;
          }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey) {
            if (document.activeElement === first || !modalDialog.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last || !modalDialog.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };
      document.addEventListener('keydown', app.activeModalKeydownListener);

      appEl.querySelectorAll('[data-action="close-modal"]').forEach(el => el.addEventListener('click', () => {
        closeModal(currentInstance);
      }));

      appEl.querySelector('form.modal-body[action="/teach"]')?.addEventListener('submit', async event => {
        event.preventDefault();
        if (isSubmitting) return;
        const form = event.currentTarget as HTMLFormElement;
        const titleFromForm = String(new FormData(form).get('title') || enteredTitle || '').trim();
        enteredTitle = titleFromForm;
        if (!enteredTitle) {
          draw('Course title is required.');
          return;
        }
        isSubmitting = true;
        draw();
        const submitInstance = modalInstanceId;
        const submitLifecycle = app.activeRouteLifecycle;
        const submittedForm = appEl.querySelector('form.modal-body[action="/teach"]') as HTMLFormElement | null;
        try {
          const course = await s2Request('/api/author/courses', 'POST', { title: enteredTitle });
          if (
            app.activeRouteLifecycle !== submitLifecycle ||
            !submittedForm ||
            !submittedForm.isConnected ||
            modalInstanceId !== submitInstance ||
            !s2Current(path) ||
            window.location.pathname !== '/teach'
          ) {
            return;
          }
          modal = false;
          enteredTitle = '';
          isSubmitting = false;
          cleanupActiveModals();
          removeInert();
          window.history.pushState({}, '', `/teach/${encodeURIComponent(course.id)}/content`);
          renderApp();
        } catch (err: any) {
          if (
            app.activeRouteLifecycle !== submitLifecycle ||
            !submittedForm ||
            !submittedForm.isConnected ||
            modalInstanceId !== submitInstance ||
            !s2Current(path) ||
            window.location.pathname !== '/teach'
          ) {
            return;
          }
          isSubmitting = false;
          draw(err.message || 'Could not create course. Please try again.');
        }
      });
    } else {
      cleanupActiveModals();
      removeInert();
      appEl.querySelectorAll('[data-action="open-new-course-modal"]').forEach(el => el.addEventListener('click', (e) => {
        if (isSubmitting) return;
        lastTrigger = (e.currentTarget as HTMLElement) || (document.activeElement as HTMLElement | null);
        modalInstanceId++;
        modal = true;
        enteredTitle = '';
        draw();
      }));

      appEl.querySelector('form.search-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const searchInput = appEl.querySelector('input[name="search"]') as HTMLInputElement | null;
        const statusInput = appEl.querySelector('input[name="status"]') as HTMLInputElement | null;
        const q = searchInput ? searchInput.value.trim() : '';
        const s = statusInput ? statusInput.value.trim() : '';
        navigateTo(buildAuthorFilterUrl(s, q));
      });
    }
  };
  draw();
  return;
}
