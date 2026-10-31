import { escapeHtml } from './StudentsAndInvitationsFormat.ts';
import type { StudentsAndInvitationsPageProps } from './StudentsAndInvitationsTypes.ts';

export function renderStudentsAndInvitationsModals(props: StudentsAndInvitationsPageProps): string {
  return `<!-- Invite Students Modal Dialog -->
    <div id="invite-students-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
      <div class="modal-dialog max-w-lg p-6 bg-raised border border-subtle rounded-xl shadow-lg">
        <div class="flex justify-between items-center pb-3 border-b border-subtle">
          <h2 id="invite-modal-title" class="text-lg font-semibold">Invite students to course</h2>
          <button type="button" class="btn btn-icon text-secondary" data-action="close-modal" aria-label="Close dialog">✕</button>
        </div>

        <div class="invite-modal-tabs flex gap-4 mt-4 border-b border-subtle" role="tablist">
          <button id="invite-tab-email" class="tab-link pb-2 font-medium text-sm active border-b-2 border-primary text-primary" role="tab" aria-selected="true" type="button">
            Email invitation
          </button>
          <button id="invite-tab-link" class="tab-link pb-2 font-medium text-sm border-b-2 border-transparent text-secondary" role="tab" aria-selected="false" type="button">
            Shareable link
          </button>
        </div>

        <!-- Tab 1: Email Form -->
        <div id="invite-panel-email" class="modal-tab-panel py-4">
          <form id="form-invite-email" class="space-y-4">
            <div id="email-invite-error" class="hidden alert alert-danger text-xs mb-3" role="alert"></div>
            <div id="email-invite-success" class="hidden alert alert-success text-xs mb-3" role="alert"></div>

            <div class="form-group">
              <label for="invite-recipient-email" class="form-label block text-xs font-semibold uppercase text-secondary mb-1">Student email</label>
              <input
                type="email"
                id="invite-recipient-email"
                required
                class="form-input w-full text-sm"
                placeholder="learner@institution.edu"
              />
              <p class="text-xs text-muted mt-1">The invitation email is sent when delivery is configured. You can copy its link if delivery is unavailable.</p>
            </div>

            <div class="p-3 bg-surface border border-subtle rounded text-xs text-secondary leading-relaxed">
              <strong>Validity & Expiration:</strong> Email invitations expire after 7 days. Recipients must accept the invitation to enroll. A generated link is valid even if you cannot deliver it.
            </div>

            <div id="email-created-link-container" class="hidden p-3 bg-surface border border-control rounded space-y-2">
              <label for="email-created-link" class="form-label">Invitation link for recipient</label>
              <input id="email-created-link" class="form-input w-full" readonly type="text" />
              <button id="btn-copy-email-link" class="btn btn-secondary" type="button">Copy link</button>
            </div>
            <div class="flex justify-end gap-3 pt-3 border-t border-subtle">
              <button type="button" class="btn btn-secondary" data-action="close-modal">Done</button>
              <button type="submit" id="btn-submit-email-invite" class="btn btn-primary">Send invitation</button>
            </div>
          </form>
        </div>

        <!-- Tab 2: Shareable Link Form -->
        <div id="invite-panel-link" class="modal-tab-panel py-4 hidden">
          <form id="form-invite-link" class="space-y-4">
            <div id="link-invite-error" class="hidden alert alert-danger text-xs mb-3" role="alert"></div>
            <div id="link-invite-success" class="hidden alert alert-success text-xs mb-3" role="alert"></div>

            <div class="grid grid-cols-2 gap-4">
              <div class="form-group">
                <label for="invite-link-days" class="form-label block text-xs font-semibold uppercase text-secondary mb-1">Valid for</label>
                <select id="invite-link-days" class="form-select w-full text-sm">
                  <option value="7">7 days</option>
                  <option value="14" selected>14 days</option>
                  <option value="30">30 days</option>
                </select>
              </div>

              <div class="form-group">
                <label for="invite-link-max-uses" class="form-label block text-xs font-semibold uppercase text-secondary mb-1">Max uses (optional)</label>
                <input
                  type="number"
                  id="invite-link-max-uses"
                  min="1"
                  class="form-input w-full text-sm"
                  placeholder="Unlimited if blank"
                />
              </div>
            </div>

            <div class="p-3 bg-surface border border-subtle rounded text-xs text-secondary leading-relaxed">
              <strong>Notice:</strong> Shareable links allow anyone with the link to enroll until expiration or use limit. Rotating or revoking a link leaves existing enrollments active.
            </div>

            <div id="generated-link-container" class="hidden p-3 bg-surface border border-accent rounded space-y-2">
              <label for="generated-invite-input" class="text-xs font-semibold text-primary block">Shareable Enrollment Link:</label>
              <div class="flex gap-2">
                <input type="text" id="generated-invite-input" readonly class="form-input flex-1 font-mono text-xs" />
                <button type="button" id="btn-copy-generated-link" class="btn btn-primary btn-compact">Copy link</button>
              </div>
            </div>

            <div class="flex justify-end gap-3 pt-3 border-t border-subtle">
              <button type="button" class="btn btn-secondary" data-action="close-modal">Done</button>
              <button type="submit" id="btn-create-shareable-link" class="btn btn-primary">Generate shareable link</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Revoke Student Confirmation Modal Dialog -->
    <div id="revoke-student-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="revoke-modal-title">
      <div class="modal-dialog confirm max-w-md p-6 bg-raised border border-danger rounded-xl shadow-lg">
        <h2 id="revoke-modal-title" class="text-lg font-semibold text-danger mb-2">Revoke Course Access</h2>
        <p class="text-sm text-secondary mb-4 leading-relaxed">
          Are you sure you want to revoke course access for <strong id="revoke-student-display-name" class="text-primary font-semibold"></strong> from <em>${escapeHtml(props.courseTitle)}</em>?
        </p>
        <div class="p-3 bg-danger-bg text-danger border border-danger rounded text-xs mb-4 leading-relaxed">
          <strong>Important:</strong> Revoking access restricts this student from viewing or continuing the course. It <strong>explicitly does not delete their account</strong>. All verified progress, step completion timestamps, and submitted attempts are retained.
        </div>
        <div class="form-group mb-4">
          <label for="revoke-reason-input" class="form-label block text-xs font-semibold uppercase text-secondary mb-1">Reason for revocation (optional)</label>
          <input type="text" id="revoke-reason-input" class="form-input w-full text-sm" placeholder="e.g. End of term, duplicate enrollment" />
        </div>
        <input type="hidden" id="revoke-enrollment-id-input" value="" />
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
          Reinstate access for <strong id="reinstate-student-display-name" class="text-primary font-semibold"></strong>?
        </p>
        <p class="text-xs text-muted mb-4">
          The student will immediately regain access to resume their course where they left off, on their previously pinned version.
        </p>
        <input type="hidden" id="reinstate-enrollment-id-input" value="" />
        <div class="flex justify-end gap-3 pt-3 border-t border-subtle">
          <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
          <button type="button" id="btn-confirm-reinstate" class="btn btn-primary">Reinstate access</button>
        </div>
      </div>
    </div>`;
}
