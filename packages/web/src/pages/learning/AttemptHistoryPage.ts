import {
  renderLearningWorkspaceShell,
  type CourseModuleItem,
  type TaskSquareItem,
} from '../../components/shells/LearningWorkspaceShell.ts';
import { PYTHON_RUNTIME_LABEL } from 'zur-shared';
import { renderIcon } from '../../components/common/icons.ts';
import { sentenceCase, formatDate } from '../../utils/formatters.ts';

export interface AttemptItem {
  id: string;
  attemptNumber: number;
  verdict: string;
  executionTimeMs?: number | null;
  isInfrastructureFailure: boolean;
  createdAt: string;
  runtimeVersion?: string;
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
  offset?: number;
  modules?: CourseModuleItem[];
  taskSquares?: TaskSquareItem[];
  courseProgressText?: string;
  courseProgressPercentage?: number;
  isSidebarCollapsed?: boolean;
  allAttemptsUrl?: string;
  stepOrdinalText?: string;
  courseId?: string;
  courseVersionId?: string;
  outlineContent?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]!));
}

export function getAttemptDocumentTitle(stepTitle: string, courseTitle: string, selected?: { attemptNumber?: number } | null): string {
  const prefix = selected?.attemptNumber
    ? `Attempt #${selected.attemptNumber}`
    : selected
    ? 'Attempt Detail'
    : 'Submission History';
  return `${prefix} · ${stepTitle || 'Exercise'} · ${courseTitle || 'Course'} · ZUR`;
}

