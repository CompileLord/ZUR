import { DraftManager } from '../../services/draft-manager.ts';
import { type PythonWorkspaceContext } from './python-workspace-context.ts';
import { app, courseClient, authClient } from '../state.ts';

export function attachWorkspaceControls(ctx: PythonWorkspaceContext): void {
  const { initial, userId, textarea, saveQueue, pendingJobKey, runShortcutText, runAriaShortcut, getSelectedRunMode, setSaveState, setDraftNotice, setResults, selectTab, setEditorCode, execute, waitForJob } = ctx;
  try {
    const pending = JSON.parse(localStorage.getItem(pendingJobKey) || 'null');
    if (pending?.jobId) {
      ctx.resultMode = pending.mode;
      setResults({ inFlightStatus: 'reconnecting', inFlightJobId: pending.jobId });
      void waitForJob(pending.jobId).then((state) => {
        localStorage.removeItem(pendingJobKey);
        ctx.currentResult = state.result;
        selectTab('results');
        setResults();
      }).catch(() => setResults({ executionError: 'Could not reconnect to this execution. Your code is unchanged.' }));
    }
  } catch { localStorage.removeItem(pendingJobKey); }

  const runCodeBtn = document.getElementById('run-code-btn');
  if (runCodeBtn) {
    runCodeBtn.title = ctx.activeTab === 'custom_input'
      ? `Run with custom input (${runShortcutText})`
      : `Run samples (${runShortcutText})`;
    runCodeBtn.setAttribute('aria-keyshortcuts', runAriaShortcut);
  }

  runCodeBtn?.addEventListener('click', () => {
    const mode = getSelectedRunMode();
    const input = document.getElementById('custom-stdin-input') as HTMLTextAreaElement | null;
    if (input) ctx.customStdin = input.value;
    void execute(mode, mode === 'custom' ? ctx.customStdin : undefined);
  });
  document.getElementById('run-mode-select')?.addEventListener('change', (e) => {
    const mode = (e.target as HTMLSelectElement).value;
    if (mode === 'custom') selectTab('custom_input');
    else selectTab('results');
  });
  document.getElementById('run-samples-btn')?.addEventListener('click', () => void execute('samples'));
  document.getElementById('submit-solution-btn')?.addEventListener('click', () => void execute('submit'));
  document.querySelector('.results-body')?.addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLElement>('[data-test-chip]');
    if (chip) {
      const detail = document.getElementById(chip.getAttribute('aria-controls') || '');
      if (detail) {
        const expand = detail.hidden;
        detail.hidden = !expand;
        chip.setAttribute('aria-expanded', String(expand));
      }
      return;
    }
    if ((event.target as HTMLElement).closest('#retry-execution-btn')) {
      void execute(ctx.resultMode === 'submit' ? 'submit' : ctx.resultMode === 'custom' ? 'custom' : 'samples', ctx.customStdin);
    }
  });
  document.getElementById('run-custom-btn')?.addEventListener('click', () => {
    const input = document.getElementById('custom-stdin-input') as HTMLTextAreaElement | null;
    if (input) ctx.customStdin = input.value;
    void execute('custom', ctx.customStdin);
  });
  document.querySelectorAll<HTMLButtonElement>('.results-tab-button[role="tab"]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const isResults = tab.dataset.tab === 'results' || tab.textContent?.trim() === 'Results';
      const isCustom = tab.dataset.tab === 'custom_input' || tab.textContent?.trim() === 'Custom input';
      if (isResults) {
        selectTab('results');
      } else if (isCustom) {
        selectTab('custom_input');
      }
    });
  });
  const moreBtn = document.getElementById('toolbar-more-btn');
  const moreMenu = document.getElementById('toolbar-more-menu');
  const setMoreOpen = (open: boolean) => {
    if (!moreMenu || !moreBtn) return;
    moreMenu.hidden = !open;
    moreBtn.setAttribute('aria-expanded', String(open));
    if (open) moreMenu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  };
  moreBtn?.addEventListener('click', (event) => { event.stopPropagation(); setMoreOpen(Boolean(moreMenu?.hidden)); });
  moreMenu?.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('[role="menuitem"]')) setMoreOpen(false);
  });
  const shortcutsBtn = document.getElementById('shortcuts-btn');
  const shortcutsPopover = document.getElementById('shortcuts-popover');
  const setShortcutsOpen = (open: boolean) => {
    if (!shortcutsPopover || !shortcutsBtn) return;
    shortcutsPopover.hidden = !open;
    shortcutsBtn.setAttribute('aria-expanded', String(open));
  };
  shortcutsBtn?.addEventListener('click', (event) => { event.stopPropagation(); setShortcutsOpen(Boolean(shortcutsPopover?.hidden)); });
  const popoverController = app.workspaceResizeController;
  document.addEventListener('click', (event) => {
    const t = event.target as HTMLElement;
    if (moreMenu && !moreMenu.hidden && !t.closest('.toolbar-menu')) setMoreOpen(false);
    if (shortcutsPopover && !shortcutsPopover.hidden && !t.closest('.shortcuts-wrap')) setShortcutsOpen(false);
  }, { signal: popoverController?.signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (moreMenu && !moreMenu.hidden) { setMoreOpen(false); moreBtn?.focus(); }
      if (shortcutsPopover && !shortcutsPopover.hidden) { setShortcutsOpen(false); shortcutsBtn?.focus(); }
      return;
    }
    const el = event.target as HTMLElement;
    if (event.key === '?' && !el.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) {
      event.preventDefault();
      setShortcutsOpen(Boolean(shortcutsPopover?.hidden));
    }
  }, { signal: popoverController?.signal });
  document.querySelector('.paired-workspace')?.addEventListener('click', (event) => {
    const stepBtn = (event.target as HTMLElement).closest<HTMLElement>('[data-font-step]');
    if (stepBtn && ctx.editorInstance?.setFontSize && ctx.editorInstance.getFontSize) {
      ctx.editorInstance.setFontSize(ctx.editorInstance.getFontSize() + Number(stepBtn.dataset.fontStep));
      return;
    }
    const reveal = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-hint-reveal]');
    if (!reveal) return;
    const block = reveal.closest<HTMLElement>('.hints-block');
    if (!block) return;
    const total = Number(block.dataset.hintTotal);
    const index = Number(block.dataset.hintRevealed);
    const item = block.querySelector<HTMLElement>(`[data-hint-item="${index}"]`);
    if (!item) return;
    item.hidden = false;
    block.dataset.hintRevealed = String(index + 1);
    if (index + 1 >= total) reveal.remove();
    else reveal.textContent = `Reveal hint ${index + 2} of ${total}`;
    courseClient.revealHint(initial.enrollmentId, initial.stepId, index).catch((err: unknown) => {
      console.warn('Failed to record hint reveal event', err);
    });
  });
  textarea?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      void execute('submit');
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      const mode = getSelectedRunMode();
      const input = document.getElementById('custom-stdin-input') as HTMLTextAreaElement | null;
      if (input) ctx.customStdin = input.value;
      void execute(mode, mode === 'custom' ? ctx.customStdin : undefined);
    }
  });
  document.getElementById('reset-code-btn')?.addEventListener('click', async () => {
    if (!window.confirm('Reset your code to the starter version? Your current editor contents will be replaced.')) return;
    const resetButton = document.getElementById('reset-code-btn') as HTMLButtonElement | null;
    if (resetButton) resetButton.disabled = true;
    try {
      await saveQueue.flush();
      if (saveQueue.lastError) {
        setSaveState(saveQueue.lastError?.code === 'STALE_REVISION' ? 'conflict' : 'unsaved', 'Reset unavailable');
        setDraftNotice('Sync your latest code before resetting. Your local copy is preserved.');
        return;
      }
      const reset = await authClient.fetchApi('/api/drafts/reset', { method: 'POST', body: JSON.stringify({ enrollmentId: initial.enrollmentId, stepId: initial.stepId, expectedRevision: saveQueue.revision }) });
      saveQueue.setServerState(reset.code, reset.revision);
      ctx.code = reset.code;
      DraftManager.saveLocalDraft(userId, initial.enrollmentId, initial.stepId, ctx.code, reset.revision);
      DraftManager.markUnsynced(userId, initial.enrollmentId, initial.stepId, false);
      document.getElementById('python-save-notice')?.remove();
      if (textarea) textarea.value = ctx.code;
      setEditorCode(ctx.code);
      ctx.currentResult = null;
      ctx.resultMode = undefined;
      setResults();
      setSaveState('saved', 'Saved');
    } catch (error: any) {
      const stale = error?.code === 'STALE_REVISION';
      setSaveState(stale ? 'conflict' : 'unsaved', stale ? 'Draft conflict' : 'Reset failed');
      setDraftNotice(stale
        ? 'A newer server draft exists. Your local code is preserved on this device; reload before resetting.'
        : 'Reset could not be saved. Your code remains in the editor.');
    } finally {
      if (resetButton) resetButton.disabled = false;
    }
  });
}
