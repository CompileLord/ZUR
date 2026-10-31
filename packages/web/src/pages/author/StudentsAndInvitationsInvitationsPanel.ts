import { escapeHtml, formatDate } from './StudentsAndInvitationsFormat.ts';
import type { StudentsAndInvitationsPageProps } from './StudentsAndInvitationsTypes.ts';

export function renderInvitationsPanel(props: StudentsAndInvitationsPageProps, activeTab: string): string {
  return `<!-- Invitations Panel -->
      <div id="panel-invitations" role="tabpanel" aria-labelledby="tab-btn-invitations" class="${activeTab === 'invitations' ? '' : 'hidden'}">
        <div class="data-table-wrapper border border-subtle rounded-lg bg-surface overflow-x-auto">
          <table class="data-table w-full text-left border-collapse text-sm" aria-label="Course invitations list">
            <thead>
              <tr class="border-b border-subtle bg-raised text-secondary font-semibold">
                <th scope="col" class="py-3 px-4">Type</th>
                <th scope="col" class="py-3 px-4">Recipient / Token Link</th>
                <th scope="col" class="py-3 px-4">Usage</th>
                <th scope="col" class="py-3 px-4">Expiry</th>
                <th scope="col" class="py-3 px-4">Status</th>
                <th scope="col" class="py-3 px-4">Email delivery</th>
                <th scope="col" class="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${props.invitations.length === 0 ? `
                <tr>
                  <td colspan="7" class="p-8 text-center text-secondary">
                    <p class="font-medium text-base mb-1">No invitations generated</p>
                    <p class="text-xs text-muted">Generate an email invitation or shareable link to invite learners.</p>
                  </td>
                </tr>
              ` : props.invitations.map((inv) => {
                const isExpired = new Date(inv.expiresAt).getTime() < Date.now();
                const statusBadge = inv.isRevoked
                  ? '<span class="status-badge danger">Revoked</span>'
                  : isExpired
                  ? '<span class="status-badge muted">Expired</span>'
                  : '<span class="status-badge success">Active</span>';

                

                return `
                  <tr class="border-b border-subtle hover:bg-hover transition-colors" data-invitation-id="${escapeHtml(inv.id)}">
                    <td class="py-3 px-4">
                      <span class="inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded bg-raised border border-subtle">
                        ${inv.type === 'email' ? 'Email' : 'Shareable link'}
                      </span>
                    </td>
                    <td class="py-3 px-4">
                      ${inv.type === 'email' ? `
                        <span class="font-medium">${escapeHtml(inv.recipientEmail || 'Recipient hidden')}</span>
                      ` : `
                        <span class="text-secondary">Shareable link · token shown only when created</span>
                      `}
                    </td>
                    <td class="py-3 px-4 text-secondary text-xs">
                      ${inv.maxUses ? `${inv.usesCount} / ${inv.maxUses} uses` : `${inv.usesCount} uses (unlimited)`}
                    </td>
                    <td class="py-3 px-4 text-secondary text-xs">
                      ${formatDate(inv.expiresAt)}
                    </td>
                    <td class="py-3 px-4">
                      ${statusBadge}
                    </td>
                    <td class="py-3 px-4 text-xs text-secondary">${inv.type === 'email' ? escapeHtml(inv.emailDeliveryStatus || 'Not sent') : 'Not applicable'}</td>
                    <td class="py-3 px-4 text-right">
                      <div class="flex items-center justify-end gap-2">
                        ${inv.type === 'email' && !inv.isRevoked ? `
                          <button
                            type="button"
                            class="btn btn-secondary btn-compact"
                            data-action="resend-invitation"
                            data-invitation-id="${escapeHtml(inv.id)}"
                          >
                            Resend
                          </button>
                        ` : ''}
                        ${!inv.isRevoked && !isExpired ? `
                          <button
                            type="button"
                            class="btn btn-ghost btn-compact text-danger hover:bg-danger-bg"
                            data-action="revoke-invitation"
                            data-invitation-id="${escapeHtml(inv.id)}"
                          >
                            Revoke
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
}