export function renderAttemptHistoryPage(opts: AttemptHistoryPageOptions): string {
  const selected = opts.selectedAttempt;
  const allAttemptsHref = opts.allAttemptsUrl || `/learn/${encodeURIComponent(opts.enrollmentId)}/steps/${encodeURIComponent(opts.stepId)}/attempts`;

  // Attempt Detail Drawer / View (design §11 P16, consistent container inset matching list)
  let detailHtml = '';
  if (selected) {
    const isPassed = selected.verdict === 'PASSED';
    const isInfra = selected.isInfrastructureFailure;
    const badgeClass = isPassed ? 'status-ready' : isInfra ? 'status-draft' : 'status-failed';

    detailHtml = `
      <div class="attempt-history-container" style="max-width: 800px; margin: 0 auto; padding: 40px var(--space-6); width: 100%;">
        <div class="attempt-detail-view" role="region" aria-label="Attempt Detail">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4);">
            <div style="display: flex; align-items: center; gap: var(--space-3);">
              <a href="${escapeHtml(allAttemptsHref)}" class="btn btn-ghost btn-compact">
                ${renderIcon('chevron-left', { size: 14 })}
                <span>All attempts</span>
              </a>
              <a href="${escapeHtml(opts.workspaceUrl)}" class="btn btn-ghost btn-compact">Back to task</a>
              <h2>Attempt ${escapeHtml(selected.attemptNumber)}<span class="sr-only">Attempt #${escapeHtml(selected.attemptNumber)}</span></h2>
            </div>
            <span class="status-badge ${badgeClass}" aria-label="${escapeHtml(selected.verdict)}">${sentenceCase(selected.verdict)}</span>
          </div>

          <div class="problem-meta-row" style="margin-bottom: var(--space-4);">
            <span>Submitted ${formatDate(selected.createdAt)}</span>
            <span>·</span>
            <span>Runtime: ${escapeHtml(selected.runtimeVersion || PYTHON_RUNTIME_LABEL)}</span>
            ${selected.executionTimeMs ? `<span>·</span><span>${escapeHtml(selected.executionTimeMs)} ms</span>` : ''}
          </div>

          <div style="margin-bottom: var(--space-4);">
            <h3 class="problem-subheading" style="margin-bottom: var(--space-2);">Submitted code snapshot</h3>
            <div class="code-block" style="overflow-x: auto; max-width: 100%;">
              <pre style="overflow-x: auto; white-space: pre; margin: 0;"><code>${escapeHtml(selected.codeSnapshot)}</code></pre>
              <button type="button" class="btn btn-secondary btn-compact code-block-copy" id="copy-code-btn">
                ${renderIcon('copy', { size: 14 })}
                <span>Copy</span>
              </button>
            </div>
          </div>

          ${selected.canRestore ? `
            <div style="margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--border-subtle);">
              <button type="button" class="btn btn-primary btn-compact" id="restore-to-editor-btn">
                Restore to editor
              </button>
              <div id="restore-detail-feedback" class="form-error text-sm text-danger mt-2 hidden" role="alert" hidden style="color: var(--danger, #dc2626); margin-top: 8px; font-size: 0.875rem; display: none;"></div>
              <dialog id="restore-confirm-dialog" class="dialog-overlay modal-dialog" hidden role="dialog" aria-modal="true" aria-labelledby="restore-dialog-title">
                <div class="dialog">
                  <div class="dialog-header">
                    <h3 id="restore-dialog-title" class="dialog-title">Restore code to editor?</h3>
                  </div>
                  <div class="dialog-body">
                    <p>Restoring this submission will replace your current code draft. Your existing draft will be overwritten.</p>
                    <div id="restore-error-message" class="form-error text-sm text-danger mt-3 hidden" role="alert" hidden style="color: var(--danger, #dc2626); margin-top: 12px; font-size: 0.875rem; display: none;"></div>
                  </div>
                  <div class="dialog-footer">
                    <button type="button" class="btn btn-secondary" id="cancel-restore-btn">Cancel</button>
                    <button type="button" class="btn btn-primary" id="confirm-restore-btn">Restore code</button>
                  </div>
                </div>
              </dialog>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // Attempt List View
  const listHtml = `
    <div class="attempt-history-container" style="max-width: 800px; margin: 0 auto; padding: 40px var(--space-6); width: 100%;">
      <div style="margin-bottom: var(--space-6);">
        <a href="${escapeHtml(opts.workspaceUrl)}" class="btn btn-ghost btn-compact" style="margin-bottom: var(--space-3); padding-left: 0;">
          ${renderIcon('chevron-left', { size: 14 })}
          <span>Back to workspace</span>
        </a>
        <h1 class="problem-title" aria-label="Submission History">Attempts<span class="sr-only">Submission History</span></h1>
        ${opts.attempts.length > 0 ? `<p class="text-secondary" style="font-size: var(--type-metadata-size); margin-top: var(--space-1);">${escapeHtml(opts.totalAttempts)} total ${Number(opts.totalAttempts) === 1 ? 'attempt' : 'attempts'} for this exercise</p>` : ''}
      </div>

      ${opts.attempts.length === 0 ? `
        <div class="results-empty-notice attempt-empty-state">
          <span class="attempt-empty-icon" aria-hidden="true">${renderIcon('history', { size: 22 })}</span>
          <p class="attempt-empty-title">No submissions yet</p>
          <p class="text-secondary attempt-empty-hint">Run your solution and submit it. Every attempt will be listed here.</p>
          <a href="${escapeHtml(opts.workspaceUrl)}" class="btn btn-primary btn-compact">Return to task</a>
        </div>
      ` : `
        <div class="attempt-history-list">
          ${opts.attempts.map((att) => {
            const isPassed = att.verdict === 'PASSED';
            const isInfra = att.isInfrastructureFailure;
            const badgeClass = isPassed ? 'status-ready' : isInfra ? 'status-draft' : 'status-failed';
            const detailHref = `/learn/${encodeURIComponent(opts.enrollmentId)}/steps/${encodeURIComponent(opts.stepId)}/attempts/${encodeURIComponent(att.id)}${opts.offset ? `?offset=${opts.offset}` : ''}`;
            return `
              <a href="${detailHref}" class="attempt-row-card ${isPassed ? 'is-passed' : isInfra ? 'is-infra' : 'is-failed'}">
                <div class="attempt-row-main">
                  <span class="status-badge ${badgeClass}" aria-label="${escapeHtml(att.verdict)}">${sentenceCase(att.verdict)}</span>
                  <span class="attempt-row-num" aria-label="Attempt #${escapeHtml(att.attemptNumber)}">Attempt ${escapeHtml(att.attemptNumber)}</span>
                  <time class="attempt-row-time" datetime="${escapeHtml(att.createdAt)}">${formatDate(att.createdAt)}</time>
                </div>
                <div class="attempt-row-meta">
                  <span class="attempt-row-runtime">${escapeHtml(att.runtimeVersion || PYTHON_RUNTIME_LABEL)}</span>
                  ${att.executionTimeMs ? `<span class="attempt-row-duration tabular-nums">${escapeHtml(att.executionTimeMs)} ms</span>` : ''}
                  <span class="attempt-row-chevron" aria-hidden="true">${renderIcon('chevron-right', { size: 16 })}</span>
                </div>
              </a>
            `;
          }).join('')}
        </div>
      `}
      ${opts.totalAttempts > opts.pageSize ? `<nav class="attempt-history-pagination" aria-label="Submission history pages"><span>Showing ${Math.min((opts.offset || 0) + 1, opts.totalAttempts)}–${Math.min((opts.offset || 0) + opts.attempts.length, opts.totalAttempts)} of ${escapeHtml(opts.totalAttempts)}</span><div>${(opts.offset || 0) > 0 ? `<a class="btn btn-secondary btn-compact" href="/learn/${encodeURIComponent(opts.enrollmentId)}/steps/${encodeURIComponent(opts.stepId)}/attempts?offset=${Math.max(0, (opts.offset || 0) - opts.pageSize)}">Previous</a>` : ''}${(opts.offset || 0) + opts.pageSize < opts.totalAttempts ? `<a class="btn btn-secondary btn-compact" href="/learn/${encodeURIComponent(opts.enrollmentId)}/steps/${encodeURIComponent(opts.stepId)}/attempts?offset=${(opts.offset || 0) + opts.pageSize}">Next</a>` : ''}</div></nav>` : ''}
    </div>
  `;

  return renderLearningWorkspaceShell({
    courseTitle: opts.courseTitle,
    courseOverviewUrl: opts.courseOverviewUrl,
    lessonTitle: opts.lessonTitle,
    stepTitle: opts.stepTitle,
    stepOrdinalText: opts.stepOrdinalText || 'Attempts',
    courseProgressText: opts.courseProgressText,
    courseProgressPercentage: opts.courseProgressPercentage,
    modules: opts.modules,
    taskSquares: opts.taskSquares,
    isPythonWorkspace: false,
    outlineDrawer: true,
    isSidebarCollapsed: opts.isSidebarCollapsed,
    outlineContent: opts.outlineContent,
    workspaceContent: selected ? detailHtml : listHtml,
    previousStepUrl: opts.workspaceUrl,
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
