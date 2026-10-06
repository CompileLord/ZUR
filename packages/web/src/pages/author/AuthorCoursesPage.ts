import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAppShell } from '../../components/shells/AppShell.ts';
import { renderIcon } from '../../components/common/icons.ts';
import { formatDate } from '../../utils/formatters.ts';

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
  newCourseError?: string | null;
}

export function renderAuthorCoursesPage(opts: AuthorCoursesPageOptions): string {
  opts = safeTemplateData(opts);
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

  const activeFilter = opts.activeFilter || 'all';
  const searchQuery = opts.searchQuery || '';

  const filteredCourses = opts.courses.filter((c) => {
    if (activeFilter === 'draft' && c.publicationStatus !== 'draft') return false;
    if (activeFilter === 'published' && c.publicationStatus !== 'published') return false;
    if (activeFilter === 'archived' && c.publicationStatus !== 'archived') return false;
    if (searchQuery && !c.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const renderNewCourseModal = opts.showNewCourseModal
    ? `
      <div class="modal-backdrop" role="presentation">
        <div class="modal-dialog author-modal-440" role="dialog" aria-modal="true" aria-labelledby="new-course-title">
          <div class="modal-header">
            <h2 id="new-course-title" class="modal-title">Create new course</h2>
            <button type="button" class="btn-close" aria-label="Close dialog" data-action="close-modal">&times;</button>
          </div>
          <form class="modal-body" method="POST" action="/teach">
            ${opts.newCourseError ? `<div class="alert alert-danger" role="alert">${opts.newCourseError}</div>` : ''}
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
                aria-describedby="new-course-helper"
                autofocus
              />
              <p id="new-course-helper" class="field-hint">Starts as a private draft. You choose discoverability and delivery settings before publication.</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
              <button type="submit" class="btn btn-primary">Create course</button>
            </div>
          </form>
        </div>
      </div>
    `
    : '';

  let courseListHtml = '';

  if (opts.courses.length === 0) {
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
  } else if (filteredCourses.length === 0) {
    courseListHtml = `
      <div class="empty-state-card" role="region" aria-label="No matching courses">
        <h2 class="empty-state-title">No matching courses</h2>
        <p class="empty-state-description">No courses match the query "${searchQuery}" in ${activeFilter} courses.</p>
        <a href="/teach" class="btn btn-secondary">Clear filters</a>
      </div>
    `;
  } else {
    courseListHtml = `
      <div class="author-course-list" role="feed" aria-label="Your courses">
        ${filteredCourses
          .map((c) => {
            const isDraft = c.publicationStatus === 'draft';
            const isPublished = c.publicationStatus === 'published';
            const statusBadgeClass = isPublished ? 'status-badge success' : isDraft ? 'status-badge warning' : 'status-badge muted';
            const actionLabel = isDraft ? 'Continue editing' : 'Open course';
            const studentText = c.studentCount === 1 ? '1 student' : `${c.studentCount} students`;
            const editDateFormatted = c.lastEditTime ? (formatDate(c.lastEditTime) || new Date(c.lastEditTime).toLocaleDateString()) : '';

            return `
              <article class="course-card author-course-row" aria-labelledby="course-heading-${c.id}">
                <div class="course-row-main">
                  <div class="course-row-meta">
                    <span class="${statusBadgeClass}">${c.publicationStatus === 'published' ? 'Published' : c.publicationStatus === 'draft' ? 'Draft' : 'Archived'}</span>
                    ${c.hasUnpublishedChanges ? '<span class="status-badge warning status-badge-subtle">Draft changes<span class="sr-only"> (Unpublished changes)</span></span>' : ''}
                    ${c.studentCount > 0 ? `
                      <span class="meta-separator">·</span>
                      <span class="student-count-text">${studentText}</span>
                    ` : ''}
                  </div>
                  <h2 id="course-heading-${c.id}" class="course-row-title">
                    <a href="/teach/${c.id}/content">${c.title}</a>
                  </h2>
                  ${editDateFormatted ? `<div class="course-row-date text-xs text-muted">Edited ${editDateFormatted}</div>` : ''}
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
          <a href="/teach?status=all" class="segmented-control-btn filter-tab ${activeFilter === 'all' ? 'active' : ''}" role="tab" aria-selected="${activeFilter === 'all'}">All</a>
          <a href="/teach?status=draft" class="segmented-control-btn filter-tab ${activeFilter === 'draft' ? 'active' : ''}" role="tab" aria-selected="${activeFilter === 'draft'}">Drafts</a>
          <a href="/teach?status=published" class="segmented-control-btn filter-tab ${activeFilter === 'published' ? 'active' : ''}" role="tab" aria-selected="${activeFilter === 'published'}">Published</a>
          <a href="/teach?status=archived" class="segmented-control-btn filter-tab ${activeFilter === 'archived' ? 'active' : ''}" role="tab" aria-selected="${activeFilter === 'archived'}">Archived</a>
        </nav>

        <form class="search-form" method="GET" action="/teach">
          <input type="hidden" name="status" value="${activeFilter}" />
          <div class="search-input-wrapper">
            <span class="search-input-icon" aria-hidden="true">
              ${renderIcon('search', { size: 14 })}
            </span>
            <input
              type="search"
              name="search"
              class="text-input search-input"
              placeholder="Search courses..."
              value="${searchQuery}"
              aria-label="Search courses by title"
            />
          </div>
        </form>
      </div>

      <main id="main-content" role="main">
        ${courseListHtml}
      </main>

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
