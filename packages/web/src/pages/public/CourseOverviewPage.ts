import { renderLessonRail } from '../../components/common/LessonRail.ts';
import { renderSafeDenialPage } from '../status/SafeDenialPage.ts';

export interface OverviewStepItem {
  id: string;
  title: string;
  type: string;
  position: number;
  isRequired: boolean;
  estimatedDurationMinutes: number;
}

export interface OverviewLessonItem {
  id: string;
  title: string;
  description: string;
  position: number;
  stepCounts: {
    theory: number;
    video: number;
    quiz: number;
    python: number;
    total: number;
  };
  steps: OverviewStepItem[];
}

export interface OverviewModuleItem {
  id: string;
  title: string;
  position: number;
  lessons: OverviewLessonItem[];
}

export interface CourseOverviewData {
  course: {
    id: string;
    title: string;
    description: string;
    categoryId?: string;
    categoryName?: string;
    tags?: string[];
    difficulty?: string;
    language?: string;
    learningOutcomes?: string[];
    prerequisites?: string;
    estimatedDurationMinutes?: number;
    visibility?: 'public' | 'unlisted' | 'private';
    enrollmentPolicy?: 'open' | 'invitation_only';
    publicationStatus?: 'draft' | 'published' | 'archived';
    isSuspended?: boolean;
    authorName?: string;
    currentVersionId?: string;
    versionNumber?: number;
    updatedAt?: string;
  };
  syllabus: OverviewModuleItem[];
  enrollmentStatus: {
    isEnrolled: boolean;
    enrollmentId?: string;
    status: string | null;
  };
  isEmailVerified: boolean;
}

export interface CourseOverviewPageProps {
  data?: CourseOverviewData | null;
  currentUser?: { id: string; email: string; displayName: string } | null;
  isLoading?: boolean;
  error?: string | null;
  isServiceError?: boolean;
  isEnrolling?: boolean;
}

