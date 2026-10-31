import { authorStyles } from '../../pages/author/AuthorStyles.ts';
import { renderAuthorTree, type ModuleSummary } from '../../pages/author/AuthorTreeComponent.ts';
import { escapeHtmlOnce } from '../../utils/escape-html.ts';

export interface AuthorWorkspaceShellOptions {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  saveStatusText?: string;
  activeTab: 'content' | 'students' | 'analytics' | 'settings';
  treeContent?: string;
  modules?: ModuleSummary[];
  selectedType?: 'course' | 'module' | 'lesson' | 'step';
  selectedId?: string;
  editorContent: string;
  inspectorContent?: string;
  isPublishPage?: boolean;
  showTree?: boolean;
}

export function renderAuthorWorkspaceShell(opts: AuthorWorkspaceShellOptions): string {
  const isContentTab = opts.activeTab === 'content' && !opts.isPublishPage && opts.showTree !== false;

  const statusBadgeClass = opts.publicationState === 'published' ? 'success' : 'warning';
  const statusBadgeText = opts.publicationState === 'published'
    ? `<span class="status-badge ${statusBadgeClass}" title="${opts.hasUnpublishedChanges ? 'Published (Unpublished changes)' : 'Published'}">Published</span>${opts.hasUnpublishedChanges ? ' <span class="status-badge warning status-badge-subtle">Draft changes</span>' : ''}`
    : `<span class="status-badge ${statusBadgeClass}">${opts.publicationState === 'draft' ? 'Draft' : 'Archived'}</span>`;

  let treeHtml = '';
  if (isContentTab) {
    if (opts.treeContent) {
      treeHtml = opts.treeContent;
    } else if (opts.modules && opts.modules.length > 0) {
      treeHtml = renderAuthorTree({
        courseId: opts.courseId,
        courseTitle: opts.courseTitle,
        modules: opts.modules,
        selectedType: opts.selectedType || (opts.selectedId ? 'step' : 'course'),
        selectedId: opts.selectedId,
        isEditor: true,
      });
    }
  }

  const tab = (id: AuthorWorkspaceShellOptions['activeTab'], label: string) =>
    `<a href="/teach/${opts.courseId}/${id}" class="tab-link ${opts.activeTab === id ? 'active' : ''}" aria-selected="${opts.activeTab === id}"${opts.activeTab === id ? ' aria-current="page"' : ''}>${label}</a>`;

  return `
    <style id="author-workspace-styles">${authorStyles}</style>
    <div class="shell-author">
      <div class="author-chrome">
        <header class="author-header" role="banner">
          <div class="author-header-left">
            <a href="/teach" class="back-link" aria-label="Back to Your courses">&larr; Courses</a>
            <span class="header-divider">/</span>
            <span class="author-course-title" title="${escapeHtmlOnce(opts.courseTitle)}">${escapeHtmlOnce(opts.courseTitle)}</span>
            ${statusBadgeText}
          </div>

          <div class="author-header-right">
            ${opts.saveStatusText && opts.saveStatusText !== 'Saved' ? `<div class="save-indicator ${opts.saveStatusText.toLowerCase().includes('saving') ? 'saving' : opts.saveStatusText.toLowerCase().includes('unsaved') || opts.saveStatusText.toLowerCase().includes('conflict') ? 'unsaved' : 'saved'}" aria-live="polite">${opts.saveStatusText}</div>` : ''}
            <a href="/teach/${opts.courseId}/preview${opts.selectedType === 'step' && opts.selectedId ? `?stepId=${encodeURIComponent(opts.selectedId)}` : ''}" class="btn btn-secondary btn-compact" title="Preview as student" aria-label="Preview as student">Preview</a>
            ${!opts.isPublishPage ? `<a href="/teach/${opts.courseId}/publish" class="btn btn-primary btn-compact">Review & publish</a>` : ''}
          </div>
        </header>

        <nav class="author-tabs-bar" role="navigation" aria-label="Course Management Tabs">
          <div class="tabs-nav">
            ${tab('content', 'Content')}
            ${tab('students', 'Students')}
            ${tab('analytics', 'Analytics')}
            ${tab('settings', 'Settings')}
          </div>
          <a href="/teach/${opts.courseId}/activity" class="tabs-aside-link" title="View changes and draft history">Recent changes</a>
        </nav>
      </div>

      <main id="main-content" class="author-workspace-main ${isContentTab ? 'has-tree' : 'full-pane'}" role="main">
        ${isContentTab ? `
          <div class="author-desktop-guidance" role="note">
            <p>Editing course content needs a screen at least 1024 pixels wide. Open this course on a desktop or laptop to write and arrange steps.</p>
            <p><a href="/teach/${opts.courseId}/students">Students</a> and <a href="/teach/${opts.courseId}/analytics">Analytics</a> work on this screen.</p>
          </div>
        ` : ''}
        ${isContentTab ? `
          <aside class="author-tree-pane" id="author-tree-pane" role="region" aria-label="Course Structure" data-course-id="${opts.courseId}" data-step-id="${opts.selectedId || ''}">
            ${treeHtml || '<div class="p-3 text-xs text-secondary">Course structure not loaded</div>'}
          </aside>
          <div class="tree-resizer" role="separator" aria-orientation="vertical" aria-label="Resize course structure" aria-valuemin="220" aria-valuemax="560" tabindex="0" title="Drag to resize (or use left/right arrow keys)"></div>
        ` : ''}

        <div class="author-editor-pane">
          ${opts.editorContent}
        </div>

        ${isContentTab && opts.inspectorContent ? `
          <aside class="author-inspector-pane" id="author-inspector-pane" role="complementary" aria-label="Step Settings">
            ${opts.inspectorContent}
          </aside>
        ` : ''}
      </main>
    </div>
  `;
}
