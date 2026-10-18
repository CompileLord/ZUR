import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAppShell } from '../../components/shells/AppShell.ts';
import {
  renderYourCoursesSection,
  renderProgressRing,
  renderCourseThumb,
  percentOf,
  type CourseFilter,
  type EnrolledCourseItem,
} from './MyCoursesPage.ts';

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
  /** Full enrollment list (from /api/student/courses). Falls back to continueCourse + recentCourses. */
  courses?: EnrolledCourseItem[];
  previousCourses?: EnrolledCourseItem[];
  activeFilter?: CourseFilter;
}

export function renderDashboardContinuePage(opts: DashboardContinuePageOptions): string {
  opts = safeTemplateData(opts);
  const c = opts.continueCourse || null;

  let courses = opts.courses;
  if (!courses) {
    courses = [];
    if (c) {
      courses.push({
        id: c.enrollmentId, courseId: c.courseId, courseTitle: c.title, courseDescription: c.description,
        difficulty: '', pinnedVersionNumber: c.pinnedVersionNumber, status: 'active', percentage: c.percentage,
        completedRequired: c.completedRequired, totalRequired: c.totalRequired, isCompleted: c.isCompleted,
        nextStepId: c.nextIncompleteStepId || c.lastVisitedStepId, nextStepTitle: c.nextStepTitle, updatedAt: '',
      });
    }
    for (const rc of opts.recentCourses || []) {
      if (c && (rc.courseId === c.courseId || rc.enrollmentId === c.enrollmentId)) continue;
      courses.push({
        id: rc.enrollmentId, courseId: rc.courseId, courseTitle: rc.title, courseDescription: rc.description,
        difficulty: rc.difficulty, pinnedVersionNumber: 1, status: 'active', percentage: rc.percentage,
        completedRequired: 0, totalRequired: 0, isCompleted: rc.isCompleted, nextStepId: rc.nextStepId, updatedAt: '',
      });
    }
  }
  const hasEnrollments = Boolean(c) || courses.length > 0 || (opts.previousCourses?.length ?? 0) > 0;

  let heroHtml = '';
  if (!hasEnrollments) {
    heroHtml = `
      <section class="welcome-empty-panel home-welcome" aria-label="Welcome to learning">
        <h2 class="welcome-title">Your next lesson starts here</h2>
        <p class="welcome-description">
          Enroll in a published course to begin coding, or open an invitation link shared by your instructor.
        </p>
        <div class="welcome-actions">
          <a href="/courses" class="btn btn-primary">Explore courses</a>
        </div>
      </section>
    `;
  } else if (c && c.isCompleted) {
    heroHtml = `
      <section class="home-hero completed-state" aria-label="Completed courses summary">
        ${renderCourseThumb(c.courseId, c.title, 'home-thumb-hero')}
        <div class="home-hero-main">
          <span class="status-badge success">All courses complete</span>
          <h2 class="home-hero-title">Your courses are complete</h2>
          <p class="home-hero-step">Review past lessons or explore new topics.</p>
        </div>
        <div class="home-hero-side">
          <a href="/courses" class="btn btn-primary home-hero-cta">Explore courses</a>
          <a href="/learn?filter=completed" class="btn btn-ghost btn-compact">Review courses</a>
        </div>
      </section>
    `;
  } else if (c) {
    const resumeStepId = c.nextIncompleteStepId || c.lastVisitedStepId;
    const resumeUrl = resumeStepId ? `/learn/${c.enrollmentId}/steps/${resumeStepId}` : `/learn/${c.enrollmentId}`;
    const stepLabel = c.nextStepTitle
      ? (c.lessonTitle ? `${c.lessonTitle} · ${c.nextStepTitle}` : c.nextStepTitle)
      : '';
    const percent = percentOf(c);
    heroHtml = `
      <section class="home-hero" aria-label="Resume current course">
        <span class="sr-only">Version ${c.pinnedVersionNumber}</span>
        ${renderCourseThumb(c.courseId, c.title, 'home-thumb-hero')}
        <div class="home-hero-main">
          <span class="home-hero-eyebrow">Continue learning</span>
          <h2 class="home-hero-title"><a href="/learn/${c.enrollmentId}">${c.title}</a></h2>
          ${stepLabel ? `
            <p class="home-hero-step">${stepLabel}</p>
            <span class="sr-only">Next: <strong>${c.nextStepTitle}</strong></span>
          ` : ''}
        </div>
        <div class="home-hero-side">
          ${renderProgressRing(percent, `${percent}% complete: ${c.completedRequired} of ${c.totalRequired} required steps`, 84)}
          <a href="${resumeUrl}" class="btn btn-primary home-hero-cta">Continue</a>
        </div>
      </section>
    `;
  }

  const coursesHtml = hasEnrollments
    ? renderYourCoursesSection({
        user: opts.user,
        courses,
        previousCourses: opts.previousCourses,
        activeFilter: opts.activeFilter || (opts.courses ? 'in_progress' : 'all'),
      })
    : '';

  const content = `
    <div class="home-page">
      <div class="home-container">
        <h1 class="page-title">Home</h1>
        ${heroHtml}
        ${coursesHtml}
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
