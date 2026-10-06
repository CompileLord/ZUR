import { authorStyles } from '../../pages/author/AuthorStyles.ts';
import { renderAuthorTree, type ModuleSummary } from '../../pages/author/AuthorTreeComponent.ts';

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

  // Pure render of course tree from provided treeContent or modules
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

  return `
    <style id="author-workspace-styles">${authorStyles}</style>
    <div class="shell-author" oninput="this.classList.add('is-dirty'); const btn = this.querySelector('.author-header-right > button.btn-primary'); if (btn && btn.textContent === 'Saved') btn.textContent = 'Save changes';">
      <header class="author-header" role="banner">
        <div class="author-header-left">
          <a href="/teach" class="back-link" aria-label="Back to Your courses">← Courses</a>
          <span class="header-divider">/</span>
          <span class="author-course-title">${opts.courseTitle}</span>
          ${statusBadgeText}
        </div>

        <div class="author-header-right">
          ${opts.saveStatusText ? `<div class="save-indicator saved" aria-live="polite">${opts.saveStatusText}</div>` : ''}
          <a href="/teach/${opts.courseId}/activity" class="btn btn-secondary btn-compact" title="View changes and draft history">Recent changes</a>
          <a href="/teach/${opts.courseId}/preview${opts.selectedType === 'step' && opts.selectedId ? `?stepId=${encodeURIComponent(opts.selectedId)}` : ''}" class="btn btn-secondary btn-compact">Preview as student</a>
          ${!opts.isPublishPage ? `<a href="/teach/${opts.courseId}/publish" class="btn btn-secondary btn-compact">Review & publish</a>` : ''}
        </div>
      </header>

      <nav class="author-tabs-bar" role="navigation" aria-label="Course Management Tabs">
        <div class="tabs-nav container">
          <a href="/teach/${opts.courseId}/content" class="tab-link ${opts.activeTab === 'content' ? 'active' : ''}" aria-selected="${opts.activeTab === 'content'}">Content</a>
          <a href="/teach/${opts.courseId}/students" class="tab-link ${opts.activeTab === 'students' ? 'active' : ''}" aria-selected="${opts.activeTab === 'students'}">Students</a>
          <a href="/teach/${opts.courseId}/analytics" class="tab-link ${opts.activeTab === 'analytics' ? 'active' : ''}" aria-selected="${opts.activeTab === 'analytics'}">Analytics</a>
          <a href="/teach/${opts.courseId}/settings" class="tab-link ${opts.activeTab === 'settings' ? 'active' : ''}" aria-selected="${opts.activeTab === 'settings'}">Settings</a>
        </div>
      </nav>

      <main id="main-content" class="author-workspace-main ${isContentTab ? 'has-tree' : 'full-pane'}" role="main">
        ${isContentTab ? `
          <aside class="author-tree-pane" id="author-tree-pane" role="region" aria-label="Course Structure" data-course-id="${opts.courseId}" data-step-id="${opts.selectedId || ''}">
            ${treeHtml || '<div class="p-3 text-xs text-secondary">Course structure not loaded</div>'}
          </aside>
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
