import { renderLearningWorkspaceShell } from '../../components/shells/LearningWorkspaceShell.ts';
import type { ExecutionResult } from 'zur-shared';
import { PYTHON_RUNTIME_LABEL } from 'zur-shared';
import { renderIcon } from '../../components/common/icons.ts';

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
  activeTab?: 'results' | 'custom_input' | 'attempts';
  isCompact?: boolean;
  customStdin?: string;
  editorFontSize?: number;
  indentationSpaces?: number;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]!));
}

export interface FormattedLearnerError {
  isTraceback: boolean;
  exceptionType?: string;
  exceptionMessage?: string;
  sourceLineNumber?: number;
  sourceCodeSnippet?: string;
  cleanSummary: string;
  rawStderr: string;
}

export function sanitizeInternalPaths(text: string): string {
  if (!text) return '';
  return text
    .replace(/(?:["']?\/[a-zA-Z0-9_.-]+)*\/(main|solution|code)\.py["']?/g, 'solution.py')
    .replace(/\/work\/[a-zA-Z0-9_./-]+/g, 'solution.py')
    .replace(/\/work\b/g, '.')
    .replace(/\/(?:usr(?:\/local)?)\/lib\/python[0-9.]+\/[a-zA-Z0-9_./-]+/g, 'lib')
    .replace(/\/tmp\/[a-zA-Z0-9_./-]+/g, 'temp');
}

export function formatLearnerError(stderr: string): FormattedLearnerError {
  const trimmed = (stderr || '').trim();
  if (!trimmed) {
    return { isTraceback: false, cleanSummary: '', rawStderr: '' };
  }

  const lines = trimmed.split('\n');
  const lastLine = lines[lines.length - 1].trim();

  // Match ExceptionType: Message on the last non-empty line (requires uppercase initial and exception suffix)
  const exceptionMatch = lastLine.match(/^(?:[a-zA-Z0-9_.]+\.)?([A-Z][a-zA-Z0-9_]*(?:Error|Exception|Exit|Interrupt|Iteration))(?::\s*(.*))?$/);

  let sourceLineNumber: number | undefined;
  let sourceCodeSnippet: string | undefined;

  interface Frame {
    filePath: string;
    lineNumber: number;
    snippet?: string;
    isLearnerFile: boolean;
  }
  const frames: Frame[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineMatch = lines[i].match(/File\s+["']([^"']+)["'],\s+line\s+(\d+)/);
    if (lineMatch) {
      const filePath = lineMatch[1];
      const lineNumber = parseInt(lineMatch[2], 10);
      let snippet: string | undefined;
      if (i + 1 < lines.length && !lines[i + 1].trim().startsWith('File ') && !lines[i + 1].match(/^[A-Z][A-Za-z0-9_]*.*:/)) {
        snippet = lines[i + 1].trim();
      }
      const isLibrary =
        filePath.includes('/usr/lib') ||
        filePath.includes('/usr/local/lib') ||
        filePath.includes('site-packages') ||
        filePath.includes('dist-packages') ||
        filePath.includes('<frozen') ||
        filePath.includes('/lib/python');
      const isLearnerFile =
        !isLibrary &&
        (filePath.endsWith('main.py') ||
          filePath.endsWith('solution.py') ||
          filePath.endsWith('code.py') ||
          filePath.startsWith('/work/') ||
          filePath === '<stdin>' ||
          !filePath.startsWith('/'));
      frames.push({ filePath, lineNumber, snippet, isLearnerFile });
    }
  }

  // Prefer the last learner frame so library frames are not mistaken for learner source
  const chosenFrame = [...frames].reverse().find((f) => f.isLearnerFile) || frames[frames.length - 1];
  if (chosenFrame) {
    sourceLineNumber = chosenFrame.lineNumber;
    sourceCodeSnippet = chosenFrame.snippet;
  }

  if (exceptionMatch) {
    const exceptionType = exceptionMatch[1];
    const rawMessage = exceptionMatch[2] || '';
    const exceptionMessage = sanitizeInternalPaths(rawMessage);
    let cleanSummary = exceptionType;
    if (exceptionMessage) {
      cleanSummary += `: ${exceptionMessage}`;
    }
    if (sourceLineNumber !== undefined) {
      cleanSummary = `Line ${sourceLineNumber} · ${cleanSummary}`;
    }

    return {
      isTraceback: true,
      exceptionType,
      exceptionMessage,
      sourceLineNumber,
      sourceCodeSnippet,
      cleanSummary,
      rawStderr: trimmed,
    };
  }

  // Fallback: strip internal runner paths
  const cleaned = sanitizeInternalPaths(trimmed);

  return {
    isTraceback: false,
    cleanSummary: cleaned,
    rawStderr: trimmed,
  };
}

export function renderPythonExecutionResults(opts: Pick<PythonWorkspacePageOptions, 'currentResult' | 'resultMode' | 'inFlightStatus' | 'inFlightJobId' | 'executionError'>): string {
  if (opts.executionError) return `<div class="form-error" role="alert">${escapeHtml(opts.executionError)}</div>`;
  if (opts.inFlightStatus) return `
    <div class="result-card-banner info" role="status" aria-live="polite">
      <span>${opts.inFlightStatus === 'queued' ? 'Queued for checking.' : opts.inFlightStatus === 'reconnecting' ? 'Checking execution status…' : 'Checking your code…'}</span>
      ${opts.inFlightJobId ? `<span class="text-tertiary font-mono">${escapeHtml(opts.inFlightJobId)}</span>` : ''}
    </div>`;
  if (!opts.currentResult) return `<div class="results-empty-notice"><span>Run your code to see output.</span></div>`;
  const res = opts.currentResult;
  const isPassed = res.verdict === 'PASSED';
  const isInfra = res.isInfrastructureFailure;
  const bannerClass = isPassed && opts.resultMode === 'custom' ? 'info'
    : isPassed ? 'passed' : isInfra ? 'infrastructure' : 'wrong';
  const headline = isPassed && opts.resultMode === 'samples'
    ? 'Samples passed.'
    : isPassed && opts.resultMode === 'custom'
    ? 'Code ran successfully.'
    : isPassed && opts.resultMode === 'submit' ? 'All tests passed.'
    : res.verdict === 'TIME_LIMIT' || res.verdict === 'TIME_LIMIT_EXCEEDED' ? 'Time limit exceeded.'
    : res.verdict === 'MEMORY_LIMIT' || res.verdict === 'MEMORY_LIMIT_EXCEEDED' ? 'Memory limit exceeded.'
    : res.verdict === 'OUTPUT_LIMIT' ? 'Output limit exceeded.'
    : res.verdict === 'SYNTAX_ERROR' || res.verdict === 'COMPILE_ERROR' ? 'Syntax error.'
    : res.verdict === 'RUNTIME_ERROR' ? 'Runtime error.'
    : res.verdict === 'WRONG_ANSWER' ? 'Wrong answer.'
    : res.verdict === 'INTERNAL_ERROR' ? 'Internal execution error.'
    : `Verdict: ${res.verdict}`;
  return `
    <div class="result-card-banner ${bannerClass}" role="status" aria-live="polite">
      <div class="result-banner-text">
        <span class="result-headline">${escapeHtml(headline)}</span>
        <span class="result-verdict-badge sr-only font-mono text-xs">Verdict: ${escapeHtml(res.verdict)}</span>
      </div>
      ${res.executionTimeMs ? `<span class="result-duration text-secondary tabular-nums">${escapeHtml(res.executionTimeMs)} ms</span>` : ''}
    </div>
    ${res.guidance ? `<div class="guidance-notice" style="margin-bottom: var(--space-3); color: var(--text-secondary);">${escapeHtml(res.guidance)}</div>` : ''}
    <div class="test-cards-list">
      ${res.testResults.map((tr) => `
        <div class="test-card-compact">
          <div class="test-card-header">
            <span class="status-badge ${opts.resultMode === 'custom' && isPassed ? 'status-neutral' : tr.passed ? 'status-ready' : 'status-failed'}">${opts.resultMode === 'custom' && isPassed ? 'Executed' : tr.passed ? 'Passed' : 'Failed'}</span>
            <span class="test-title">Test #${escapeHtml(tr.position + 1)}</span>
          </div>
          <div class="test-card-grid">
            ${tr.input !== undefined ? `
              <div class="test-field">
                <span class="comparison-label">Input</span>
                <pre class="comparison-value code-surface">${escapeHtml(tr.input || '(empty)')}</pre>
              </div>` : ''}
            ${tr.expectedOutput !== undefined ? `
              <div class="test-field">
                <span class="comparison-label">Expected Output</span>
                <pre class="comparison-value code-surface">${escapeHtml(tr.expectedOutput)}</pre>
              </div>` : ''}
            ${tr.actualOutput !== undefined ? `
              <div class="test-field">
                <span class="comparison-label">Received Output</span>
                <pre class="comparison-value code-surface">${escapeHtml(tr.actualOutput)}</pre>
              </div>` : ''}
            ${tr.stderr ? (() => {
              const formatted = formatLearnerError(tr.stderr);
              return `
              <div class="test-field test-error-field">
                <span class="comparison-label">Error</span>
                <div class="learner-error-summary text-danger">
                  <p class="error-headline font-semibold" style="margin: 0 0 0.25rem 0;">${escapeHtml(formatted.cleanSummary)}</p>
                  ${formatted.sourceCodeSnippet ? `<pre class="error-snippet code-surface font-mono text-sm" style="margin: 0 0 0.5rem 0; padding: 0.35rem 0.5rem;">${escapeHtml(formatted.sourceCodeSnippet)}</pre>` : ''}
                </div>
                <details class="technical-details" style="margin-top: 0.5rem;">
                  <summary class="text-xs text-secondary cursor-pointer" style="cursor: pointer; user-select: none;">Technical details (traceback)</summary>
                  <pre class="comparison-value code-surface text-danger font-mono text-xs" style="margin-top: 0.25rem;">${escapeHtml(formatted.rawStderr)}</pre>
                </details>
              </div>`;
            })() : ''}
          </div>
        </div>`).join('')}
    </div>
    ${isInfra ? '<p class="text-secondary" style="margin-top: var(--space-3);">Your code is unchanged. You can try again.</p><button type="button" class="btn btn-secondary btn-compact" id="retry-execution-btn">Retry Execution</button>' : ''}`;
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
  const saveNoticeHtml = opts.saveNotice
    ? `<p id="python-save-notice" class="alert alert-warning" role="status">${escapeHtml(opts.saveNotice)}</p>`
    : '';

  // Left Panel: Problem Statement
  const leftPanelHtml = `
    <div class="problem-pane" role="region" aria-label="Problem Instructions" data-enrollment-id="${escapeHtml(opts.enrollmentId)}" data-step-id="${escapeHtml(opts.stepId)}">
      ${saveNoticeHtml}
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
        <h2 class="problem-subheading">Input &amp; output format</h2>
        <div class="problem-section-body">
          <p><strong>Input:</strong> ${escapeHtml(opts.inputFormat)}</p>
          <p><strong>Output:</strong> ${escapeHtml(opts.outputFormat)}</p>
        </div>
      </div>

      <div class="problem-section">
        <h2 class="problem-subheading">Constraints</h2>
        <div class="problem-section-body">
          <code class="code-inline">${escapeHtml(opts.constraints)}</code>
        </div>
      </div>

      ${examples.length > 0 ? `
        <div class="problem-section">
          <h2 class="problem-subheading">Examples</h2>
          ${examples.map((ex, idx) => `
            <div class="test-card-compact" style="margin-bottom: var(--space-3);">
              <div class="test-card-grid">
                <div class="test-field">
                  <span class="comparison-label">Example ${idx + 1} Input</span>
                  <pre class="comparison-value code-surface">${escapeHtml(ex.input || '(empty)')}</pre>
                </div>
                <div class="test-field">
                  <span class="comparison-label">Example ${idx + 1} Output</span>
                  <pre class="comparison-value code-surface">${escapeHtml(ex.output)}</pre>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${hints.length > 0 ? `
        <div class="problem-section">
          <h2 class="problem-subheading">Hints</h2>
          <div class="hints-container">
            ${hints.map((hint, idx) => `
              <div class="hint-accordion" ${idx > 0 ? 'hidden' : ''}>
                <button type="button" class="hint-trigger" aria-expanded="false" data-hint-index="${idx}" data-enrollment-id="${escapeHtml(opts.enrollmentId)}" data-step-id="${escapeHtml(opts.stepId)}">
                  <span>Hint ${idx + 1}</span>
                  <span class="hint-chevron">${renderIcon('chevron-down', { size: 14 })}</span>
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
            <h2 class="problem-subheading" aria-label="Solution Explanation">Solution explanation<span class="sr-only">Solution Explanation</span></h2>
            <div class="problem-section-body">
              <p>${escapeHtml(opts.solutionExplanation)}</p>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="problem-section">
        <a href="/help?report=broken_exercise&stepId=${encodeURIComponent(opts.stepId)}" class="btn-ghost btn-compact text-muted report-issue-link">
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
          <span class="runtime-badge">${PYTHON_RUNTIME_LABEL}</span>
          <div id="python-save-indicator" class="save-indicator ${opts.saveStatus || 'saved'}" aria-live="polite">
            ${saveLabel}
          </div>
        </div>

        <div class="editor-toolbar-right">
          <div class="editor-menu-wrapper">
            <details class="editor-overflow-menu">
              <summary class="btn-icon btn-compact overflow-trigger" title="Editor options" aria-label="Editor options">
                ${renderIcon('more-horizontal', { size: 16 })}
              </summary>
              <div class="overflow-dropdown">
                <button type="button" class="overflow-menu-item text-danger" id="reset-code-btn" title="Revert to starter code">
                  ${renderIcon('history', { size: 14 })}
                  <span>Reset code</span>
                </button>
              </div>
            </details>
          </div>
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

      <div id="results-splitter" class="results-splitter" role="separator" tabindex="0"
        aria-label="Resize code and results" aria-orientation="horizontal" aria-valuemin="120" aria-valuemax="500" aria-valuenow="240">
        <div class="splitter-hover-handle" aria-hidden="true"></div>
      </div>

      <div class="workspace-results-region" role="region" aria-label="Execution Results">
        <div class="results-tab-bar" role="tablist">
          <button type="button" id="tab-btn-results" data-tab="results" class="results-tab-button ${activeTab === 'results' ? 'active' : ''}" role="tab" aria-selected="${activeTab === 'results'}">
            Results
          </button>
          <button type="button" id="tab-btn-custom-input" data-tab="custom_input" class="results-tab-button ${activeTab === 'custom_input' ? 'active' : ''}" role="tab" aria-selected="${activeTab === 'custom_input'}">
            Custom input
          </button>
          <a href="/learn/${encodeURIComponent(opts.enrollmentId)}/steps/${encodeURIComponent(opts.stepId)}/attempts" class="results-tab-button" role="tab" aria-selected="false">
            Attempts
          </a>
        </div>

        <div class="results-body">
          ${activeTab === 'custom_input' ? `
            <div class="custom-input-box">
              <label for="custom-stdin-input" class="comparison-label">Input</label>
              <textarea id="custom-stdin-input" class="code-editor-input" style="height: 100px; border: 1px solid var(--border-control); border-radius: var(--radius-sm);" placeholder="Input for your program (optional)">${escapeHtml(opts.customStdin || '')}</textarea>
            </div>
          ` : resultsBodyHtml}
        </div>
      </div>
    </div>
  `;

  // Task footer action buttons
  // After pass, primary Continue and Submit demoted to secondary; no competing Next.
  const taskActionsHtml = `
    <button type="button" class="btn btn-secondary btn-compact" id="run-samples-btn" title="Run against public sample tests (Ctrl/⌘+Enter runs selected mode · Esc moves to actions)">
      <span>Run samples</span>
      <kbd class="kbd-hint">⌘↵</kbd>
    </button>
    <button type="button" class="btn btn-secondary btn-compact" id="run-custom-btn" title="Run with custom standard input">
      Run code
    </button>
    <button type="button" class="btn ${opts.isCompleted ? 'btn-secondary' : 'btn-primary'} btn-compact" id="submit-solution-btn" title="Submit solution for grading">
      Submit solution
    </button>
    ${opts.isCompleted && opts.nextStepUrl ? `<a href="${escapeHtml(opts.nextStepUrl)}" class="btn btn-primary btn-compact" id="continue-next-btn">Continue</a>` : ''}
  `;

  return renderLearningWorkspaceShell({
    courseTitle: opts.courseTitle,
    courseOverviewUrl: opts.courseOverviewUrl,
    lessonTitle: opts.lessonTitle,
    stepTitle: opts.stepTitle,
    stepOrdinalText: opts.stepOrdinalText,
    isPythonWorkspace: true,
    saveStatusText: saveLabel,
    outlineContent: opts.outlineContent || '<nav class="outline-nav"><ul><li>' + escapeHtml(opts.stepTitle) + '</li></ul></nav>',
    workspaceContent: leftPanelHtml +
      '<div id="workspace-splitter" class="workspace-splitter" role="separator" tabindex="0" aria-label="Resize problem and code panes" aria-orientation="vertical" aria-valuemin="340" aria-valuemax="800" aria-valuenow="400"><div class="splitter-hover-handle" aria-hidden="true"></div></div>' + rightPanelHtml,
    previousStepUrl: opts.previousStepUrl,
    nextStepUrl: null, // Avoid competing Next button; Continue is rendered in taskActions
    taskActions: taskActionsHtml,
  });
}
