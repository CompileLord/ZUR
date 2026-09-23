import { renderLearningWorkspaceShell } from '../../components/shells/LearningWorkspaceShell.ts';

export interface AttemptItem {
  id: string;
  attemptNumber: number;
  verdict: string;
  executionTimeMs?: number | null;
  isInfrastructureFailure: boolean;
  createdAt: string;
}

export interface AttemptHistoryPageOptions {
  courseTitle: string;
  courseOverviewUrl: string;
  lessonTitle: string;
  stepTitle: string;
  enrollmentId: string;
  stepId: string;
  workspaceUrl: string;
  attempts: AttemptItem[];
  selectedAttempt?: {
    id: string;
    attemptNumber: number;
    verdict: string;
    codeSnapshot: string;
    executionTimeMs?: number | null;
    isInfrastructureFailure: boolean;
    createdAt: string;
    canRestore: boolean;
    runtimeVersion: string;
  } | null;
  totalAttempts: number;
  currentPage: number;
  pageSize: number;
}

export function renderAttemptHistoryPage(opts: AttemptHistoryPageOptions): string {
  const selected = opts.selectedAttempt;

  // Attempt Detail Drawer / View (design §11 P16)
  let detailHtml = '';
  if (selected) {
    const isPassed = selected.verdict === 'PASSED';
    const isInfra = selected.isInfrastructureFailure;
    const badgeClass = isPassed ? 'status-ready' : isInfra ? 'status-draft' : 'status-failed';

    detailHtml = `
      <div class="attempt-detail-view" role="region" aria-label="Attempt Detail">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4);">
          <div style="display: flex; align-items: center; gap: var(--space-3);">
            <a href="/learn/${opts.enrollmentId}/steps/${opts.stepId}/attempts" class="btn btn-ghost btn-compact">
              ← All attempts
            </a>
            <h2>Attempt #${selected.attemptNumber}</h2>
          </div>
          <span class="status-badge ${badgeClass}">${selected.verdict}</span>
        </div>

        <div class="problem-meta-row" style="margin-bottom: var(--space-4);">
          <span>Submitted at: ${new Date(selected.createdAt).toLocaleString()}</span>
          <span>·</span>
          <span>Runtime: ${selected.runtimeVersion || 'Python 3.14'}</span>
          ${selected.executionTimeMs ? `<span>·</span><span>${selected.executionTimeMs} ms</span>` : ''}
        </div>

        <div style="margin-bottom: var(--space-4);">
          <h3 class="problem-section-title" style="margin-bottom: var(--space-2);">Submitted Code Snapshot</h3>
          <div class="code-block">
            <pre><code>${selected.codeSnapshot}</code></pre>
            <button type="button" class="btn btn-secondary btn-compact code-block-copy" id="copy-code-btn">
              Copy
            </button>
          </div>
        </div>

        ${selected.canRestore ? `
          <div style="margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--border-subtle);">
            <button type="button" class="btn btn-primary" id="restore-to-editor-btn">
              Restore to editor
            </button>
            <div id="restore-confirm-dialog" class="dialog-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="restore-dialog-title">
              <div class="dialog">
                <div class="dialog-header">
                  <h3 id="restore-dialog-title" class="dialog-title">Restore code to editor?</h3>
                </div>
                <div class="dialog-body">
                  <p>Restoring this submission will replace your current code draft. Your existing draft will be overwritten.</p>
                </div>
                <div class="dialog-footer">
                  <button type="button" class="btn btn-secondary" id="cancel-restore-btn">Cancel</button>
                  <button type="button" class="btn btn-primary" id="confirm-restore-btn">Restore code</button>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Attempt List View
  const listHtml = `
    <div style="max-width: 800px; margin: 0 auto; padding: var(--space-6); width: 100%;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-6);">
        <div>
          <a href="${opts.workspaceUrl}" class="btn btn-ghost btn-compact" style="margin-bottom: var(--space-2);">
            ← Back to workspace
          </a>
          <h1 class="problem-title">Submission History</h1>
          <p class="problem-section-body">${opts.totalAttempts} total attempts for this exercise</p>
        </div>
      </div>

      ${opts.attempts.length === 0 ? `
        <div class="results-empty-notice" style="padding: var(--space-8); text-align: center;">
          <p>No attempts recorded yet. Submit your solution from the workspace to record an attempt.</p>
        </div>
      ` : `
        <div class="attempt-history-list">
          ${opts.attempts.map((att) => {
            const isPassed = att.verdict === 'PASSED';
            const isInfra = att.isInfrastructureFailure;
            const badgeClass = isPassed ? 'status-ready' : isInfra ? 'status-draft' : 'status-failed';
            return `
              <a href="/learn/${opts.enrollmentId}/steps/${opts.stepId}/attempts/${att.id}" class="attempt-row-card">
                <div style="display: flex; align-items: center; gap: var(--space-4);">
                  <span class="status-badge ${badgeClass}">${att.verdict}</span>
                  <span style="font-weight: 500;">Attempt #${att.attemptNumber}</span>
                  <span class="text-secondary" style="font-size: var(--type-metadata-size);">
                    ${new Date(att.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: var(--space-3);">
                  ${att.executionTimeMs ? `<span class="text-tertiary" style="font-size: var(--type-metadata-size);">${att.executionTimeMs} ms</span>` : ''}
                  <span class="btn btn-ghost btn-compact">View →</span>
                </div>
              </a>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;

  return renderLearningWorkspaceShell({
    courseTitle: opts.courseTitle,
    courseOverviewUrl: opts.courseOverviewUrl,
    lessonTitle: opts.lessonTitle,
    stepTitle: opts.stepTitle,
    stepOrdinalText: 'Attempts',
    isPythonWorkspace: false,
    outlineContent: '<nav class="outline-nav"><ul><li>History</li></ul></nav>',
    workspaceContent: selected ? detailHtml : listHtml,
    previousStepUrl: opts.workspaceUrl,
  });
}
