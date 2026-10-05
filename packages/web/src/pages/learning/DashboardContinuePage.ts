import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAppShell } from '../../components/shells/AppShell.ts';
import { renderProgressLine } from '../../components/common/CourseRow.ts';
import { humanizeEnum } from '../../utils/formatters.ts';

export interface DashboardContinuePageOptions {
  user: {
    displayName: string;
    email: string;
    capabilities: ('student' | 'author' | 'admin')[];
  };
  continueCourse?: {
    courseId: string;
    enrollmentId: string;
    title: string;
    description: string;
    pinnedVersionNumber: number;
    percentage: number;
    completedRequired: number;
    totalRequired: number;
    isCompleted: boolean;
    nextIncompleteStepId?: string | null;
    lastVisitedStepId?: string | null;
    nextStepTitle?: string;
    lessonTitle?: string;
  } | null;
  recentCourses?: Array<{
    courseId: string;
    enrollmentId: string;
    title: string;
    description: string;
    difficulty: string;
    percentage: number;
    isCompleted: boolean;
    status: string;
    nextStepId?: string | null;
  }>;
}

export function renderDashboardContinuePage(opts: DashboardContinuePageOptions): string {
  opts = safeTemplateData(opts);
  const hasEnrollments = Boolean(opts.continueCourse || (opts.recentCourses && opts.recentCourses.length > 0));

  let mainContentHtml = '';

  if (!hasEnrollments) {
    // First-time learner empty state (design §11 P09)
    mainContentHtml = `
      <section class="welcome-empty-panel" aria-label="Welcome to learning">
        <h2 class="welcome-title">Your next lesson starts here</h2>
        <p class="welcome-description">
          Enroll in a published course to begin coding, or open an invitation link shared by your instructor.
        </p>
        <div class="welcome-actions">
          <a href="/courses" class="btn btn-primary">Explore courses</a>
        </div>
      </section>
    `;
  } else if (opts.continueCourse && opts.continueCourse.isCompleted) {
    // All courses complete state (design §11 P09)
    mainContentHtml = `
      <section class="resume-hero-card completed-state" aria-label="Completed courses summary">
        <div class="resume-hero-badge">
          <span class="status-badge success">All courses complete</span>
        </div>
        <h2 class="resume-hero-title">Your courses are complete</h2>
        <p class="resume-hero-subtitle">
          You have satisfied all required steps in your enrolled courses. You can review past lessons or explore new topics.
        </p>
        <div class="resume-hero-actions">
          <a href="/learn/courses" class="btn btn-ghost btn-compact">Review courses</a>
          <a href="/courses" class="btn btn-primary">Explore courses</a>
        </div>
      </section>
    `;
  } else if (opts.continueCourse) {
    // Dominant resume panel (design §11 P09)
    const c = opts.continueCourse;
    const resumeStepId = c.nextIncompleteStepId || c.lastVisitedStepId;
    const resumeUrl = resumeStepId
      ? `/learn/${c.enrollmentId}/steps/${resumeStepId}`
      : `/learn/${c.enrollmentId}`;

    const stepLabel = c.nextStepTitle
      ? (c.lessonTitle ? `${c.lessonTitle} · ${c.nextStepTitle}` : c.nextStepTitle)
      : '';

    mainContentHtml = `
      <section class="resume-hero-card" aria-label="Resume current course">
        <span class="sr-only">Version ${c.pinnedVersionNumber}</span>
        <div class="resume-hero-header">
          <h2 class="resume-hero-title">${c.title}</h2>
        </div>
        ${stepLabel ? `
          <div class="resume-step-line">
            <span class="resume-step-context">${stepLabel}</span>
            <span class="sr-only">Next: <strong>${c.nextStepTitle}</strong></span>
          </div>
        ` : ''}

        <div class="resume-progress-container">
          ${renderProgressLine({
            satisfiedRequiredCount: c.completedRequired,
            totalRequiredCount: c.totalRequired,
            isCompleted: c.isCompleted,
          })}
        </div>

        <div class="resume-hero-actions">
          <a href="${resumeUrl}" class="btn btn-primary">
            Continue learning
          </a>
          <a href="/learn/${c.enrollmentId}" class="btn btn-ghost btn-compact text-secondary">
            Overview
          </a>
        </div>
      </section>
    `;
  }

  // Filter out the resume course from recent courses to avoid redundant duplicate
  const rawRecent = opts.recentCourses || [];
  const recentCourses = rawRecent.filter((rc) => {
    if (opts.continueCourse) {
      if (rc.courseId === opts.continueCourse.courseId || rc.enrollmentId === opts.continueCourse.enrollmentId) {
        return false;
      }
    }
    return true;
  });

  let recentCoursesHtml = '';
  if (recentCourses.length > 0) {
    recentCoursesHtml = `
      <section class="recent-courses-section" aria-label="Enrolled courses">
        <div class="section-header-row">
          <h3 class="section-title">Other courses</h3>
          <a href="/learn/courses" class="section-link">View all courses</a>
        </div>

        <div class="recent-courses-list">
          ${recentCourses.map((rc) => {
            const nextUrl = rc.nextStepId
              ? `/learn/${rc.enrollmentId}/steps/${rc.nextStepId}`
              : `/learn/${rc.enrollmentId}`;
            return `
              <article class="course-row compact" data-course-id="${rc.courseId}">
                <div class="course-row-main">
                  <div class="course-row-header">
                    <a href="/learn/${rc.enrollmentId}" class="course-row-title">${rc.title}</a>
                    ${rc.isCompleted ? '<span class="status-badge success">Completed</span>' : ''}
                  </div>
                  <div class="course-row-meta tabular-nums">
                    <span>${humanizeEnum(rc.difficulty)}</span>
                    <span>·</span>
                    <span>${rc.percentage}% complete</span>
                  </div>
                </div>
                <div class="course-row-action">
                  <a href="${nextUrl}" class="btn btn-ghost btn-compact">
                    ${rc.isCompleted ? 'Review' : 'Resume'}
                  </a>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  const content = `
    <div class="dashboard-page">
      <div class="dashboard-container">
        <h1 class="page-title">Continue learning</h1>
        ${mainContentHtml}
        ${recentCoursesHtml}
      </div>
    </div>
  `;

  return renderAppShell({
    activePath: '/learn',
    user: opts.user,
    currentMode: 'learn',
    headerTitle: 'Continue learning',
    content,
  });
}
