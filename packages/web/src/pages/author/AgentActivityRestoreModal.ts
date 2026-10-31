import type { AgentActivityPageOptions } from './AgentActivityTypes.ts';
import { escapeHtml } from './AgentActivityFormat.ts';

export function renderActivityRestoreModal(opts: AgentActivityPageOptions): string {
  // Restore Confirmation Modal
  let restoreModalHtml = '';
  if (opts.showRestoreConfirmModal && opts.selectedMutation) {
    const sel = opts.selectedMutation;
    const matchingRecovery = opts.recoveryRevisions === undefined
      ? { id: sel.id, revisionNumber: sel.baseRevision }
      : (opts.recoveryRevisions || []).find((r) => r.revisionNumber === sel.baseRevision);

    if (opts.recoveryError) {
      restoreModalHtml = `
        <div class="modal-backdrop" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1100;" role="presentation">
          <div class="modal-card card p-4" role="alertdialog" aria-modal="true" aria-labelledby="restore-modal-title" style="max-width: 540px; width: 90%; background-color: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-md);">
            <header class="mb-3">
              <h2 id="restore-modal-title" class="modal-title text-danger" style="font-size: 1.25rem; margin: 0 0 0.5rem 0;">
                Recovery Service Unavailable
              </h2>
              <p class="text-secondary" style="font-size: 0.875rem;">
                Could not verify draft recovery snapshots: ${escapeHtml(opts.recoveryError)}.
              </p>
            </header>
            <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
              <a href="/teach/${opts.courseId}/activity?mutationId=${sel.id}" class="btn btn-secondary" id="close-unavailable-restore-btn">Close</a>
            </div>
          </div>
        </div>
      `;
    } else if (matchingRecovery) {
      const currentRev = opts.currentDraftRevision ?? sel.newRevision;
      const nextRev = currentRev + 1;
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

            ${
              opts.restoreConflict
                ? `
                  <div id="restore-conflict-msg" class="restore-conflict-alert mb-3" role="alert" aria-live="assertive" style="background: rgba(216, 59, 1, 0.1); border: 1px solid var(--danger); border-radius: var(--radius-sm); padding: 0.75rem 1rem;">
                    <strong style="color: var(--danger); display: block; margin-bottom: 0.25rem;">Revision Conflict (Concurrent modification detected)</strong>
                    <p style="margin: 0 0 0.5rem 0; font-size: 0.875rem; color: var(--fg-default);">
                      ${escapeHtml(opts.restoreConflict.message || 'The course draft has been modified since it was loaded. Please review changes before restoring.')}
                    </p>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                      <a href="/teach/${escapeHtml(opts.courseId)}/activity" id="btn-reload-current-revision" class="btn btn-secondary btn-compact">Reload latest draft state</a>
                    </div>
                  </div>
                `
                : ''
            }

            <div class="restore-explanation mb-4" style="background: var(--bg-canvas); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.875rem; line-height: 1.5;">
              <p style="margin: 0 0 0.75rem 0;">
                This operation will restore content from prior snapshot and create a <strong>new draft revision</strong> (Revision ${nextRev}).
              </p>
              <p class="text-warning" style="font-weight: 600; margin: 0;">
                Published versions, student progress, and live access settings won't be rolled back.
              </p>
            </div>

            <form method="POST" action="/api/author/courses/${opts.courseId}/recovery/${matchingRecovery.id}/restore">
              <input type="hidden" name="expectedRevision" value="${currentRev}" />
              <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                <a href="/teach/${opts.courseId}/activity?mutationId=${sel.id}" class="btn btn-secondary" id="cancel-restore-btn">Cancel</a>
                <button type="submit" class="btn btn-danger" id="confirm-restore-btn" ${opts.restoreConflict ? 'disabled' : ''}>Confirm restore</button>
              </div>
            </form>
          </div>
        </div>
      `;
    } else {
      restoreModalHtml = `
        <div class="modal-backdrop" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1100;" role="presentation">
          <div class="modal-card card p-4" role="alertdialog" aria-modal="true" aria-labelledby="restore-modal-title" style="max-width: 540px; width: 90%; background-color: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-md);">
            <header class="mb-3">
              <h2 id="restore-modal-title" class="modal-title" style="font-size: 1.25rem; margin: 0 0 0.5rem 0;">
                Recovery Snapshot Unavailable
              </h2>
              <p class="text-secondary" style="font-size: 0.875rem;">
                No recovery snapshot is retained for <strong>Revision ${sel.baseRevision}</strong>. Snapshots are preserved before batch operations and structural changes (retained for 30 days).
              </p>
            </header>
            <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
              <a href="/teach/${opts.courseId}/activity?mutationId=${sel.id}" class="btn btn-secondary" id="close-unavailable-restore-btn">Close</a>
            </div>
          </div>
        </div>
      `;
    }
  }
  return restoreModalHtml;
}
