import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';
import { escapeHtml, formatDate, formatRelativeTime } from './StudentsAndInvitationsFormat.ts';
import { renderInvitationsPanel } from './StudentsAndInvitationsInvitationsPanel.ts';
import { renderStudentsAndInvitationsModals } from './StudentsAndInvitationsModals.ts';
import type { StudentsAndInvitationsPageProps } from './StudentsAndInvitationsTypes.ts';

export { formatRelativeTime } from './StudentsAndInvitationsFormat.ts';
export type { StudentsAndInvitationsPageProps } from './StudentsAndInvitationsTypes.ts';

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
          <h1 class="page-title text-2xl font-bold tracking-tight" aria-label="Students and invitations">Students</h1>
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
        <div class="roster-toolbar">
          <div class="roster-search-field">
            <label for="roster-search" class="sr-only">Search students</label>
            <input
              type="search"
              id="roster-search"
              class="form-input w-full text-sm"
              placeholder="Search students by display name…"
              value="${escapeHtml(props.filters?.search || '')}"
            />
          </div>
          <div class="roster-filter-group">
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
        <div class="data-table-wrapper roster-table-wrapper border border-subtle rounded-lg bg-surface overflow-x-auto">
          <table class="data-table roster-table w-full text-left border-collapse text-sm" aria-label="Student enrollments roster">
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
                  <tr class="roster-row border-b border-subtle hover:bg-hover transition-colors" data-enrollment-id="${escapeHtml(item.enrollmentId)}">
                    <td class="py-3 px-4">
                      <div class="student-cell">
                        <span class="student-avatar" aria-hidden="true">${escapeHtml((String(item.displayName || '?').trim()[0] || '?').toUpperCase())}</span>
                        <div class="student-identity">
                          <a href="/teach/${escapeHtml(props.courseId)}/students/${escapeHtml(item.enrollmentId)}" class="font-medium text-primary hover:underline block">
                            ${escapeHtml(item.displayName)}
                          </a>
                          ${email ? `
                            <span class="text-xs text-muted font-mono block mt-0.5" title="Masked student email for privacy">
                              ${escapeHtml(email)}
                            </span>
                          ` : ''}
                        </div>
                      </div>
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
                        <div class="progress-track" aria-hidden="true">
                          <div class="progress-fill" style="width: ${Math.min(100, Math.max(0, progressPct))}%;"></div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-4 text-secondary text-xs">
                      <time ${lastAct ? `datetime="${escapeHtml(lastAct)}"` : ''} title="${escapeHtml(formatDate(lastAct))}">${escapeHtml(formatRelativeTime(lastAct))}</time>
                    </td>
                    <td class="py-3 px-4">
                      ${statusBadge}
                    </td>
                    <td class="py-3 px-4 text-right">
                      <div class="row-actions flex items-center justify-end gap-2">
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
          ${enrolledCount > pageLimit ? `
            <div class="flex gap-2">
              <button class="btn btn-secondary" type="button" data-action="roster-page" data-offset="${Math.max(0, pageOffset - pageLimit)}" ${pageOffset === 0 ? 'disabled' : ''}>Previous</button>
              <button class="btn btn-secondary" type="button" data-action="roster-page" data-offset="${pageOffset + pageLimit}" ${pageOffset + pageLimit >= enrolledCount ? 'disabled' : ''}>Next</button>
            </div>
          ` : ''}
        </nav>
      </div>

      ${renderInvitationsPanel(props, activeTab)}
    </div>

    ${renderStudentsAndInvitationsModals(props)}
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
