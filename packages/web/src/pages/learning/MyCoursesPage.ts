import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAppShell } from '../../components/shells/AppShell.ts';
import { renderProgressLine } from '../../components/common/CourseRow.ts';
import { renderDialog } from '../../components/common/Dialog.ts';
import { renderIcon } from '../../components/common/icons.ts';
import { humanizeEnum } from '../../utils/formatters.ts';

export interface EnrolledCourseItem {
  id: string; // enrollmentId
  courseId: string;
  courseTitle: string;
  courseDescription: string;
  difficulty: string;
  pinnedVersionNumber: number;
  status: 'active' | 'left' | 'revoked';
  percentage: number;
  completedRequired: number;
  totalRequired: number;
  isCompleted: boolean;
  nextStepId?: string | null;
  nextStepTitle?: string | null;
  updatedAt: string;
}

export interface MyCoursesPageOptions {
  user: {
    displayName: string;
    email: string;
    capabilities: ('student' | 'author' | 'admin')[];
  };
  activeFilter?: 'in_progress' | 'completed' | 'all';
  courses: EnrolledCourseItem[];
  previousCourses?: EnrolledCourseItem[];
  leaveCourseDialogFor?: {
    courseId: string;
    courseTitle: string;
  } | null;
}

export function renderMyCoursesPage(opts: MyCoursesPageOptions): string {
  opts = safeTemplateData(opts);
  const activeFilter = opts.activeFilter || 'in_progress';
  const activeCourses = opts.courses.filter((c) => c.status === 'active');
  const previousCourses =
    opts.previousCourses || opts.courses.filter((c) => c.status === 'left' || c.status === 'revoked');

  let filteredCourses: EnrolledCourseItem[] = [];
  if (activeFilter === 'in_progress') {
    filteredCourses = activeCourses.filter((c) => !c.isCompleted);
  } else if (activeFilter === 'completed') {
    filteredCourses = activeCourses.filter((c) => c.isCompleted);
  } else {
    filteredCourses = activeCourses;
  }

  // Filter tabs
  const tabsHtml = `
    <nav class="tabs-nav" aria-label="Course status filters">
      <a href="/learn/courses?filter=in_progress" class="tab-link ${activeFilter === 'in_progress' ? 'active' : ''}" aria-selected="${activeFilter === 'in_progress'}">
        In progress (${activeCourses.filter((c) => !c.isCompleted).length})
      </a>
      <a href="/learn/courses?filter=completed" class="tab-link ${activeFilter === 'completed' ? 'active' : ''}" aria-selected="${activeFilter === 'completed'}">
        Completed (${activeCourses.filter((c) => c.isCompleted).length})
      </a>
      <a href="/learn/courses?filter=all" class="tab-link ${activeFilter === 'all' ? 'active' : ''}" aria-selected="${activeFilter === 'all'}">
        All (${activeCourses.length})
      </a>
    </nav>
  `;

  let coursesListHtml = '';
  if (filteredCourses.length === 0) {
    let emptyMessage = 'No courses in progress.';
    if (activeFilter === 'completed') {
      emptyMessage = 'No completed courses yet. Keep learning to finish your enrolled courses!';
    } else if (activeFilter === 'all' && activeCourses.length === 0) {
      emptyMessage = 'You are not enrolled in any courses yet.';
    }

    coursesListHtml = `
      <div class="empty-state-panel" role="region" aria-label="Filter results">
        <p class="empty-message">${emptyMessage}</p>
        <a href="/courses" class="btn btn-secondary">Explore catalog</a>
      </div>
    `;
  } else {
    // Flat rows, no card-in-card
    coursesListHtml = `
      <div class="enrolled-courses-flat-list" role="feed" aria-label="Enrolled courses">
        ${filteredCourses.map((c) => {
          const actionUrl = c.isCompleted
            ? `/learn/${c.id}`
            : (c.nextStepId ? `/learn/${c.id}/steps/${c.nextStepId}` : `/learn/${c.id}`);

          return `
            <article class="enrolled-course-flat-row" data-enrollment-id="${c.id}">
              <div class="course-row-info">
                <div class="course-row-title-line">
                  <a href="/learn/${c.id}" class="course-row-title">${c.courseTitle}</a>
                  <span class="version-quiet-meta">v${c.pinnedVersionNumber}</span>
                  <span class="sr-only">Version ${c.pinnedVersionNumber}</span>
                  <span class="difficulty-quiet-meta">${humanizeEnum(c.difficulty)}</span>
                  ${c.isCompleted ? '<span class="status-badge success">Completed</span>' : ''}
                </div>

                <div class="course-row-progress-block">
                  ${renderProgressLine({
                    satisfiedRequiredCount: c.completedRequired,
                    totalRequiredCount: c.totalRequired,
                    isCompleted: c.isCompleted,
                  })}
                </div>

                ${c.nextStepTitle ? `<p class="next-step-indicator">Next: <strong>${c.nextStepTitle}</strong></p>` : ''}
              </div>

              <div class="course-row-actions">
                <a href="${actionUrl}" class="btn btn-secondary btn-compact">
                  ${c.isCompleted ? 'Review course' : 'Resume'}
                </a>

                <div class="row-overflow-wrapper">
                  <details class="row-overflow-menu">
                    <summary class="btn-icon btn-compact overflow-trigger" aria-label="More options for ${c.courseTitle}">
                      ${renderIcon('more-horizontal', { size: 16 })}
                    </summary>
                    <div class="overflow-dropdown">
                      <button type="button" class="overflow-menu-item leave-course-trigger text-danger" data-course-id="${c.courseId}" data-course-title="${c.courseTitle}">
                        ${renderIcon('logout', { size: 14 })}
                        <span>Leave course</span>
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  // Previous enrollments section (left/revoked)
  let previousSectionHtml = '';
  if (previousCourses.length > 0) {
    previousSectionHtml = `
      <section class="previous-enrollments-section" aria-label="Previous enrollments">
        <h2 class="section-heading">Previous enrollments</h2>
        <div class="previous-courses-list">
          ${previousCourses.map((c) => `
            <div class="previous-course-row" data-enrollment-id="${c.id}">
              <div class="previous-course-info">
                <span class="previous-title">${c.courseTitle}</span>
                <span class="status-badge ${c.status === 'revoked' ? 'danger' : 'neutral'}">
                  ${c.status === 'revoked' ? 'Access revoked' : 'Left course'}
                </span>
                <span class="previous-note">
                  ${
                    c.status === 'revoked'
                      ? 'Reinstatement by the course instructor is required to rejoin.'
                      : 'Your progress has been preserved. You can rejoin this course at any time.'
                  }
                </span>
              </div>
              <div class="previous-course-action">
                ${
                  c.status === 'left'
                    ? `
                      <form method="POST" action="/api/courses/${c.courseId}/enroll">
                        <button type="submit" class="btn btn-secondary btn-compact">Rejoin course</button>
                      </form>
                    `
                    : ''
                }
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  // Leave course confirmation dialog
  let dialogHtml = '';
  if (opts.leaveCourseDialogFor) {
    dialogHtml = renderDialog({
      isOpen: true,
      title: 'Leave course?',
      description: `Are you sure you want to leave "${opts.leaveCourseDialogFor.courseTitle}"? Your progress and completed steps will be saved, but this course will no longer appear on your continue dashboard.`,
      confirmText: 'Leave course',
      cancelText: 'Cancel',
      isDestructive: true,
    });
  }

  const content = `
    <div class="my-courses-page">
      <div class="my-courses-container">
        <header class="page-header">
          <h1 class="page-title">My courses</h1>
        </header>

        ${tabsHtml}
        ${coursesListHtml}
        ${previousSectionHtml}
        ${dialogHtml}
      </div>
    </div>
  `;

  return renderAppShell({
    activePath: '/learn/courses',
    user: opts.user,
    currentMode: 'learn',
    headerTitle: 'My courses',
    content,
  });
}
