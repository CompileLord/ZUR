import { type PythonWorkspaceContext } from './python-workspace-context.ts';

const CUSTOM_INPUT_HTML = '<div class="custom-input-box"><label for="custom-stdin-input" class="comparison-label">Input</label><textarea id="custom-stdin-input" placeholder="Input for your program (optional)" class="code-editor-input custom-stdin"></textarea></div>';

type TabContext = Pick<PythonWorkspaceContext, 'activeTab' | 'customStdin' | 'runShortcutText' | 'setDrawerOpen' | 'setResults'>;

export function selectWorkspaceTab(ctx: TabContext, tabName: 'results' | 'custom_input', doc: Document = document): void {
  const existingInput = doc.getElementById('custom-stdin-input') as HTMLTextAreaElement | null;
  if (existingInput) ctx.customStdin = existingInput.value;
  ctx.activeTab = tabName;
  const modeSelect = doc.getElementById('run-mode-select') as HTMLSelectElement | null;
  if (modeSelect) modeSelect.value = tabName === 'custom_input' ? 'custom' : 'samples';
  const runBtn = doc.getElementById('run-code-btn');
  if (runBtn) {
    runBtn.title = tabName === 'custom_input'
      ? `Run with custom input (${ctx.runShortcutText})`
      : `Run samples (${ctx.runShortcutText})`;
  }
  doc.querySelectorAll<HTMLButtonElement>('.results-tab-button[role="tab"]').forEach((tab) => {
    const selected = tab.dataset.tab === tabName;
    tab.classList.toggle('active', Boolean(selected));
    tab.setAttribute('aria-selected', String(Boolean(selected)));
  });
  ctx.setDrawerOpen(true);
  const body = doc.querySelector('.results-body');
  if (!body) return;
  if (tabName === 'custom_input') {
    body.innerHTML = CUSTOM_INPUT_HTML;
    const input = doc.getElementById('custom-stdin-input') as HTMLTextAreaElement | null;
    if (input) { input.value = ctx.customStdin; input.focus(); }
  } else {
    ctx.setResults();
  }
}
