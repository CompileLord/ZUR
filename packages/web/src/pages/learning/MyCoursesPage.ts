import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAppShell } from '../../components/shells/AppShell.ts';
import { renderDialog } from '../../components/common/Dialog.ts';
import { renderIcon } from '../../components/common/icons.ts';
import { humanizeEnum } from '../../utils/formatters.ts';
import { courseThumbStyle } from '../../utils/course-thumb.ts';

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

export type CourseFilter = 'in_progress' | 'completed' | 'all';

export interface MyCoursesPageOptions {
  user: {
    displayName: string;
    email: string;
    capabilities: ('student' | 'author' | 'admin')[];
  };
  activeFilter?: CourseFilter;
  courses: EnrolledCourseItem[];
  previousCourses?: EnrolledCourseItem[];
  leaveCourseDialogFor?: {
    courseId: string;
    courseTitle: string;
  } | null;
}

export function courseInitial(title: string): string {
  return (title.match(/[A-Za-z0-9]/)?.[0] || 'C').toUpperCase();
}

export function renderProgressRing(percent: number, label: string, size = 56): string {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  return `
    <div class="home-ring" style="--ring-size: ${size}px" role="img" aria-label="${label}">
      <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">
        <circle class="ring-track" cx="40" cy="40" r="${radius}" fill="none" stroke-width="8"></circle>
        <circle class="ring-value" cx="40" cy="40" r="${radius}" fill="none" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${(circumference * (1 - value / 100)).toFixed(2)}"
          transform="rotate(-90 40 40)"></circle>
      </svg>
      <span class="ring-percent" aria-hidden="true">${value}%</span>
    </div>
  `;
}

export function formatLastActivity(iso?: string, now: number = Date.now()): string {
  const then = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(then)) return '';
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 2) return 'Active just now';
  if (minutes < 60) return `Active ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Active ${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `Active ${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `Active ${months} mo ago` : 'Active over a year ago';
}

export function renderCourseThumb(seed: string, title: string, extraClass = ''): string {
  return `<span class="home-thumb ${extraClass}" style="${courseThumbStyle(seed)}" aria-hidden="true"><span class="home-thumb-initial">${courseInitial(title)}</span></span>`;
}

export function percentOf(c: { percentage?: number; completedRequired: number; totalRequired: number }): number {
  return c.totalRequired > 0
    ? Math.min(100, Math.round((c.completedRequired / c.totalRequired) * 100))
    : Math.min(100, Math.max(0, Math.round(c.percentage || 0)));
}

/** "Your courses" block of the Home page: filter chips, card grid, previous enrollments, leave dialog. */
export function renderYourCoursesSection(opts: MyCoursesPageOptions): string {
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

  const chip = (filter: CourseFilter, label: string, count: number) => `
    <a href="/learn?filter=${filter}" class="filter-chip ${activeFilter === filter ? 'active' : ''}" ${activeFilter === filter ? 'aria-current="true"' : ''}>
      ${label} (${count})
    </a>`;
  const chipsHtml = `
    <nav class="filter-chips" aria-label="Course status filters">
      ${chip('in_progress', 'In progress', activeCourses.filter((c) => !c.isCompleted).length)}
      ${chip('completed', 'Completed', activeCourses.filter((c) => c.isCompleted).length)}
      ${chip('all', 'All', activeCourses.length)}
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
      <div class="empty-state-panel home-empty" role="region" aria-label="Filter results">
        <p class="empty-message">${emptyMessage}</p>
        <a href="/courses" class="btn btn-secondary">Explore catalog</a>
      </div>
    `;
  } else {
    coursesListHtml = `
      <div class="home-course-grid" role="feed" aria-label="Enrolled courses">
        ${filteredCourses.map((c) => {
          const actionUrl = c.isCompleted
            ? `/learn/${c.id}`
            : (c.nextStepId ? `/learn/${c.id}/steps/${c.nextStepId}` : `/learn/${c.id}`);
          const percent = percentOf(c);
          const activity = formatLastActivity(c.updatedAt);

          return `
            <article class="home-course-card" data-enrollment-id="${c.id}">
              <a href="/learn/${c.id}" class="home-course-thumb-link" tabindex="-1" aria-hidden="true">${renderCourseThumb(c.courseId, c.courseTitle, 'home-thumb-card')}</a>
              <div class="home-course-body">
                <div class="home-course-head">
                  <div class="home-course-titles">
                    <a href="/learn/${c.id}" class="course-row-title">${c.courseTitle}</a>
                    <p class="home-course-meta">
                      <span>${humanizeEnum(c.difficulty)}</span>
                      <span class="version-quiet-meta">v${c.pinnedVersionNumber}</span>
                      <span class="sr-only">Version ${c.pinnedVersionNumber}</span>
                      ${activity ? `<span>${activity}</span>` : ''}
                    </p>
                  </div>
                  ${renderProgressRing(percent, `${percent}% complete: ${c.completedRequired} of ${c.totalRequired} required steps`, 52)}
                </div>
                ${c.isCompleted ? '<span class="status-badge success">Completed</span>' : ''}
                ${c.nextStepTitle && !c.isCompleted ? `<p class="next-step-indicator">Next: <strong>${c.nextStepTitle}</strong></p>` : ''}
                <div class="home-course-actions">
                  <a href="${actionUrl}" class="btn ${c.isCompleted ? 'btn-secondary' : 'btn-primary'} btn-compact">
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
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

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

  let dialogHtml = '';
  if (opts.leaveCourseDialogFor) {
    dialogHtml = renderDialog({
      isOpen: true,
      title: 'Leave course?',
      description: `Are you sure you want to leave "${opts.leaveCourseDialogFor.courseTitle}"? Your progress and completed steps will be saved, but this course will no longer appear on your Home page.`,
      confirmText: 'Leave course',
      cancelText: 'Cancel',
      isDestructive: true,
    });
  }

  return `
    <section class="home-courses" aria-labelledby="home-courses-heading">
      <div class="home-courses-head">
        <h2 id="home-courses-heading" class="section-title">Your courses</h2>
        ${chipsHtml}
      </div>
      ${coursesListHtml}
      ${previousSectionHtml}
      ${dialogHtml}
    </section>
  `;
}

/** Standalone courses list (the Home page composes renderYourCoursesSection with the Continue hero). */
export function renderMyCoursesPage(opts: MyCoursesPageOptions): string {
  opts = safeTemplateData(opts);
  const content = `
    <div class="home-page">
      <div class="home-container">
        <h1 class="page-title">Home</h1>
        ${renderYourCoursesSection(opts)}
      </div>
    </div>
  `;

  return renderAppShell({
    activePath: '/learn',
    user: opts.user,
    currentMode: 'learn',
    headerTitle: 'Home',
    content,
  });
}
