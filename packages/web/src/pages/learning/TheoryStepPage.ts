import { renderLearningWorkspaceShell } from '../../components/shells/LearningWorkspaceShell.ts';
import { renderMarkdownToHtml } from 'zur-shared';

export interface TheoryStepPageOptions {
  courseTitle: string;
  courseOverviewUrl: string;
  lessonTitle: string;
  stepTitle: string;
  stepOrdinalText: string;
  isRequired: boolean;
  estimatedDurationMinutes: number;
  markdownContent: string;
  enrollmentId: string;
  stepId: string;
  isCompleted: boolean;
  outlineContent?: string;
  previousStepUrl?: string | null;
  nextStepUrl?: string | null;
}

export function renderTheoryStepPage(opts: TheoryStepPageOptions): string {
  const renderedBodyHtml = renderMarkdownToHtml(opts.markdownContent);

  const workspaceContent = `
    <article class="theory-step-content" role="region" aria-label="Theory Reading">
      <div class="reading-meta-bar">
        <span class="step-ordinal">${opts.stepOrdinalText}</span>
        <span>·</span>
        <span>Theory</span>
        <span>·</span>
        <span>${opts.isRequired ? 'Required' : 'Optional'}</span>
        <span>·</span>
        <span>~${opts.estimatedDurationMinutes}m</span>
      </div>

      <h1 class="theory-title">${opts.stepTitle}</h1>

      <div class="reading-body markdown-prose">
        ${renderedBodyHtml}
      </div>

      <footer class="step-navigation-footer">
        <div class="footer-left">
          ${
            opts.previousStepUrl
              ? `<a href="${opts.previousStepUrl}" class="btn btn-secondary btn-compact">Previous</a>`
              : ''
          }
        </div>

        <div class="footer-center">
          <a href="/help/report?stepId=${opts.stepId}&enrollmentId=${opts.enrollmentId}" class="report-issue-link">
            Report issue
          </a>
        </div>

        <div class="footer-right">
          ${
            opts.isCompleted
              ? `
                <span class="status-badge success">Completed ✓</span>
                ${
                  opts.nextStepUrl
                    ? `<a href="${opts.nextStepUrl}" class="btn btn-primary btn-compact">Next step →</a>`
                    : `<a href="${opts.courseOverviewUrl}" class="btn btn-secondary btn-compact">Course overview</a>`
                }
              `
              : `
                <form method="POST" action="/api/enrollments/${opts.enrollmentId}/steps/${opts.stepId}/complete" class="complete-step-form">
                  <button type="submit" class="btn btn-primary">
                    Mark complete and continue
                  </button>
                </form>
              `
          }
        </div>
      </footer>
    </article>
  `;

  return renderLearningWorkspaceShell({
    courseTitle: opts.courseTitle,
    courseOverviewUrl: opts.courseOverviewUrl,
    lessonTitle: opts.lessonTitle,
    stepTitle: opts.stepTitle,
    stepOrdinalText: opts.stepOrdinalText,
    isPythonWorkspace: false,
    outlineContent: opts.outlineContent || '<p class="outline-empty">Outline available</p>',
    workspaceContent,
    previousStepUrl: opts.previousStepUrl,
    nextStepUrl: opts.nextStepUrl,
  });
}
