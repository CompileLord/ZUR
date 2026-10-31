import { attachOutlineDrawer } from '../../components/shells/index.ts';
import {
  setCurriculumSidebarCollapsed,
  getScopedModulesExpandedKey,
  getScopedSidebarScrollKey,
} from '../../pages/learning/learning-navigation.ts';
import { safeSessionStorageGet, safeSessionStorageSet } from '../helpers.ts';
import { appEl, authClient, app } from '../state.ts';

export function attachLearningShellListeners(): void {
  const shellEl = appEl.querySelector('.shell-learning') as HTMLElement | null;
  if (!shellEl || shellEl.dataset.shellListenersAttached === 'true') return;
  shellEl.dataset.shellListenersAttached = 'true';

  const getScope = () => {
    const uId = authClient.getUser()?.id || 'guest';
    const eId = (document.getElementById('report-enrollment-id') as HTMLInputElement)?.value || '';
    const vId = (document.getElementById('report-version-id') as HTMLInputElement)?.value || '';
    return { uId, eId, vId };
  };

  if (shellEl.classList.contains('outline-drawer-mode')) {
    attachOutlineDrawer(shellEl, (collapsed) => {
      const { uId, eId, vId } = getScope();
      if (uId && eId && vId) setCurriculumSidebarCollapsed(uId, eId, vId, collapsed);
    });
  }
  shellEl.addEventListener('click', event => {
    if (shellEl.classList.contains('outline-drawer-mode')) return;
    const btn = (event.target as HTMLElement).closest<HTMLElement>('.sidebar-toggle-btn');
    if (!btn) return;
    event.stopPropagation();
    const sidebar = shellEl.querySelector<HTMLElement>('#course-sidebar');
    if (!sidebar) return;
    const isCollapsed = sidebar.classList.toggle('collapsed');
    sidebar.classList.toggle('open', !isCollapsed);
    sidebar.inert = isCollapsed;
    btn.setAttribute('aria-expanded', String(!isCollapsed));
    btn.setAttribute('aria-label', isCollapsed ? 'Show modules' : 'Hide modules');
    btn.setAttribute('title', isCollapsed ? 'Show modules' : 'Hide modules');
    const { uId, eId, vId } = getScope();
    if (uId && eId && vId) {
      setCurriculumSidebarCollapsed(uId, eId, vId, isCollapsed);
    }
  });

  const reportDialog = document.getElementById('exercise-report-dialog') as HTMLElement | null;
  const closeBtn = document.getElementById('close-report-dialog-btn');
  const cancelBtn = document.getElementById('cancel-report-btn');
  const reportForm = document.getElementById('exercise-report-form') as HTMLFormElement | null;
  let lastActiveLink: HTMLElement | null = null;

  const setBackgroundInert = (isInert: boolean) => {
    const taskStrip = shellEl.querySelector<HTMLElement>('.learning-task-strip');
    const learningBody = shellEl.querySelector<HTMLElement>('.learning-body');
    if (taskStrip) taskStrip.inert = isInert;
    if (learningBody) learningBody.inert = isInert;
  };

  let isReportModalOpen = false;

  const closeReportModal = () => {
    if (!isReportModalOpen && (!reportDialog || !(reportDialog as any).open)) return;
    isReportModalOpen = false;
    if (reportDialog) {
      if (typeof (reportDialog as any).close === 'function' && (reportDialog as any).open) {
        try { (reportDialog as any).close(); } catch {}
      }
      reportDialog.hidden = true;
      reportDialog.style.display = 'none';
      reportDialog.classList.remove('open');
    }
    setBackgroundInert(false);
    if (app.activeModalKeydownListener) {
      document.removeEventListener('keydown', app.activeModalKeydownListener);
      app.activeModalKeydownListener = null;
    }
    app.activeModalCleanup = null;
    const includeCodeInput = document.getElementById('report-include-code') as HTMLInputElement | null;
    if (includeCodeInput) includeCodeInput.checked = false;
    lastActiveLink?.focus();
  };

  const openReportModal = (trigger: HTMLElement) => {
    if (!reportDialog) return;
    isReportModalOpen = true;
    lastActiveLink = trigger;
    const includeCodeInput = document.getElementById('report-include-code') as HTMLInputElement | null;
    if (includeCodeInput && reportDialog.hidden) includeCodeInput.checked = false;

    // Reset error feedback
    const feedback = document.getElementById('report-form-feedback');
    if (feedback) feedback.hidden = true;

    setBackgroundInert(true);
    reportDialog.hidden = false;
    reportDialog.style.display = 'flex';
    reportDialog.classList.add('open');
    if (typeof (reportDialog as any).showModal === 'function') {
      try {
        if (!(reportDialog as any).open) {
          (reportDialog as any).showModal();
        }
      } catch {}
    }

    const focusableSelectors = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusableElements = () => Array.from(reportDialog.querySelectorAll<HTMLElement>(focusableSelectors));

    const focusTarget = (document.getElementById('report-issue-details') as HTMLElement | null) || getFocusableElements()[0];
    focusTarget?.focus();

    if (app.activeModalKeydownListener) {
      document.removeEventListener('keydown', app.activeModalKeydownListener);
      app.activeModalKeydownListener = null;
    }

    app.activeModalCleanup = () => {
      if (reportDialog) {
        if (typeof (reportDialog as any).close === 'function' && (reportDialog as any).open) {
          try { (reportDialog as any).close(); } catch {}
        }
        reportDialog.hidden = true;
        reportDialog.style.display = 'none';
        reportDialog.classList.remove('open');
      }
      setBackgroundInert(false);
    };

    app.activeModalKeydownListener = (e: KeyboardEvent) => {
      if (!reportDialog || !reportDialog.isConnected || reportDialog.hidden || !(reportDialog as any).open) {
        if (app.activeModalKeydownListener) {
          document.removeEventListener('keydown', app.activeModalKeydownListener);
          app.activeModalKeydownListener = null;
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeReportModal();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = getFocusableElements();
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl || !reportDialog.contains(document.activeElement)) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl || !reportDialog.contains(document.activeElement)) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', app.activeModalKeydownListener);
  };

  shellEl.addEventListener('click', e => {
    const link = (e.target as HTMLElement).closest<HTMLElement>('.report-issue-link');
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();
    openReportModal(link);
  });

  closeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeReportModal();
  });
  cancelBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeReportModal();
  });
  reportDialog?.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeReportModal();
  });
  reportDialog?.addEventListener('close', () => {
    if ((reportDialog as any).open || isReportModalOpen) return;
    closeReportModal();
  });

  // Persist and restore sidebar module groups (<details>) expanded/collapsed state scoped by user/enrollment/version
  try {
    const { uId, eId, vId } = getScope();
    const storageKey = uId && eId && vId ? getScopedModulesExpandedKey(uId, eId, vId) : 'zur_collapsed_modules';
    const collapsedRaw = safeSessionStorageGet(storageKey);
    const collapsedSet = new Set<string>(collapsedRaw ? JSON.parse(collapsedRaw) : []);
    const moduleDetails = appEl.querySelectorAll<HTMLDetailsElement>('.sidebar-module-group');
    moduleDetails.forEach((details) => {
      const modId = details.dataset.moduleId;
      if (modId && collapsedSet.has(modId)) {
        details.open = false;
      }
      details.addEventListener('toggle', () => {
        if (!modId) return;
        if (details.open) {
          collapsedSet.delete(modId);
        } else {
          collapsedSet.add(modId);
        }
        safeSessionStorageSet(storageKey, JSON.stringify([...collapsedSet]));
      });
    });
  } catch {}

  // Persist and restore sidebar scroll position scoped by user/enrollment/version
  const sidebar = document.getElementById('course-sidebar');
  if (sidebar) {
    try {
      const { uId, eId, vId } = getScope();
      const scrollKey = uId && eId && vId ? getScopedSidebarScrollKey(uId, eId, vId) : 'zur_sidebar_scroll';
      const savedScroll = safeSessionStorageGet(scrollKey);
      if (savedScroll !== null) {
        sidebar.scrollTop = Number(savedScroll);
      }
      sidebar.addEventListener('scroll', () => {
        safeSessionStorageSet(scrollKey, String(sidebar.scrollTop));
      }, { passive: true });
    } catch {}
  }

  reportForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-report-btn') as HTMLButtonElement | null;
    const feedback = document.getElementById('report-form-feedback');
    if (submitBtn) submitBtn.disabled = true;

    const courseId = (document.getElementById('report-course-id') as HTMLInputElement)?.value || '';
    const courseVersionId = (document.getElementById('report-version-id') as HTMLInputElement)?.value || '';
    const stepId = (document.getElementById('report-step-id') as HTMLInputElement)?.value || '';
    const enrollmentId = (document.getElementById('report-enrollment-id') as HTMLInputElement)?.value || '';
    const type = (document.getElementById('report-issue-type') as HTMLSelectElement)?.value || 'other';
    const details = (document.getElementById('report-issue-details') as HTMLTextAreaElement)?.value || '';
    const includeCode = Boolean((document.getElementById('report-include-code') as HTMLInputElement)?.checked);
    const code = includeCode ? ((document.getElementById('code-editor-input') as HTMLTextAreaElement)?.value || '') : undefined;

    try {
      const payload: Record<string, any> = {
        courseId,
        courseVersionId,
        stepId,
        enrollmentId,
        type,
        details,
        description: details,
        includeCodeConsent: includeCode,
        includeCode,
      };
      if (includeCode && code) {
        payload.code = code;
        payload.submittedCode = code;
      }
      await authClient.fetchApi('/api/reports', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (feedback) {
        feedback.hidden = false;
        feedback.className = 'alert alert-success text-sm mb-3';
        feedback.textContent = 'Report submitted. Thank you for your feedback.';
      }
      setTimeout(() => {
        closeReportModal();
        if (feedback) feedback.hidden = true;
        if (submitBtn) submitBtn.disabled = false;
      }, 1000);
    } catch {
      if (feedback) {
        feedback.hidden = false;
        feedback.className = 'alert alert-danger text-sm mb-3';
        feedback.textContent = 'Could not submit report. Your message is preserved; try again.';
      }
      if (submitBtn) submitBtn.disabled = false;
      (document.getElementById('report-issue-details') as HTMLTextAreaElement | null)?.focus();
    }
  });
}
