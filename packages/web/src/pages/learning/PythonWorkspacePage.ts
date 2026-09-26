import { renderLearningWorkspaceShell } from '../../components/shells/LearningWorkspaceShell.ts';
import type { ExecutionResult } from 'zur-shared';

export interface PythonWorkspacePageOptions {
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
  inFlightStatus?: 'queued' | 'running' | null;
  inFlightJobId?: string | null;
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'conflict';
  saveNotice?: string;
  previousStepUrl?: string | null;
  nextStepUrl?: string | null;
  activeTab?: 'results' | 'custom_input' | 'attempts';
  customStdin?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]!));
}

export function renderPythonExecutionResults(opts: Pick<PythonWorkspacePageOptions, 'currentResult' | 'resultMode' | 'inFlightStatus' | 'inFlightJobId' | 'executionError'>): string {
  if (opts.executionError) return `<div class="form-error" role="alert">${escapeHtml(opts.executionError)}</div>`;
  if (opts.inFlightStatus) return `
    <div class="result-card-banner info" role="status" aria-live="polite">
      <span>${opts.inFlightStatus === 'queued' ? 'Queued for checking.' : 'Checking your code…'}</span>
      ${opts.inFlightJobId ? `<span class="text-tertiary font-mono">${escapeHtml(opts.inFlightJobId)}</span>` : ''}
    </div>`;
  if (!opts.currentResult) return `<div class="results-empty-notice"><span>No runs yet. Try running against samples first.</span></div>`;
  const res = opts.currentResult;
  const isPassed = res.verdict === 'PASSED';
  const isInfra = res.isInfrastructureFailure;
  const bannerClass = isPassed ? 'passed' : isInfra ? 'infrastructure' : 'wrong';
  const headline = isPassed && opts.resultMode === 'samples'
    ? 'Samples passed. Submit your solution to complete this step.'
    : isPassed && opts.resultMode === 'submit' ? 'All tests passed.' : `Verdict: ${res.verdict}`;
  return `
    <div class="result-card-banner ${bannerClass}" role="status" aria-live="polite">
      <span>${escapeHtml(headline)}</span>
      ${res.executionTimeMs ? `<span class="text-secondary">${escapeHtml(res.executionTimeMs)} ms</span>` : ''}
    </div>
    ${res.guidance ? `<div class="guidance-notice" style="margin-bottom: var(--space-3); color: var(--text-secondary);">${escapeHtml(res.guidance)}</div>` : ''}
    ${res.testResults.map((tr) => `
      <div class="test-comparison-block">
        <div class="problem-meta-row" style="margin-bottom: var(--space-1);">
          <span class="status-badge ${tr.passed ? 'status-ready' : 'status-failed'}">${tr.passed ? 'Passed' : 'Failed'}</span>
          <span>Test #${escapeHtml(tr.position + 1)}</span>
        </div>
        ${tr.input !== undefined ? `<span class="comparison-label">Input</span><pre class="comparison-value">${escapeHtml(tr.input || '(empty)')}</pre>` : ''}
        ${tr.expectedOutput !== undefined ? `<span class="comparison-label">Expected Output</span><pre class="comparison-value">${escapeHtml(tr.expectedOutput)}</pre>` : ''}
        ${tr.actualOutput !== undefined ? `<span class="comparison-label">Received Output</span><pre class="comparison-value">${escapeHtml(tr.actualOutput)}</pre>` : ''}
        ${tr.stderr ? `<span class="comparison-label">Stderr</span><pre class="comparison-value text-danger">${escapeHtml(tr.stderr)}</pre>` : ''}
      </div>`).join('')}
    ${isInfra ? '<p class="text-secondary">Your code is unchanged. You can try again.</p><button type="button" class="btn btn-secondary btn-compact" id="retry-execution-btn">Retry Execution</button>' : ''}`;
}

