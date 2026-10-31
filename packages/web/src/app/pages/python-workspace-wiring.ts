import { type PythonWorkspacePageOptions, renderPythonExecutionResults } from '../../pages/learning/PythonWorkspacePage.ts';
import { DraftManager } from '../../services/draft-manager.ts';
import { DraftSaveQueue } from '../../services/draft-save-queue.ts';
import { type PythonWorkspaceContext } from './python-workspace-context.ts';
import { attachWorkspaceControls } from './python-workspace-controls.ts';
import { attachWorkspaceSplitters, attachExecution } from './python-workspace-execution.ts';
import { authClient, app } from '../state.ts';

export async function savePythonDraft(code: string, baseRevision: number, enrollmentId: string, stepId: string): Promise<any> {
  const saved = await authClient.fetchApi('/api/drafts', {
    method: 'PUT',
    body: JSON.stringify({ enrollmentId, stepId, code, baseRevision }),
  });
  return saved;
}

export function attachPythonWorkspaceListeners(
  initial: PythonWorkspacePageOptions,
  startingRevision: number,
  userId: string,
  isRevisionConflict: boolean,
  requestedPath: string,
): void {
  const ctx = {
    initial,
    userId,
    requestedPath,
    code: initial.currentCode || '',
    currentResult: initial.currentResult || null,
    resultMode: initial.resultMode,
    activeTab: initial.activeTab || 'results',
    customStdin: initial.customStdin || '',
    isRevisionConflict,
    editorInstance: null,
  } as PythonWorkspaceContext;
  const isMac = typeof navigator !== 'undefined' && (/Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac/.test(navigator.userAgent));
  const runShortcutText = isMac ? '⌘+Enter' : 'Ctrl+Enter';
  const runAriaShortcut = isMac ? 'Meta+Enter' : 'Control+Enter';
  const getSelectedRunMode = (): 'samples' | 'custom' => (ctx.activeTab === 'custom_input' ? 'custom' : 'samples');
  const pendingJobKey = `zur_job_${userId}_${initial.enrollmentId}_${initial.stepId}`;
  const saveQueue = new DraftSaveQueue({
    revision: startingRevision,
    save: (snapshot, baseRevision) => savePythonDraft(snapshot, baseRevision, initial.enrollmentId, initial.stepId),
    onAcknowledged: (saved, _submittedCode, latestCode) => {
      if (window.location.pathname + window.location.search !== requestedPath) return;
      const hasUnsavedTail = latestCode !== saved.code;
      DraftManager.saveLocalDraft(userId, initial.enrollmentId, initial.stepId, latestCode, saved.revision);
      DraftManager.markUnsynced(userId, initial.enrollmentId, initial.stepId, hasUnsavedTail);
      setSaveState(hasUnsavedTail ? 'saving' : 'saved', hasUnsavedTail ? 'Saving…' : 'Saved');
      if (!hasUnsavedTail) document.getElementById('python-save-notice')?.remove();
    },
    onFailure: (error, latestCode) => {
      if (window.location.pathname + window.location.search !== requestedPath) return;
      const storedLocally = DraftManager.saveLocalDraft(userId, initial.enrollmentId, initial.stepId, latestCode, saveQueue.revision);
      DraftManager.markUnsynced(userId, initial.enrollmentId, initial.stepId, true);
      const isConflict = error?.code === 'STALE_REVISION';
      setSaveState(isConflict ? 'conflict' : 'unsaved', isConflict ? 'Draft conflict' : 'Unsaved edits (offline)');
      setDraftNotice(isConflict
        ? storedLocally ? 'A newer server draft exists. Your local code is preserved on this device.' : 'A newer server draft exists. Keep this page open and copy your code before leaving.'
        : storedLocally ? 'Changes are stored on this device. Reconnect to sync.' : 'Local storage is unavailable. Keep this page open and copy your code before leaving.', isConflict);
    },
  });

  const setSaveState = (status: NonNullable<PythonWorkspacePageOptions['saveStatus']>, text: string) => {
    document.querySelectorAll<HTMLElement>('.learning-header .save-indicator, #python-save-indicator').forEach((indicator) => {
      indicator.className = `save-indicator ${status}`;
      indicator.textContent = text;
    });
  };
  const setDraftNotice = (text: string, canResolveConflict = false) => {
    const main = document.querySelector('.learning-workspace-main');
    const region = main?.querySelector('.workspace-viewport');
    if (!main || !region) return;
    let notice = document.getElementById('python-save-notice');
    if (!notice) {
      notice = document.createElement('p');
      notice.id = 'python-save-notice';
      notice.className = 'alert alert-warning';
      notice.setAttribute('role', 'status');
      const editor = region.querySelector('.editor-pane');
      if (editor) editor.prepend(notice);
      else main.insertBefore(notice, region);
    }
    notice.textContent = text;
    notice.querySelector('.draft-conflict-actions')?.remove();
    if (canResolveConflict) {
      const actions = document.createElement('span');
      actions.className = 'draft-conflict-actions';
      for (const [id, label] of [['keep-local-draft-btn', 'Keep my local code'], ['use-server-draft-btn', 'Use saved server code']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.className = 'btn btn-secondary btn-compact';
        button.textContent = label;
        actions.append(button);
      }
      notice.append(actions);
      actions.querySelector('#keep-local-draft-btn')?.addEventListener('click', () => { void resolveDraftConflict('local'); });
      actions.querySelector('#use-server-draft-btn')?.addEventListener('click', () => { void resolveDraftConflict('server'); });
    }
  };
  const setResults = (overrides: Partial<PythonWorkspacePageOptions> = {}) => {
    if (window.location.pathname + window.location.search !== requestedPath || !textarea?.isConnected) return;
    const body = document.querySelector('.results-body');
    if (!body) return;
    body.innerHTML = renderPythonExecutionResults({
      currentResult: ctx.currentResult,
      resultMode: ctx.resultMode,
      executionError: null,
      ...overrides,
    });
    body.setAttribute('aria-live', 'polite');
    const summary = document.getElementById('drawer-summary');
    if (summary) {
      const tests = ctx.currentResult?.testResults || [];
      summary.textContent = ctx.currentResult && ctx.resultMode !== 'custom' && tests.length
        ? `${tests.filter((t) => t.passed).length}/${tests.length} passed`
        : ctx.currentResult ? ctx.currentResult.verdict.toLowerCase().replace(/_/g, ' ') : '';
    }
  };
  const selectTab = (tabName: 'results' | 'custom_input') => {
    const existingInput = document.getElementById('custom-stdin-input') as HTMLTextAreaElement | null;
    if (existingInput) ctx.customStdin = existingInput.value;
    ctx.activeTab = tabName;
    const modeSelect = document.getElementById('run-mode-select') as HTMLSelectElement | null;
    if (modeSelect) modeSelect.value = tabName === 'custom_input' ? 'custom' : 'samples';
    const runBtn = document.getElementById('run-code-btn');
    if (runBtn) {
      runBtn.title = tabName === 'custom_input'
        ? `Run with custom input (${runShortcutText})`
        : `Run samples (${runShortcutText})`;
    }
    document.querySelectorAll<HTMLButtonElement>('.results-tab-button[role="tab"]').forEach((tab) => {
      const selected = tab.dataset.tab === tabName;
      tab.classList.toggle('active', Boolean(selected));
      tab.setAttribute('aria-selected', String(Boolean(selected)));
    });
    const body = document.querySelector('.results-body');
    if (!body) return;
    if (tabName === 'custom_input') {
      body.innerHTML = '<div class="custom-input-box"><label for="custom-stdin-input" class="comparison-label">Input</label><textarea id="custom-stdin-input" placeholder="Input for your program (optional)" class="code-editor-input custom-stdin"></textarea></div>';
      const input = document.getElementById('custom-stdin-input') as HTMLTextAreaElement | null;
      if (input) { input.value = ctx.customStdin; input.focus(); }
    } else {
      setResults();
    }
  };

  const textarea = document.getElementById('code-editor-input') as HTMLTextAreaElement | null;
  if (textarea) {
    void import('../../pages/learning/codemirror-editor.ts').then(({ createCodeMirrorEditor }) => {
      if (!textarea.isConnected) return;
      textarea.classList.add('cm-source-backup');
      document.querySelector('.code-editor-line-numbers')?.remove();
      ctx.editorInstance = createCodeMirrorEditor({
        textarea,
        indentationSpaces: initial.indentationSpaces || 4,
        editorFontSize: initial.editorFontSize || 14,
        onModEnter: () => {
          const mode = getSelectedRunMode();
          const input = document.getElementById('custom-stdin-input') as HTMLTextAreaElement | null;
          void ctx.execute(mode, mode === 'custom' ? (input?.value ?? ctx.customStdin) : undefined);
        },
        onEscape: () => {
          document.getElementById('run-code-btn')?.focus();
        },
        onModShiftEnter: () => { void ctx.execute('submit'); },
        onCursorChange: (line, col) => {
          const pos = document.getElementById('editor-cursor-pos');
          if (pos) pos.textContent = `Ln ${line}, Col ${col}`;
        },
        onFontSizeChange: (size) => {
          const label = document.getElementById('editor-font-size-label');
          if (label) label.textContent = `${size}px`;
        },
        onDocChange: (_val) => {
          // input event is already dispatched to textarea
        },
      });
      (window as any).__zur_active_cm_editor = ctx.editorInstance;
      const fontLabel = document.getElementById('editor-font-size-label');
      if (fontLabel && ctx.editorInstance?.getFontSize) fontLabel.textContent = `${ctx.editorInstance.getFontSize()}px`;
    }).catch((err) => {
      textarea.classList.remove('cm-source-backup');
      console.warn('CodeMirror dynamic load failed, using fallback textarea', err);
    });
  }
  const setEditorCode = (newCode: string) => {
    if (ctx.editorInstance) {
      ctx.editorInstance.setCode(newCode);
    }
  };
  const resolveDraftConflict = async (choice: 'local' | 'server') => {
    if (!textarea) return;
    const localCode = textarea.value;
    const actionButtons = document.querySelectorAll<HTMLButtonElement>('.draft-conflict-actions button');
    actionButtons.forEach((button) => { button.disabled = true; });
    try {
      const serverDraft = await authClient.fetchApi(`/api/drafts?enrollmentId=${encodeURIComponent(initial.enrollmentId)}&stepId=${encodeURIComponent(initial.stepId)}`);
      if (choice === 'server') {
        ctx.code = serverDraft.code;
        textarea.value = serverDraft.code;
        setEditorCode(serverDraft.code);
        saveQueue.setServerState(serverDraft.code, serverDraft.revision);
        DraftManager.saveLocalDraft(userId, initial.enrollmentId, initial.stepId, serverDraft.code, serverDraft.revision);
        DraftManager.markUnsynced(userId, initial.enrollmentId, initial.stepId, false);
        ctx.isRevisionConflict = false;
        setSaveState('saved', 'Saved');
        document.getElementById('python-save-notice')?.remove();
        return;
      }
      ctx.code = localCode;
      ctx.isRevisionConflict = false;
      saveQueue.setServerState(serverDraft.code, serverDraft.revision);
      DraftManager.saveLocalDraft(userId, initial.enrollmentId, initial.stepId, localCode, serverDraft.revision);
      saveQueue.update(localCode);
      setSaveState('saving', 'Saving…');
      await saveQueue.flush();
      if (saveQueue.lastError) throw saveQueue.lastError;
    } catch {
      actionButtons.forEach((button) => { button.disabled = false; });
      setSaveState('conflict', 'Draft conflict');
      setDraftNotice('Your local code is preserved. The conflict could not be resolved; retry either choice.', true);
    }
  };
  if (ctx.isRevisionConflict) setDraftNotice(initial.saveNotice || 'A newer server draft exists. Choose which copy to keep.', true);
  if (ctx.isRevisionConflict || initial.saveStatus === 'unsaved') {
    DraftManager.markUnsynced(userId, initial.enrollmentId, initial.stepId, true);
  }
  if (textarea) {
    app.workspaceResizeController?.abort();
    app.workspaceResizeController = new AbortController();
    app.workspaceResizeController.signal.addEventListener('abort', () => ctx.editorInstance?.destroy(), { once: true });
    textarea.readOnly = false;
  }
  ctx.textarea = textarea;
  ctx.saveQueue = saveQueue;
  ctx.pendingJobKey = pendingJobKey;
  ctx.runShortcutText = runShortcutText;
  ctx.runAriaShortcut = runAriaShortcut;
  ctx.getSelectedRunMode = getSelectedRunMode;
  ctx.setSaveState = setSaveState;
  ctx.setDraftNotice = setDraftNotice;
  ctx.setResults = setResults;
  ctx.selectTab = selectTab;
  ctx.setEditorCode = setEditorCode;
  attachWorkspaceSplitters(ctx);
  attachExecution(ctx);
  attachWorkspaceControls(ctx);
}
