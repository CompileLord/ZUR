import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAppShell } from '../../components/shells/AppShell.ts';
import { renderProgressLine } from '../../components/common/CourseRow.ts';

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
    displayName: string;
    email: string;
    capabilities: ('student' | 'author' | 'admin')[];
  };
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
          <span class="completion-date">${completedDateText}</span>
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

  // Syllabus Tree / Lesson Rail
  const syllabusHtml = `
    <div class="syllabus-container" role="region" aria-label="Course Syllabus">
      <h2 class="syllabus-heading">Course Syllabus</h2>

      <div class="syllabus-modules">
        ${opts.modules.map((mod, modIdx) => `
          <div class="module-group" data-module-id="${mod.id}">
            <h3 class="module-title">Module ${modIdx + 1}: ${withoutOrdinal(mod.title, 'Module')}</h3>

            <div class="module-lessons">
              ${mod.lessons.map((les, lesIdx) => `
                <div class="lesson-group" data-lesson-id="${les.id}">
                  <h4 class="lesson-title">Lesson ${lesIdx + 1}: ${withoutOrdinal(les.title, 'Lesson')}</h4>
                  ${les.description ? `<p class="lesson-desc">${les.description}</p>` : ''}

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

                      const typeDisplay = stp.type.charAt(0).toUpperCase() + stp.type.slice(1);
                      const stepUrl = `/learn/${opts.enrollmentId}/steps/${stp.id}`;

                      return `
                        <li class="rail-item ${statusClass}" ${stp.isCurrent ? 'aria-current="step"' : ''}>
                          <div class="rail-marker-column" aria-hidden="true">
                            <span class="rail-marker"></span>
                            <span class="rail-line"></span>
                          </div>
                          <div class="rail-content">
                            <a href="${stepUrl}" class="rail-step-link">
                              <span class="rail-title">${stp.title}</span>
                              <span class="rail-step-meta">
                                <span class="sr-only">${statusLabel}. </span>
                                <span>${typeDisplay}</span>
                                <span>·</span>
                                <span>${stp.isRequired ? 'Required' : 'Optional'}</span>
                                <span>·</span>
                                <span>${stp.estimatedDurationMinutes}m</span>
                                ${stp.isWaived ? '<span class="status-badge warning">Waived</span>' : ''}
                                ${stp.isCompleted ? '<span class="status-badge success">✓</span>' : ''}
                              </span>
                            </a>
                          </div>
                        </li>
                      `;
                    }).join('')}
                  </ul>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const content = `
    <div class="enrolled-course-page">
      <div class="enrolled-course-container">
        ${archivedNoticeHtml}
        ${completionBannerHtml}

        <header class="course-header-card">
          <div class="course-header-meta">
            <span class="version-tag">Version ${opts.pinnedVersionNumber}</span>
            <span>·</span>
            <span>${opts.difficulty}</span>
            ${opts.estimatedDurationMinutes > 0 ? `<span>·</span><span>~${opts.estimatedDurationMinutes} mins</span>` : ''}
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

          <div class="course-header-actions">
            ${
              resumeUrl
                ? `
                  <a href="${resumeUrl}" class="btn btn-primary btn-large">
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
