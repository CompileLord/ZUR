import { renderPublicShell } from '../../components/shells/index.ts';
import { type ReportCourse, renderHelpPage } from '../../pages/public/HelpPage.ts';
import { courseClient, authClient, appEl } from '../state.ts';

export function attachHelpListeners(courseId?: string, triggerElement?: HTMLElement | null, courses: ReportCourse[] | null = []): void {
  const modal = document.getElementById('report-issue-modal');
  const openBtns = document.querySelectorAll<HTMLElement>('[data-action="open-report"]');
  const closeBtns = document.querySelectorAll<HTMLElement>('[data-action="close-report"]');
  const form = document.getElementById('report-issue-form') as HTMLFormElement | null;

  let helpTriggerElement: HTMLElement | null = triggerElement || (openBtns.length > 0 ? openBtns[0] : null);

  const getFocusableElements = (): HTMLElement[] => {
    if (!modal) return [];
    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');
    return Array.from(modal.querySelectorAll<HTMLElement>(selectors)).filter(
      (el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
    );
  };

  const handleModalKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeReportModal();
      return;
    }

    if (e.key === 'Tab') {
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl || !modal?.contains(document.activeElement)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl || !modal?.contains(document.activeElement)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
  };

  function openReportModal(trigger?: HTMLElement): void {
    if (!modal) return;
    if (trigger) {
      helpTriggerElement = trigger;
    } else if (!helpTriggerElement) {
      helpTriggerElement = document.activeElement as HTMLElement | null;
    }

    modal.style.display = 'flex';
    modal.classList.add('open');

    if (modal instanceof HTMLDialogElement && !modal.open) {
      try {
        modal.showModal();
      } catch {
        modal.setAttribute('open', '');
      }
    }

    document.addEventListener('keydown', handleModalKeyDown);

    const firstInput = (modal.querySelector('#report-signin, #report-course-id, #report-type, #report-description') as HTMLElement | null)
      || (modal.querySelector('input:not([type="hidden"]), select, textarea, button') as HTMLElement | null);
    firstInput?.focus();
  }

  function closeReportModal(): void {
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('open');

    if (modal instanceof HTMLDialogElement && modal.open) {
      try {
        modal.close();
      } catch {
        modal.removeAttribute('open');
      }
    }

    document.removeEventListener('keydown', handleModalKeyDown);
    if (helpTriggerElement && typeof helpTriggerElement.focus === 'function') {
      helpTriggerElement.focus();
    }
  }

  if (modal instanceof HTMLDialogElement) {
    modal.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeReportModal();
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeReportModal();
      }
    });
  }

  openBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      openReportModal(btn);
    });
  });

  closeBtns.forEach((btn) => {
    btn.addEventListener('click', closeReportModal);
  });

  if (modal && (modal.classList.contains('open') || modal.hasAttribute('open') || modal.style.display === 'flex')) {
    if (modal instanceof HTMLDialogElement && !modal.open) {
      try {
        modal.showModal();
      } catch {
        modal.setAttribute('open', '');
      }
    }
    document.addEventListener('keydown', handleModalKeyDown);
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending report…';
      }

      const reportCourseId = (document.getElementById('report-course-id') as HTMLInputElement)?.value || courseId || '';
      const type = (document.getElementById('report-type') as HTMLSelectElement)?.value || 'other';
      const description = (document.getElementById('report-description') as HTMLTextAreaElement)?.value || '';
      const courseVersionId = (document.getElementById('report-version-id') as HTMLInputElement)?.value || undefined;
      const stepId = (document.getElementById('report-step-id') as HTMLInputElement)?.value || undefined;

      try {
        const res = await courseClient.submitReport({
          courseId: reportCourseId,
          courseVersionId,
          stepId,
          type,
          description,
        });

        const currentUser = authClient.getUser();
        const content = renderHelpPage({
          isSignedIn: true,
          courses,
          courseId: reportCourseId,
          isReportModalOpen: true,
          reportSuccessReference: res.reference,
        });
        appEl.innerHTML = renderPublicShell({
          activePath: window.location.pathname,
          user: currentUser,
          content,
        });
        attachHelpListeners(reportCourseId, helpTriggerElement, courses);
      } catch (err: any) {
        const currentUser = authClient.getUser();
        const content = renderHelpPage({
          isSignedIn: true,
          courses,
          courseId: reportCourseId,
          courseVersionId,
          stepId,
          type,
          description,
          isReportModalOpen: true,
          reportError: err.message || 'Failed to submit report. Please try again.',
        });
        appEl.innerHTML = renderPublicShell({
          activePath: window.location.pathname,
          user: currentUser,
          content,
        });
        attachHelpListeners(reportCourseId, helpTriggerElement, courses);
        const descEl = document.getElementById('report-description') as HTMLTextAreaElement | null;
        descEl?.focus();
      }
    });
  }
}
