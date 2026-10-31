import { type ExecutionResult } from 'zur-shared';
import { renderTaskSquareInnerHtml } from '../../components/shells/index.ts';
import { DraftManager } from '../../services/draft-manager.ts';
import { parseLearningNavigation } from '../../pages/learning/learning-navigation.ts';
import { escapeHtml } from '../helpers.ts';
import { type PythonWorkspaceContext } from './python-workspace-context.ts';
import { authClient } from '../state.ts';

export function attachWorkspaceSplitters(ctx: PythonWorkspaceContext): void {
  const {  } = ctx;
  const workspaceViewport = document.querySelector<HTMLElement>('.paired-workspace .workspace-viewport');
  const workspaceSplitter = document.getElementById('workspace-splitter');
  const editorPane = document.querySelector<HTMLElement>('.paired-workspace .editor-pane');
  const resultsSplitter = document.getElementById('results-splitter');
  const resultsRegion = document.querySelector<HTMLElement>('.paired-workspace .workspace-results-region');
  const setProblemWidth = (width: number) => {
    if (!workspaceViewport || !workspaceSplitter) return;
    const bounded = Math.max(340, Math.min(width, workspaceViewport.clientWidth - 486));
    workspaceViewport.style.setProperty('--problem-pane-width', `${bounded}px`);
    workspaceSplitter.setAttribute('aria-valuenow', String(Math.round(bounded)));
  };
  const DRAWER_HEIGHT_KEY = 'zur_results_drawer_height';
  const setDrawerOpen = (open: boolean) => {
    if (!editorPane) return;
    editorPane.dataset.drawer = open ? 'open' : 'closed';
    document.getElementById('drawer-toggle-btn')?.setAttribute('aria-expanded', String(open));
  };
  const setResultsHeight = (height: number, persist = false) => {
    if (!editorPane || !resultsSplitter || !resultsRegion) return;
    const bounded = Math.max(120, Math.min(height, editorPane.clientHeight - 200));
    editorPane.style.setProperty('--results-height', `${bounded}px`);
    resultsSplitter.setAttribute('aria-valuenow', String(Math.round(bounded)));
    if (persist) {
      try { window.localStorage.setItem(DRAWER_HEIGHT_KEY, String(Math.round(bounded))); } catch { /* storage unavailable */ }
    }
  };
  try {
    const storedHeight = Number(window.localStorage.getItem(DRAWER_HEIGHT_KEY));
    if (Number.isFinite(storedHeight) && storedHeight >= 120) setResultsHeight(storedHeight);
  } catch { /* storage unavailable */ }
  document.getElementById('drawer-toggle-btn')?.addEventListener('click', () => setDrawerOpen(editorPane?.dataset.drawer !== 'open'));
  resultsSplitter?.addEventListener('dblclick', () => setDrawerOpen(editorPane?.dataset.drawer !== 'open'));
  workspaceSplitter?.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setProblemWidth((workspaceViewport?.querySelector('.problem-pane')?.clientWidth || 400) + (event.key === 'ArrowRight' ? 16 : -16));
  });
  resultsSplitter?.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    setDrawerOpen(true);
    setResultsHeight((resultsRegion?.clientHeight || 240) + (event.key === 'ArrowUp' ? 16 : -16), true);
  });
  workspaceSplitter?.addEventListener('pointerdown', (event) => {
    if (window.innerWidth < 1024) return;
    workspaceSplitter.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = workspaceViewport?.querySelector('.problem-pane')?.clientWidth || 400;
    const move = (moveEvent: PointerEvent) => setProblemWidth(startWidth + moveEvent.clientX - startX);
    workspaceSplitter.addEventListener('pointermove', move);
    workspaceSplitter.addEventListener('pointerup', () => workspaceSplitter.removeEventListener('pointermove', move), { once: true });
  });
  resultsSplitter?.addEventListener('pointerdown', (event) => {
    if (window.innerWidth < 1024) return;
    resultsSplitter.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const wasClosed = editorPane?.dataset.drawer !== 'open';
    setDrawerOpen(true);
    const startHeight = wasClosed ? 120 : (resultsRegion?.clientHeight || 240);
    const move = (moveEvent: PointerEvent) => setResultsHeight(startHeight + startY - moveEvent.clientY, true);
    resultsSplitter.addEventListener('pointermove', move);
    resultsSplitter.addEventListener('pointerup', () => resultsSplitter.removeEventListener('pointermove', move), { once: true });
  });
  ctx.setDrawerOpen = setDrawerOpen;
}

