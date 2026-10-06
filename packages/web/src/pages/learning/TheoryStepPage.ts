import {
  renderLearningWorkspaceShell,
  type CourseModuleItem,
  type TaskSquareItem,
} from '../../components/shells/LearningWorkspaceShell.ts';
import { escapeHtml, renderMarkdownToHtml } from 'zur-shared';
import { renderIcon } from '../../components/common/icons.ts';
import { formatDuration } from '../../utils/formatters.ts';

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
  courseProgressText?: string;
  courseProgressPercentage?: number;
  modules?: CourseModuleItem[];
  taskSquares?: TaskSquareItem[];
}

export function renderTheoryWorkspaceContent(opts: TheoryStepPageOptions): { workspaceContent: string; taskActions: string } {
  // Suppress first markdown H1 if it equals the step title (case insensitive, trimmed)
  let markdown = opts.markdownContent || '';
  const h1Match = markdown.match(/^\s*#\s+([^\n]+)/);
  if (h1Match && h1Match[1].trim().toLowerCase() === opts.stepTitle.trim().toLowerCase()) {
    markdown = markdown.replace(/^\s*#\s+[^\n]+\n?/, '');
  }

  let renderedBodyHtml = renderMarkdownToHtml(markdown);

  // Enhance fenced code blocks with code surface and Copy button
  renderedBodyHtml = renderedBodyHtml.replace(
    /<pre><code class="language-([^"]*)">([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) => `
      <div class="code-block" data-language="${lang}">
        <div class="code-block-header">
          <span class="code-lang-badge">${lang || 'code'}</span>
          <button type="button" class="btn btn-ghost btn-compact code-block-copy" aria-label="Copy code">
            ${renderIcon('copy', { size: 14 })}
            <span>Copy</span>
          </button>
        </div>
        <pre><code class="language-${lang}">${code}</code></pre>
      </div>
    `
  );

  const continueUrl = opts.nextStepUrl || opts.courseOverviewUrl;
  const taskActions = opts.isCompleted
    ? `<a href="${escapeHtml(continueUrl)}" class="btn btn-primary btn-compact">Continue</a>`
    : `<form method="POST" action="/api/enrollments/${encodeURIComponent(opts.enrollmentId)}/steps/${encodeURIComponent(opts.stepId)}/complete" class="complete-step-form"><button type="submit" class="btn btn-primary btn-compact">Mark complete and continue</button></form>`;

  const durationStr = formatDuration(opts.estimatedDurationMinutes);

  const workspaceContent = `
    <article class="theory-step-content" role="region" aria-label="Theory Reading">
      <div class="reading-meta-bar">
        <span class="step-ordinal">${escapeHtml(opts.stepOrdinalText)}</span>
        <span>·</span>
        <span>Theory</span>
        ${!opts.isRequired ? '<span>·</span><span class="optional-tag">Optional</span>' : ''}
        ${durationStr ? `<span>·</span><span>${durationStr}</span>` : ''}
      </div>

      <h1 class="theory-title">${escapeHtml(opts.stepTitle)}</h1>

      <div class="reading-body markdown-prose">
        ${renderedBodyHtml}
      </div>

      <div class="reading-footer-quiet-action">
        <a href="/help?report=broken_exercise&stepId=${encodeURIComponent(opts.stepId)}&enrollmentId=${encodeURIComponent(opts.enrollmentId)}" class="report-issue-link btn-ghost btn-compact text-muted">
          Report issue
        </a>
      </div>
    </article>
  `;

  return { workspaceContent, taskActions };
}

export function renderTheoryStepPage(opts: TheoryStepPageOptions): string {
  const { workspaceContent, taskActions } = renderTheoryWorkspaceContent(opts);

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
    isPythonWorkspace: false,
    outlineContent: opts.outlineContent || '<p class="outline-empty">Outline available</p>',
    workspaceContent,
    previousStepUrl: opts.previousStepUrl,
    nextStepUrl: opts.nextStepUrl,
    taskActions,
    reportContext: {
      enrollmentId: opts.enrollmentId,
      stepId: opts.stepId,
      courseTitle: opts.courseTitle,
      lessonTitle: opts.lessonTitle,
      stepTitle: opts.stepTitle,
    },
  });
}
