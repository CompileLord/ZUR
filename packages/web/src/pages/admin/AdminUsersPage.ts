import { renderIcon } from '../../components/common/icons.ts';
import { formatDate, sentenceCase } from '../../utils/formatters.ts';
import { formField, adminForm, table, pill, idChip, detailHeader, pageNav, escapeAdmin, renderActionDialog } from './admin-page-helpers.ts';

export function renderAdminUsersContent(path: string, data: any): string {
      const searchParams = new URLSearchParams(path.split('?')[1] || '');
      const searchVal = searchParams.get('search') || '';
      const statusVal = searchParams.get('status') || '';
      const isFiltered = Boolean(searchVal || statusVal);

      const rows = (data.items || []).map(
        (u: any) => `
        <tr>
          <td><a href="/admin/users/${encodeURIComponent(u.id)}" class="table-link font-medium">${escapeAdmin(u.displayName)}</a></td>
          <td><span class="text-secondary">${escapeAdmin(u.email)}</span></td>
          <td>${u.emailVerified ? pill('Verified', 'success') : pill('Unverified', 'neutral')}</td>
          <td><div class="badge-cluster">${u.capabilities.map((c: string) => pill(sentenceCase(c), 'neutral')).join('')}</div></td>
          <td>${pill(sentenceCase(u.accountStatus), u.accountStatus === 'active' ? 'success' : 'warning')}</td>
          <td><time datetime="${escapeAdmin(u.createdAt)}" title="${escapeAdmin(u.createdAt)}" class="text-secondary">${formatDate(u.createdAt)}</time></td>
        </tr>
      `
      );

      return `
        <div class="admin-page-header">
          <h1 class="page-title">Users</h1>
        </div>

        <form class="admin-filter-toolbar" action="/admin/users" method="get">
          <div class="search-input-wrapper">
            <span class="search-input-icon" aria-hidden="true">${renderIcon('search', { size: 16 })}</span>
            <input class="form-input search-input" name="search" placeholder="Search by name or email…" value="${escapeAdmin(searchVal)}" aria-label="Search users">
          </div>
          <div class="filter-select-wrapper">
            <label for="user-status-select" class="sr-only">Account state</label>
            <select id="user-status-select" name="status" class="form-input form-select" aria-label="Filter by account state">
              <option value="">All account states</option>
              ${['active', 'suspended', 'pending_deletion', 'purged'].map((s) => `<option value="${s}" ${statusVal === s ? 'selected' : ''}>${sentenceCase(s)}</option>`).join('')}
            </select>
          </div>
          <button type="submit" class="btn btn-secondary btn-compact">Search</button>
          ${isFiltered ? `<a href="/admin/users" class="btn btn-ghost btn-compact">Clear filters</a>` : ''}
        </form>

        ${table(['User', 'Email', 'Verification', 'Roles', 'Account state', 'Created'], rows, 'No matching users.', isFiltered ? '<a href="/admin/users">Clear filters</a> to see every account.' : 'Accounts appear here once people sign up.')}
        ${pageNav(data, path)}
      `;
}

