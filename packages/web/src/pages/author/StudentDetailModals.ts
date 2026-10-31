import { escapeHtml } from './StudentDetailFormat.ts';

export function renderStudentAccessModals(studentDisplayName: string, enrollmentId: string): string {
  return `<!-- Revoke Student Confirmation Modal Dialog -->
    <div id="revoke-student-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="revoke-modal-title">
      <div class="modal-dialog confirm max-w-md p-6 bg-raised border border-danger rounded-xl shadow-lg">
        <h2 id="revoke-modal-title" class="text-lg font-semibold text-danger mb-2">Revoke Course Access</h2>
        <p class="text-sm text-secondary mb-4 leading-relaxed">
          Revoke course access for <strong id="revoke-student-display-name" class="text-primary font-semibold">${escapeHtml(studentDisplayName)}</strong>?
        </p>
        <div class="p-3 bg-danger-bg text-danger border border-danger rounded text-xs mb-4 leading-relaxed">
          <strong>Important:</strong> Revoking access restricts this student from viewing or continuing the course. It <strong>explicitly does not delete their account</strong>. All verified progress, step completion timestamps, and submitted attempts are retained.
        </div>
        <div class="form-group mb-4">
          <label for="revoke-reason-input" class="form-label block text-xs font-semibold uppercase text-secondary mb-1">Reason for revocation (optional)</label>
          <input type="text" id="revoke-reason-input" class="form-input w-full text-sm" placeholder="e.g. End of term, duplicate enrollment" />
        </div>
        <input type="hidden" id="revoke-enrollment-id-input" value="${escapeHtml(enrollmentId)}" />
        <div class="flex justify-end gap-3 pt-3 border-t border-subtle">
          <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
          <button type="button" id="btn-confirm-revoke" class="btn btn-destructive">Revoke access</button>
        </div>
      </div>
    </div>

    <!-- Reinstate Student Confirmation Modal Dialog -->
    <div id="reinstate-student-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="reinstate-modal-title">
      <div class="modal-dialog confirm max-w-md p-6 bg-raised border border-subtle rounded-xl shadow-lg">
        <h2 id="reinstate-modal-title" class="text-lg font-semibold text-primary mb-2">Reinstate Course Access</h2>
        <p class="text-sm text-secondary mb-4 leading-relaxed">
          Reinstate access for <strong id="reinstate-student-display-name" class="text-primary font-semibold">${escapeHtml(studentDisplayName)}</strong>?
        </p>
        <p class="text-xs text-muted mb-4">
          The student will immediately regain access to resume their course where they left off, on their previously pinned version.
        </p>
        <input type="hidden" id="reinstate-enrollment-id-input" value="${escapeHtml(enrollmentId)}" />
        <div class="flex justify-end gap-3 pt-3 border-t border-subtle">
          <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
          <button type="button" id="btn-confirm-reinstate" class="btn btn-primary">Reinstate access</button>
        </div>
      </div>
    </div>`;
}
