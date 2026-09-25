export interface CourseRowProps {
  id: string;
  title: string;
  description: string;
  authorName?: string;
  level?: string;
  durationText?: string;
  nextStepTitle?: string;
  actionText?: string;
  actionHref: string;
  statusBadge?: { status: 'success' | 'warning' | 'danger' | 'info'; label: string };
}

export function renderCourseRow(props: CourseRowProps): string {
  const metadataParts = [
    props.authorName ? `<span>${escapeHtml(props.authorName)}</span>` : null,
    props.level ? `<span>${escapeHtml(props.level)}</span>` : null,
    props.durationText ? `<span>${escapeHtml(props.durationText)}</span>` : null,
    props.nextStepTitle ? `<span>Next: ${escapeHtml(props.nextStepTitle)}</span>` : null,
  ].filter(Boolean).join(' · ');

  return `
    <article class="course-row" data-course-id="${escapeHtml(props.id)}">
      <div class="course-row-main">
        <div class="course-row-header">
          <a href="${escapeHtml(props.actionHref)}" class="course-row-title">${escapeHtml(props.title)}</a>
          ${props.statusBadge ? `
            <span class="status-badge ${escapeHtml(props.statusBadge.status)}">${escapeHtml(props.statusBadge.label)}</span>
          ` : ''}
        </div>
        <p class="course-row-description">${escapeHtml(props.description)}</p>
        <div class="course-row-meta tabular-nums">
          ${metadataParts}
        </div>
      </div>
      <div class="course-row-action">
        <a href="${escapeHtml(props.actionHref)}" class="btn btn-secondary btn-compact">${escapeHtml(props.actionText || 'Open')}</a>
      </div>
    </article>
  `;
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface ProgressLineProps {
  satisfiedRequiredCount: number;
  totalRequiredCount: number;
  isCompleted?: boolean;
}

export function renderProgressLine(props: ProgressLineProps): string {
  const total = Math.max(props.totalRequiredCount, 1);
  const percentage = props.isCompleted
    ? 100
    : Math.floor((props.satisfiedRequiredCount / total) * 100);

  const text = `${props.satisfiedRequiredCount} of ${props.totalRequiredCount} required steps`;

  return `
    <div
      class="progress-container"
      role="progressbar"
      aria-valuenow="${props.satisfiedRequiredCount}"
      aria-valuemin="0"
      aria-valuemax="${props.totalRequiredCount}"
      aria-valuetext="${text}"
    >
      <div class="progress-track" aria-hidden="true">
        <div class="progress-fill" style="width: ${percentage}%"></div>
      </div>
      <span class="progress-label tabular-nums">${text}</span>
    </div>
  `;
}
