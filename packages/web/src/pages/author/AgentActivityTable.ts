import { escapeHtml, formatActivityDate, formatToolName, formatAffectedEntities } from './AgentActivityFormat.ts';
import type { ActivityItem, AgentActivityPageOptions } from './AgentActivityTypes.ts';

export function renderActivityTable(opts: AgentActivityPageOptions, activities: ActivityItem[], total: number, page: number, totalPages: number): string {
  let tableContent = '';
  if (activities.length === 0) {
    tableContent = `
      <section class="card p-8 text-center empty-state bg-surface border border-subtle rounded-md" aria-label="No activity" style="text-align: center; padding: 3rem 1rem;">
        <h2 class="section-title mb-2 text-lg font-semibold">No recent changes recorded<span class="sr-only"> (No agent activity recorded)</span></h2>
        <p class="text-secondary mb-4 text-sm" style="max-width: 480px; margin-left: auto; margin-right: auto;">
          Changes made by connected tools will appear here with before/after diffs and draft recovery options.
        </p>
        <a href="/teach/${opts.courseId}/content" class="btn btn-primary">Return to editor<span class="sr-only"> (Return to Course Builder)</span></a>
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
              <time datetime="${escapeHtml(item.createdAt)}" title="${escapeHtml(item.createdAt)}">${escapeHtml(formatActivityDate(item.createdAt))}</time>
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
              ${formatAffectedEntities(item.affectedEntities, item.toolName)}
            </td>
            <td style="padding: 0.75rem 1rem; font-family: var(--font-mono); font-size: 0.8125rem; white-space: nowrap;">
              <span class="revision-badge inline-flex items-center font-mono text-xs px-2 py-0.5 rounded bg-raised border border-subtle">
                r${item.baseRevision} → r${item.newRevision}
              </span>
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

    const cardsHtml = activities
      .map((item) => {
        const outcomeBadge = item.outcome === 'success'
          ? '<span class="status-badge success" style="font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 999px; background: rgba(16, 124, 65, 0.15); color: var(--success); font-weight: 600;">Success</span>'
          : '<span class="status-badge danger" style="font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 999px; background: rgba(216, 59, 1, 0.15); color: var(--danger); font-weight: 600;">Failed</span>';

        return `
          <article class="activity-mobile-card activity-row card p-3" role="listitem" style="background-color: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
              <div style="min-width: 0;">
                <strong style="font-size: 0.9375rem; color: var(--fg-default); display: block; word-break: break-word;">${escapeHtml(item.tokenLabel)}</strong>
                <span class="tool-badge" style="font-family: var(--font-mono); font-size: 0.8125rem; color: var(--accent); font-weight: 600;">
                  ${escapeHtml(formatToolName(item.toolName))}
                </span>
              </div>
              <div style="flex-shrink: 0;">
                ${outcomeBadge}
              </div>
            </div>

            <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.375rem; font-size: 0.8125rem; color: var(--fg-muted); border-top: 1px solid var(--border-subtle); padding-top: 0.375rem;">
              <div>
                <span style="font-family: var(--font-mono); font-weight: 500; color: var(--fg-default);">r${item.baseRevision} → r${item.newRevision}</span>
                <span style="margin: 0 0.25rem;">·</span>
                <time datetime="${escapeHtml(item.createdAt)}" title="${escapeHtml(item.createdAt)}">${escapeHtml(formatActivityDate(item.createdAt))}</time>
              </div>
              <div style="font-size: 0.75rem; color: var(--fg-muted);">
                ${formatAffectedEntities(item.affectedEntities, item.toolName)}
              </div>
            </div>

            <div style="display: flex; justify-content: flex-end; border-top: 1px solid var(--border-subtle); padding-top: 0.375rem;">
              <a href="/teach/${opts.courseId}/activity?mutationId=${item.id}" class="btn btn-secondary btn-compact" aria-label="View diff for mutation ${item.id}">View diff</a>
            </div>
          </article>
        `;
      })
      .join('');

    const paginationHtml = totalPages > 1
      ? `
        <div class="pagination-bar" style="padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-default);">
          <span class="text-secondary text-sm">Showing page ${page} of ${totalPages} (${total} total)</span>
          <div style="display: flex; gap: 0.5rem;">
            ${page > 1 ? `<a href="/teach/${opts.courseId}/activity?page=${page - 1}" class="btn btn-secondary btn-compact">Previous</a>` : ''}
            ${page < totalPages ? `<a href="/teach/${opts.courseId}/activity?page=${page + 1}" class="btn btn-secondary btn-compact">Next</a>` : ''}
          </div>
        </div>
      `
      : '';

    tableContent = `
      <section class="card data-table-card activity-desktop-table" aria-label="Mutation Timeline" style="background-color: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-sm); overflow-x: auto;">
        <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead style="background-color: var(--bg-canvas); border-bottom: 2px solid var(--border-default);">
            <tr>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Time</th>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Connection</th>
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
        ${paginationHtml}
      </section>

      <div class="activity-mobile-list" role="list" aria-label="Mutation Timeline Mobile">
        ${cardsHtml}
        ${paginationHtml}
      </div>
    `;
  }
  return tableContent;
}
