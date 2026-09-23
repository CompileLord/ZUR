export interface AuthorWorkspaceShellOptions {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  saveStatusText?: string;
  activeTab: 'content' | 'students' | 'analytics' | 'settings';
  treeContent?: string;
  editorContent: string;
  inspectorContent?: string;
}

export function renderAuthorWorkspaceShell(opts: AuthorWorkspaceShellOptions): string {
  const isContentTab = opts.activeTab === 'content';

  const statusBadgeClass = opts.publicationState === 'published' ? 'success' : 'warning';
  const statusBadgeText = opts.publicationState === 'published'
    ? (opts.hasUnpublishedChanges ? 'Published (Unpublished changes)' : 'Published')
    : 'Draft';

  return `
    <div class="shell-author">
      <header class="author-header" role="banner">
        <div class="author-header-left">
          <a href="/teach" class="back-link" aria-label="Back to Your courses">← Courses</a>
          <span class="header-divider">/</span>
          <span class="author-course-title">${opts.courseTitle}</span>
          <span class="status-badge ${statusBadgeClass}">${statusBadgeText}</span>
        </div>

        <div class="author-header-right">
          ${opts.saveStatusText ? `<div class="save-indicator saved" aria-live="polite">${opts.saveStatusText}</div>` : ''}
          <a href="/teach/${opts.courseId}/preview" class="btn btn-secondary btn-compact">Preview as student</a>
          <a href="/teach/${opts.courseId}/publish" class="btn btn-primary btn-compact">Review & publish</a>
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
        ${isContentTab && opts.treeContent ? `
          <aside class="author-tree-pane" role="region" aria-label="Course Structure">
            ${opts.treeContent}
          </aside>
        ` : ''}

        <div class="author-editor-pane">
          ${opts.editorContent}
        </div>

        ${isContentTab && opts.inspectorContent ? `
          <aside class="author-inspector-pane" role="complementary" aria-label="Step Settings">
            ${opts.inspectorContent}
          </aside>
        ` : ''}
      </main>
    </div>
  `;
}
