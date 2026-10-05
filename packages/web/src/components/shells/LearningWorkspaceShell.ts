import { escapeHtml } from '../escape-html.ts';
import { renderIcon } from '../common/icons.ts';

export interface LearningWorkspaceShellOptions {
  courseTitle: string;
  courseOverviewUrl: string;
  lessonTitle: string;
  stepTitle: string;
  stepOrdinalText: string; // e.g. "Step 3 of 5"
  isPythonWorkspace?: boolean;
  saveStatusText?: string; // e.g. "Saved", "Saving"
  outlineContent: string;
  workspaceContent: string;
  previousStepUrl?: string | null;
  nextStepUrl?: string | null;
  taskActions?: string; // e.g. Run samples, Submit solution
  reportIssueUrl?: string | null;
}

export function renderLearningWorkspaceShell(opts: LearningWorkspaceShellOptions): string {
  const isPython = Boolean(opts.isPythonWorkspace);
  const hasLocalSavedIndicator = opts.workspaceContent.includes('id="python-save-indicator"');

  return `
    <div class="shell-learning ${isPython ? 'paired-workspace' : 'reading-workspace'}">
      <header class="learning-header" role="banner">
        <div class="learning-header-left">
          <a href="${escapeHtml(opts.courseOverviewUrl)}" class="back-link" aria-label="Back to course overview">
            ${renderIcon('chevron-left', { size: 16 })}
            <span class="back-link-title">${escapeHtml(opts.courseTitle)}</span>
          </a>
          <span class="header-divider">/</span>
          <span class="header-lesson-context">${escapeHtml(opts.lessonTitle)}</span>
        </div>

        <div class="learning-header-right">
          ${opts.saveStatusText && !hasLocalSavedIndicator ? `<div class="save-indicator saved" aria-live="polite">${escapeHtml(opts.saveStatusText)}</div>` : ''}
          <button type="button" class="btn btn-secondary btn-compact outline-toggle-btn" aria-expanded="false" aria-controls="course-outline-panel">
            ${renderIcon('book', { size: 14 })}
            <span>Outline</span>
          </button>
        </div>
      </header>

      <div class="learning-body">
        <aside id="course-outline-panel" class="learning-outline-drawer" role="navigation" aria-label="Course Outline">
          <div class="outline-drawer-header">
            <h2>Course outline</h2>
          </div>
          <div class="outline-drawer-content">
            ${opts.outlineContent}
          </div>
        </aside>

        <main id="main-content" class="learning-workspace-main" role="main">
          <div class="workspace-viewport">
            ${opts.workspaceContent}
          </div>

          <footer class="learning-task-footer" role="region" aria-label="Step Navigation">
            <div class="task-footer-left">
              ${opts.previousStepUrl ? `<a href="${escapeHtml(opts.previousStepUrl)}" class="btn btn-secondary btn-compact">Previous</a>` : ''}
            </div>

            <div class="task-footer-center">
              <span class="step-ordinal-meta">${escapeHtml(opts.stepOrdinalText)}</span>
            </div>

            <div class="task-footer-right">
              ${isPython
                ? `<div class="python-execution-actions">${opts.taskActions || ''}</div>`
                : (opts.taskActions ? opts.taskActions : (opts.nextStepUrl ? `<a href="${escapeHtml(opts.nextStepUrl)}" class="btn btn-primary btn-compact">Next</a>` : ''))}
            </div>
          </footer>
        </main>
      </div>
    </div>
  `;
}
