import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';
import { escapeHtml } from './AgentActivityFormat.ts';
import { renderActivityFilterToolbar } from './AgentActivityFilterToolbar.ts';
import { renderActivityTable } from './AgentActivityTable.ts';
import { renderActivityDiffDrawer } from './AgentActivityDiffDrawer.ts';
import { renderActivityRestoreModal } from './AgentActivityRestoreModal.ts';
import type { AgentActivityPageOptions } from './AgentActivityTypes.ts';

export type { ActivityItem, MutationDetail, RecoveryRevisionSummary, AgentActivityPageOptions } from './AgentActivityTypes.ts';

export function renderAgentActivityPage(opts: AgentActivityPageOptions): string {
  const activities = opts.activities || [];
  const total = opts.totalActivities ?? activities.length;
  const page = opts.currentPage || 1;
  const totalPages = opts.totalPages || Math.ceil(total / 20) || 1;

  let feedbackHtml = '';
  if (opts.feedbackMessage) {
    feedbackHtml = `
      <div class="alert alert-success mb-4" role="status" style="padding: 0.75rem 1rem; background-color: rgba(16, 124, 65, 0.1); border: 1px solid var(--success); border-radius: var(--radius-sm); color: var(--fg-default);">
        ✓ ${escapeHtml(opts.feedbackMessage)}
      </div>
    `;
  }
  if (opts.errorMessage) {
    feedbackHtml = `
      <div class="alert alert-danger mb-4" role="alert" style="padding: 0.75rem 1rem; background-color: rgba(216, 59, 1, 0.1); border: 1px solid var(--danger); border-radius: var(--radius-sm); color: var(--fg-default);">
        ✕ ${escapeHtml(opts.errorMessage)}
      </div>
    `;
  }

  // Filter toolbar
  const filterToolbarHtml = renderActivityFilterToolbar(opts);

  const tableContent = renderActivityTable(opts, activities, total, page, totalPages);

  // Diff Drawer Modal (when selectedMutation is open)
  const diffDrawerHtml = renderActivityDiffDrawer(opts);

  // Restore Confirmation Modal
  const restoreModalHtml = renderActivityRestoreModal(opts);

  const contentHtml = `
    <div class="agent-activity-container" style="max-width: 1100px; margin: 0 auto; padding: 1rem 0.75rem;">
      <header class="page-header mb-4 pb-3 border-b border-subtle">
        <h1 class="page-title text-2xl font-bold tracking-tight">Recent changes<span class="sr-only"> (Agent Activity)</span></h1>
        <p class="text-secondary text-sm hidden-mobile mt-1">
          Changes made by connected tools.
        </p>
      </header>

      ${feedbackHtml}
      ${filterToolbarHtml}
      ${tableContent}
      ${diffDrawerHtml}
      ${restoreModalHtml}
    </div>
  `;

  return renderAuthorWorkspaceShell({
    courseId: opts.courseId,
    courseTitle: opts.courseTitle,
    publicationState: opts.publicationState,
    hasUnpublishedChanges: opts.hasUnpublishedChanges,
    activeTab: 'content',
    showTree: false,
    editorContent: contentHtml,
  });
}