export function renderCourseOverviewPage(props: CourseOverviewPageProps): string {
  const { data, currentUser, isLoading, error, isServiceError, isEnrolling } = props;

  if (isLoading) {
    return `
      <div class="container py-12" aria-busy="true">
        <div class="loading-skeleton max-w-reading">
          <div class="skeleton-line skeleton-title mb-4"></div>
          <div class="skeleton-line skeleton-body mb-2"></div>
          <div class="skeleton-line skeleton-body w-3/4 mb-8"></div>
        </div>
      </div>
    `;
  }

  if (isServiceError) {
    return `
      <div class="container py-12">
        <div class="state-container state-service-failure max-w-reading mx-auto" role="alert">
          <div class="empty-icon text-warning text-3xl mb-3" aria-hidden="true">⚠</div>
          <h2 class="state-heading text-lg font-semibold mb-2">Temporary connection issue</h2>
          <p class="state-message text-secondary text-sm mb-6">
            We could not reach the server to load this course overview. Please check your network and try again.
          </p>
          <div class="state-actions flex items-center justify-center gap-3">
            <button type="button" class="btn btn-primary btn-compact" data-action="retry">Try again</button>
            <a href="/courses" class="btn btn-secondary btn-compact">Browse courses</a>
          </div>
        </div>
      </div>
    `;
  }

  if (error || !data) {
    return renderSafeDenialPage({ type: 'not-found' });
  }

  const { course, syllabus, enrollmentStatus, isEmailVerified } = data;

  const isSuspended = Boolean(course.isSuspended);
  const isArchived = course.publicationStatus === 'archived';
  const isRevoked = enrollmentStatus.status === 'revoked';
  const isEnrolled = enrollmentStatus.isEnrolled && enrollmentStatus.status === 'active';
  const isInvitationOnly = course.enrollmentPolicy === 'invitation_only';
  const isSignedIn = Boolean(currentUser);

  // Determine Primary CTA button/banner
  let primaryActionHtml = '';
  if (isSuspended) {
    primaryActionHtml = `
      <div class="banner banner-warning p-4 rounded-md" role="status">
        <h3 class="text-sm font-semibold mb-1">Course unavailable</h3>
        <p class="text-xs text-secondary">This course has been suspended by administration. Learning and enrollment are temporarily disabled.</p>
      </div>
    `;
  } else if (isRevoked) {
    primaryActionHtml = `
      <div class="banner banner-danger p-4 rounded-md" role="alert">
        <h3 class="text-sm font-semibold mb-1">Access revoked</h3>
        <p class="text-xs text-secondary">Your access to this course has been removed. Reinstatement by the course owner is required.</p>
      </div>
    `;
  } else if (isEnrolled) {
    primaryActionHtml = `
      <a href="/learn" class="btn btn-primary w-full">
        Continue learning
      </a>
    `;
  } else if (isArchived) {
    primaryActionHtml = `
      <div class="banner banner-info p-4 rounded-md" role="status">
        <h3 class="text-sm font-semibold mb-1">Archived course</h3>
        <p class="text-xs text-secondary">This course is archived and no longer accepts new student enrollments.</p>
      </div>
    `;
  } else if (!isSignedIn) {
    primaryActionHtml = `
      <a href="/sign-in?returnTo=${encodeURIComponent(`/courses/${course.id}`)}" class="btn btn-primary w-full">
        Sign in to enroll
      </a>
    `;
  } else if (!isEmailVerified) {
    primaryActionHtml = `
      <div class="flex flex-col gap-2">
        <a href="/verify-email" class="btn btn-warning w-full">
          Verify email to enroll
        </a>
        <p class="text-xs text-muted text-center">Email verification is required before enrolling.</p>
      </div>
    `;
  } else if (isInvitationOnly) {
    primaryActionHtml = `
      <div class="banner banner-info p-4 rounded-md" role="status">
        <h3 class="text-sm font-semibold mb-1">Invitation required</h3>
        <p class="text-xs text-secondary">This course requires an invitation link from the teacher to enroll.</p>
      </div>
    `;
  } else {
    // Eligible to enroll (open enrollment)
    primaryActionHtml = `
      <button
        type="button"
        id="btn-enroll-course"
        class="btn btn-primary w-full"
        ${isEnrolling ? 'disabled aria-disabled="true"' : ''}
      >
        ${isEnrolling ? 'Enrolling…' : 'Enroll in course'}
      </button>
    `;
  }

  // Metadata items
  const metaParts = [
    course.authorName ? `<span>Teacher: ${escapeHtml(course.authorName)}</span>` : null,
    course.difficulty ? `<span>Level: ${escapeHtml(capitalize(course.difficulty))}</span>` : null,
    course.language ? `<span>Language: ${escapeHtml(course.language.toUpperCase())}</span>` : null,
    course.estimatedDurationMinutes ? `<span>Duration: ~${Number(course.estimatedDurationMinutes)} mins</span>` : null,
    course.versionNumber ? `<span>Version ${Number(course.versionNumber)}</span>` : null,
  ].filter(Boolean).join(' · ');

  // Learning Outcomes
  const outcomes = course.learningOutcomes || [];
  const outcomesHtml = outcomes.length > 0
    ? `
      <section class="course-outcomes-section mb-10" aria-labelledby="outcomes-heading">
        <h2 id="outcomes-heading" class="section-title text-lg font-semibold mb-4">What you will learn</h2>
        <ul class="outcomes-list flex flex-col gap-2.5 list-none p-0">
          ${outcomes.map((o) => `
            <li class="flex items-start gap-3 text-secondary text-sm">
              <span class="text-accent text-base leading-none font-bold" aria-hidden="true">✓</span>
              <span>${escapeHtml(o)}</span>
            </li>
          `).join('')}
        </ul>
      </section>
    `
    : '';

  // Prerequisites
  const prereqHtml = course.prerequisites
    ? `
      <section class="course-prerequisites-section mb-10" aria-labelledby="prereq-heading">
        <h2 id="prereq-heading" class="section-title text-lg font-semibold mb-2">Prerequisites</h2>
        <p class="text-sm text-secondary leading-relaxed">${escapeHtml(course.prerequisites)}</p>
      </section>
    `
    : '';

  // Informational Syllabus (Modules -> Lessons -> Step type counts)
  let syllabusHtml = '';
  if (syllabus && syllabus.length > 0) {
    const moduleItems = syllabus.map((mod, modIdx) => {
      const lessonItems = (mod.lessons || []).map((les, lesIdx) => {
        const counts = les.stepCounts;
        const countBadges: string[] = [];
        if (counts.theory > 0) countBadges.push(`${counts.theory} Theory`);
        if (counts.video > 0) countBadges.push(`${counts.video} Video`);
        if (counts.quiz > 0) countBadges.push(`${counts.quiz} Quiz`);
        if (counts.python > 0) countBadges.push(`${counts.python} Python`);

        const stepBadgeLine = countBadges.join(' · ') || `${counts.total} steps`;

        // Render pure step titles without leaking step bodies or test cases
        const stepRows = (les.steps || []).map((st, stIdx) => `
          <div class="syllabus-step-row flex items-center justify-between py-1.5 px-3 text-xs border-b border-subtle last:border-none">
            <span class="step-title text-secondary">
              <span class="font-mono text-muted mr-2">${stIdx + 1}.</span>${escapeHtml(st.title)}
            </span>
            <span class="step-type-badge text-muted uppercase text-micro font-mono">
              ${escapeHtml(st.type)}${st.isRequired ? '' : ' · optional'}
            </span>
          </div>
        `).join('');

        return `
          <div class="syllabus-lesson mb-4 p-4 bg-surface border border-subtle rounded-lg">
            <div class="flex justify-between items-start flex-wrap gap-2 mb-2">
              <h4 class="text-sm font-semibold text-primary">
                <span class="text-muted font-mono mr-1.5">Lesson ${lesIdx + 1}:</span>
                ${escapeHtml(les.title)}
              </h4>
              <span class="text-xs text-muted font-mono tabular-nums">${stepBadgeLine}</span>
            </div>
            ${les.description ? `<p class="text-xs text-secondary mb-3">${escapeHtml(les.description)}</p>` : ''}
            <div class="syllabus-steps bg-canvas rounded border border-subtle">
              ${stepRows}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="syllabus-module mb-8">
          <div class="syllabus-module-header flex items-center gap-3 mb-4 pb-2 border-b border-subtle">
            <span class="module-ordinal font-mono text-xs font-semibold text-accent uppercase">
              Module ${modIdx + 1}
            </span>
            <h3 class="text-base font-semibold text-primary">${escapeHtml(mod.title)}</h3>
          </div>
          <div class="syllabus-lessons">
            ${lessonItems}
          </div>
        </div>
      `;
    }).join('');

    syllabusHtml = `
      <section class="course-syllabus-section mt-10 pt-8 border-t border-subtle" aria-labelledby="syllabus-heading">
        <div class="syllabus-header mb-6">
          <h2 id="syllabus-heading" class="section-title text-lg font-semibold mb-1">Course syllabus</h2>
          <p class="text-xs text-muted">Informational outline of modules and step types. Enrollment gives full interactive practice access.</p>
        </div>
        <div class="syllabus-modules">
          ${moduleItems}
        </div>
      </section>
    `;
  }

  return `
    <div class="course-overview-page container py-10" data-course-id="${escapeHtml(course.id)}">
      <!-- Header -->
      <header class="course-overview-header mb-8 max-w-reading">
        <nav class="breadcrumb text-xs text-muted mb-4" aria-label="Breadcrumb">
          <a href="/courses" class="text-secondary hover:underline">Courses</a>
          <span class="mx-2">/</span>
          <span class="text-primary font-medium" aria-current="page">${escapeHtml(course.title)}</span>
        </nav>

        <h1 class="page-title font-semibold mb-3">${escapeHtml(course.title)}</h1>
        <p class="prose text-secondary text-base mb-4 leading-relaxed">${escapeHtml(course.description)}</p>

        <div class="course-metadata text-xs text-muted tabular-nums">
          ${metaParts}
        </div>
      </header>

      <!-- Mobile Top Action Button -->
      <div class="mobile-cta md:hidden mb-8">
        ${primaryActionHtml}
      </div>

      <!-- 2:1 Main and Secondary Layout (P03) -->
      <div class="overview-grid grid grid-cols-1 md:grid-cols-3 gap-10 items-start">
        <!-- Main Column (2/3 width) -->
        <main class="overview-main md:col-span-2">
          ${outcomesHtml}
          ${prereqHtml}
          ${syllabusHtml}

          <!-- Repeated Action below syllabus on mobile -->
          <div class="mobile-cta-bottom md:hidden mt-8 pt-6 border-t border-subtle">
            ${primaryActionHtml}
          </div>
        </main>

        <!-- Secondary Column: Enrollment Summary Card (1/3 width, sticky) -->
        <aside class="overview-sidebar md:col-span-1 sticky top-20" aria-label="Enrollment details">
          <div class="enrollment-summary-card p-6 bg-surface border border-subtle rounded-lg flex flex-col gap-5">
            <h3 class="text-base font-semibold text-primary">Course summary</h3>

            <div class="summary-details flex flex-col gap-3 text-sm">
              <div class="summary-row flex justify-between">
                <span class="text-secondary">Estimated time</span>
                <span class="font-medium text-primary tabular-nums">~${Number(course.estimatedDurationMinutes || 0)} mins</span>
              </div>
              <div class="summary-row flex justify-between">
                <span class="text-secondary">Level</span>
                <span class="font-medium text-primary">${escapeHtml(capitalize(course.difficulty || 'beginner'))}</span>
              </div>
              <div class="summary-row flex justify-between">
                <span class="text-secondary">Enrollment</span>
                <span class="font-medium text-primary">${isInvitationOnly ? 'Invitation only' : 'Open'}</span>
              </div>
              <div class="summary-row flex justify-between">
                <span class="text-secondary">Version</span>
                <span class="font-medium text-primary tabular-nums">v${Number(course.versionNumber || 1)}</span>
              </div>
            </div>

            <div class="sidebar-action-container pt-3 border-t border-subtle">
              ${primaryActionHtml}
            </div>

            <div class="sidebar-footer-note text-xs text-muted leading-normal">
              Practice Python with short lessons and browser exercises. No setup required.
            </div>
          </div>
        </aside>
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
