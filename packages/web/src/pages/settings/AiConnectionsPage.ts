import { renderSettingsNav } from './SettingsNav.ts';
import { renderButton, renderTextInput, renderStatusBadge } from '../../components/common/index.ts';
import type { User, TokenScope } from 'zur-shared';

export interface ConnectionTokenItem {
  id: string;
  tokenIdentifier: string;
  label: string;
  scopes: TokenScope[];
  courseRestrictions: string[] | null;
  expiresAt: string;
  isRevoked: boolean;
  lastUsedAt?: string | null;
  createdAt: string;
  status: 'never_used' | 'active' | 'expired' | 'revoked';
}

export interface AuthorCourseOption {
  id: string;
  title: string;
}

export interface RevealedTokenData {
  id: string;
  rawToken: string;
  label: string;
  scopes: TokenScope[];
  courseRestrictions: string[] | null;
  expiresAt: string;
}

export interface AiConnectionsPageOptions {
  user: User;
  tokens?: ConnectionTokenItem[];
  courses?: AuthorCourseOption[];
  activeFilter?: 'all' | 'active' | 'expired' | 'revoked';
  showCreateModal?: boolean;
  replacingToken?: ConnectionTokenItem;
  revealedToken?: RevealedTokenData;
  revokingToken?: ConnectionTokenItem;
  error?: string;
  successMessage?: string;
  isLoading?: boolean;
}

export function formatScopeSummary(scopes: TokenScope[]): string {
  const scopeSet = new Set(scopes);
  if (
    scopeSet.has('courses:read') &&
    scopeSet.has('courses:create') &&
    scopeSet.has('content:write') &&
    scopeSet.has('content:delete') &&
    scopeSet.has('media:write') &&
    scopeSet.has('exercises:validate') &&
    scopeSet.has('courses:publish') &&
    scopeSet.has('courses:manage')
  ) {
    return 'Full course control';
  }
  if (
    scopeSet.has('courses:read') &&
    scopeSet.has('courses:create') &&
    scopeSet.has('content:write') &&
    scopeSet.has('media:write') &&
    scopeSet.has('exercises:validate') &&
    !scopeSet.has('courses:publish') &&
    !scopeSet.has('content:delete')
  ) {
    return 'Draft authoring';
  }
  if (scopes.length === 1 && scopeSet.has('courses:read')) {
    return 'Read only';
  }
  return `${scopes.length} custom scopes`;
}

export function formatCourseRestrictions(restrictions: string[] | null, coursesMap?: Map<string, string>): string {
  if (restrictions === null) {
    return 'All owned courses, including future courses';
  }
  if (restrictions.length === 0) {
    return 'Created courses only';
  }
  if (restrictions.length === 1 && coursesMap && coursesMap.has(restrictions[0])) {
    return coursesMap.get(restrictions[0])!;
  }
  return `${restrictions.length} selected courses`;
}

