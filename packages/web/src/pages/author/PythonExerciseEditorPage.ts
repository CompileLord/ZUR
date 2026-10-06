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

  // Sub-tabs navigation
  const subTabsNav = `
    <nav class="sub-tabs-bar" role="tablist" aria-label="Exercise Configuration Sections">
      <button type="button" class="sub-tab-btn ${activeTab === 'problem' ? 'active' : ''}" role="tab" aria-selected="${activeTab === 'problem'}" data-tab="problem">Problem</button>
      <button type="button" class="sub-tab-btn ${activeTab === 'code' ? 'active' : ''}" role="tab" aria-selected="${activeTab === 'code'}" data-tab="code">Code</button>
      <button type="button" class="sub-tab-btn ${activeTab === 'tests' ? 'active' : ''}" role="tab" aria-selected="${activeTab === 'tests'}" data-tab="tests">Tests (${opts.publicTests.length} public · ${opts.hiddenTests.length} hidden)</button>
      <button type="button" class="sub-tab-btn ${activeTab === 'validation' ? 'active' : ''}" role="tab" aria-selected="${activeTab === 'validation'}" data-tab="validation">
        Validation ${opts.validationStatus === 'passed' ? '✔' : opts.validationStatus === 'failed' ? '✖' : ''}
      </button>
    </nav>
  `;

  // Problem Tab Content
  const problemPane = `
    <div class="sub-tab-pane ${activeTab === 'problem' ? 'active' : ''}" id="tab-problem" role="tabpanel" ${activeTab !== 'problem' ? 'style="display:none;"' : ''}>
      <div class="form-group mt-3">
        <label for="problem-stmt-input" class="field-label">Problem statement</label>
        <textarea id="problem-stmt-input" class="textarea-input" rows="6" placeholder="Describe the task and objective..." required>${opts.problemStatement}</textarea>
      </div>

      <div class="form-row mt-3">
        <div class="form-group col-half">
          <label for="input-format-input" class="field-label">Input format</label>
          <textarea id="input-format-input" class="textarea-input" rows="3" placeholder="Describe standard input structure...">${opts.inputFormat}</textarea>
        </div>
        <div class="form-group col-half">
          <label for="output-format-input" class="field-label">Output format</label>
          <textarea id="output-format-input" class="textarea-input" rows="3" placeholder="Describe expected output format...">${opts.outputFormat}</textarea>
        </div>
      </div>

      <div class="form-group mt-3">
        <label for="constraints-input" class="field-label">Constraints</label>
        <input id="constraints-input" type="text" class="text-input" value="${opts.constraints}" placeholder="e.g. 1 <= N <= 10^5" />
      </div>

      <div class="form-group mt-3">
        <div class="section-header-row flex justify-between items-center mb-1">
          <label class="field-label m-0">Hints (up to 3)</label>
          <span class="text-xs text-muted">Progressive hints for learners</span>
        </div>
        <div class="hints-list flex flex-col gap-2 mt-2">
          ${[0, 1, 2]
            .map(
              (i) => `
              <div class="hint-row flex items-center gap-2">
                <span class="hint-index-badge font-mono text-xs text-muted w-5 text-center flex-shrink-0">${i + 1}</span>
                <input
                  type="text"
                  class="text-input hint-input flex-1 text-sm"
                  data-hint-index="${i}"
                  value="${opts.hints[i] || ''}"
                  placeholder="Hint ${i + 1} (optional)..."
                />
              </div>
            `
            )
            .join('')}
        </div>
      </div>

      <div class="form-group mt-3">
        <label for="explanation-input" class="field-label">Student post-pass explanation</label>
        <textarea id="explanation-input" class="textarea-input" rows="3" placeholder="Explanation revealed only after successful submission...">${opts.solutionExplanation}</textarea>
      </div>
    </div>
  `;

  // Code Tab Content
  const codePane = `
    <div class="sub-tab-pane ${activeTab === 'code' ? 'active' : ''}" id="tab-code" role="tabpanel" ${activeTab !== 'code' ? 'style="display:none;"' : ''}>
      <div class="form-group mt-3">
        <div class="section-header-row">
          <label for="starter-code-input" class="field-label">Starter code (Visible to student)</label>
          <span class="text-secondary text-xs">Pre-loaded into student editor</span>
        </div>
        <textarea id="starter-code-input" class="textarea-input code-editor font-mono" rows="8">${opts.starterCode}</textarea>
      </div>

      <div class="form-group mt-4">
        <div class="section-header-row">
          <label for="ref-solution-input" class="field-label">Reference solution</label>
          <span class="status-badge badge-warning">Private — Never sent to students</span>
        </div>
        <textarea id="ref-solution-input" class="textarea-input code-editor font-mono" rows="12">${opts.referenceSolution}</textarea>
        <p class="field-hint">Must pass all public and hidden test cases under configured runtime limits.</p>
      </div>
    </div>
  `;

  // Tests Tab Content
  const testsPane = `
    <div class="sub-tab-pane ${activeTab === 'tests' ? 'active' : ''}" id="tab-tests" role="tabpanel" ${activeTab !== 'tests' ? 'style="display:none;"' : ''}>
      <div class="test-cases-section mt-3">
        <div class="section-header-row">
          <h2 class="section-title text-base font-semibold">Public test cases (${opts.publicTests.length})</h2>
          <span class="text-secondary text-xs">Shown to students as examples and feedback</span>
        </div>
        ${opts.publicTests
          .map(
            (t, i) => `
            <div class="card p-3 mb-2 test-case-card">
              <div class="test-header"><strong>Public Test ${i + 1}</strong></div>
              <div class="form-row mt-2">
                <div class="col-half">
                  <label class="field-label text-xs">Standard Input (stdin)</label>
                  <textarea class="textarea-input code-editor font-mono test-stdin" rows="3">${t.stdin}</textarea>
                </div>
                <div class="col-half">
                  <label class="field-label text-xs">Expected Output (stdout)</label>
                  <textarea class="textarea-input code-editor font-mono test-stdout" rows="3">${t.expectedStdout}</textarea>
                </div>
              </div>
            </div>
          `
          )
          .join('')}
        <button type="button" class="btn btn-secondary btn-compact mt-2" data-action="add-public-test">+ Add public test</button>
      </div>

      <hr class="section-divider mt-4" />

      <div class="test-cases-section mt-4">
        <div class="section-header-row">
          <h2 class="section-title text-base font-semibold">Hidden test cases (${opts.hiddenTests.length})</h2>
          <span class="status-badge badge-warning">Private grading suite</span>
        </div>
        ${opts.hiddenTests
          .map(
            (t, i) => `
            <div class="card p-3 mb-2 test-case-card">
              <div class="test-header"><strong>Hidden Test ${i + 1}</strong></div>
              <div class="form-row mt-2">
                <div class="col-half">
                  <label class="field-label text-xs">Standard Input (stdin)</label>
                  <textarea class="textarea-input code-editor font-mono test-stdin" rows="3">${t.stdin}</textarea>
                </div>
                <div class="col-half">
                  <label class="field-label text-xs">Expected Output (stdout)</label>
                  <textarea class="textarea-input code-editor font-mono test-stdout" rows="3">${t.expectedStdout}</textarea>
                </div>
              </div>
            </div>
          `
          )
          .join('')}
        <button type="button" class="btn btn-secondary btn-compact mt-2" data-action="add-hidden-test">+ Add hidden test</button>
      </div>
    </div>
  `;

  // Validation Tab Content
  const validationStatusBadge =
    opts.validationStatus === 'passed'
      ? '<span class="status-badge badge-success">Passed All Tests</span>'
      : opts.validationStatus === 'failed'
      ? '<span class="status-badge badge-danger">Validation Failed</span>'
      : '<span class="status-badge badge-warning">Needs Validation Check</span>';

  const validationPane = `
    <div class="sub-tab-pane ${activeTab === 'validation' ? 'active' : ''}" id="tab-validation" role="tabpanel" ${activeTab !== 'validation' ? 'style="display:none;"' : ''}>
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
    <div class="python-editor-container" style="max-width: 900px; margin: 0 auto; padding: 1.5rem 1rem;">
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
        <div class="input-with-unit flex items-center">
          <input id="step-duration" type="number" min="1" max="180" class="text-input input-compact" value="${opts.estimatedDurationMinutes}" />
          <span class="unit-text text-xs text-muted ml-1.5">min</span>
        </div>
      </div>

      <div class="form-group mt-3">
        <label class="checkbox-label flex items-center gap-2 text-sm text-secondary">
          <input id="step-required" type="checkbox" ${opts.isRequired ? 'checked' : ''} />
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
