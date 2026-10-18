import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAppShell } from '../../components/shells/AppShell.ts';
import { renderIcon } from '../../components/common/icons.ts';
import { formatDate } from '../../utils/formatters.ts';
import { escapeHtml } from '../../components/escape-html.ts';

export interface AuthorCourseItem {
  id: string;
  title: string;
  publicationStatus: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  studentCount: number;
  lastEditTime: string;
}

export interface AuthorCoursesPageOptions {
  user: {
    displayName: string;
    email: string;
    capabilities: string[];
  };
  courses: AuthorCourseItem[];
  activeFilter?: 'all' | 'draft' | 'published' | 'archived';
  searchQuery?: string;
  showNewCourseModal?: boolean;
  newCourseTitle?: string;
  newCourseError?: string | null;
  isSubmitting?: boolean;
}

export function buildAuthorFilterUrl(status: string, search?: string): string {
  const params = new URLSearchParams();
  const normalizedStatus = ['all', 'draft', 'published', 'archived'].includes(status) ? status : 'all';
  if (normalizedStatus !== 'all') {
    params.set('status', normalizedStatus);
  }
  if (search && search.trim()) {
    params.set('search', search.trim());
  }
  const qs = params.toString();
  return qs ? `/teach?${qs}` : '/teach';
}

