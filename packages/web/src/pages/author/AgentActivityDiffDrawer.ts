import type { AgentActivityPageOptions } from './AgentActivityTypes.ts';
import { escapeHtml, formatActivityDate, formatToolName, formatAffectedEntities } from './AgentActivityFormat.ts';
import { renderVisualDiff } from './AgentActivityDiff.ts';

export function renderActivityDiffDrawer(opts: AgentActivityPageOptions): string {
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
                Changes: ${escapeHtml(formatToolName(sel.toolName))}
              </h2>
              <p class="text-secondary" style="font-size: 0.8125rem; margin: 0;">
                Applied by <strong>${escapeHtml(sel.tokenLabel)}</strong> · <time datetime="${escapeHtml(sel.createdAt)}" title="${escapeHtml(sel.createdAt)}">${escapeHtml(formatActivityDate(sel.createdAt))}</time>
              </p>
            </div>
            <a href="/teach/${opts.courseId}/activity" class="btn btn-ghost btn-compact" aria-label="Close diff drawer">✕</a>
          </header>

          <div class="drawer-meta mb-3" style="display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.8125rem; background: var(--bg-canvas); padding: 0.75rem; border-radius: var(--radius-sm);">
            <div><strong>Revision bump:</strong> <code>r${sel.baseRevision} → r${sel.newRevision}</code></div>
            <div><strong>Status:</strong> ${sel.outcome}</div>
          </div>

          <details class="drawer-technical-details mb-3 text-secondary" style="font-size: 0.75rem; background: var(--bg-canvas); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm);">
            <summary style="cursor: pointer; font-weight: 500;">Technical identifiers</summary>
            <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem;">
              <div><strong>Correlation ID:</strong> <code>${escapeHtml(sel.correlationId || 'N/A')}</code></div>
              <div><strong>Idempotency key:</strong> <code>${escapeHtml(sel.idempotencyKey || 'N/A')}</code></div>
              <div><strong>Mutation ID:</strong> <code>${escapeHtml(sel.id)}</code></div>
            </div>
          </details>

          <section class="affected-entities-section mb-3" aria-label="Affected Entities">
            <h3 style="font-size: 0.9375rem; margin-bottom: 0.5rem;">Affected Content</h3>
            <p class="text-secondary" style="font-size: 0.875rem;">${formatAffectedEntities(sel.affectedEntities, sel.toolName)}</p>
          </section>

          <section class="visual-diff-section mb-4" aria-label="Visual Diff" style="flex: 1;">
            <h3 style="font-size: 0.9375rem; margin-bottom: 0.5rem;">Before / After Comparison</h3>
            ${diffContentHtml}
          </section>

          <footer class="drawer-footer" style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-default); padding-top: 1rem; flex-wrap: wrap; gap: 0.75rem;">
            <a href="/teach/${opts.courseId}/activity" class="btn btn-secondary">Close drawer</a>
            ${
              opts.recoveryError
                ? `
                  <span class="recovery-retention-notice text-danger" id="recovery-fetch-error-msg" style="font-size: 0.8125rem;">
                    Unable to check recovery snapshots: ${escapeHtml(opts.recoveryError)}
                  </span>
                `
                : opts.recoveryRevisions === undefined || (opts.recoveryRevisions || []).some((r) => r.revisionNumber === sel.baseRevision)
                ? `
                  <a href="/teach/${opts.courseId}/activity?mutationId=${sel.id}&restore=true" class="btn btn-danger" id="restore-prior-btn">
                    Restore prior version (r${sel.baseRevision})
                  </a>
                `
                : `
                  <span class="recovery-retention-notice text-secondary" id="recovery-unavailable-msg" style="font-size: 0.8125rem;">
                    Recovery snapshot not retained for Revision ${sel.baseRevision}. Snapshots are preserved before batch operations and structural changes (retained for 30 days).
                  </span>
                `
            }
          </footer>
        </aside>
      </div>
    `;
  }
  return diffDrawerHtml;
}