export function renderPythonWorkspacePage(opts: PythonWorkspacePageOptions): string {
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

  // Left Panel: Problem Statement
  const leftPanelHtml = `
    <div class="problem-pane" role="region" aria-label="Problem Instructions" data-enrollment-id="${opts.enrollmentId}" data-step-id="${opts.stepId}">
      <div class="problem-header">
        <div class="problem-meta-row">
          <span>${escapeHtml(opts.stepOrdinalText)}</span>
          <span>·</span>
          <span>Python exercise</span>
        </div>
        <h1 class="problem-title">${escapeHtml(opts.stepTitle)}</h1>
      </div>

      <div class="problem-section">
        <h2 class="problem-section-title">Problem Statement</h2>
        <div class="problem-section-body">
          <p>${escapeHtml(opts.problemStatement)}</p>
        </div>
      </div>

      <div class="problem-section">
        <h2 class="problem-section-title">Input & Output Format</h2>
        <div class="problem-section-body">
          <p><strong>Input:</strong> ${escapeHtml(opts.inputFormat)}</p>
          <p><strong>Output:</strong> ${escapeHtml(opts.outputFormat)}</p>
        </div>
      </div>

      <div class="problem-section">
        <h2 class="problem-section-title">Constraints</h2>
        <div class="problem-section-body">
          <code>${escapeHtml(opts.constraints)}</code>
        </div>
      </div>

      ${examples.length > 0 ? `
        <div class="problem-section">
          <h2 class="problem-section-title">Examples</h2>
          ${examples.map((ex, idx) => `
            <div class="test-comparison-block">
              <span class="comparison-label">Example ${idx + 1} Input</span>
              <pre class="comparison-value">${ex.input || '(empty)'}</pre>
              <span class="comparison-label">Example ${idx + 1} Output</span>
              <pre class="comparison-value">${ex.output}</pre>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${hints.length > 0 ? `
        <div class="problem-section">
          <h2 class="problem-section-title">Hints</h2>
          <div class="hints-container">
            ${hints.map((hint, idx) => `
              <div class="hint-accordion">
                <button type="button" class="hint-trigger" aria-expanded="false" data-hint-index="${idx}" data-enrollment-id="${opts.enrollmentId}" data-step-id="${opts.stepId}">
                  <span>Hint ${idx + 1}</span>
                  <span class="hint-chevron">▼</span>
                </button>
                <div class="hint-content" hidden>
                ${escapeHtml(hint)}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${opts.isCompleted && opts.solutionExplanation ? `
        <div class="problem-section">
          <div class="solution-explanation-card">
            <h2 class="problem-section-title">Solution Explanation</h2>
            <div class="problem-section-body">
              <p>${escapeHtml(opts.solutionExplanation)}</p>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="problem-section">
            <a href="/help?report=broken_exercise&stepId=${encodeURIComponent(opts.stepId)}" class="btn-ghost btn-compact text-secondary">
          Report an issue with this exercise
        </a>
      </div>
    </div>
  `;

  // Right Panel: Editor & Results
  const lineCount = (opts.currentCode || '').split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 15) }, (_, i) => i + 1).join('\n');

  const resultsBodyHtml = renderPythonExecutionResults(opts);

  const rightPanelHtml = `
    <div class="editor-pane" role="region" aria-label="Python Code Editor">
      <div class="editor-toolbar">
        <div class="editor-toolbar-left">
          <span class="runtime-badge">Python 3.14</span>
          <div id="python-save-indicator" class="save-indicator ${opts.saveStatus || 'saved'}" aria-live="polite">
            ${saveLabel}
          </div>
        </div>

        <div class="editor-toolbar-right">
          <button type="button" class="btn btn-ghost btn-compact" id="reset-code-btn" title="Revert to starter code">
            Reset code
          </button>
        </div>
      </div>

      <div class="code-editor-area">
        <div class="code-editor-line-numbers" aria-hidden="true">${lineNumbers}</div>
        <textarea
          id="code-editor-input"
          class="code-editor-input"
          spellcheck="false"
          aria-label="Python Source Code"
        >${escapeHtml(opts.currentCode || opts.starterCode || '')}</textarea>
      </div>

      <div class="workspace-results-region" role="region" aria-label="Execution Results">
        <div class="results-tab-bar" role="tablist">
          <button type="button" class="results-tab-button ${activeTab === 'results' ? 'active' : ''}" role="tab" aria-selected="${activeTab === 'results'}">
            Results
          </button>
          <button type="button" class="results-tab-button ${activeTab === 'custom_input' ? 'active' : ''}" role="tab" aria-selected="${activeTab === 'custom_input'}">
            Custom input
          </button>
          <a href="/learn/${encodeURIComponent(opts.enrollmentId)}/steps/${encodeURIComponent(opts.stepId)}/attempts" class="results-tab-button" role="tab" aria-selected="false">
            Attempts
          </a>
        </div>

        <div class="results-body">
          ${activeTab === 'custom_input' ? `
            <div class="custom-input-box">
              <label for="custom-stdin-input" class="comparison-label">Custom Standard Input</label>
              <textarea id="custom-stdin-input" class="code-editor-input" style="height: 100px; border: 1px solid var(--border-control); border-radius: var(--radius-sm);" placeholder="Enter custom stdin...">${opts.customStdin || ''}</textarea>
            </div>
          ` : resultsBodyHtml}
        </div>
      </div>
    </div>
  `;

  // Task footer action buttons
  const taskActionsHtml = `
    <button type="button" class="btn btn-secondary btn-compact" id="run-samples-btn" title="Run against public sample tests (Ctrl+Enter)">
      Run samples
    </button>
    <button type="button" class="btn btn-secondary btn-compact" id="run-custom-btn" title="Run with custom standard input">
      Run custom
    </button>
    <button type="button" class="btn btn-primary btn-compact" id="submit-solution-btn" title="Submit solution for grading">
      Submit solution
    </button>
    ${opts.isCompleted && opts.nextStepUrl ? `<a href="${escapeHtml(opts.nextStepUrl)}" class="btn btn-primary btn-compact">Continue</a>` : ''}
  `;

  const saveNoticeHtml = opts.saveNotice
    ? `<p id="python-save-notice" class="alert alert-warning" role="status">${escapeHtml(opts.saveNotice)}</p>`
    : '';

  return renderLearningWorkspaceShell({
    courseTitle: opts.courseTitle,
    courseOverviewUrl: opts.courseOverviewUrl,
    lessonTitle: opts.lessonTitle,
    stepTitle: opts.stepTitle,
    stepOrdinalText: opts.stepOrdinalText,
    isPythonWorkspace: true,
    saveStatusText: saveLabel,
    outlineContent: '<nav class="outline-nav"><ul><li>' + opts.stepTitle + '</li></ul></nav>',
    workspaceContent: saveNoticeHtml + leftPanelHtml + rightPanelHtml,
    previousStepUrl: opts.previousStepUrl,
    nextStepUrl: opts.nextStepUrl,
    taskActions: taskActionsHtml,
  });
}