export function renderAuthorCoursesPage(opts: AuthorCoursesPageOptions): string {
  const rawSearchQuery = (opts.searchQuery || '').trim();
  const rawNewCourseTitle = opts.newCourseTitle || '';
  const activeFilter = opts.activeFilter || 'all';

  const rawCourses = opts.courses || [];
  const filteredRawCourses = rawCourses.filter((c) => {
    if (activeFilter === 'draft' && c.publicationStatus !== 'draft') return false;
    if (activeFilter === 'published' && c.publicationStatus !== 'published') return false;
    if (activeFilter === 'archived' && c.publicationStatus !== 'archived') return false;
    if (rawSearchQuery && !c.title.toLowerCase().includes(rawSearchQuery.toLowerCase())) return false;
    return true;
  });

  const isAuthor = opts.user.capabilities.includes('author') || opts.user.capabilities.includes('admin');

  if (!isAuthor) {
    const deniedContent = `
      <div class="content-container error-pane" role="region" aria-label="Author Access Required">
        <h1 class="page-title">Author Access Required</h1>
        <p class="text-secondary">Your account does not currently have authoring privileges. Contact an administrator to request course authoring capabilities.</p>
        <div class="action-row">
          <a href="/learn" class="btn btn-primary">Return to learning</a>
        </div>
      </div>
    `;
    return renderAppShell({
      user: opts.user as any,
      activeMode: 'learn',
      content: deniedContent,
    });
  }

  const safeOpts = safeTemplateData({
    ...opts,
    courses: filteredRawCourses,
  });

  const renderNewCourseModal = opts.showNewCourseModal
    ? `
      <dialog id="new-course-dialog" open class="modal-backdrop dialog-overlay" style="border:none;margin:0;max-width:100vw;max-height:100vh;width:100vw;height:100vh;padding:var(--space-4);" role="presentation">
        <div class="modal-dialog author-modal-440" role="dialog" aria-modal="true" aria-labelledby="new-course-title">
          <div class="modal-header">
            <h2 id="new-course-title" class="modal-title">Create new course</h2>
            <button type="button" class="btn-close" aria-label="Close dialog" data-action="close-modal"${opts.isSubmitting ? ' disabled' : ''}>&times;</button>
          </div>
          <form class="modal-body" method="POST" action="/teach">
            ${opts.newCourseError ? `<div class="alert alert-danger" id="new-course-error" role="alert">${escapeHtml(opts.newCourseError)}</div>` : ''}
            <div class="form-group">
              <label for="course-title-input" class="field-label">Course title</label>
              <input
                id="course-title-input"
                name="title"
                type="text"
                class="text-input"
                required
                maxlength="200"
                placeholder="e.g. Algorithmic Problem Solving"
                value="${escapeHtml(rawNewCourseTitle)}"
                aria-describedby="${opts.newCourseError ? 'new-course-error ' : ''}new-course-helper"
                ${opts.isSubmitting ? 'disabled ' : ''}
                autofocus
              />
              <p id="new-course-helper" class="field-hint">Starts as a private draft. You choose discoverability and delivery settings before publication.</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-action="close-modal"${opts.isSubmitting ? ' disabled' : ''}>Cancel</button>
              <button type="submit" class="btn btn-primary" id="btn-create-course"${opts.isSubmitting ? ' disabled aria-busy="true"' : ''}>${opts.isSubmitting ? 'Creating...' : 'Create course'}</button>
            </div>
          </form>
        </div>
      </dialog>
    `
    : '';

  let courseListHtml = '';

  if (rawCourses.length === 0) {
    courseListHtml = `
      <div class="empty-state-card" role="region" aria-label="No courses yet">
        <h2 class="empty-state-title">No courses yet</h2>
        <p class="empty-state-description">Create your first course to begin drafting modules, lessons, and interactive Python exercises.</p>
        <button type="button" class="btn btn-primary" data-action="open-new-course-modal">+ New course</button>

        <div class="sample-tree-preview" aria-hidden="true">
          <div class="sample-tree-title">Sample Course Structure</div>
          <div class="sample-tree-node">${renderIcon('folder', { size: 14 })} Module 1: Foundations</div>
          <div class="sample-tree-node child">${renderIcon('file-text', { size: 14 })} Lesson 1: Introduction (Theory)</div>
          <div class="sample-tree-node child">${renderIcon('list-checks', { size: 14 })} Lesson 2: Logic Quiz</div>
          <div class="sample-tree-node child">${renderIcon('code', { size: 14 })} Lesson 3: First Python Exercise</div>
        </div>
      </div>
    `;
  } else if (safeOpts.courses.length === 0) {
    courseListHtml = `
      <div class="empty-state-card" role="region" aria-label="No matching courses">
        <h2 class="empty-state-title">No matching courses</h2>
        <p class="empty-state-description">No courses match the query "${escapeHtml(rawSearchQuery)}" in ${escapeHtml(activeFilter)} courses.</p>
        <a href="/teach" class="btn btn-secondary">Clear filters</a>
      </div>
    `;
  } else {
    courseListHtml = `
      <div class="author-course-list" role="feed" aria-label="Your courses">
        ${safeOpts.courses
          .map((c) => {
            const isDraft = c.publicationStatus === 'draft';
            const isPublished = c.publicationStatus === 'published';
            const statusBadgeClass = isPublished ? 'status-badge success' : isDraft ? 'status-badge warning' : 'status-badge muted';
            const actionLabel = isDraft ? 'Continue editing' : 'Open course';
            const studentText = c.studentCount === 1 ? '1 student' : `${c.studentCount} students`;
            const editDateFormatted = c.lastEditTime ? (formatDate(c.lastEditTime) || new Date(c.lastEditTime).toLocaleDateString()) : '';

            let hash = 0;
            for (let i = 0; i < (c.id || c.title).length; i++) hash = (hash * 31 + (c.id || c.title).charCodeAt(i)) % 360;
            const hue = 70 + (hash % 160);
            const initial = (c.title.replace(/&[#a-z0-9]+;/gi, '').trim().charAt(0) || 'C').toUpperCase();

            return `
              <article class="course-card author-course-row author-course-card" aria-labelledby="course-heading-${c.id}">
                <a class="author-course-thumb" href="/teach/${c.id}/content" tabindex="-1" aria-hidden="true" style="--thumb-hue: ${hue}"><span>${initial}</span></a>
                <div class="course-row-main">
                  <div class="course-row-meta">
                    <span class="${statusBadgeClass}">${c.publicationStatus === 'published' ? 'Published' : c.publicationStatus === 'draft' ? 'Draft' : 'Archived'}</span>
                    ${c.hasUnpublishedChanges ? '<span class="status-badge warning status-badge-subtle">Draft changes<span class="sr-only"> (Unpublished changes)</span></span>' : ''}
                  </div>
                  <h2 id="course-heading-${c.id}" class="course-row-title">
                    <a href="/teach/${c.id}/content">${c.title}</a>
                  </h2>
                  <div class="course-row-stats text-xs text-muted">
                    <span class="student-count-text">${studentText}</span>
                    ${editDateFormatted ? `<span class="meta-separator">&middot;</span><span class="course-row-date">Edited ${editDateFormatted}</span>` : ''}
                  </div>
                </div>
                <div class="course-row-actions">
                  <a href="/teach/${c.id}/content" class="btn btn-secondary btn-compact" aria-label="${actionLabel}">Open<span class="sr-only"> (${actionLabel})</span></a>
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;
  }

  const pageContent = `
    <div class="author-courses-container container">
      <header class="page-header author-page-header">
        <div class="header-text-group">
          <h1 class="page-title">Your courses</h1>
        </div>
        <div class="header-action-group">
          <button type="button" class="btn btn-primary" data-action="open-new-course-modal">+ New course</button>
        </div>
      </header>

      <div class="author-toolbar flex flex-wrap items-center justify-between gap-3 mb-6">
        <nav class="segmented-control segmented-tabs" role="tablist" aria-label="Course Status Filters">
          <a href="${escapeHtml(buildAuthorFilterUrl('all', rawSearchQuery))}" class="segmented-control-btn filter-tab ${activeFilter === 'all' ? 'active' : ''}" role="tab" aria-selected="${activeFilter === 'all'}">All</a>
          <a href="${escapeHtml(buildAuthorFilterUrl('draft', rawSearchQuery))}" class="segmented-control-btn filter-tab ${activeFilter === 'draft' ? 'active' : ''}" role="tab" aria-selected="${activeFilter === 'draft'}">Drafts</a>
          <a href="${escapeHtml(buildAuthorFilterUrl('published', rawSearchQuery))}" class="segmented-control-btn filter-tab ${activeFilter === 'published' ? 'active' : ''}" role="tab" aria-selected="${activeFilter === 'published'}">Published</a>
          <a href="${escapeHtml(buildAuthorFilterUrl('archived', rawSearchQuery))}" class="segmented-control-btn filter-tab ${activeFilter === 'archived' ? 'active' : ''}" role="tab" aria-selected="${activeFilter === 'archived'}">Archived</a>
        </nav>

        <form class="search-form" method="GET" action="/teach">
          ${activeFilter !== 'all' ? `<input type="hidden" name="status" value="${escapeHtml(activeFilter)}" />` : ''}
          <div class="search-input-wrapper">
            <span class="search-input-icon" aria-hidden="true">
              ${renderIcon('search', { size: 14 })}
            </span>
            <input
              type="search"
              name="search"
              class="text-input search-input"
              placeholder="Search courses..."
              value="${escapeHtml(rawSearchQuery)}"
              aria-label="Search courses by title"
            />
          </div>
        </form>
      </div>

      <section class="author-courses-content" aria-label="Course list">
        ${courseListHtml}
      </section>

      ${renderNewCourseModal}
    </div>
  `;

  return renderAppShell({
    user: opts.user as any,
    activeMode: 'teach',
    activePath: '/teach',
    content: pageContent,
  });
}
