import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAppShell } from '../../components/shells/AppShell.ts';
import { renderProgressLine } from '../../components/common/CourseRow.ts';
import { renderIcon, type IconName } from '../../components/common/icons.ts';
import { humanizeEnum, formatDuration } from '../../utils/formatters.ts';
import { getLastVisitedStep } from './learning-navigation.ts';

export interface EnrolledCourseModule {
  id: string;
  title: string;
  lessons: Array<{
    id: string;
    title: string;
    description?: string;
    steps: Array<{
      id: string;
      title: string;
      type: 'theory' | 'video' | 'quiz' | 'python';
      isRequired: boolean;
      estimatedDurationMinutes: number;
      isCompleted: boolean;
      isWaived: boolean;
      waiverReason?: string | null;
      isCurrent?: boolean;
    }>;
  }>;
}

export interface EnrolledCoursePageOptions {
  user: {
    id?: string;
    displayName: string;
    email: string;
    capabilities: ('student' | 'author' | 'admin')[];
  };
  userId?: string;
  courseVersionId?: string;
  enrollmentId: string;
  courseId: string;
  title: string;
  description: string;
  difficulty: string;
  estimatedDurationMinutes: number;
  pinnedVersionNumber: number;
  percentage: number;
  completedRequired: number;
  totalRequired: number;
  waivedRequired?: number;
  isCompleted: boolean;
  completedAt?: string | null;
  isArchived?: boolean;
  nextStepId?: string | null;
  modules: EnrolledCourseModule[];
}

function getStepIcon(type: 'theory' | 'video' | 'quiz' | 'python'): IconName {
  switch (type) {
    case 'theory':
      return 'file-text';
    case 'video':
      return 'video';
    case 'quiz':
      return 'list-checks';
    case 'python':
      return 'code';
    default:
      return 'file-text';
  }
}

