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
}

export function renderLearningWorkspaceShell(opts: LearningWorkspaceShellOptions): string {
  const isPython = Boolean(opts.isPythonWorkspace);

  return `
    <div class="shell-learning ${isPython ? 'paired-workspace' : 'reading-workspace'}">
      <header class="learning-header" role="banner">
        <div class="learning-header-left">
          <a href="${escapeHtml(opts.courseOverviewUrl)}" class="back-link" aria-label="Back to course overview">
            ← ${escapeHtml(opts.courseTitle)}
          </a>
          <span class="header-divider">/</span>
          <span class="header-lesson-context">${escapeHtml(opts.lessonTitle)}</span>
        </div>

        <div class="learning-header-right">
          ${opts.saveStatusText ? `<div class="save-indicator saved" aria-live="polite">${opts.saveStatusText}</div>` : ''}
          <button type="button" class="btn btn-secondary btn-compact outline-toggle-btn" aria-expanded="false" aria-controls="course-outline-panel">
            Outline
          </button>
        </div>
      </header>

      <div class="learning-body">
        <aside id="course-outline-panel" class="learning-outline-drawer" role="navigation" aria-label="Course Outline">
          <div class="outline-drawer-header">
            <h2>Course Outline</h2>
          </div>
          <div class="outline-drawer-content">
            ${opts.outlineContent}
          </div>
        </aside>

        <main id="main-content" class="learning-workspace-main" role="main">
          <!-- Desktop Guidance Banner on Compact Screens for Python (design §5, §8) -->
          ${isPython ? `
            <div class="desktop-guidance-banner" role="note">
              <span class="guidance-icon">ℹ</span>
              <span class="guidance-text">Open this exercise on a computer to write and run code.</span>
            </div>
          ` : ''}

          <div class="workspace-viewport">
            ${opts.workspaceContent}
          </div>

          <footer class="learning-task-footer" role="region" aria-label="Step Navigation">
            <div class="task-footer-left">
              ${opts.previousStepUrl ? `<a href="${escapeHtml(opts.previousStepUrl)}" class="btn btn-secondary btn-compact">Previous</a>` : ''}
              <span class="step-ordinal-meta">${escapeHtml(opts.stepOrdinalText)}</span>
            </div>

            <div class="task-footer-right">
              ${isPython ? `<div class="python-execution-actions">${opts.taskActions || ''}</div><span class="python-desktop-action-note">Run and Submit are available on a computer.</span>` : (opts.taskActions || '')}
              ${opts.nextStepUrl ? `<a href="${escapeHtml(opts.nextStepUrl)}" class="btn btn-secondary btn-compact">Next</a>` : ''}
            </div>
          </footer>
        </main>
      </div>
    </div>
  `;
}
import { escapeHtml } from 'zur-shared';
