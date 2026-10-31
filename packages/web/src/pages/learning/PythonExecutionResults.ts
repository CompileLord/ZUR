import type { ExecutionResult } from 'zur-shared';
import { renderIcon } from '../../components/common/icons.ts';
import { formatLearnerError, sanitizeInternalPaths } from './PythonLearnerError.ts';
import type { PythonWorkspacePageOptions } from './PythonWorkspacePage.ts';

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]!));
}

export function renderPythonExecutionResults(opts: Pick<PythonWorkspacePageOptions, 'currentResult' | 'resultMode' | 'inFlightStatus' | 'inFlightJobId' | 'executionError'>): string {
  if (opts.executionError) return `<div class="form-error" role="alert">${escapeHtml(opts.executionError)}</div>`;
  if (opts.inFlightStatus) return `
    <div class="result-card-banner info" role="status" aria-live="polite">
      <div class="result-banner-text">
        <span class="result-headline">${opts.inFlightStatus === 'queued' ? 'Queued…' : opts.inFlightStatus === 'reconnecting' ? 'Checking status…' : 'Running…'}</span>
      </div>
      ${opts.inFlightJobId ? `
        <details class="job-meta-details text-xs text-muted">
          <summary class="cursor-pointer select-none">Details</summary>
          <span class="font-mono mt-1">${escapeHtml(opts.inFlightJobId)}</span>
        </details>
      ` : ''}
    </div>`;
  if (!opts.currentResult) return `<div class="results-empty-notice"><span>Output appears here.</span></div>`;
  const res = opts.currentResult;
  if (opts.resultMode === 'custom' && !res.isInfrastructureFailure) {
    const stdout = res.testResults.filter(result => !result.isHidden).map(result => result.actualOutput || '').join('');
    const stderr = res.testResults.filter(result => !result.isHidden).map(result => result.stderr || '').join('');
    return `<div class="program-output" role="status" aria-live="polite"><pre class="program-stdout">${escapeHtml(stdout)}</pre>${stderr ? `<pre class="program-stderr">${escapeHtml(sanitizeInternalPaths(stderr))}</pre>` : ''}${res.verdict !== 'PASSED' ? `<span class="text-xs text-danger">${escapeHtml(res.verdict)}</span>` : ''}</div>`;
  }
  const isPassed = res.verdict === 'PASSED';
  const isInfra = res.isInfrastructureFailure;
  const bannerClass = isPassed && opts.resultMode === 'custom' ? 'info'
    : isPassed ? 'passed' : isInfra ? 'infrastructure' : 'wrong';
  const headline = isPassed && opts.resultMode === 'samples'
    ? 'Samples passed.'
    : isPassed && opts.resultMode === 'custom'
    ? 'Code ran successfully.'
    : isPassed && opts.resultMode === 'submit' ? 'All tests passed.'
    : res.verdict === 'TIME_LIMIT' ? 'Time limit exceeded.'
    : res.verdict === 'MEMORY_LIMIT' ? 'Memory limit exceeded.'
    : res.verdict === 'OUTPUT_LIMIT' ? 'Output limit exceeded.'
    : res.verdict === 'SYNTAX_ERROR' ? 'Syntax error.'
    : res.verdict === 'RUNTIME_ERROR' ? 'Runtime error.'
    : res.verdict === 'WRONG_ANSWER' ? 'Wrong answer.'
    : res.verdict === 'INTERNAL_ERROR' ? 'Internal execution error.'
    : `Verdict: ${res.verdict}`;
  const modeLabel = opts.resultMode === 'submit' ? 'Submit (Graded)' : opts.resultMode === 'custom' ? 'Run' : 'Test samples';
  return `
    <div class="result-card-banner ${bannerClass}" role="status" aria-live="polite">
      <div class="result-banner-text">
        <span class="result-mode-badge status-badge status-neutral text-xs font-mono mr-2">${escapeHtml(modeLabel)}</span>
        <span class="result-headline">${escapeHtml(headline)}</span>
        <span class="result-verdict-badge sr-only font-mono text-xs">Verdict: ${escapeHtml(res.verdict)}</span>
      </div>
      ${res.executionTimeMs ? `<span class="result-duration text-secondary tabular-nums">${escapeHtml(res.executionTimeMs)} ms</span>` : ''}
    </div>
    ${res.guidance ? `<div class="guidance-notice" style="margin-bottom: var(--space-3); color: var(--text-secondary);">${escapeHtml(res.guidance)}</div>` : ''}
    <div class="test-chip-row" role="group" aria-label="Test results">
      ${res.testResults.map((tr) => {
        const chipClass = opts.resultMode === 'custom' && isPassed ? 'neutral' : tr.passed ? 'passed' : 'failed';
        const chipIcon = chipClass === 'failed' ? '✗' : '✓';
        return `<button type="button" class="test-chip ${chipClass}" data-test-chip="${escapeHtml(tr.position)}" aria-expanded="${tr.passed ? 'false' : 'true'}" aria-controls="test-detail-${escapeHtml(tr.position)}"><span aria-hidden="true">${chipIcon}</span> Test ${escapeHtml(tr.position + 1)}<span class="sr-only"> ${tr.passed ? 'passed' : 'failed'}</span></button>`;
      }).join('')}
    </div>
    <div class="test-cards-list">
      ${res.testResults.map((tr) => `
        <div class="test-card-compact" id="test-detail-${escapeHtml(tr.position)}" ${tr.passed ? 'hidden' : ''}>
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
