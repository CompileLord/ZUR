import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';

export interface StudentsAndInvitationsPageProps {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  totalStudentsCount: number;
  roster: {
    items: Array<{
      enrollmentId: string;
      userId: string;
      displayName: string;
      email?: string | null;
      versionNumber: number | null;
      versionId: string | null;
      status: string;
      requiredStepsCompleted: number;
      totalRequiredSteps: number;
      progressPercentage: number;
      lastLearningActivityAt: string | null;
      enrolledAt: string;
    }>;
    totalCount?: number;
    total?: number;
    limit: number;
    offset: number;
  };
  invitations: Array<{
    id: string;
    courseId: string;
    type: 'email' | 'shareable_link';
    recipientEmail: string | null;
    expiresAt: string;
    maxUses: number | null;
    usesCount: number;
    isRevoked: boolean;
    emailDeliveryStatus?: 'pending' | 'sent' | 'failed' | 'not_configured' | null;
    emailSentAt?: string | null;
    createdAt: string;
  }>;
  availableVersions?: Array<{ id: string; versionNumber: number }>;
  currentTab?: 'enrolled' | 'invitations';
  filters?: {
    search?: string;
    status?: string;
    version?: string;
  };
  actionMessage?: { type: 'success' | 'error'; text: string };
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'No activity yet';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function renderStudentsAndInvitationsPage(props: StudentsAndInvitationsPageProps): string {
  const activeTab = props.currentTab || 'enrolled';
  const rawRoster: any = props.roster || {};
  const studentList: any[] = rawRoster.students || rawRoster.items || [];
  const enrolledCount = rawRoster.total ?? rawRoster.totalCount ?? studentList.length;
  const invitationsList = props.invitations || [];
  const invitationsCount = invitationsList.length;
  const pageLimit = rawRoster.limit || 20;
  const pageOffset = rawRoster.offset || 0;
  const versionsList = props.availableVersions || rawRoster.versions || [];

  const content = `
    <div class="students-page-container p-6 max-w-7xl mx-auto" data-course-id="${escapeHtml(props.courseId)}">
      <!-- Top Header -->
      <header class="students-header flex justify-between items-center mb-6 pb-4 border-b border-subtle">
        <div>
          <h1 class="page-title text-2xl font-bold tracking-tight">Students and invitations</h1>
        </div>
        <div class="header-actions">
          <button id="btn-open-invite-modal" class="btn btn-primary" type="button" aria-haspopup="dialog">
            <span aria-hidden="true">+</span> Invite students
          </button>
        </div>
      </header>

      ${props.actionMessage ? `
        <div class="alert alert-${props.actionMessage.type === 'error' ? 'danger' : 'success'} mb-6" role="alert">
          ${escapeHtml(props.actionMessage.text)}
        </div>
      ` : ''}

      <!-- Contextual Tabs -->
      <div class="tabs-nav border-b border-subtle mb-6 flex gap-4" role="tablist" aria-label="Student management sections">
        <button
          id="tab-btn-enrolled"
          class="tab-link pb-3 font-medium text-sm border-b-2 ${activeTab === 'enrolled' ? 'active border-primary text-primary' : 'border-transparent text-secondary'}"
          role="tab"
          aria-selected="${activeTab === 'enrolled'}"
          aria-controls="panel-enrolled"
          type="button"
        >
          Enrolled (${enrolledCount})
        </button>
        <button
          id="tab-btn-invitations"
          class="tab-link pb-3 font-medium text-sm border-b-2 ${activeTab === 'invitations' ? 'active border-primary text-primary' : 'border-transparent text-secondary'}"
          role="tab"
          aria-selected="${activeTab === 'invitations'}"
          aria-controls="panel-invitations"
          type="button"
        >
          Invitations (${invitationsCount})
        </button>
      </div>

      <!-- Enrolled Panel -->
      <div id="panel-enrolled" role="tabpanel" aria-labelledby="tab-btn-enrolled" class="${activeTab === 'enrolled' ? '' : 'hidden'}">
        <!-- Plain Filter Toolbar -->
        <div class="roster-toolbar flex flex-wrap gap-3 items-center justify-between mb-6">
          <div class="flex-1 min-w-[240px]">
            <label for="roster-search" class="sr-only">Search students</label>
            <input
              type="search"
              id="roster-search"
              class="form-input w-full text-sm"
              placeholder="Search students by display name…"
              value="${escapeHtml(props.filters?.search || '')}"
            />
          </div>
          <div class="flex gap-3 items-center">
            <div>
              <label for="roster-status-filter" class="sr-only">Filter by status</label>
              <select id="roster-status-filter" class="form-select text-sm">
                <option value="all" ${!props.filters?.status || props.filters.status === 'all' ? 'selected' : ''}>All access states</option>
                <option value="active" ${props.filters?.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="revoked" ${props.filters?.status === 'revoked' ? 'selected' : ''}>Revoked</option>
                <option value="left" ${props.filters?.status === 'left' ? 'selected' : ''}>Left</option>
              </select>
            </div>
            ${versionsList.length > 0 ? `
              <div>
                <label for="roster-version-filter" class="sr-only">Filter by version</label>
                <select id="roster-version-filter" class="form-select text-sm">
                  <option value="" ${!props.filters?.version ? 'selected' : ''}>All versions</option>
                  ${versionsList.map((v: any) => `
                    <option value="${escapeHtml(String(v.versionNumber || v.id))}" ${props.filters?.version === String(v.versionNumber || v.id) ? 'selected' : ''}>
                      Version ${v.versionNumber}
                    </option>
                  `).join('')}
                </select>
              </div>
            ` : ''}
            <button id="btn-apply-filters" class="btn btn-secondary btn-compact" type="button">Filter</button>
            ${(props.filters?.search || (props.filters?.status && props.filters.status !== 'all') || props.filters?.version) ? `
              <button id="btn-clear-roster-filters" class="btn btn-ghost btn-compact text-secondary" type="button">Reset</button>
            ` : ''}
          </div>
        </div>

        <!-- Roster Table -->
        <div class="data-table-wrapper border border-subtle rounded-lg bg-surface overflow-x-auto">
          <table class="data-table w-full text-left border-collapse text-sm" aria-label="Student enrollments roster">
            <thead>
              <tr class="border-b border-subtle bg-raised text-secondary font-semibold">
                <th scope="col" class="py-3 px-4">Student</th>
                <th scope="col" class="py-3 px-4">Enrolled version</th>
                <th scope="col" class="py-3 px-4">Required progress</th>
                <th scope="col" class="py-3 px-4">Last learning activity</th>
                <th scope="col" class="py-3 px-4">Access state</th>
                <th scope="col" class="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${studentList.length === 0 ? `
                <tr>
                  <td colspan="6" class="p-8 text-center text-secondary">
                    <p class="font-medium text-base mb-1">No students found</p>
                    <p class="text-xs text-muted">No learners match your search criteria or have enrolled in this course.</p>
                  </td>
                </tr>
              ` : studentList.map((item: any) => {
                const statusBadge = item.status === 'active'
                  ? '<span class="status-badge success">Active</span>'
                  : item.status === 'revoked'
                  ? '<span class="status-badge danger">Revoked</span>'
                  : '<span class="status-badge info">Left</span>';

                const email = item.maskedEmail || item.email || '';
                const versionNum = item.pinnedVersionNumber ?? item.versionNumber ?? 1;
                const completedSteps = item.completedStepsCount ?? item.requiredStepsCompleted ?? 0;
                const totalRequired = item.totalRequiredStepsCount ?? item.totalRequiredSteps ?? 0;
                const progressPct = item.progressPercent ?? item.progressPercentage ?? 0;
                const lastAct = item.lastActivityAt || item.lastLearningActivityAt;

                return `
                  <tr class="border-b border-subtle hover:bg-hover transition-colors" data-enrollment-id="${escapeHtml(item.enrollmentId)}">
                    <td class="py-3 px-4">
                      <a href="/teach/${escapeHtml(props.courseId)}/students/${escapeHtml(item.enrollmentId)}" class="font-medium text-primary hover:underline block">
                        ${escapeHtml(item.displayName)}
                      </a>
                      ${email ? `
                        <span class="text-xs text-muted font-mono block mt-0.5" title="Masked student email for privacy">
                          ${escapeHtml(email)}
                        </span>
                      ` : ''}
                    </td>
                    <td class="py-3 px-4 text-secondary">
                      <span class="inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded bg-raised border border-subtle">
                        v${versionNum}
                      </span>
                    </td>
                    <td class="py-3 px-4">
                      <div class="progress-cell flex flex-col gap-1 min-w-[140px]" role="progressbar" aria-valuenow="${progressPct}" aria-valuemin="0" aria-valuemax="100">
                        <div class="flex justify-between text-xs text-secondary mb-1">
                          <span>${completedSteps} / ${totalRequired} steps</span>
                          <span class="font-medium">${progressPct}%</span>
                        </div>
                        <div class="progress-track" aria-hidden="true" style="height: 6px; background-color: var(--border-subtle); border-radius: 3px; overflow: hidden; width: 100%;">
                          <div class="progress-fill" style="width: ${Math.min(100, Math.max(0, progressPct))}%; height: 100%; background-color: var(--accent); border-radius: 3px;"></div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-4 text-secondary text-xs">
                      ${formatDate(lastAct)}
                    </td>
                    <td class="py-3 px-4">
                      ${statusBadge}
                    </td>
                    <td class="py-3 px-4 text-right">
                      <div class="flex items-center justify-end gap-2">
                        <a href="/teach/${escapeHtml(props.courseId)}/students/${escapeHtml(item.enrollmentId)}" class="btn btn-secondary btn-compact" aria-label="View detail for ${escapeHtml(item.displayName)}">
                          View detail
                        </a>
                        ${item.status === 'active' || item.status === 'revoked' ? `
                          <details class="action-overflow relative inline-block text-left">
                            <summary class="btn btn-ghost btn-compact px-2 cursor-pointer list-none select-none text-secondary hover:text-primary" aria-label="More actions for ${escapeHtml(item.displayName)}">⋮</summary>
                            <div class="overflow-dropdown-menu">
                              ${item.status === 'active' ? `
                                <button
                                  type="button"
                                  class="dropdown-item text-danger"
                                  data-action="open-revoke"
                                  data-enrollment-id="${escapeHtml(item.enrollmentId)}"
                                  data-student-name="${escapeHtml(item.displayName)}"
                                  aria-label="Revoke access for ${escapeHtml(item.displayName)}"
                                >
                                  Revoke
                                </button>
                              ` : `
                                <button
                                  type="button"
                                  class="dropdown-item text-secondary hover:text-primary"
                                  data-action="open-reinstate"
                                  data-enrollment-id="${escapeHtml(item.enrollmentId)}"
                                  data-student-name="${escapeHtml(item.displayName)}"
                                  aria-label="Reinstate access for ${escapeHtml(item.displayName)}"
                                >
                                  Reinstate
                                </button>
                              `}
                            </div>
                          </details>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <nav class="flex items-center justify-between gap-3 mt-4" aria-label="Roster pages">
          <span class="text-sm text-secondary">${enrolledCount === 0 ? '0 students' : `${pageOffset + 1}–${Math.min(pageOffset + studentList.length, enrolledCount)} of ${enrolledCount} students`}</span>
          <div class="flex gap-2">
            <button class="btn btn-secondary" type="button" data-action="roster-page" data-offset="${Math.max(0, pageOffset - pageLimit)}" ${pageOffset === 0 ? 'disabled' : ''}>Previous</button>
            <button class="btn btn-secondary" type="button" data-action="roster-page" data-offset="${pageOffset + pageLimit}" ${pageOffset + pageLimit >= enrolledCount ? 'disabled' : ''}>Next</button>
          </div>
        </nav>
      </div>

      <!-- Invitations Panel -->
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
                    <td class="py-3 px-4 text-xs text-secondary">${inv.type === 'email' ? escapeHtml(inv.emailDeliveryStatus || 'Not sent') : '—'}</td>
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
      </div>
    </div>

    <!-- Invite Students Modal Dialog -->
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
    </div>
  `;

  return renderAuthorWorkspaceShell({
    courseId: props.courseId,
    courseTitle: props.courseTitle,
    publicationState: props.publicationState,
    hasUnpublishedChanges: props.hasUnpublishedChanges,
    activeTab: 'students',
    editorContent: content,
  });
}
