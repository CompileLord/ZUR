import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';

export interface ActivityItem {
  id: string;
  tokenId: string;
  tokenLabel: string;
  toolName: string;
  baseRevision: number;
  newRevision: number;
  affectedEntities: string[] | Record<string, unknown> | any;
  outcome: 'success' | 'failure' | string;
  correlationId?: string | null;
  createdAt: string;
}

export interface MutationDetail extends ActivityItem {
  courseId: string;
  idempotencyKey?: string;
  priorContent?: any | null;
  newContent?: any | null;
}

export interface RecoveryRevisionSummary {
  id: string;
  courseId: string;
  revisionNumber: number;
  createdBy: string;
  reason: string;
  createdAt: string;
}

export interface AgentActivityPageOptions {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  activities: ActivityItem[];
  totalActivities?: number;
  currentPage?: number;
  totalPages?: number;
  selectedMutation?: MutationDetail | null;
  recoveryRevisions?: RecoveryRevisionSummary[];
  selectedRecoveryRevision?: RecoveryRevisionSummary | null;
  showRestoreConfirmModal?: boolean;
  filterTool?: string;
  filterOutcome?: string;
  feedbackMessage?: string;
  errorMessage?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatToolName(toolName: string): string {
  switch (toolName) {
    case 'batch_author':
      return 'Batch authoring';
    case 'create_course':
      return 'Create course draft';
    case 'update_course_metadata':
      return 'Update metadata';
    case 'create_module':
      return 'Create module';
    case 'update_module':
      return 'Update module';
    case 'delete_module':
      return 'Delete module';
    case 'create_lesson':
      return 'Create lesson';
    case 'update_lesson':
      return 'Update lesson';
    case 'delete_lesson':
      return 'Delete lesson';
    case 'create_step':
      return 'Create step';
    case 'update_step':
      return 'Update step content';
    case 'delete_step':
      return 'Delete step';
    case 'duplicate_step':
      return 'Duplicate step';
    case 'restore_draft_revision':
      return 'Restore draft revision';
    default:
      return toolName;
  }
}

function formatAffectedEntities(entities: any): string {
  if (!entities) return 'None';
  if (Array.isArray(entities)) {
    if (entities.length === 0) return 'None';
    if (entities.length === 1) return `1 item (${escapeHtml(String(entities[0]))})`;
    return `${entities.length} items`;
  }
  if (typeof entities === 'object') {
    if (entities.operations_applied) {
      return `${entities.operations_applied} operations (${Array.isArray(entities.affected_entities) ? entities.affected_entities.length : 0} nodes)`;
    }
    return Object.keys(entities).length + ' properties';
  }
  return escapeHtml(String(entities));
}

function renderVisualDiff(prior: any, updated: any): string {
  if (!prior && !updated) {
    return '<p class="text-secondary">No content recorded for visual diffing.</p>';
  }

  const priorStr = prior ? JSON.stringify(prior, null, 2) : '';
  const updatedStr = updated ? JSON.stringify(updated, null, 2) : '';

  const priorLines = priorStr ? priorStr.split('\n') : [];
  const updatedLines = updatedStr ? updatedStr.split('\n') : [];

  const maxLines = Math.max(priorLines.length, updatedLines.length);
  const diffRows: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const pLine = priorLines[i];
    const uLine = updatedLines[i];

    if (pLine === uLine) {
      diffRows.push(`
        <div class="diff-line diff-unchanged" style="display: flex; font-family: var(--font-mono); font-size: 0.8125rem; line-height: 1.4; padding: 0.125rem 0.5rem;">
          <span class="diff-marker" style="width: 1.5rem; user-select: none; color: var(--fg-muted);" aria-hidden="true">&nbsp;</span>
          <span class="diff-code" style="white-space: pre-wrap; word-break: break-word; color: var(--fg-default);">${escapeHtml(pLine || '')}</span>
        </div>
      `);
    } else {
      if (pLine !== undefined) {
        diffRows.push(`
          <div class="diff-line diff-deletion" style="display: flex; font-family: var(--font-mono); font-size: 0.8125rem; line-height: 1.4; padding: 0.125rem 0.5rem; background-color: rgba(216, 59, 1, 0.12); border-left: 3px solid var(--danger);">
            <span class="diff-marker" style="width: 1.5rem; user-select: none; font-weight: 700; color: var(--danger);">-</span>
            <span class="diff-code" style="white-space: pre-wrap; word-break: break-word; color: var(--fg-default);">${escapeHtml(pLine)}</span>
          </div>
        `);
      }
      if (uLine !== undefined) {
        diffRows.push(`
          <div class="diff-line diff-addition" style="display: flex; font-family: var(--font-mono); font-size: 0.8125rem; line-height: 1.4; padding: 0.125rem 0.5rem; background-color: rgba(16, 124, 65, 0.12); border-left: 3px solid var(--success);">
            <span class="diff-marker" style="width: 1.5rem; user-select: none; font-weight: 700; color: var(--success);">+</span>
            <span class="diff-code" style="white-space: pre-wrap; word-break: break-word; color: var(--fg-default);">${escapeHtml(uLine)}</span>
          </div>
        `);
      }
    }
  }

