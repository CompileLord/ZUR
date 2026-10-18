import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAppShell } from '../../components/shells/AppShell.ts';
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

  const isSatisfied = (s: { isCompleted: boolean; isWaived: boolean }) => s.isCompleted || s.isWaived;
  const allSteps = opts.modules.flatMap((m) => m.lessons.flatMap((l) => l.steps));
  const nextStep = (opts.nextStepId && allSteps.find((s) => s.id === opts.nextStepId)) || null;
  const currentModuleIdx = (() => {
    const byCurrent = opts.modules.findIndex((m) => m.lessons.some((l) => l.steps.some((s) => s.isCurrent)));
    if (byCurrent >= 0) return byCurrent;
    const byNext = opts.nextStepId ? opts.modules.findIndex((m) => m.lessons.some((l) => l.steps.some((s) => s.id === opts.nextStepId))) : -1;
    if (byNext >= 0) return byNext;
    const byOpen = opts.modules.findIndex((m) => m.lessons.some((l) => l.steps.some((s) => !isSatisfied(s))));
    return byOpen >= 0 ? byOpen : 0;
  })();

  const percent = opts.totalRequired > 0
    ? Math.min(100, Math.round((opts.completedRequired / opts.totalRequired) * 100))
    : Math.min(100, Math.max(0, Math.round(opts.percentage || 0)));
  const ringRadius = 34;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringHtml = `
    <div class="course-progress-ring" role="img" aria-label="${percent}% complete: ${opts.completedRequired} of ${opts.totalRequired} required steps">
      <svg viewBox="0 0 80 80" width="88" height="88" aria-hidden="true" focusable="false">
        <circle class="ring-track" cx="40" cy="40" r="${ringRadius}" fill="none" stroke-width="7"></circle>
        <circle class="ring-value" cx="40" cy="40" r="${ringRadius}" fill="none" stroke-width="7" stroke-linecap="round"
          stroke-dasharray="${ringCircumference.toFixed(2)}" stroke-dashoffset="${(ringCircumference * (1 - percent / 100)).toFixed(2)}"
          transform="rotate(-90 40 40)"></circle>
      </svg>
      <span class="ring-percent">${percent}%</span>
    </div>
  `;

  const resumeLabel = opts.isCompleted ? 'Review lessons' : opts.completedRequired > 0 ? 'Resume learning' : 'Start course';

  // Syllabus Tree / Lesson Rail (design.md §6)
  const syllabusHtml = `
    <div class="syllabus-container" role="region" aria-label="Course Syllabus">
      <div class="syllabus-modules">
        ${opts.modules.map((mod, modIdx) => {
          const modTotal = mod.lessons.reduce((acc, l) => acc + l.steps.length, 0);
          const modCompleted = mod.lessons.reduce((acc, l) => acc + l.steps.filter(isSatisfied).length, 0);
          const modDone = modTotal > 0 && modCompleted === modTotal;
          return `
          <details class="module-section syllabus-module-card${modDone ? ' is-done' : ''}" data-module-id="${mod.id}"${modIdx === currentModuleIdx ? ' open' : ''}>
            <summary class="module-heading-summary">
              <span class="module-chevron" aria-hidden="true">${renderIcon('chevron-right', { size: 16 })}</span>
              <h3 class="module-heading">Module ${modIdx + 1}: ${withoutOrdinal(mod.title, 'Module')}</h3>
              <span class="module-completion-count progress-chip${modDone ? ' done' : ''}" aria-label="${modCompleted} of ${modTotal} steps completed">${modDone ? renderIcon('check', { size: 12, strokeWidth: 2.5 }) : ''}${modCompleted}/${modTotal}</span>
            </summary>

            <div class="module-lessons">
              ${mod.lessons.map((les, lesIdx) => {
                const uid = opts.userId || (opts.user as any)?.id;
                const lastVisitedId = uid && opts.courseVersionId ? getLastVisitedStep(uid, opts.enrollmentId, opts.courseVersionId, les.id) : null;
                const targetStep = (lastVisitedId && les.steps.find((s) => s.id === lastVisitedId)) || les.steps.find((s) => !isSatisfied(s)) || les.steps[0];
                const lessonTargetUrl = targetStep ? `/learn/${opts.enrollmentId}/steps/${targetStep.id}` : '#';
                const lesCompleted = les.steps.filter(isSatisfied).length;
                const lesDone = les.steps.length > 0 && lesCompleted === les.steps.length;
                return `
                <div class="lesson-subgroup" data-lesson-id="${les.id}">
                  <div class="lesson-header-row">
                    <h4 class="lesson-subheading">
                      <a href="${lessonTargetUrl}">Lesson ${lesIdx + 1}: ${withoutOrdinal(les.title, 'Lesson')}</a>
                    </h4>
                    <span class="lesson-progress-badge progress-chip${lesDone ? ' done' : ''}" aria-label="${lesCompleted} of ${les.steps.length} steps completed">${lesCompleted}/${les.steps.length}</span>
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
                          <div class="rail-content">
                            <a href="${stepUrl}" class="rail-step-link">
                              <span class="rail-marker" aria-hidden="true">
                                ${stp.isCompleted ? renderIcon('check', { size: 12, strokeWidth: 3 }) : ''}
                              </span>
                              <span class="rail-step-icon" aria-hidden="true">${renderIcon(iconName, { size: 16 })}</span>
                              <span class="rail-title">${stp.title}</span>
                              <span class="rail-step-meta">
                                <span class="sr-only">${statusLabel}. </span>
                                ${!stp.isRequired ? '<span class="optional-tag">Optional</span>' : ''}
                                ${durationStr ? `<span class="rail-duration">${durationStr}</span>` : ''}
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
          ${ringHtml}
          <div class="course-header-main">
            <div class="course-plain-meta">
              <span class="version-quiet-tag">Version ${opts.pinnedVersionNumber}</span>
              <span>·</span>
              <span>${humanizeEnum(opts.difficulty)}</span>
              ${durationStr ? `<span>·</span><span>${durationStr}</span>` : ''}
            </div>

            <h1 class="course-title">${opts.title}</h1>
            ${opts.description ? `<p class="course-description">${opts.description}</p>` : ''}
            <p class="course-progress-summary">${opts.completedRequired} of ${opts.totalRequired} required steps complete</p>
          </div>
        </header>

        ${
          resumeUrl
            ? `
              <div class="course-plain-actions course-resume-bar">
                <div class="resume-bar-text">
                  <span class="resume-bar-label">${opts.isCompleted ? 'Course complete' : 'Up next'}</span>
                  ${nextStep && !opts.isCompleted ? `<span class="resume-bar-step">${nextStep.title}</span>` : ''}
                </div>
                <a href="${resumeUrl}" class="btn btn-primary">${resumeLabel}</a>
              </div>
            `
            : ''
        }

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
