import {
  renderLearningWorkspaceShell,
  type CourseModuleItem,
  type TaskSquareItem,
} from '../../components/shells/LearningWorkspaceShell.ts';
import type { ExecutionResult } from 'zur-shared';
import { renderIcon } from '../../components/common/icons.ts';
import { escapeHtml, renderPythonExecutionResults } from './PythonExecutionResults.ts';


export interface PythonWorkspacePageOptions {
  outlineContent?: string;
  courseTitle: string;
  courseOverviewUrl: string;
  lessonTitle: string;
  stepTitle: string;
  stepOrdinalText: string;
  enrollmentId: string;
  stepId: string;
  problemStatement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: string;
  currentCode: string;
  hints?: string[];
  solutionExplanation?: string;
  isCompleted?: boolean;
  examples?: Array<{ input: string; output: string }>;
  currentResult?: ExecutionResult | null;
  resultMode?: 'samples' | 'custom' | 'submit';
  executionError?: string | null;
  inFlightStatus?: 'queued' | 'running' | 'reconnecting' | null;
  inFlightJobId?: string | null;
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'conflict';
  saveNotice?: string;
  previousStepUrl?: string | null;
  nextStepUrl?: string | null;
  isLastStep?: boolean;
  activeTab?: 'results' | 'custom_input' | 'attempts';
  customStdin?: string;
  editorFontSize?: number;
  indentationSpaces?: number;
  courseId?: string;
  courseVersionId?: string;
  courseProgressText?: string;
  courseProgressPercentage?: number;
  modules?: CourseModuleItem[];
  taskSquares?: TaskSquareItem[];
}

export { renderPythonExecutionResults } from './PythonExecutionResults.ts';
export { sanitizeInternalPaths, formatLearnerError } from './PythonLearnerError.ts';
export type { FormattedLearnerError } from './PythonLearnerError.ts';