export function renderAiConnectionsPage(opts: AiConnectionsPageOptions): string {
  const isAuthor = opts.user.capabilities.includes('author');

  if (!isAuthor) {
    return `
      <div class="settings-container max-w-2xl py-6">
        <h1 class="h1 mb-2">AI connections</h1>
        <p class="text-sm text-secondary mb-6">Let your tools create and edit courses with access you control.</p>
        ${renderSettingsNav('ai-connections', false)}
        <div class="card p-6 bg-surface border border-subtle rounded-lg" role="region" aria-labelledby="author-required-title">
          <h2 id="author-required-title" class="text-base font-semibold mb-2">Author Access Required</h2>
          <p class="text-sm text-secondary mb-4">
            AI connections allow external tools to edit and manage courses on your behalf. To create and manage connections, your account must have author capability.
          </p>
          <a href="/dashboard" class="btn btn-secondary">Return to learning</a>
        </div>
      </div>
    `;
  }

  const tokens = opts.tokens || [];
  const activeFilter = opts.activeFilter || 'all';

  const filteredTokens = tokens.filter((t) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'active') return t.status === 'active' || t.status === 'never_used';
    return t.status === activeFilter;
  });

  const coursesMap = new Map((opts.courses || []).map((c) => [c.id, c.title]));

  return `
    <div class="settings-connections-container py-6">
      <div class="flex items-center justify-between flex-wrap gap-4 mb-2">
        <h1 class="h1">AI connections</h1>
        ${renderButton({
          id: 'btn-open-create-token',
          label: '+ Create access token',
          variant: 'primary',
          type: 'button',
        })}
      </div>
      <p class="text-sm text-secondary mb-6">Let your tools create and edit courses with access you control.</p>

      ${renderSettingsNav('ai-connections', true)}

      ${
        opts.error
          ? `
        <div id="connections-error" class="form-error mb-6 p-3 border border-danger rounded" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span> <span>${opts.error}</span>
        </div>
      `
          : '<div id="connections-error" class="sr-only" role="alert" aria-live="polite"></div>'
      }

      ${
        opts.successMessage
          ? `
        <div id="connections-success" class="mb-6 p-3 bg-surface border border-accent rounded text-sm text-success flex items-center gap-2" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span> <span>${opts.successMessage}</span>
        </div>
      `
          : ''
      }

      <details class="disclosure-card mb-6">
        <summary class="font-medium cursor-pointer text-sm text-primary">How connections work</summary>
        <div class="text-xs text-secondary mt-3 space-y-2">
          <p>
            An AI connection grants an external tool (such as Claude Desktop or Cursor) scoped access to your course drafts using the Model Context Protocol (MCP).
          </p>
          <p>
            Tokens are author-authorized credentials. They expire in 1 to 90 days and can be revoked immediately at any time. The AI cannot expand its own permissions.
          </p>
        </div>
      </details>

      <div class="filter-tab-bar" role="tablist" aria-label="Filter connections by status">
        <a href="/settings/ai-connections?filter=all" class="filter-tab-btn ${activeFilter === 'all' ? 'active' : ''}" role="tab" aria-selected="${activeFilter === 'all'}">All (${tokens.length})</a>
        <a href="/settings/ai-connections?filter=active" class="filter-tab-btn ${activeFilter === 'active' ? 'active' : ''}" role="tab" aria-selected="${activeFilter === 'active'}">Active</a>
        <a href="/settings/ai-connections?filter=expired" class="filter-tab-btn ${activeFilter === 'expired' ? 'active' : ''}" role="tab" aria-selected="${activeFilter === 'expired'}">Expired</a>
        <a href="/settings/ai-connections?filter=revoked" class="filter-tab-btn ${activeFilter === 'revoked' ? 'active' : ''}" role="tab" aria-selected="${activeFilter === 'revoked'}">Revoked</a>
      </div>

      ${
        filteredTokens.length === 0
          ? `
        <div class="card p-8 bg-surface border border-subtle rounded-lg text-center" role="region" aria-label="No connections">
          <h2 class="text-base font-semibold mb-2">No AI connections yet</h2>
          <p class="text-sm text-secondary max-w-md mx-auto mb-6">
            Connect an external AI agent to manage course drafts, tests, and media with scoped permissions you control.
          </p>
          <div class="flex items-center justify-center gap-3">
            ${renderButton({
              id: 'btn-empty-create-token',
              label: 'Create access token',
              variant: 'primary',
              type: 'button',
            })}
            <a href="/help" class="btn btn-secondary">View setup guide</a>
          </div>
        </div>
      `
          : `
        <div class="connections-table-wrapper">
          <table class="connections-table" aria-label="AI Connections">
            <thead>
              <tr>
                <th scope="col">Connection</th>
                <th scope="col">Access summary</th>
                <th scope="col">Courses</th>
                <th scope="col" class="whitespace-nowrap">Last used</th>
                <th scope="col" class="whitespace-nowrap">Expires</th>
                <th scope="col">Status</th>
                <th scope="col" class="text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filteredTokens
                .map((token) => {
                  let badgeStatus: 'info' | 'success' | 'warning' | 'danger' = 'info';
                  let statusLabel = 'Never used';
                  if (token.status === 'active') {
                    badgeStatus = 'success';
                    statusLabel = 'Active';
                  } else if (token.status === 'expired') {
                    badgeStatus = 'warning';
                    statusLabel = 'Expired';
                  } else if (token.status === 'revoked') {
                    badgeStatus = 'danger';
                    statusLabel = 'Revoked';
                  }

                  const expiryDate = new Date(token.expiresAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  });

                  const lastUsedText = token.lastUsedAt
                    ? new Date(token.lastUsedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Never used';

                  return `
                  <tr id="token-row-${token.id}">
                    <td>
                      <div class="font-medium text-primary">${token.label}</div>
                      <div class="text-xs font-mono text-muted">${token.tokenIdentifier}</div>
                    </td>
                    <td>
                      <span class="text-sm">${formatScopeSummary(token.scopes)}</span>
                    </td>
                    <td>
                      <span class="text-xs text-secondary">${formatCourseRestrictions(token.courseRestrictions, coursesMap)}</span>
                    </td>
                    <td class="whitespace-nowrap">
                      <span class="text-xs text-muted">${lastUsedText}</span>
                    </td>
                    <td class="whitespace-nowrap">
                      <span class="text-xs text-secondary">${expiryDate}</span>
                    </td>
                    <td class="whitespace-nowrap">
                      ${renderStatusBadge({ status: badgeStatus, label: statusLabel })}
                    </td>
                    <td class="text-right whitespace-nowrap">
                      <div class="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        ${token.isRevoked || token.status === 'expired'
                          ? '<button type="button" class="btn btn-secondary btn-compact" disabled aria-label="Setup unavailable for inactive connection">Setup</button>'
                          : `<a href="/settings/ai-connections/${token.id}/setup" class="btn btn-primary btn-compact" aria-label="Setup ${token.label}">Setup</a>`}
                        <details class="action-overflow relative inline-block text-left">
                          <summary class="btn btn-ghost btn-compact px-2 cursor-pointer list-none select-none text-secondary hover:text-primary" aria-label="More actions for ${token.label}">⋮</summary>
                          <div class="overflow-dropdown-menu">
                            <button type="button" class="dropdown-item text-secondary hover:text-primary" data-action="replace-token" data-token-id="${token.id}" aria-label="Replace ${token.label}">Replace</button>
                            ${
                              !token.isRevoked
                                ? `<button type="button" class="dropdown-item text-danger" data-action="revoke-token" data-token-id="${token.id}" aria-label="Revoke ${token.label}">Revoke</button>`
                                : ''
                            }
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>
        </div>

        <div class="connections-mobile-list" role="list" aria-label="AI Connections">
          ${filteredTokens
            .map((token) => {
              let badgeStatus: 'info' | 'success' | 'warning' | 'danger' = 'info';
              let statusLabel = 'Never used';
              if (token.status === 'active') {
                badgeStatus = 'success';
                statusLabel = 'Active';
              } else if (token.status === 'expired') {
                badgeStatus = 'warning';
                statusLabel = 'Expired';
              } else if (token.status === 'revoked') {
                badgeStatus = 'danger';
                statusLabel = 'Revoked';
              }

              const expiryDate = new Date(token.expiresAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });

              const lastUsedText = token.lastUsedAt
                ? new Date(token.lastUsedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Never used';

              return `
              <article class="connection-mobile-card" id="mobile-token-card-${token.id}" role="listitem">
                <div class="connection-mobile-header">
                  <div class="connection-mobile-identity">
                    <div class="font-medium text-primary">${token.label}</div>
                    <div class="text-xs font-mono text-muted">${token.tokenIdentifier}</div>
                  </div>
                  <div class="connection-mobile-status">
                    ${renderStatusBadge({ status: badgeStatus, label: statusLabel })}
                  </div>
                </div>
                <div class="connection-mobile-body text-xs space-y-1">
                  <div class="connection-mobile-row-field">
                    <span class="text-secondary font-medium">Access: </span>
                    <span class="text-primary font-medium">${formatScopeSummary(token.scopes)}</span>
                  </div>
                  <div class="connection-mobile-row-field">
                    <span class="text-secondary font-medium">Courses: </span>
                    <span class="text-secondary">${formatCourseRestrictions(token.courseRestrictions, coursesMap)}</span>
                  </div>
                  <div class="connection-mobile-row-field connection-mobile-row-meta" style="display: flex; flex-direction: column; gap: 0.125rem; padding-top: 0.25rem;">
                    <div><span class="text-secondary font-medium">Last used: </span><span class="text-muted">${lastUsedText}</span></div>
                    <div><span class="text-secondary font-medium">Expires: </span><span class="text-muted">${expiryDate}</span></div>
                  </div>
                </div>
                <div class="connection-mobile-actions">
                  ${token.isRevoked || token.status === 'expired'
                    ? `<button type="button" class="btn btn-secondary btn-compact" data-action="replace-token" data-token-id="${token.id}" aria-label="Replace ${token.label}">Replace</button>`
                    : `<a href="/settings/ai-connections/${token.id}/setup" class="btn btn-secondary btn-compact" aria-label="Setup ${token.label}">Setup</a>
                       <button type="button" class="btn btn-secondary btn-compact" data-action="replace-token" data-token-id="${token.id}" aria-label="Replace ${token.label}">Replace</button>
                       <button type="button" class="btn btn-destructive btn-compact" data-action="revoke-token" data-token-id="${token.id}" aria-label="Revoke ${token.label}">Revoke</button>`}
                </div>
              </article>
            `;
            })
            .join('')}
        </div>
      `
      }

      ${opts.showCreateModal ? renderCreateTokenModal(opts.courses || [], opts.error) : ''}
      ${opts.replacingToken ? renderReplaceTokenModal(opts.replacingToken, opts.courses || [], opts.error) : ''}
      ${opts.revealedToken ? renderTokenRevealModal(opts.revealedToken) : ''}
      ${opts.revokingToken ? renderRevokeConfirmationModal(opts.revokingToken) : ''}
    </div>
  `;
}

function renderReplaceTokenModal(token: ConnectionTokenItem, courses: AuthorCourseOption[], error?: string): string {
  const allowedScopes = token.scopes;
  const isAllCourses = token.courseRestrictions === null;
  const restrictedCourses = token.courseRestrictions || [];
  const selectableCourses = courses.filter((c) => isAllCourses || restrictedCourses.includes(c.id));

  return `
    <div id="replace-token-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="replace-token-title" style="overflow-y: auto;">
      <div class="modal-dialog" tabindex="-1" style="max-width: 520px; max-height: calc(100vh - 2rem); margin: auto; padding: var(--space-4); display: flex; flex-direction: column;">
        <header class="dialog-header mb-1">
          <h2 id="replace-token-title" class="dialog-title text-base font-semibold">Replace access token</h2>
          <p class="text-xs text-secondary">Reauthenticate to rotate this token. The existing token (${escapeHtml(token.label)}) will be revoked immediately and cannot be reused.</p>
        </header>

        ${error ? `<div id="replace-token-error" class="form-error p-2 text-xs border border-danger rounded" role="alert">${escapeHtml(error)}</div>` : ''}

        <form id="replace-token-form" data-token-id="${escapeHtml(token.id)}" style="display: flex; flex-direction: column; gap: 0.625rem; overflow-y: auto; flex: 1; padding: 0.25rem 0;" novalidate>
          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="replace-connection-name">Connection name *</label>
            <input type="text" id="replace-connection-name" name="label" class="form-input text-sm" value="${escapeHtml(token.label)}" required />
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="replace-connection-password">Current password *</label>
            <input type="password" id="replace-connection-password" name="password" class="form-input text-sm" placeholder="Re-enter password to authorize" required autocomplete="current-password" />
          </div>

          <details class="border border-subtle rounded-md p-2" open>
            <summary class="text-xs font-semibold cursor-pointer text-primary">Allowed scope permissions (narrowing only)</summary>
            <p class="text-xs text-muted mt-1 mb-2">Replacement tokens cannot widen scope grants. You may keep or narrow existing scopes.</p>
            <div class="grid grid-cols-1 gap-1.5 text-xs" id="replace-scopes-checklist">
              ${allowedScopes.map((scope) => `
                <label class="flex items-center gap-2">
                  <input type="checkbox" name="scopes" value="${escapeHtml(scope)}" checked />
                  <span><code>${escapeHtml(scope)}</code></span>
                </label>
              `).join('')}
            </div>
          </details>

          <div class="form-group">
            <label class="form-label text-xs font-semibold">Course access</label>
            ${isAllCourses ? `
              <div class="space-y-1 mt-0.5">
                <label class="flex items-center gap-2 text-xs">
                  <input type="radio" name="courseScopeType" value="all" checked />
                  <span>All owned courses (including future courses)</span>
                </label>
                <label class="flex items-center gap-2 text-xs">
                  <input type="radio" name="courseScopeType" value="selected" />
                  <span>Selected courses</span>
                </label>
              </div>
              ${selectableCourses.length > 0 ? `
                <div id="replace-selected-courses-container" class="mt-1 pl-4 border-l border-subtle hidden space-y-1 max-h-24 overflow-y-auto">
                  ${selectableCourses.map((c) => `
                    <label class="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="selectedCourses" value="${escapeHtml(c.id)}" />
                      <span>${escapeHtml(c.title)}</span>
                    </label>
                  `).join('')}
                </div>
              ` : ''}
            ` : `
              <p class="text-xs text-secondary mt-0.5">Course access cannot be expanded to all owned courses. You may select among currently authorized courses:</p>
              <input type="hidden" name="courseScopeType" value="selected" />
              <div id="replace-selected-courses-container" class="mt-1 pl-4 border-l border-subtle space-y-1 max-h-24 overflow-y-auto">
                ${selectableCourses.length > 0 ? selectableCourses.map((c) => `
                  <label class="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="selectedCourses" value="${escapeHtml(c.id)}" checked />
                    <span>${escapeHtml(c.title)}</span>
                  </label>
                `).join('') : `
                  <p class="text-xs text-muted">No specific courses assigned to this token.</p>
                `}
              </div>
            `}
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="replace-expiry-days">Expiry duration</label>
            <select id="replace-expiry-days" name="expiryDays" class="form-input text-sm">
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30" selected>30 days (Default)</option>
              <option value="90">90 days</option>
            </select>
          </div>

          <footer class="dialog-footer flex justify-end gap-3 pt-3 border-t border-subtle mt-1" style="position: sticky; bottom: 0; background: var(--bg-raised, #1c2128);">
            <button type="button" class="btn btn-secondary btn-compact" data-dialog-action="cancel">Cancel</button>
            <button type="submit" class="btn btn-primary btn-compact" id="btn-submit-replace-token">Replace token</button>
          </footer>
        </form>
      </div>
    </div>
  `;
}

function renderCreateTokenModal(courses: AuthorCourseOption[], error?: string): string {
  return `
    <div id="create-token-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-token-title" style="overflow-y: auto;">
      <div class="modal-dialog" tabindex="-1" style="max-width: 520px; max-height: calc(100vh - 2rem); margin: auto; padding: var(--space-4); display: flex; flex-direction: column;">
        <header class="dialog-header mb-1">
          <h2 id="create-token-title" class="dialog-title text-base font-semibold">Create access token</h2>
          <p class="text-xs text-secondary">Issue a scoped credential for external AI agents using MCP.</p>
        </header>

        ${error ? `<div id="create-token-error" class="form-error p-2 text-xs border border-danger rounded" role="alert">${escapeHtml(error)}</div>` : ''}

        <form id="create-token-form" style="display: flex; flex-direction: column; gap: 0.625rem; overflow-y: auto; flex: 1; padding: 0.25rem 0;" novalidate>
          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="connection-name">Connection name *</label>
            <input type="text" id="connection-name" name="label" class="form-input text-sm" placeholder="e.g. My course-writing agent" required />
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="connection-password">Current password *</label>
            <input type="password" id="connection-password" name="password" class="form-input text-sm" placeholder="Re-enter password to authorize" required />
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="permission-preset">Permission preset</label>
            <select id="permission-preset" name="preset" class="form-input text-sm">
              <option value="draft_authoring" selected>Draft authoring (Recommended)</option>
              <option value="read_only">Read only</option>
              <option value="full_course_control">Full course control</option>
              <option value="custom">Custom</option>
            </select>
            <p class="form-hint text-xs text-muted" style="margin-top: 0.125rem;">
              Draft edits, media uploads, and exercise validation. Publishing & deletion off by default.
            </p>
          </div>

          <details class="border border-subtle rounded-md p-2">
            <summary class="text-xs font-semibold cursor-pointer text-primary">Detailed scope permissions</summary>
            <div class="grid grid-cols-1 gap-1.5 mt-2 text-xs" id="scopes-checklist">
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="courses:read" checked />
                <span><code>courses:read</code> — Read course metadata and drafts</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="courses:create" checked />
                <span><code>courses:create</code> — Create new course drafts</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="content:write" checked />
                <span><code>content:write</code> — Create/edit modules, lessons, and steps</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="media:write" checked />
                <span><code>media:write</code> — Upload and attach course images</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="exercises:validate" checked />
                <span><code>exercises:validate</code> — Run Python reference validation</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="content:delete" />
                <span><code>content:delete</code> — Delete draft steps and modules</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="courses:publish" />
                <span><code>courses:publish</code> — Publish validated draft revisions</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="courses:manage" />
                <span><code>courses:manage</code> — Change access, archive, or restore</span>
              </label>
            </div>
          </details>

          <div class="form-group">
            <label class="form-label text-xs font-semibold">Course access</label>
            <div class="space-y-1 mt-0.5">
              <label class="flex items-center gap-2 text-xs">
                <input type="radio" name="courseScopeType" value="all" checked />
                <span>All owned courses (including future courses)</span>
              </label>
              <label class="flex items-center gap-2 text-xs">
                <input type="radio" name="courseScopeType" value="selected" />
                <span>Selected courses</span>
              </label>
            </div>
            ${
              courses.length > 0
                ? `
              <div id="selected-courses-container" class="mt-1 pl-4 border-l border-subtle hidden space-y-1 max-h-24 overflow-y-auto">
                ${courses
                  .map(
                    (c) => `
                  <label class="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="selectedCourses" value="${c.id}" />
                    <span>${c.title}</span>
                  </label>
                `
                  )
                  .join('')}
              </div>
            `
                : ''
            }
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="expiry-days">Expiry duration</label>
            <select id="expiry-days" name="expiryDays" class="form-input text-sm">
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30" selected>30 days (Default)</option>
              <option value="90">90 days</option>
            </select>
          </div>

          <footer class="dialog-footer flex justify-end gap-3 pt-3 border-t border-subtle mt-1" style="position: sticky; bottom: 0; background: var(--bg-raised, #1c2128);">
            <button type="button" class="btn btn-secondary btn-compact" data-dialog-action="cancel">Cancel</button>
            <button type="submit" class="btn btn-primary btn-compact" id="btn-submit-create-token">Create token</button>
          </footer>
        </form>
      </div>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function renderTokenRevealModal(revealed: RevealedTokenData): string {
  const expiryFormatted = new Date(revealed.expiresAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return `
    <div id="token-reveal-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="token-reveal-title">
      <div class="modal-dialog" tabindex="-1" style="max-width: 560px;">
        <header class="dialog-header">
          <h2 id="token-reveal-title" class="dialog-title text-success flex items-center gap-2">
            <span>✓</span> Save your access token
          </h2>
          <p class="text-xs text-danger font-medium mt-1">
            ⚠ You won't be able to view this token again. Copy and store it in your client's secure configuration now.
          </p>
        </header>

        <div class="dialog-body space-y-4 py-3">
          <div class="token-secret-box">
            <input
              type="password"
              id="revealed-token-value"
              class="token-secret-text bg-transparent border-none outline-none font-mono"
              value="${revealed.rawToken}"
              readonly
              aria-label="Secret token value"
            />
            <button type="button" class="btn btn-secondary btn-compact" id="btn-toggle-secret-visibility" aria-label="Toggle token visibility">
              Reveal
            </button>
            <button type="button" class="btn btn-primary btn-compact" id="btn-copy-token">
              Copy token
            </button>
          </div>
          <div id="copy-announcement" class="sr-only" role="status" aria-live="polite"></div>

          <div class="bg-surface border border-subtle rounded-md p-3 text-xs space-y-2">
            <div class="flex justify-between">
              <span class="text-muted">Connection:</span>
              <span class="font-medium text-primary">${revealed.label}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">Access summary:</span>
              <span class="font-medium text-primary">${formatScopeSummary(revealed.scopes)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">Course access:</span>
              <span class="font-medium text-primary">${formatCourseRestrictions(revealed.courseRestrictions)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">Expires:</span>
              <span class="font-medium text-primary">${expiryFormatted}</span>
            </div>
          </div>
        </div>

        <footer class="dialog-footer flex justify-between items-center pt-4 border-t border-subtle">
          <span class="text-xs text-muted">If lost, token must be replaced.</span>
          <a href="/settings/ai-connections/${revealed.id}/setup" class="btn btn-primary" id="btn-view-setup">
            I've saved it — view setup
          </a>
        </footer>
      </div>
    </div>
  `;
}

function renderRevokeConfirmationModal(token: ConnectionTokenItem): string {
  return `
    <div id="revoke-token-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="revoke-token-title">
      <div class="modal-dialog confirm" tabindex="-1">
        <header class="dialog-header">
          <h2 id="revoke-token-title" class="dialog-title text-danger">Revoke connection</h2>
        </header>

        <div class="dialog-body space-y-3 py-3 text-sm">
          <p>
            Are you sure you want to revoke <strong>${token.label}</strong> (<code>${token.tokenIdentifier}</code>)?
          </p>
          <div class="p-3 bg-raised border border-subtle rounded text-xs text-secondary">
            This connection will lose access. Existing course content will remain.
          </div>
        </div>

        <footer class="dialog-footer flex justify-end gap-3 pt-4 border-t border-subtle">
          <button type="button" class="btn btn-secondary" data-dialog-action="cancel">Cancel</button>
          <button type="button" class="btn btn-destructive" id="btn-confirm-revoke" data-token-id="${token.id}">
            Revoke token
          </button>
        </footer>
      </div>
    </div>
  `;
}
