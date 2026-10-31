import { renderSafeDenialPage } from '../../pages/status/SafeDenialPage.ts';
import { getAttemptDocumentTitle, renderAttemptHistoryPage } from '../../pages/learning/AttemptHistoryPage.ts';
import { getCurriculumSidebarCollapsed, parseLearningNavigation } from '../../pages/learning/learning-navigation.ts';
import { navigateTo } from '../navigation.ts';
import { attachLearningShellListeners } from './learning-shell-listeners.ts';
import { showRouteLoading, showRouteFailure } from '../route-loading.ts';
import { authClient, appEl, app } from '../state.ts';
import { initTheme } from '../theme.ts';

export async function loadAttemptHistory(enrollmentId: string, stepId: string, attemptId: string | undefined, requestedPath: string): Promise<void> {
  const isCurrent = () => window.location.pathname + window.location.search === requestedPath;
  showRouteLoading('Submission history');
  try {
    const [step, page] = await Promise.all([
      authClient.fetchApi(`/api/enrollments/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}`),
      authClient.fetchApi(`/api/attempts?enrollmentId=${encodeURIComponent(enrollmentId)}&stepId=${encodeURIComponent(stepId)}&limit=10&offset=${Math.max(0, Number(new URLSearchParams(requestedPath.split('?')[1] || '').get('offset') || 0))}`),
    ]);
    if (!isCurrent()) return;
    const selected = attemptId ? await authClient.fetchApi(`/api/attempts/${encodeURIComponent(attemptId)}`) : null;
    if (!isCurrent()) return;
    const stepTitle = step.step?.title || 'Exercise';
    const courseTitle = step.courseTitle || 'Course';
    document.title = getAttemptDocumentTitle(stepTitle, courseTitle, selected);

    const user = authClient.getUser() || { id: 'user-guest', displayName: 'Guest' };
    const courseVersionId = step.courseVersionId || step.progress?.pinnedVersionId || step.progress?.courseVersionId || '';
    const isSidebarCollapsed = user?.id ? getCurriculumSidebarCollapsed(user.id, enrollmentId, courseVersionId) : false;
    const nav = parseLearningNavigation(step.progress, enrollmentId, stepId, user?.id, courseVersionId);

    const queryOffset = Math.max(0, Number(new URLSearchParams(requestedPath.split('?')[1] || '').get('offset') || 0));
    const allAttemptsUrl = queryOffset > 0
      ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}/attempts?offset=${queryOffset}`
      : `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}/attempts`;

    appEl.innerHTML = renderAttemptHistoryPage({
      courseTitle,
      courseOverviewUrl: `/learn/${encodeURIComponent(enrollmentId)}`,
      lessonTitle: step.stepMeta?.lessonTitle || 'Lesson',
      stepTitle,
      enrollmentId,
      stepId,
      courseId: step.courseId || step.progress?.courseId,
      courseVersionId,
      workspaceUrl: `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}`,
      attempts: page.items || [],
      selectedAttempt: selected,
      totalAttempts: page.total || 0,
      currentPage: Math.floor((page.offset || 0) / Math.max(1, page.limit || 10)) + 1,
      pageSize: page.limit || 10,
      offset: page.offset || 0,
      isCompact: window.innerWidth < 1024,
      modules: nav.modules,
      taskSquares: nav.taskSquares,
      courseProgressText: nav.courseProgressText,
      courseProgressPercentage: nav.courseProgressPercentage,
      isSidebarCollapsed,
      allAttemptsUrl,
    });
    initTheme();
    attachLearningShellListeners();
    document.getElementById('copy-code-btn')?.addEventListener('click', async () => {
      if (!selected?.codeSnapshot) return;
      await navigator.clipboard.writeText(selected.codeSnapshot);
    });

    const restoreTriggerBtn = document.getElementById('restore-to-editor-btn') as HTMLButtonElement | null;
    const restoreDialog = document.getElementById('restore-confirm-dialog') as HTMLDialogElement | null;
    const cancelRestoreBtn = document.getElementById('cancel-restore-btn') as HTMLButtonElement | null;
    const confirmRestoreBtn = document.getElementById('confirm-restore-btn') as HTMLButtonElement | null;
    const restoreErrorMsg = document.getElementById('restore-error-message');
    const restoreDetailFeedback = document.getElementById('restore-detail-feedback');

    let restoreKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
    let isRestoreDialogOpen = false;

    const closeRestoreDialog = () => {
      if (!isRestoreDialogOpen && (!restoreDialog || !restoreDialog.open)) return;
      isRestoreDialogOpen = false;
      if (restoreDialog) {
        if (typeof restoreDialog.close === 'function' && restoreDialog.open) {
          try { restoreDialog.close(); } catch {}
        }
        restoreDialog.hidden = true;
        restoreDialog.style.display = 'none';
      }
      if (restoreErrorMsg) {
        restoreErrorMsg.textContent = '';
        restoreErrorMsg.hidden = true;
        restoreErrorMsg.setAttribute('hidden', '');
        restoreErrorMsg.classList.add('hidden');
        restoreErrorMsg.style.display = 'none';
      }
      if (restoreDetailFeedback) {
        restoreDetailFeedback.textContent = '';
        restoreDetailFeedback.hidden = true;
        restoreDetailFeedback.setAttribute('hidden', '');
        restoreDetailFeedback.classList.add('hidden');
        restoreDetailFeedback.style.display = 'none';
      }
      if (restoreKeydownHandler) {
        document.removeEventListener('keydown', restoreKeydownHandler);
        restoreKeydownHandler = null;
      }
      app.activeModalCleanup = null;
      restoreTriggerBtn?.focus();
    };

    const openRestoreDialog = () => {
      if (!restoreDialog) return;
      isRestoreDialogOpen = true;
      if (restoreErrorMsg) {
        restoreErrorMsg.textContent = '';
        restoreErrorMsg.hidden = true;
        restoreErrorMsg.setAttribute('hidden', '');
        restoreErrorMsg.classList.add('hidden');
        restoreErrorMsg.style.display = 'none';
      }
      if (restoreDetailFeedback) {
        restoreDetailFeedback.textContent = '';
        restoreDetailFeedback.hidden = true;
        restoreDetailFeedback.setAttribute('hidden', '');
        restoreDetailFeedback.classList.add('hidden');
        restoreDetailFeedback.style.display = 'none';
      }
      if (confirmRestoreBtn) {
        confirmRestoreBtn.disabled = false;
        confirmRestoreBtn.textContent = 'Restore code';
      }
      restoreDialog.hidden = false;
      restoreDialog.style.display = 'flex';
      if (typeof restoreDialog.showModal === 'function') {
        try {
          if (!restoreDialog.open) {
            restoreDialog.showModal();
          }
        } catch {}
      }
      cancelRestoreBtn?.focus();

      if (restoreKeydownHandler) {
        document.removeEventListener('keydown', restoreKeydownHandler);
      }

      app.activeModalCleanup = () => {
        if (restoreDialog) {
          if (typeof restoreDialog.close === 'function' && restoreDialog.open) {
            try { restoreDialog.close(); } catch {}
          }
          restoreDialog.hidden = true;
          restoreDialog.style.display = 'none';
        }
      };

      restoreKeydownHandler = (e: KeyboardEvent) => {
        if (!restoreDialog || !restoreDialog.isConnected || restoreDialog.hidden || !restoreDialog.open) {
          if (restoreKeydownHandler) {
            document.removeEventListener('keydown', restoreKeydownHandler);
            restoreKeydownHandler = null;
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeRestoreDialog();
          return;
        }
        if (e.key === 'Tab') {
          const focusable = [cancelRestoreBtn, confirmRestoreBtn].filter(Boolean) as HTMLElement[];
          if (focusable.length === 0) {
            e.preventDefault();
            return;
          }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey) {
            if (document.activeElement === first || !restoreDialog.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last || !restoreDialog.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };
      document.addEventListener('keydown', restoreKeydownHandler);
    };

    restoreTriggerBtn?.addEventListener('click', openRestoreDialog);

    cancelRestoreBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      closeRestoreDialog();
    });

    restoreDialog?.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeRestoreDialog();
    });

    restoreDialog?.addEventListener('close', () => {
      if (restoreDialog.open || isRestoreDialogOpen) return;
      closeRestoreDialog();
    });

    confirmRestoreBtn?.addEventListener('click', async () => {
      if (!selected) return;
      confirmRestoreBtn.disabled = true;
      confirmRestoreBtn.textContent = 'Restoring…';
      try {
        await authClient.fetchApi(`/api/attempts/${encodeURIComponent(attemptId!)}/restore`, { method: 'POST' });
        if (!isCurrent()) return;
        closeRestoreDialog();
        navigateTo(`/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}`);
      } catch {
        if (!isCurrent()) return;
        confirmRestoreBtn.disabled = false;
        confirmRestoreBtn.textContent = 'Retry restore';
        const failureText = 'This attempt could not be restored. Your current editor content is preserved.';
        if (restoreErrorMsg) {
          restoreErrorMsg.textContent = failureText;
          restoreErrorMsg.hidden = false;
          restoreErrorMsg.removeAttribute('hidden');
          restoreErrorMsg.classList.remove('hidden');
          restoreErrorMsg.style.display = 'flex';
        }
        if (restoreDetailFeedback) {
          restoreDetailFeedback.textContent = failureText;
          restoreDetailFeedback.hidden = false;
          restoreDetailFeedback.removeAttribute('hidden');
          restoreDetailFeedback.classList.remove('hidden');
          restoreDetailFeedback.style.display = 'block';
        }
      }
    });
  } catch (error: any) {
    if (!isCurrent()) return;
    if (error.statusCode === 404 || error.statusCode === 403) appEl.innerHTML = renderSafeDenialPage({ type: 'not-found', user: authClient.getUser() });
    else showRouteFailure('We could not load submission history. Retry when the service is available.', requestedPath);
  }
}