export function renderAdminUserDetailContent(data: any): string {
      const u = data.user;
      const supported = data.supportRecords;
      const isSuspended = u.accountStatus === 'suspended';
      const hasAuthor = u.capabilities.includes('author');

      const enrollmentOptions = (data.enrollments || []).map(
        (e: any) => `<option value="${escapeAdmin(e.courseId)}">${escapeAdmin(e.title)} (pinned ${escapeAdmin(e.pinnedVersionId || 'latest')})</option>`
      ).join('');

      return `
        <p class="mb-4"><a href="/admin/users" class="back-link">${renderIcon('arrow-left', { size: 14 })} Back to users</a></p>
        ${detailHeader(escapeAdmin(u.displayName), pill(sentenceCase(u.accountStatus), isSuspended ? 'danger' : 'success'), idChip(u.id, 'User ID'))}

        <div class="admin-detail-layout">
          <div class="admin-detail-main">
        <div class="admin-entity-card mb-5">
          <div class="admin-definition-grid">
            <div class="admin-def-item">
              <span class="admin-def-label">Email</span>
              <span class="admin-def-value">${escapeAdmin(u.email)} ${u.emailVerified ? pill('Verified', 'success') : pill('Unverified', 'neutral')}</span>
            </div>
            <div class="admin-def-item">
              <span class="admin-def-label">Roles</span>
              <span class="admin-def-value"><div class="badge-cluster">${u.capabilities.map((c: string) => pill(sentenceCase(c), 'neutral')).join('')}</div></span>
            </div>
            <div class="admin-def-item">
              <span class="admin-def-label">Account state</span>
              <span class="admin-def-value">${pill(sentenceCase(u.accountStatus), isSuspended ? 'danger' : 'success')}</span>
            </div>
            <div class="admin-def-item">
              <span class="admin-def-label">Created</span>
              <span class="admin-def-value text-secondary">${formatDate(u.createdAt)}</span>
            </div>
          </div>
        </div>

        ${
          supported
            ? `<aside class="alert alert-warning mb-6" role="status">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <strong>Audited support access active.</strong> ${escapeAdmin(supported.support.reason)} · expires ${escapeAdmin(supported.support.expiresAt)} · ${escapeAdmin(supported.course.title)}.
                  </div>
                  <div>
                    <button type="button" class="btn btn-secondary btn-compact" data-open-dialog="dialog-revoke-support-access">End support access…</button>
                  </div>
                </div>
              </aside>
              ${renderActionDialog({
                id: 'dialog-revoke-support-access',
                title: `End support access · ${escapeAdmin(u.displayName)}`,
                target: `${escapeAdmin(u.displayName)} (${u.id})`,
                effect: 'Terminates this audited read-only support session immediately.',
                actionUrl: `/api/admin/support-access/${encodeURIComponent(supported.support.grantId)}/revoke`,
                buttonLabel: 'End support access',
                buttonVariant: 'danger',
                isDestructive: true
              })}
              <h2 class="section-title">Learning records · ${escapeAdmin(supported.course.title)}</h2>
              <div class="space-y-4 mb-6">
                ${supported.enrollments.map((e: any) => `
                  <section class="admin-overview-card">
                    <h3 class="font-semibold text-sm mb-2">Version ${e.versionNumber} · ${escapeAdmin(e.status)}</h3>
                    ${table(['Step', 'State', 'Evidence'], e.progress.map((p: any) => `<tr><td>${escapeAdmin(p.title || p.stepId)}</td><td>${p.isWaived ? 'Waived' : p.isCompleted ? 'Completed' : 'Not complete'}</td><td>${escapeAdmin(p.waiverReason || p.completedAt || 'None')}</td></tr>`), 'No progress records.')}
                    ${table(['Attempt', 'Step', 'Verdict', 'Date'], e.attempts.map((a: any) => `<tr><td>${a.attemptNumber}</td><td>${escapeAdmin(a.stepId)}</td><td>${escapeAdmin(a.verdict)}</td><td>${escapeAdmin(a.createdAt)}</td></tr>`), 'No assessment attempts.')}
                  </section>
                `).join('')}
              </div>`
            : ''
        }

        <h2 class="section-title mt-5">Privacy requests</h2>
        ${table(
          ['Type', 'Status', 'Blocker', 'Created', 'Support action'],
          (data.privacyRequests || []).map((r: any) => `
            <tr>
              <td>${escapeAdmin(r.request_type)}</td>
              <td>${pill(sentenceCase(r.status), r.status === 'completed' ? 'success' : 'neutral')}</td>
              <td>${escapeAdmin(r.blocker_reason || 'None')}</td>
              <td><time datetime="${escapeAdmin(r.created_at)}" title="${escapeAdmin(r.created_at)}">${formatDate(r.created_at)}</time></td>
              <td>
                ${
                  r.request_type === 'deletion' && ['pending', 'submitted'].includes(r.status)
                    ? `<button type="button" class="btn btn-danger btn-compact" data-open-dialog="dialog-purge-privacy-${r.id}">Purge account after review…</button>
                       ${renderActionDialog({
                         id: `dialog-purge-privacy-${r.id}`,
                         title: `Purge account · ${escapeAdmin(u.displayName)}`,
                         target: u.id,
                         currentState: 'Pending deletion',
                         resultingState: 'Purged',
                         effect: 'Permanently removes personal data, stored identity credentials, and session history.',
                         actionUrl: `/api/admin/privacy-requests/${encodeURIComponent(r.id)}`,
                         buttonLabel: 'Purge account after review',
                         buttonVariant: 'danger',
                         isDestructive: true
                       })}`
                    : r.request_type === 'export' && ['pending', 'submitted'].includes(r.status)
                    ? `<form class="admin-mutation-form" data-admin-export action="/api/admin/privacy-requests/${encodeURIComponent(r.id)}/export" method="post">
                        ${formField('reason', 'Export fulfillment reason')}
                        ${formField('currentPassword', 'Confirm administrator password', 'password')}
                        <button class="btn btn-primary btn-compact" type="submit">Prepare export for user</button>
                        <p class="form-error hidden" role="alert"></p>
                      </form>`
                    : adminForm(`/api/admin/privacy-requests/${encodeURIComponent(r.id)}`, `<select class="form-input" name="status"><option>pending</option><option>failed</option></select>`, 'Update request status', 'patch')
                }
              </td>
            </tr>
          `),
          'No privacy requests.',
          'Export and deletion requests from this user will be listed here.'
        )}

          </div>
          <aside class="admin-detail-side admin-actions-card" aria-label="Account actions">
            <h2 class="admin-side-title">Account actions</h2>
            <div class="admin-actions-stack">
              ${
                data.enrollments?.length && !supported
                  ? `<button type="button" class="btn btn-secondary" data-open-dialog="dialog-support-access">${renderIcon('shield', { size: 14 })} Open support access…</button>`
                  : ''
              }
              <button type="button" class="btn btn-secondary" data-open-dialog="dialog-manage-roles">${renderIcon('users', { size: 14 })} Manage roles…</button>
              ${isSuspended ? `<button type="button" class="btn btn-primary" data-open-dialog="dialog-restore-user">${renderIcon('check', { size: 14 })} Restore account…</button>` : ''}
            </div>
            ${
              isSuspended
                ? ''
                : `<div class="admin-danger-zone"><h3>Danger zone</h3><button type="button" class="btn btn-danger" data-open-dialog="dialog-suspend-user">${renderIcon('alert-triangle', { size: 14 })} Suspend account…</button></div>`
            }
          </aside>
        </div>

        <!-- Dialog: Suspend Account -->
        ${renderActionDialog({
          id: 'dialog-suspend-user',
          title: `Suspend ${escapeAdmin(u.displayName)}`,
          target: `${escapeAdmin(u.displayName)} (${u.id})`,
          currentState: 'Active',
          resultingState: 'Suspended',
          effect: 'Suspends account authentication and active sessions. Course progress and enrollment records are preserved.',
          actionUrl: `/api/admin/users/${encodeURIComponent(u.id)}/suspend`,
          buttonLabel: 'Suspend account',
          buttonVariant: 'danger',
          isDestructive: true
        })}

        <!-- Dialog: Restore Account -->
        ${renderActionDialog({
          id: 'dialog-restore-user',
          title: `Restore ${escapeAdmin(u.displayName)}`,
          target: `${escapeAdmin(u.displayName)} (${u.id})`,
          currentState: 'Suspended',
          resultingState: 'Active',
          effect: 'Restores account login and learning workspace access.',
          actionUrl: `/api/admin/users/${encodeURIComponent(u.id)}/restore`,
          buttonLabel: 'Restore account',
          buttonVariant: 'primary'
        })}

        <!-- Dialog: Manage Roles -->
        ${renderActionDialog({
          id: 'dialog-manage-roles',
          title: `Manage roles · ${escapeAdmin(u.displayName)}`,
          target: `${escapeAdmin(u.displayName)} (${u.id})`,
          currentState: u.capabilities.join(', '),
          resultingState: hasAuthor ? u.capabilities.filter((c: string) => c !== 'author').join(', ') : [...u.capabilities, 'author'].join(', '),
          effect: hasAuthor
            ? 'Revokes authoring studio access and agent token management. Previously authored courses remain preserved.'
            : 'Grants access to authoring studio, course builder, and agent authoring tokens.',
          actionUrl: `/api/admin/users/${encodeURIComponent(u.id)}/${hasAuthor ? 'revoke-author' : 'grant-author'}`,
          buttonLabel: hasAuthor ? 'Revoke author role' : 'Grant author role',
          buttonVariant: hasAuthor ? 'danger' : 'primary',
          isDestructive: hasAuthor
        })}

        <!-- Dialog: Support Access -->
        ${
          data.enrollments?.length
            ? renderActionDialog({
                id: 'dialog-support-access',
                title: `Open support access · ${escapeAdmin(u.displayName)}`,
                target: `${escapeAdmin(u.displayName)} (${u.id})`,
                effect: 'Grants a 30-minute audited read-only session to inspect learner attempts and progress records.',
                actionUrl: '/api/admin/support-access',
                extraContent: `
                  <input type="hidden" name="userId" value="${escapeAdmin(u.id)}">
                  <label class="form-group">
                    <span class="form-label">Course to inspect</span>
                    <select class="form-input form-select" name="courseId" required>
                      ${enrollmentOptions}
                    </select>
                  </label>
                `,
                buttonLabel: 'Start 30-minute support access',
                buttonVariant: 'primary'
              })
            : ''
        }
      `;
}
