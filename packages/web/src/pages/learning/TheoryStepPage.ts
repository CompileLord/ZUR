import { renderLearningWorkspaceShell } from '../../components/shells/LearningWorkspaceShell.ts';
import { escapeHtml, renderMarkdownToHtml } from 'zur-shared';

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
  const continueUrl = opts.nextStepUrl || opts.courseOverviewUrl;
  const taskActions = `
    <a href="/help/report?stepId=${encodeURIComponent(opts.stepId)}&amp;enrollmentId=${encodeURIComponent(opts.enrollmentId)}" class="report-issue-link">Report issue</a>
    ${opts.isCompleted
      ? `<a href="${escapeHtml(continueUrl)}" class="btn btn-primary btn-compact">Continue</a>`
      : `<form method="POST" action="/api/enrollments/${encodeURIComponent(opts.enrollmentId)}/steps/${encodeURIComponent(opts.stepId)}/complete" class="complete-step-form"><button type="submit" class="btn btn-primary">Mark complete and continue</button></form>`}
  `;

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

      <h1 class="theory-title">${escapeHtml(opts.stepTitle)}</h1>

      <div class="reading-body markdown-prose">
        ${renderedBodyHtml}
      </div>

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
    taskActions,
  });
}