  return `
    <div class="diff-viewer" role="region" aria-label="Content diff comparison" style="border: 1px solid var(--border-default); border-radius: var(--radius-sm); overflow-x: auto; background-color: var(--bg-canvas); max-height: 400px; overflow-y: auto;">
      <div class="diff-header" style="display: flex; justify-content: space-between; padding: 0.5rem 0.75rem; background-color: var(--bg-surface); border-bottom: 1px solid var(--border-default); font-size: 0.75rem; color: var(--fg-muted);">
        <span>Legend: <strong style="color: var(--danger);">- Deletions</strong> &nbsp;|&nbsp; <strong style="color: var(--success);">+ Additions</strong></span>
        <span>${maxLines} lines inspected</span>
      </div>
      <div class="diff-content" style="padding: 0.5rem 0;">
        ${diffRows.join('')}
      </div>
    </div>
  `;
}

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
  const filterToolbarHtml = `
    <section class="activity-filters-card card p-3 mb-4" aria-label="Activity Filters" style="background-color: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-sm);">
      <form method="GET" action="/teach/${opts.courseId}/activity" style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-end;">
        <div class="form-group" style="min-width: 180px;">
          <label for="filter-tool" class="field-label" style="font-size: 0.8125rem; font-weight: 600; display: block; margin-bottom: 0.25rem;">Operation</label>
          <select id="filter-tool" name="toolName" class="select-input" style="width: 100%; padding: 0.375rem 0.5rem; border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: var(--bg-surface); color: var(--fg-default);">
            <option value="">All operations</option>
            <option value="batch_author" ${opts.filterTool === 'batch_author' ? 'selected' : ''}>Batch authoring</option>
            <option value="update_course_metadata" ${opts.filterTool === 'update_course_metadata' ? 'selected' : ''}>Update metadata</option>
            <option value="create_module" ${opts.filterTool === 'create_module' ? 'selected' : ''}>Create module</option>
            <option value="update_module" ${opts.filterTool === 'update_module' ? 'selected' : ''}>Update module</option>
            <option value="delete_module" ${opts.filterTool === 'delete_module' ? 'selected' : ''}>Delete module</option>
            <option value="create_lesson" ${opts.filterTool === 'create_lesson' ? 'selected' : ''}>Create lesson</option>
            <option value="update_lesson" ${opts.filterTool === 'update_lesson' ? 'selected' : ''}>Update lesson</option>
            <option value="delete_lesson" ${opts.filterTool === 'delete_lesson' ? 'selected' : ''}>Delete lesson</option>
            <option value="create_step" ${opts.filterTool === 'create_step' ? 'selected' : ''}>Create step</option>
            <option value="update_step" ${opts.filterTool === 'update_step' ? 'selected' : ''}>Update step</option>
            <option value="delete_step" ${opts.filterTool === 'delete_step' ? 'selected' : ''}>Delete step</option>
            <option value="duplicate_step" ${opts.filterTool === 'duplicate_step' ? 'selected' : ''}>Duplicate step</option>
            <option value="restore_draft_revision" ${opts.filterTool === 'restore_draft_revision' ? 'selected' : ''}>Restore draft revision</option>
          </select>
        </div>

        <div class="form-group" style="min-width: 140px;">
          <label for="filter-outcome" class="field-label" style="font-size: 0.8125rem; font-weight: 600; display: block; margin-bottom: 0.25rem;">Outcome</label>
          <select id="filter-outcome" name="outcome" class="select-input" style="width: 100%; padding: 0.375rem 0.5rem; border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: var(--bg-surface); color: var(--fg-default);">
            <option value="">All outcomes</option>
            <option value="success" ${opts.filterOutcome === 'success' ? 'selected' : ''}>Success</option>
            <option value="failure" ${opts.filterOutcome === 'failure' ? 'selected' : ''}>Failure</option>
          </select>
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <button type="submit" class="btn btn-secondary btn-compact">Apply filters</button>
          <a href="/teach/${opts.courseId}/activity" class="btn btn-ghost btn-compact">Reset</a>
        </div>
      </form>
    </section>
  `;

  // Activity list or empty state
  let tableContent = '';
  if (activities.length === 0) {
    tableContent = `
      <section class="card p-5 text-center empty-state" aria-label="No activity" style="background-color: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-sm); text-align: center; padding: 3rem 1rem;">
        <span style="font-size: 2.5rem; display: block; margin-bottom: 1rem;" aria-hidden="true">🤖</span>
        <h2 class="section-title mb-2" style="font-size: 1.25rem;">No agent activity recorded</h2>
        <p class="text-secondary mb-4" style="max-width: 480px; margin-left: auto; margin-right: auto;">
          External AI mutations made through your author tokens will appear here with before/after diffs and draft recovery options.
        </p>
        <a href="/teach/${opts.courseId}/content" class="btn btn-primary">Return to Course Builder</a>
      </section>
    `;
  } else {
    const rowsHtml = activities
      .map((item) => {
        const outcomeBadge = item.outcome === 'success'
          ? '<span class="status-badge success" style="font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 999px; background: rgba(16, 124, 65, 0.15); color: var(--success); font-weight: 600;">Success</span>'
          : '<span class="status-badge danger" style="font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 999px; background: rgba(216, 59, 1, 0.15); color: var(--danger); font-weight: 600;">Failed</span>';

        return `
          <tr class="activity-row" style="border-bottom: 1px solid var(--border-default);">
            <td style="padding: 0.75rem 1rem; font-size: 0.8125rem; color: var(--fg-muted); white-space: nowrap;">
              ${escapeHtml(item.createdAt)}
            </td>
            <td style="padding: 0.75rem 1rem; font-weight: 500;">
              ${escapeHtml(item.tokenLabel)}
            </td>
            <td style="padding: 0.75rem 1rem;">
              <span class="tool-badge" style="font-family: var(--font-mono); font-size: 0.8125rem;">
                ${escapeHtml(formatToolName(item.toolName))}
              </span>
            </td>
            <td style="padding: 0.75rem 1rem; font-size: 0.875rem; color: var(--fg-default);">
              ${formatAffectedEntities(item.affectedEntities)}
            </td>
            <td style="padding: 0.75rem 1rem; font-family: var(--font-mono); font-size: 0.8125rem; white-space: nowrap;">
              r${item.baseRevision} → r${item.newRevision}
            </td>
            <td style="padding: 0.75rem 1rem;">
              ${outcomeBadge}
            </td>
            <td style="padding: 0.75rem 1rem; text-align: right; white-space: nowrap;">
              <a href="/teach/${opts.courseId}/activity?mutationId=${item.id}" class="btn btn-secondary btn-compact" aria-label="View diff for mutation ${item.id}">View diff</a>
            </td>
          </tr>
        `;
      })
      .join('');

    tableContent = `
      <section class="card data-table-card" aria-label="Mutation Timeline" style="background-color: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-sm); overflow-x: auto;">
        <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead style="background-color: var(--bg-canvas); border-bottom: 2px solid var(--border-default);">
            <tr>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Time</th>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Token / Agent</th>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Operation</th>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Affected Content</th>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Revision</th>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Outcome</th>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        ${
          totalPages > 1
            ? `
              <div class="pagination-bar" style="padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-default);">
                <span class="text-secondary text-sm">Showing page ${page} of ${totalPages} (${total} total)</span>
                <div style="display: flex; gap: 0.5rem;">
                  ${page > 1 ? `<a href="/teach/${opts.courseId}/activity?page=${page - 1}" class="btn btn-secondary btn-compact">Previous</a>` : ''}
                  ${page < totalPages ? `<a href="/teach/${opts.courseId}/activity?page=${page + 1}" class="btn btn-secondary btn-compact">Next</a>` : ''}
                </div>
              </div>
            `
            : ''
        }
      </section>
    `;
  }

  // Diff Drawer Modal (when selectedMutation is open)
  let diffDrawerHtml = '';
  if (opts.selectedMutation) {
    const sel = opts.selectedMutation;
    const diffContentHtml = renderVisualDiff(sel.priorContent, sel.newContent);

    diffDrawerHtml = `
      <div class="modal-backdrop" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: flex; justify-content: flex-end; z-index: 1000;" role="presentation">
        <aside class="diff-drawer card" role="dialog" aria-modal="true" aria-labelledby="diff-drawer-title" style="width: 100%; max-width: 720px; height: 100vh; overflow-y: auto; background-color: var(--bg-surface); border-left: 1px solid var(--border-default); padding: 1.5rem; display: flex; flex-direction: column;">
          <header class="drawer-header mb-3" style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border-default); padding-bottom: 1rem;">
            <div>
              <h2 id="diff-drawer-title" class="section-title" style="font-size: 1.25rem; margin: 0 0 0.25rem 0;">
                Mutation Diff — ${escapeHtml(formatToolName(sel.toolName))}
              </h2>
              <p class="text-secondary" style="font-size: 0.8125rem; margin: 0;">
                Applied by <strong>${escapeHtml(sel.tokenLabel)}</strong> · ${escapeHtml(sel.createdAt)}
              </p>
            </div>
            <a href="/teach/${opts.courseId}/activity" class="btn btn-ghost btn-compact" aria-label="Close diff drawer">✕</a>
          </header>

          <div class="drawer-meta mb-3" style="display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.8125rem; background: var(--bg-canvas); padding: 0.75rem; border-radius: var(--radius-sm);">
            <div><strong>Revision bump:</strong> <code>r${sel.baseRevision} → r${sel.newRevision}</code></div>
            <div><strong>Correlation ID:</strong> <code>${escapeHtml(sel.correlationId || 'N/A')}</code></div>
            <div><strong>Idempotency key:</strong> <code>${escapeHtml(sel.idempotencyKey || 'N/A')}</code></div>
            <div><strong>Status:</strong> ${sel.outcome}</div>
          </div>

          <section class="affected-entities-section mb-3" aria-label="Affected Entities">
            <h3 style="font-size: 0.9375rem; margin-bottom: 0.5rem;">Affected Content</h3>
            <p class="text-secondary" style="font-size: 0.875rem;">${formatAffectedEntities(sel.affectedEntities)}</p>
          </section>

          <section class="visual-diff-section mb-4" aria-label="Visual Diff" style="flex: 1;">
            <h3 style="font-size: 0.9375rem; margin-bottom: 0.5rem;">Before / After Comparison</h3>
            ${diffContentHtml}
          </section>

          <footer class="drawer-footer" style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-default); padding-top: 1rem;">
            <a href="/teach/${opts.courseId}/activity" class="btn btn-secondary">Close drawer</a>
            <a href="/teach/${opts.courseId}/activity?mutationId=${sel.id}&restore=true" class="btn btn-danger" id="restore-prior-btn">
              Restore prior version (r${sel.baseRevision})
            </a>
          </footer>
        </aside>
      </div>
    `;
  }

  // Restore Confirmation Modal
  let restoreModalHtml = '';
  if (opts.showRestoreConfirmModal && opts.selectedMutation) {
    const sel = opts.selectedMutation;
    restoreModalHtml = `
      <div class="modal-backdrop" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1100;" role="presentation">
        <div class="modal-card card p-4" role="alertdialog" aria-modal="true" aria-labelledby="restore-modal-title" style="max-width: 540px; width: 90%; background-color: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-md);">
          <header class="mb-3">
            <h2 id="restore-modal-title" class="modal-title text-danger" style="font-size: 1.25rem; margin: 0 0 0.5rem 0;">
              Restore Previous Draft Revision?
            </h2>
            <p class="text-secondary" style="font-size: 0.875rem;">
              You are about to restore this course draft to <strong>Revision ${sel.baseRevision}</strong>.
            </p>
          </header>

          <div class="restore-explanation mb-4" style="background: var(--bg-canvas); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.875rem; line-height: 1.5;">
            <p style="margin: 0 0 0.75rem 0;">
              This operation will restore content from prior snapshot and create a <strong>new draft revision</strong> (Revision ${opts.selectedMutation.newRevision + 1}).
            </p>
            <p class="text-warning" style="font-weight: 600; margin: 0;">
              Published versions, student progress, and live access settings won't be rolled back.
            </p>
          </div>

          <form method="POST" action="/api/author/courses/${opts.courseId}/recovery/${sel.id}/restore">
            <input type="hidden" name="expectedRevision" value="${sel.newRevision}" />
            <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
              <a href="/teach/${opts.courseId}/activity?mutationId=${sel.id}" class="btn btn-secondary">Cancel</a>
              <button type="submit" class="btn btn-danger" id="confirm-restore-btn">Confirm restore</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  const contentHtml = `
    <div class="agent-activity-container" style="max-width: 1100px; margin: 0 auto; padding: 1.5rem 1rem;">
      <header class="page-header mb-4">
        <div class="breadcrumbs mb-2">
          <a href="/teach/${opts.courseId}/content" class="text-secondary" style="font-size: 0.875rem;">← Back to Course Builder</a>
        </div>
        <h1 class="page-title" style="font-size: 1.75rem; margin: 0 0 0.5rem 0;">Agent Activity</h1>
        <p class="text-secondary" style="margin: 0;">
          Review mutations made by external AI agents through MCP, inspect diffs, and restore draft revisions safely.
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
    editorContent: contentHtml,
  });
}