export function renderEnrolledCoursePage(opts: EnrolledCoursePageOptions): string {
  opts = safeTemplateData(opts);
  const withoutOrdinal = (title: string, kind: 'Module' | 'Lesson') =>
    title.replace(new RegExp(`^${kind}\\s+\\d+\\s*:\\s*`, 'i'), '');
  const resumeUrl = opts.nextStepId
    ? `/learn/${opts.enrollmentId}/steps/${opts.nextStepId}`
    : null;

  // Completion summary banner (design §11 P11)
  let completionBannerHtml = '';
  if (opts.isCompleted) {
    const completedDateText = opts.completedAt
      ? `Completed on ${new Date(opts.completedAt).toLocaleDateString()}`
      : 'Completed';
    const waiverText =
      opts.waivedRequired && opts.waivedRequired > 0
        ? ` (${opts.waivedRequired} waived)`
        : '';

    completionBannerHtml = `
      <div class="completion-banner" role="region" aria-label="Course completion status">
        <div class="completion-header-row">
          <span class="status-badge success">Course complete</span>
          <span class="completion-date text-muted">${completedDateText}</span>
        </div>
        <p class="completion-stats">
          All <strong>${opts.completedRequired} of ${opts.totalRequired}</strong> required steps satisfied${waiverText}.
        </p>
      </div>
    `;
  }

  // Archived notice
  let archivedNoticeHtml = '';
  if (opts.isArchived) {
    archivedNoticeHtml = `
      <div class="status-banner info" role="note">
        <span>Archived — you can continue learning and practicing on your pinned version.</span>
      </div>
    `;
  }

  // Syllabus Tree / Lesson Rail (design.md §6)
  const syllabusHtml = `
    <div class="syllabus-container" role="region" aria-label="Course Syllabus">
      <h2 class="syllabus-heading">Course Syllabus</h2>

      <div class="syllabus-modules">
        ${opts.modules.map((mod, modIdx) => {
          const modTotal = mod.lessons.reduce((acc, l) => acc + l.steps.length, 0);
          const modCompleted = mod.lessons.reduce((acc, l) => acc + l.steps.filter((s) => s.isCompleted || s.isWaived).length, 0);
          return `
          <details class="module-section syllabus-module-card" data-module-id="${mod.id}" open>
            <summary class="module-heading-summary cursor-pointer select-none flex justify-between items-center mb-3">
              <h3 class="module-heading m-0">Module ${modIdx + 1}: ${withoutOrdinal(mod.title, 'Module')}</h3>
              <span class="module-completion-count text-xs text-muted font-mono">${modCompleted}/${modTotal} completed</span>
            </summary>

            <div class="module-lessons">
              ${mod.lessons.map((les, lesIdx) => {
                const uid = opts.userId || (opts.user as any)?.id;
                const lastVisitedId = uid && opts.courseVersionId ? getLastVisitedStep(uid, opts.enrollmentId, opts.courseVersionId, les.id) : null;
                const targetStep = (lastVisitedId && les.steps.find((s) => s.id === lastVisitedId)) || les.steps.find((s) => !s.isCompleted && !s.isWaived) || les.steps[0];
                const lessonTargetUrl = targetStep ? `/learn/${opts.enrollmentId}/steps/${targetStep.id}` : '#';
                const lesCompleted = les.steps.filter((s) => s.isCompleted || s.isWaived).length;
                return `
                <div class="lesson-subgroup" data-lesson-id="${les.id}">
                  <div class="lesson-header-row flex justify-between items-center mb-1">
                    <h4 class="lesson-subheading m-0">
                      <a href="${lessonTargetUrl}" class="hover:underline">Lesson ${lesIdx + 1}: ${withoutOrdinal(les.title, 'Lesson')}</a>
                    </h4>
                    <span class="lesson-progress-badge text-xs font-mono text-muted">${lesCompleted}/${les.steps.length}</span>
                  </div>
                  ${les.description ? `<p class="lesson-desc text-secondary">${les.description}</p>` : ''}

                  <ul class="lesson-steps-rail" role="list">
                    ${les.steps.map((stp) => {
                      let statusClass = 'pending';
                      let statusLabel = 'Not completed';

                      if (stp.isCompleted) {
                        statusClass = 'completed';
                        statusLabel = 'Completed';
                      } else if (stp.isWaived) {
                        statusClass = 'waived';
                        statusLabel = 'Waived';
                      } else if (stp.isCurrent) {
                        statusClass = 'current';
                        statusLabel = 'Current step';
                      }

                      const stepUrl = `/learn/${opts.enrollmentId}/steps/${stp.id}`;
                      const iconName = getStepIcon(stp.type);
                      const durationStr = formatDuration(stp.estimatedDurationMinutes);

                      return `
                        <li class="rail-item ${statusClass}" ${stp.isCurrent ? 'aria-current="step"' : ''}>
                          <div class="rail-marker-column" aria-hidden="true">
                            <span class="rail-marker">
                              ${stp.isCompleted ? renderIcon('check', { size: 10, strokeWidth: 2.5 }) : ''}
                            </span>
                            <span class="rail-line"></span>
                          </div>
                          <div class="rail-content">
                            <a href="${stepUrl}" class="rail-step-link">
                              <span class="rail-step-icon" aria-hidden="true">${renderIcon(iconName, { size: 15 })}</span>
                              <span class="rail-title">${stp.title}</span>
                              <span class="rail-step-meta">
                                <span class="sr-only">${statusLabel}. </span>
                                ${!stp.isRequired ? '<span class="optional-tag">Optional</span>' : ''}
                                ${durationStr ? `<span>${durationStr}</span>` : ''}
                                ${stp.isWaived ? '<span class="status-badge warning">Waived</span>' : ''}
                              </span>
                            </a>
                          </div>
                        </li>
                      `;
                    }).join('')}
                  </ul>
                </div>
              `;
            }).join('')}
            </div>
          </details>
        `;
      }).join('')}
      </div>
    </div>
  `;

  const durationStr = formatDuration(opts.estimatedDurationMinutes);

  const content = `
    <div class="enrolled-course-page">
      <div class="enrolled-course-container">
        ${archivedNoticeHtml}
        ${completionBannerHtml}

        <header class="course-plain-header">
          <div class="course-plain-meta">
            <span class="version-quiet-tag">Version ${opts.pinnedVersionNumber}</span>
            <span>·</span>
            <span>${humanizeEnum(opts.difficulty)}</span>
            ${durationStr ? `<span>·</span><span>${durationStr}</span>` : ''}
          </div>

          <h1 class="course-title">${opts.title}</h1>
          <p class="course-description">${opts.description}</p>

          <div class="course-progress-bar-row">
            ${renderProgressLine({
              satisfiedRequiredCount: opts.completedRequired,
              totalRequiredCount: opts.totalRequired,
              isCompleted: opts.isCompleted,
            })}
          </div>

          <div class="course-plain-actions">
            ${
              resumeUrl
                ? `
                  <a href="${resumeUrl}" class="btn btn-primary">
                    ${opts.isCompleted ? 'Review lessons' : opts.completedRequired > 0 ? 'Resume learning' : 'Start course'}
                  </a>
                `
                : ''
            }
          </div>
        </header>

        ${syllabusHtml}
      </div>
    </div>
  `;

  return renderAppShell({
    activePath: `/learn/${opts.enrollmentId}`,
    user: opts.user,
    currentMode: 'learn',
    headerTitle: opts.title,
    content,
  });
}
