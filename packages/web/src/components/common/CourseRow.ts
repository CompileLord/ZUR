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
    props.authorName ? `<span>${props.authorName}</span>` : null,
    props.level ? `<span>${props.level}</span>` : null,
    props.durationText ? `<span>${props.durationText}</span>` : null,
    props.nextStepTitle ? `<span>Next: ${props.nextStepTitle}</span>` : null,
  ].filter(Boolean).join(' · ');

  return `
    <article class="course-row" data-course-id="${props.id}">
      <div class="course-row-main">
        <div class="course-row-header">
          <a href="${props.actionHref}" class="course-row-title">${props.title}</a>
          ${props.statusBadge ? `
            <span class="status-badge ${props.statusBadge.status}">${props.statusBadge.label}</span>
          ` : ''}
        </div>
        <p class="course-row-description">${props.description}</p>
        <div class="course-row-meta tabular-nums">
          ${metadataParts}
        </div>
      </div>
      <div class="course-row-action">
        <a href="${props.actionHref}" class="btn btn-secondary btn-compact">${props.actionText || 'Open'}</a>
      </div>
    </article>
  `;
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
