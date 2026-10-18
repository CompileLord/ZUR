import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';

import type { ModuleSummary } from './AuthorTreeComponent.ts';

export interface TestCaseItem {
  id?: string;
  stdin: string;
  expectedStdout: string;
  isHidden?: boolean;
}

export interface PythonExerciseEditorPageOptions {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  stepId: string;
  stepTitle: string;
  activeSubTab?: 'problem' | 'code' | 'tests' | 'validation';
  problemStatement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: string;
  referenceSolution: string;
  hints: string[];
  solutionExplanation: string;
  publicTests: TestCaseItem[];
  hiddenTests: TestCaseItem[];
  runtimeLimits: {
    cpuTimeoutSeconds: number;
    wallTimeoutSeconds: number;
    memoryLimitMib: number;
  };
  validationStatus?: 'passed' | 'failed' | 'needs_recheck' | 'running' | null;
  validationResults?: Array<{ position: number; passed: boolean; name: string; error?: string }>;
  revision: number;
  isRequired: boolean;
  estimatedDurationMinutes: number;
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'conflict';
  saveMessage?: string;
  errorMessage?: string;
  treeContent?: string;
  modules?: ModuleSummary[];
}

export function renderPythonExerciseEditorPage(opts: PythonExerciseEditorPageOptions): string {
  opts = safeTemplateData(opts);
  const saveStatusText =
    opts.saveStatus === 'saving'
      ? 'Saving...'
      : opts.saveStatus === 'unsaved'
      ? 'Unsaved edits (offline)'
      : opts.saveStatus === 'conflict'
      ? 'Draft conflict'
      : undefined;

  const tabFromQuery = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search).get('tab') : null;
  const activeTab = (opts.activeSubTab || (['problem', 'code', 'tests', 'validation'].includes(tabFromQuery || '') ? tabFromQuery : 'problem')) as 'problem' | 'code' | 'tests' | 'validation';

  const hasText = (v: string | undefined) => Boolean(v && v.trim());
  const stepState: Record<string, 'complete' | 'incomplete' | 'error'> = {
    problem: hasText(opts.problemStatement) ? 'complete' : 'incomplete',
    code: hasText(opts.starterCode) && hasText(opts.referenceSolution) ? 'complete' : 'incomplete',
    tests: opts.publicTests.length > 0 && opts.hiddenTests.length > 0 ? 'complete' : 'incomplete',
    validation: opts.validationStatus === 'passed' ? 'complete' : opts.validationStatus === 'failed' ? 'error' : 'incomplete',
  };
  const stateLabel = (k: string) => (stepState[k] === 'complete' ? 'complete' : stepState[k] === 'error' ? 'needs attention' : 'incomplete');
  const stepBtn = (key: 'problem' | 'code' | 'tests' | 'validation', n: number, label: string) => `
      <button type="button" class="sub-tab-btn ${activeTab === key ? 'active' : ''}" role="tab" aria-selected="${activeTab === key}" data-tab="${key}">
        <span class="step-dot" data-state="${stepState[key]}" aria-hidden="true">${n}</span>
        <span class="step-label">${label}</span>
        <span class="sr-only">(${stateLabel(key)})</span>
      </button>`;

  // Stepper navigation: Problem -> Code -> Tests -> Validation
  const subTabsNav = `
    <nav class="sub-tabs-bar exercise-stepper" role="tablist" aria-label="Exercise Configuration Sections">
      ${stepBtn('problem', 1, 'Problem')}
      <span class="step-connector" aria-hidden="true"></span>
      ${stepBtn('code', 2, 'Code')}
      <span class="step-connector" aria-hidden="true"></span>
      ${stepBtn('tests', 3, `Tests <small class="step-meta" data-test-count>(${opts.publicTests.length} public · ${opts.hiddenTests.length} hidden)</small>`)}
      <span class="step-connector" aria-hidden="true"></span>
      ${stepBtn('validation', 4, 'Validation')}
    </nav>
  `;

  const paneAttrs = (key: string) => `class="sub-tab-pane ${activeTab === key ? 'active' : ''}" id="tab-${key}" role="tabpanel" ${activeTab !== key ? 'style="display:none;"' : ''}`;

  const problemPane = `
    <div ${paneAttrs('problem')}>
      <div class="problem-grid mt-3">
        <div class="problem-main">
          <div class="form-group">
            <label for="problem-stmt-input" class="field-label">Problem statement</label>
            <textarea id="problem-stmt-input" class="textarea-input autosize tall" rows="10" placeholder="Describe the task and objective..." required>${opts.problemStatement}</textarea>
          </div>
          <div class="form-group mt-3">
            <label for="explanation-input" class="field-label">Student post-pass explanation</label>
            <textarea id="explanation-input" class="textarea-input autosize" rows="3" placeholder="Explanation revealed only after successful submission...">${opts.solutionExplanation}</textarea>
          </div>
        </div>

        <div class="problem-side">
          <div class="form-group">
            <label for="input-format-input" class="field-label">Input format</label>
            <textarea id="input-format-input" class="textarea-input autosize" rows="2" placeholder="Describe standard input structure...">${opts.inputFormat}</textarea>
          </div>
          <div class="form-group mt-3">
            <label for="output-format-input" class="field-label">Output format</label>
            <textarea id="output-format-input" class="textarea-input autosize" rows="2" placeholder="Describe expected output format...">${opts.outputFormat}</textarea>
          </div>
          <div class="form-group mt-3">
            <label for="constraints-input" class="field-label">Constraints</label>
            <input id="constraints-input" type="text" class="text-input" value="${opts.constraints}" placeholder="e.g. 1 <= N <= 10^5" />
          </div>
          <div class="form-group mt-3">
            <div class="section-header-row flex justify-between items-center mb-1">
              <label class="field-label m-0">Hints (up to 3)</label>
              <span class="text-xs text-muted">Revealed one at a time</span>
            </div>
            <div class="hints-list flex flex-col gap-2 mt-2">
              ${[0, 1, 2]
                .map(
                  (i) => `
                  <div class="hint-row flex items-center gap-2">
                    <span class="hint-index-badge" aria-hidden="true">${i + 1}</span>
                    <input
                      type="text"
                      class="text-input hint-input flex-1 text-sm"
                      data-hint-index="${i}"
                      value="${opts.hints[i] || ''}"
                      placeholder="Hint ${i + 1} (optional)..."
                      aria-label="Hint ${i + 1}"
                    />
                  </div>
                `
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const codePane = `
    <div ${paneAttrs('code')}>
      <div class="form-group mt-3">
        <div class="section-header-row">
          <label for="starter-code-input" class="field-label">Starter code (Visible to student)</label>
          <span class="text-secondary text-xs">Pre-loaded into student editor</span>
        </div>
        <div class="code-field"><textarea id="starter-code-input" class="textarea-input code-editor font-mono" rows="8" spellcheck="false">${opts.starterCode}</textarea></div>
      </div>

      <div class="form-group mt-4">
        <div class="section-header-row">
          <label for="ref-solution-input" class="field-label">Reference solution</label>
          <span class="status-badge badge-warning">Private — Never sent to students</span>
        </div>
        <div class="code-field"><textarea id="ref-solution-input" class="textarea-input code-editor font-mono" rows="12" spellcheck="false">${opts.referenceSolution}</textarea></div>
        <p class="field-hint">Must pass all public and hidden test cases under configured runtime limits.</p>
      </div>
    </div>
  `;

  const testRow = (t: TestCaseItem, i: number, kind: 'public' | 'hidden') => `
            <div class="test-case-card" data-visibility="${kind}">
              <div class="test-header">
                <strong class="test-title">${kind === 'public' ? 'Public' : 'Hidden'} Test ${i + 1}</strong>
                <button type="button" class="visibility-chip vis-${kind}" data-action="toggle-test-visibility" aria-pressed="${kind === 'hidden'}" title="Switch between public (shown to students) and hidden (grading only)">
                  <span class="chip-public">Public</span><span class="chip-hidden">Hidden</span>
                </button>
                <button type="button" class="btn btn-ghost btn-compact text-danger remove-test" aria-label="Remove ${kind} test ${i + 1}">Remove</button>
              </div>
              <div class="test-io">
                <div>
                  <label class="field-label text-xs">Standard Input (stdin)</label>
                  <textarea class="textarea-input code-editor font-mono test-stdin" rows="3" spellcheck="false">${t.stdin}</textarea>
                </div>
                <div>
                  <label class="field-label text-xs">Expected Output (stdout)</label>
                  <textarea class="textarea-input code-editor font-mono test-stdout" rows="3" spellcheck="false">${t.expectedStdout}</textarea>
                </div>
              </div>
            </div>`;

  const testsPane = `
    <div ${paneAttrs('tests')}>
      <div class="tests-toolbar mt-3">
        <p class="text-secondary text-sm">Tick a test as <strong>Public</strong> to show it to students as an example, or <strong>Hidden</strong> to use it only for grading.</p>
        <button type="button" class="btn btn-secondary btn-compact" data-action="check-reference-solution">Run reference solution</button>
      </div>
      <div class="test-cases-section mt-3" data-kind="public">
        <div class="section-header-row">
          <h2 class="section-title text-base font-semibold">Public test cases (${opts.publicTests.length})</h2>
          <span class="text-secondary text-xs">Shown to students as examples and feedback</span>
        </div>
        ${opts.publicTests.map((t, i) => testRow(t, i, 'public')).join('')}
        <button type="button" class="btn btn-secondary btn-compact mt-2" data-action="add-public-test">+ Add public test</button>
      </div>

      <hr class="section-divider mt-4" />

      <div class="test-cases-section mt-4" data-kind="hidden">
        <div class="section-header-row">
          <h2 class="section-title text-base font-semibold">Hidden test cases (${opts.hiddenTests.length})</h2>
          <span class="status-badge badge-warning">Private grading suite</span>
        </div>
        ${opts.hiddenTests.map((t, i) => testRow(t, i, 'hidden')).join('')}
        <button type="button" class="btn btn-secondary btn-compact mt-2" data-action="add-hidden-test">+ Add hidden test</button>
      </div>
    </div>
  `;

  const validationStatusBadge =
    opts.validationStatus === 'passed'
      ? '<span class="status-badge badge-success">Passed All Tests</span>'
      : opts.validationStatus === 'failed'
      ? '<span class="status-badge badge-danger">Validation Failed</span>'
      : '<span class="status-badge badge-warning">Needs Validation Check</span>';

  const validationPane = `
    <div ${paneAttrs('validation')}>
      <div class="validation-overview-box card p-4 mt-3">
        <div class="section-header-row">
          <div>
            <h2 class="section-title text-base">Reference Solution Validation</h2>
            <p class="text-secondary text-sm">Verify that your private reference solution passes all public and hidden test cases.</p>
          </div>
          <div>${validationStatusBadge}</div>
        </div>

        <div class="action-row mt-3">
          <button type="button" class="btn btn-primary" data-action="check-reference-solution">Check reference solution</button>
        </div>
      </div>

      ${
        opts.validationResults && opts.validationResults.length > 0
          ? `
            <div class="validation-results-table mt-4">
              <h3 class="text-sm font-semibold">Test Results</h3>
              <table class="data-table mt-2">
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Result</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${opts.validationResults
                    .map(
                      (r) => `
                      <tr>
                        <td>${r.name}</td>
                        <td>${r.passed ? '<span class="text-success">PASS</span>' : '<span class="text-danger">FAIL</span>'}</td>
                        <td>${r.error || 'Passed within limits'}</td>
                      </tr>
                    `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          `
          : ''
      }
    </div>
  `;

  const editorContent = `
    <div class="python-editor-container editor-wide">
      <header class="editor-header">
        <div class="title-input-row">
          <label for="step-title-input" class="visually-hidden">Exercise title</label>
          <input
            id="step-title-input"
            type="text"
            class="text-input step-title-input"
            value="${opts.stepTitle}"
            placeholder="Exercise title..."
            required
          />
        </div>
      </header>

      ${opts.errorMessage ? `<div class="alert alert-danger mt-2" role="alert">${opts.errorMessage}</div>` : ''}
      ${opts.saveStatus === 'conflict' ? `<div class="alert alert-danger mt-2" role="alert">Version conflict: this step has been modified remotely. Review changes before saving.</div>` : ''}
      ${opts.saveMessage ? `<div class="alert alert-info mt-2" role="status">${opts.saveMessage}</div>` : ''}

      <div class="mt-4">
        ${subTabsNav}
        ${problemPane}
        ${codePane}
        ${testsPane}
        ${validationPane}
      </div>
    </div>
  `;

  const inspectorContent = `
    <div class="inspector-box p-3">
      <h3 class="inspector-title">Step settings</h3>

      <div class="form-group mt-3">
        <label for="step-duration" class="field-label">Estimated duration</label>
        <div class="input-with-unit">
          <input id="step-duration" type="number" min="1" max="180" class="text-input input-compact" value="${opts.estimatedDurationMinutes}" />
          <span class="unit-text">min</span>
        </div>
      </div>

      <div class="form-group mt-3">
        <label class="switch-label">
          <input id="step-required" type="checkbox" class="switch-input" ${opts.isRequired ? 'checked' : ''} />
          <span class="switch-track" aria-hidden="true"></span>
          <span>Required step</span>
        </label>
      </div>

      <hr class="section-divider mt-4 mb-3" />

      <details class="advanced-settings-disclosure">
        <summary class="text-xs font-semibold text-secondary cursor-pointer py-1">Execution limits</summary>
        <div class="limits-grid grid grid-cols-3 gap-2 mt-2">
          <div class="form-group">
            <label for="cpu-timeout" class="field-label text-xs">CPU</label>
            <div class="input-with-unit flex items-center">
              <input id="cpu-timeout" type="number" min="1" max="10" class="text-input input-compact w-full text-sm" value="${opts.runtimeLimits.cpuTimeoutSeconds}" />
              <span class="unit-text text-xs text-muted ml-1">s</span>
            </div>
          </div>

          <div class="form-group">
            <label for="wall-timeout" class="field-label text-xs">Wall</label>
            <div class="input-with-unit flex items-center">
              <input id="wall-timeout" type="number" min="1" max="20" class="text-input input-compact w-full text-sm" value="${opts.runtimeLimits.wallTimeoutSeconds}" />
              <span class="unit-text text-xs text-muted ml-1">s</span>
            </div>
          </div>

          <div class="form-group">
            <label for="memory-limit" class="field-label text-xs">Memory</label>
            <div class="input-with-unit flex items-center">
              <input id="memory-limit" type="number" min="16" max="512" class="text-input input-compact w-full text-sm" value="${opts.runtimeLimits.memoryLimitMib}" />
              <span class="unit-text text-xs text-muted ml-1">MB</span>
            </div>
          </div>
        </div>
        <p class="field-hint text-xs text-muted mt-1.5">Range: 1–10s CPU, 1–20s Wall, 16–512 MB RAM.</p>
      </details>
    </div>
  `;

  return renderAuthorWorkspaceShell({
    courseId: opts.courseId,
    courseTitle: opts.courseTitle,
    publicationState: opts.publicationState,
    hasUnpublishedChanges: opts.hasUnpublishedChanges,
    saveStatusText,
    activeTab: 'content',
    treeContent: opts.treeContent,
    modules: opts.modules,
    selectedType: 'step',
    selectedId: opts.stepId,
    editorContent,
    inspectorContent,
  });
}

export function initPythonExerciseEditor(root: HTMLElement): void {
  const shell = root.querySelector<HTMLElement>('.shell-author');
  const markDirty = () => shell?.classList.add('is-dirty');
  const tabBtns = () => Array.from(root.querySelectorAll<HTMLElement>('.sub-tab-btn[data-tab]'));
  const dot = (tab: string) => root.querySelector<HTMLElement>(`.sub-tab-btn[data-tab="${tab}"] .step-dot`);
  const val = (id: string) => (root.querySelector<HTMLTextAreaElement | HTMLInputElement>(`#${id}`)?.value || '').trim();
  const sections = () => Array.from(root.querySelectorAll<HTMLElement>('#tab-tests .test-cases-section'));

  const cmEditors: Array<{ destroy: () => void }> = [];
  let cmMounted = false;
  const mountCodeEditors = () => {
    if (cmMounted) return;
    cmMounted = true;
    void import('../learning/codemirror-editor.ts').then(({ createCodeMirrorEditor }) => {
      for (const id of ['starter-code-input', 'ref-solution-input']) {
        const textarea = root.querySelector<HTMLTextAreaElement>(`#${id}`);
        if (!textarea || !textarea.isConnected) continue;
        cmEditors.push(createCodeMirrorEditor({
          textarea,
          indentationSpaces: 4,
          editorFontSize: 14,
          onModEnter: () => {},
          onEscape: () => {},
          onDocChange: () => { markDirty(); updateDots(); },
        }));
      }
    }).catch(() => {
      cmMounted = false;
    });
  };

  const setDot = (tab: string, state: string) => {
    const d = dot(tab);
    if (d) d.dataset.state = state;
  };
  const updateDots = () => {
    setDot('problem', val('problem-stmt-input') ? 'complete' : 'incomplete');
    setDot('code', val('starter-code-input') && val('ref-solution-input') ? 'complete' : 'incomplete');
    const [pub, hid] = sections().map((s) => s.querySelectorAll('.test-case-card').length);
    setDot('tests', pub > 0 && hid > 0 ? 'complete' : 'incomplete');
    const meta = root.querySelector('[data-test-count]');
    if (meta) meta.textContent = `(${pub ?? 0} public · ${hid ?? 0} hidden)`;
  };

  const renumber = () => {
    sections().forEach((section) => {
      const kind = section.dataset.kind === 'hidden' ? 'Hidden' : 'Public';
      const cards = section.querySelectorAll<HTMLElement>('.test-case-card');
      cards.forEach((card, i) => {
        card.dataset.visibility = kind.toLowerCase();
        const chip = card.querySelector<HTMLElement>('.visibility-chip');
        chip?.classList.toggle('vis-hidden', kind === 'Hidden');
        chip?.classList.toggle('vis-public', kind === 'Public');
        chip?.setAttribute('aria-pressed', String(kind === 'Hidden'));
        const title = card.querySelector('.test-title');
        if (title) title.textContent = `${kind} Test ${i + 1}`;
        card.querySelector('.remove-test')?.setAttribute('aria-label', `Remove ${kind.toLowerCase()} test ${i + 1}`);
      });
      const h = section.querySelector('.section-title');
      if (h) h.textContent = `${kind} test cases (${cards.length})`;
    });
    updateDots();
  };

  const showTab = (tab: string) => {
    root.querySelectorAll<HTMLElement>('.sub-tab-pane').forEach((pane) => { pane.style.display = pane.id === `tab-${tab}` ? '' : 'none'; });
    tabBtns().forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    if (tab === 'code') mountCodeEditors();
    if (tab === 'validation') root.querySelector<HTMLElement>('#tab-validation')?.scrollIntoView?.({ block: 'nearest' });
  };
  tabBtns().forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab || 'problem')));
  if (root.querySelector('#tab-code.active')) mountCodeEditors();

  const newRow = (kind: 'public' | 'hidden') => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="test-case-card" data-visibility="${kind}"><div class="test-header"><strong class="test-title"></strong><button type="button" class="visibility-chip vis-${kind}" data-action="toggle-test-visibility" aria-pressed="${kind === 'hidden'}" title="Switch between public (shown to students) and hidden (grading only)"><span class="chip-public">Public</span><span class="chip-hidden">Hidden</span></button><button type="button" class="btn btn-ghost btn-compact text-danger remove-test">Remove</button></div><div class="test-io"><div><label class="field-label text-xs">Standard Input (stdin)</label><textarea class="textarea-input code-editor font-mono test-stdin" rows="3" spellcheck="false"></textarea></div><div><label class="field-label text-xs">Expected Output (stdout)</label><textarea class="textarea-input code-editor font-mono test-stdout" rows="3" spellcheck="false"></textarea></div></div></div>`;
    return wrap.firstElementChild as HTMLElement;
  };
  for (const kind of ['public', 'hidden'] as const) {
    root.querySelector(`[data-action="add-${kind}-test"]`)?.addEventListener('click', (event) => {
      const button = event.currentTarget as HTMLElement;
      const row = newRow(kind);
      button.parentElement?.insertBefore(row, button);
      renumber();
      markDirty();
      row.querySelector<HTMLTextAreaElement>('.test-stdin')?.focus();
    });
  }
  root.querySelector('#tab-tests')?.addEventListener('click', (event) => {
    const target = event.target as Element;
    const remove = target.closest('.remove-test');
    if (remove) { remove.closest('.test-case-card')?.remove(); renumber(); markDirty(); return; }
    const chip = target.closest('[data-action="toggle-test-visibility"]');
    if (chip) {
      const card = chip.closest<HTMLElement>('.test-case-card');
      const [pub, hid] = sections();
      if (!card || !pub || !hid) return;
      const to = card.dataset.visibility === 'hidden' ? pub : hid;
      to.insertBefore(card, to.querySelector('[data-action^="add-"]'));
      renumber();
      markDirty();
    }
  });
  root.addEventListener('input', (event) => {
    if ((event.target as Element).closest('.sub-tab-pane')) updateDots();
  });
}
