export interface LessonRailStep {
  id: string;
  ordinal: number;
  title: string;
  type: 'theory' | 'video' | 'quiz' | 'python';
  isCurrent: boolean;
  isCompleted: boolean;
  isWaived?: boolean;
  isRequired: boolean;
  href?: string;
}

export interface LessonRailProps {
  steps: LessonRailStep[];
}

export function renderLessonRail(props: LessonRailProps): string {
  const stepsHtml = props.steps
    .map((step) => {
      let stateClass = 'pending';
      let stateAccessibleText = 'Not started';

      if (step.isCompleted) {
        stateClass = 'completed';
        stateAccessibleText = 'Completed';
      } else if (step.isWaived) {
        stateClass = 'waived';
        stateAccessibleText = 'Waived';
      } else if (step.isCurrent) {
        stateClass = 'current';
        stateAccessibleText = 'Current step';
      }

      const ariaCurrent = step.isCurrent ? 'aria-current="step"' : '';
      const typeLabel = step.type.charAt(0).toUpperCase() + step.type.slice(1);
      const contentInner = `
        <span class="rail-title">${escapeHtml(step.title)}</span>
        <span class="rail-step-meta">
          <span class="sr-only">${stateAccessibleText}. </span>
          ${typeLabel} ${step.isRequired ? '· Required' : '· Optional'}
        </span>
      `;

      return `
        <li class="rail-item ${stateClass}" ${ariaCurrent}>
          <div class="rail-marker-column" aria-hidden="true">
            <span class="rail-marker"></span>
            <span class="rail-line"></span>
          </div>
          <div class="rail-content">
            ${
              step.href
                ? `<a href="${escapeHtml(step.href)}" class="rail-step-link">${contentInner}</a>`
                : `<div class="rail-step-body">${contentInner}</div>`
            }
          </div>
        </li>
      `;
    })
    .join('');

  return `
    <nav class="lesson-rail-container" aria-label="Lesson Progress">
      <ol class="lesson-rail">
        ${stepsHtml}
      </ol>
    </nav>
  `;
}
import { escapeHtml } from 'zur-shared';