export function attachExecution(ctx: PythonWorkspaceContext): void {
  const { initial, userId, requestedPath, textarea, saveQueue, pendingJobKey, setSaveState, setDraftNotice, setResults, selectTab, setDrawerOpen } = ctx;
  textarea?.addEventListener('input', () => {
    ctx.code = textarea.value;
    const storedLocally = DraftManager.saveLocalDraft(userId, initial.enrollmentId, initial.stepId, ctx.code, saveQueue.revision);
    DraftManager.markUnsynced(userId, initial.enrollmentId, initial.stepId, true);
    setSaveState(ctx.isRevisionConflict ? 'conflict' : storedLocally ? 'saving' : 'unsaved',
      ctx.isRevisionConflict ? 'Draft conflict' : storedLocally ? 'Saving…' : 'Unsaved edits');
    if (!storedLocally) setDraftNotice('Local storage is unavailable. Keep this page open and copy your code before leaving.');
    if (ctx.isRevisionConflict) return;
    saveQueue.update(ctx.code);
  });

  let executionInFlight = false;
  const execute = async (mode: 'samples' | 'custom' | 'submit', stdin?: string) => {
    if (executionInFlight) return;
    executionInFlight = true;
    const input = document.getElementById('custom-stdin-input') as HTMLTextAreaElement | null;
    if (input) ctx.customStdin = input.value;
    if (mode === 'custom') ctx.customStdin = stdin ?? ctx.customStdin;
    ctx.code = textarea?.value ?? ctx.code;
    ctx.resultMode = mode;
    const actionButtons = document.querySelectorAll<HTMLButtonElement>('.editor-toolbar-actions button');
    actionButtons.forEach((button) => { button.disabled = true; });
    selectTab('results');
    setDrawerOpen(true);
    setResults({ inFlightStatus: 'queued' });
    try {
      const endpoint = mode === 'samples' ? '/api/execution/run-samples' : mode === 'custom' ? '/api/execution/run-custom' : '/api/execution/submit';
      const response = await authClient.fetchApi(endpoint, {
        method: 'POST',
        body: JSON.stringify({ enrollmentId: initial.enrollmentId, stepId: initial.stepId, code: ctx.code, stdin: mode === 'custom' ? ctx.customStdin : undefined, idempotencyKey: crypto.randomUUID() }),
      });
      const jobId = response.job?.id;
      if (!jobId) throw new Error('Execution was not accepted.');
      localStorage.setItem(pendingJobKey, JSON.stringify({ jobId, mode }));
      const completed = await waitForJob(jobId);
      if (window.location.pathname + window.location.search !== requestedPath || !textarea?.isConnected) return;
      ctx.currentResult = completed.result;
      localStorage.removeItem(pendingJobKey);
      ctx.resultMode = mode;
      if (mode === 'submit' && ctx.currentResult?.verdict === 'PASSED') initial.isCompleted = true;
      selectTab('results');
      setResults();
      if (mode === 'submit' && ctx.currentResult?.verdict === 'PASSED') {
        const submitBtn = document.getElementById('submit-solution-btn');
        if (submitBtn) {
          submitBtn.classList.remove('btn-primary');
          submitBtn.classList.add('btn-secondary');
        }

        // Live-update current task square in task strip to completed green
        const activeSquare = document.querySelector('.learning-task-strip .task-square.selected, .task-square.selected, .task-square.current');
        if (activeSquare && !activeSquare.classList.contains('completed')) {
          activeSquare.classList.add('completed');
          const currentLabel = activeSquare.getAttribute('aria-label') || '';
          if (!currentLabel.includes('(Completed)')) {
            activeSquare.setAttribute('aria-label', `${currentLabel} (Completed)`);
          }
          activeSquare.innerHTML = renderTaskSquareInnerHtml({
            ordinal: Number(activeSquare.getAttribute('data-ordinal')) || 1,
            type: 'python',
            isCompleted: true,
          });
        }

        // Live-update sidebar course progress bar and counter
        void authClient.fetchApi(`/api/enrollments/${encodeURIComponent(initial.enrollmentId)}/progress`)
          .then((prog: any) => {
            if (!prog || window.location.pathname + window.location.search !== requestedPath || !textarea?.isConnected) return;
            const total = prog.totalSteps || 0;
            const completed = prog.completedSteps || 0;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            const fill = document.querySelector<HTMLElement>('.sidebar-progress-box .progress-bar-fill');
            const text = document.querySelector<HTMLElement>('.sidebar-progress-box .progress-text');
            if (fill) fill.style.width = `${pct}%`;
            if (text) text.textContent = `${completed} of ${total} completed`;
            const currentUser = authClient.getUser();
            const navigation = parseLearningNavigation(prog, initial.enrollmentId, initial.stepId, currentUser?.id, initial.courseVersionId);
            const currentLesson = navigation.modules.flatMap((module: any) => module.lessons).find((lesson: any) => lesson.isCurrent);
            const badge = document.querySelector('.sidebar-lesson-item.active .lesson-item-count');
            if (badge && currentLesson) badge.textContent = `${currentLesson.completedCount}/${currentLesson.totalCount}`;
          })
          .catch(() => {});

        const resultsBody = document.querySelector('.results-body');
        document.querySelector('.editor-toolbar-actions [data-python-continue]')?.remove();
        if (resultsBody && !resultsBody.querySelector('[data-python-success]')) {
          const nextHref = initial.nextStepUrl || `/learn/${encodeURIComponent(initial.enrollmentId)}`;
          const banner = document.createElement('div');
          banner.className = 'python-success-banner';
          banner.dataset.pythonSuccess = 'true';
          banner.setAttribute('role', 'status');
          const duration = ctx.currentResult?.executionTimeMs ? `<span class="result-duration text-secondary tabular-nums">${escapeHtml(String(ctx.currentResult.executionTimeMs))} ms</span>` : '';
          banner.innerHTML = `<span aria-hidden="true">✓</span><span class="python-success-text">All tests passed. Step complete.</span>${duration}<a href="${escapeHtml(nextHref)}" class="btn btn-primary btn-compact" data-python-next>${initial.isLastStep ? 'Back to course →' : 'Next step →'}</a>`;
          resultsBody.querySelector('.result-card-banner')?.remove();
          resultsBody.prepend(banner);
          banner.querySelector<HTMLElement>('[data-python-next]')?.focus({ preventScroll: true });
        }
      }
    } catch (error: any) {
      const safeMessage = error.statusCode === 429
        ? 'Too many execution requests. Your code is unchanged; wait briefly and try again.'
        : error.statusCode === 503
          ? 'Code execution is temporarily unavailable. Your code is unchanged; try again later.'
          : 'We could not check this code. Your code remains in the editor; try again.';
      selectTab('results');
      setResults({ executionError: safeMessage });
    } finally {
      executionInFlight = false;
      actionButtons.forEach((button) => { button.disabled = false; });
    }
  };

  const waitForJob = async (jobId: string): Promise<{ result: ExecutionResult }> => {
    while (window.location.pathname + window.location.search === requestedPath) {
      const state = await authClient.fetchApi(`/api/execution/jobs/${encodeURIComponent(jobId)}`);
      if (window.location.pathname + window.location.search !== requestedPath || !textarea?.isConnected) {
        throw new Error('Navigation interrupted polling.');
      }
      if (state.job?.status === 'completed') return state;
      setResults({ inFlightStatus: state.job?.status === 'running' ? 'running' : 'queued', inFlightJobId: jobId });
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    throw new Error('Navigation interrupted polling.');
  };
  ctx.execute = execute;
  ctx.waitForJob = waitForJob;
}