export function renderPythonWorkspaceContent(opts: PythonWorkspacePageOptions): {
  workspaceContent: string;
  taskActions: string;
  saveLabel: string;
} {
  const saveLabel =
    opts.saveStatus === 'saving'
      ? 'Saving...'
      : opts.saveStatus === 'unsaved'
      ? 'Unsaved edits (offline)'
      : opts.saveStatus === 'conflict'
      ? 'Draft conflict'
      : 'Saved';

  const hints = opts.hints || [];
  const examples = opts.examples || [];
  const activeTab = opts.activeTab || 'results';
  const constraintChips = String(opts.constraints || '').split(/\n|;/).map((c) => c.trim()).filter(Boolean);
  const saveNoticeHtml = opts.saveNotice
    ? `<p id="python-save-notice" class="alert alert-warning" role="status">${escapeHtml(opts.saveNotice)}</p>`
    : '';

  // Left Panel: Problem Statement
  const leftPanelHtml = `
    <div class="problem-pane" role="region" aria-label="Problem Instructions" data-enrollment-id="${escapeHtml(opts.enrollmentId)}" data-step-id="${escapeHtml(opts.stepId)}">
      <div class="problem-header">
        <div class="problem-meta-row">
          <span>${escapeHtml(opts.stepOrdinalText)}</span>
          <span>·</span>
          <span>Python exercise</span>
        </div>
        <h1 class="problem-title">${escapeHtml(opts.stepTitle)}</h1>
      </div>

      <div class="problem-section">
        <div class="problem-section-body">
          <p>${escapeHtml(opts.problemStatement)}</p>
        </div>
      </div>

      <div class="problem-section">
        <h2 class="problem-subheading">Input &amp; output</h2>
        <div class="io-grid">
          <div class="io-box"><span class="io-label">Input</span><p>${escapeHtml(opts.inputFormat)}</p></div>
          <div class="io-box"><span class="io-label">Output</span><p>${escapeHtml(opts.outputFormat)}</p></div>
        </div>
      </div>

      ${constraintChips.length > 0 ? `
      <div class="problem-section">
        <h2 class="problem-subheading">Constraints</h2>
        <ul class="constraint-chips" role="list">
          ${constraintChips.map((c) => `<li><code class="constraint-chip">${escapeHtml(c)}</code></li>`).join('')}
        </ul>
      </div>` : ''}

      ${examples.length > 0 ? `
        <div class="problem-section">
          <h2 class="problem-subheading">Examples</h2>
          ${examples.map((ex, idx) => `
            <div class="io-grid example-grid">
              <div class="io-box"><span class="io-label">Example ${idx + 1} input</span><pre class="io-pre">${escapeHtml(ex.input || '(empty)')}</pre></div>
              <div class="io-box"><span class="io-label">Example ${idx + 1} output</span><pre class="io-pre">${escapeHtml(ex.output)}</pre></div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${hints.length > 0 ? `
        <div class="problem-section hints-block" data-hint-total="${hints.length}" data-hint-revealed="0" data-enrollment-id="${escapeHtml(opts.enrollmentId)}" data-step-id="${escapeHtml(opts.stepId)}">
          <h2 class="problem-subheading">Hints</h2>
          <ol class="hint-list" aria-live="polite">
            ${hints.map((hint, idx) => `<li class="hint-item" data-hint-item="${idx}" hidden><span class="hint-item-label">Hint ${idx + 1}</span><p>${escapeHtml(hint)}</p></li>`).join('')}
          </ol>
          <button type="button" class="btn btn-secondary btn-compact hint-reveal-btn" data-hint-reveal>Reveal hint 1 of ${hints.length}</button>
        </div>
      ` : ''}

      ${opts.isCompleted && opts.solutionExplanation ? `
        <div class="problem-section">
          <div class="solution-explanation-card">
            <details class="solution-explanation-details" open>
              <summary class="problem-subheading cursor-pointer select-none" aria-label="Solution Explanation">Solution explanation</summary>
              <div class="problem-section-body mt-2">
                <p>${escapeHtml(opts.solutionExplanation)}</p>
              </div>
            </details>
          </div>
        </div>
      ` : ''}

      <div class="problem-section problem-footer">
        <a href="/help?report=broken_exercise&courseId=${encodeURIComponent(opts.courseId || '')}&courseVersionId=${encodeURIComponent(opts.courseVersionId || '')}&stepId=${encodeURIComponent(opts.stepId)}" class="report-issue-link report-issue-quiet">
          Report an issue with this exercise
        </a>
      </div>
    </div>
  `;

  // Right Panel: Editor & Results
  const resultsBodyHtml = renderPythonExecutionResults(opts);
  const hasResult = Boolean(opts.currentResult || opts.executionError || opts.inFlightStatus);

  const rightPanelHtml = `
    <div class="editor-pane" role="region" aria-label="Python Code Editor" data-drawer="${hasResult || activeTab === 'custom_input' ? 'open' : 'closed'}">
      ${saveNoticeHtml}
      <div class="code-editor-area">
        <textarea
          id="code-editor-input"
          class="code-editor-input"
          spellcheck="false"
          aria-label="Python Source Code"
        >${escapeHtml(opts.currentCode || opts.starterCode || '')}</textarea>
      </div>

      <div class="editor-footer" role="toolbar" aria-label="Editor status and settings">
        <span id="editor-cursor-pos" class="editor-footer-item tabular-nums">Ln 1, Col 1</span>
        <span id="python-save-indicator" class="save-indicator ${opts.saveStatus || 'saved'}" aria-live="polite">${saveLabel}</span>
        <span class="editor-footer-spacer"></span>
        <span class="font-size-control" role="group" aria-label="Editor font size">
          <button type="button" class="editor-footer-btn" data-font-step="-1" aria-label="Decrease font size" title="Decrease font size (Ctrl+-)">A−</button>
          <span id="editor-font-size-label" class="tabular-nums">${opts.editorFontSize || 14}px</span>
          <button type="button" class="editor-footer-btn" data-font-step="1" aria-label="Increase font size" title="Increase font size (Ctrl++)">A+</button>
        </span>
        <div class="shortcuts-wrap">
          <button type="button" id="shortcuts-btn" class="editor-footer-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="shortcuts-popover" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
          <div id="shortcuts-popover" class="shortcuts-popover" role="dialog" aria-label="Keyboard shortcuts" hidden>
            <h3>Keyboard shortcuts</h3>
            <dl>
              <dt><kbd>Ctrl</kbd> <kbd>Enter</kbd></dt><dd>Run code</dd>
              <dt><kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Enter</kbd></dt><dd>Submit solution</dd>
              <dt><kbd>Ctrl</kbd> <kbd>B</kbd></dt><dd>Open or close outline</dd>
              <dt><kbd>Ctrl</kbd> <kbd>+</kbd> / <kbd>-</kbd></dt><dd>Editor font size</dd>
              <dt><kbd>Esc</kbd></dt><dd>Leave the editor</dd>
              <dt><kbd>?</kbd></dt><dd>Show this list</dd>
            </dl>
          </div>
        </div>
      </div>

      <div id="results-splitter" class="results-splitter" role="separator" tabindex="0"
        aria-label="Resize code and results" aria-orientation="horizontal" aria-valuemin="120" aria-valuemax="500" aria-valuenow="240">
        <div class="splitter-hover-handle" aria-hidden="true"></div>
      </div>

      <div class="workspace-results-region" role="region" aria-label="Execution Results">
        <div class="results-tab-bar" role="tablist">
          <button type="button" id="tab-btn-results" data-tab="results" class="results-tab-button ${activeTab === 'results' ? 'active' : ''}" role="tab" aria-selected="${activeTab === 'results'}">
            Output &amp; tests
          </button>
          <button type="button" id="tab-btn-custom-input" data-tab="custom_input" class="results-tab-button ${activeTab === 'custom_input' ? 'active' : ''}" role="tab" aria-selected="${activeTab === 'custom_input'}">
            Custom input
          </button>
          <span id="drawer-summary" class="drawer-summary" aria-hidden="true"></span>
          <button type="button" id="drawer-toggle-btn" class="editor-footer-btn drawer-toggle" aria-label="Toggle output panel" aria-expanded="${hasResult || activeTab === 'custom_input'}" aria-controls="results-body">${renderIcon('chevron-down', { size: 14 })}</button>
        </div>

        <div class="results-body" id="results-body">
          ${activeTab === 'custom_input' ? `
            <div class="custom-input-box">
              <label for="custom-stdin-input" class="comparison-label">Input</label>
              <textarea id="custom-stdin-input" class="code-editor-input custom-stdin" placeholder="Input for your program (optional)">${escapeHtml(opts.customStdin || '')}</textarea>
            </div>
          ` : resultsBodyHtml}
        </div>
      </div>
    </div>
  `;

  const attemptsUrl = `/learn/${encodeURIComponent(opts.enrollmentId)}/steps/${encodeURIComponent(opts.stepId)}/attempts`;
  const showContinue = Boolean(opts.isCompleted && opts.nextStepUrl);
  const taskActionsHtml = `
          <div class="editor-toolbar-actions">
            <button type="button" class="btn btn-secondary btn-compact" id="run-code-btn" title="Run code (Ctrl+Enter)" aria-label="Run code" aria-keyshortcuts="Control+Enter">
              <span>Run</span><kbd class="kbd-hint" aria-hidden="true">Ctrl ↵</kbd>
            </button>

            <button type="button" id="run-custom-btn" class="sr-only" aria-hidden="true" tabindex="-1">Run code</button>

            <button type="button" class="btn ${opts.isCompleted ? 'btn-secondary' : 'btn-primary'} btn-compact" id="submit-solution-btn" title="Submit solution for grading (Ctrl+Shift+Enter)" aria-label="Submit solution" aria-keyshortcuts="Control+Shift+Enter">
              Submit
            </button>
            ${showContinue ? `<a href="${escapeHtml(opts.nextStepUrl!)}" class="btn btn-primary btn-compact" id="continue-next-btn" data-python-continue="true">${opts.isLastStep ? 'Back to course →' : 'Next step →'}</a>` : ''}

            <div class="toolbar-menu">
              <button type="button" class="btn btn-ghost btn-compact" id="toolbar-more-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="toolbar-more-menu" aria-label="More actions" title="More actions">⋯</button>
              <div id="toolbar-more-menu" class="toolbar-menu-list" role="menu" aria-label="More actions" hidden>
                <button type="button" role="menuitem" id="run-samples-btn">Test samples</button>
                <button type="button" role="menuitem" id="reset-code-btn">Reset code</button>
                <a role="menuitem" href="${attemptsUrl}" id="attempts-link">Attempts</a>
              </div>
            </div>
          </div>
  `;

    return {
      workspaceContent: leftPanelHtml +
        '<div id="workspace-splitter" class="workspace-splitter" role="separator" tabindex="0" aria-label="Resize problem and code panes" aria-orientation="vertical" aria-valuemin="340" aria-valuemax="800" aria-valuenow="400"><div class="splitter-hover-handle" aria-hidden="true"></div></div>' + rightPanelHtml,
      taskActions: taskActionsHtml,
      saveLabel,
    };
  }

  export function renderPythonWorkspacePage(opts: PythonWorkspacePageOptions): string {
    const { workspaceContent, taskActions, saveLabel } = renderPythonWorkspaceContent(opts);

    return renderLearningWorkspaceShell({
      courseTitle: opts.courseTitle,
      courseOverviewUrl: opts.courseOverviewUrl,
      lessonTitle: opts.lessonTitle,
      stepTitle: opts.stepTitle,
      stepOrdinalText: opts.stepOrdinalText,
      courseProgressText: opts.courseProgressText,
      courseProgressPercentage: opts.courseProgressPercentage,
      modules: opts.modules,
      taskSquares: opts.taskSquares,
      isPythonWorkspace: true,
      outlineDrawer: true,
      saveStatusText: saveLabel,
      outlineContent: opts.outlineContent || '<nav class="outline-nav"><ul><li>' + escapeHtml(opts.stepTitle) + '</li></ul></nav>',
      workspaceContent,
      previousStepUrl: opts.previousStepUrl,
      nextStepUrl: null, // Avoid competing Next button; Continue is rendered in toolbar/banner
      taskActions,
      reportContext: {
        courseId: opts.courseId,
        courseVersionId: opts.courseVersionId,
        enrollmentId: opts.enrollmentId,
        stepId: opts.stepId,
        courseTitle: opts.courseTitle,
        lessonTitle: opts.lessonTitle,
        stepTitle: opts.stepTitle,
      },
    });
  }
