import { renderSettingsNav } from './SettingsNav.ts';
import { renderButton, renderTextInput, renderStatusBadge } from '../../components/common/index.ts';
import { escapeHtml, formatScopeSummary, formatCourseRestrictions } from './AiConnectionsFormat.ts';
import { renderReplaceTokenModal, renderCreateTokenModal } from './AiConnectionsTokenFormModals.ts';
import { renderTokenRevealModal, renderRevokeConfirmationModal } from './AiConnectionsRevealRevokeModals.ts';
import type { AiConnectionsPageOptions } from './AiConnectionsTypes.ts';
import './ai-connections-enhancer.ts';

export { formatScopeSummary, formatCourseRestrictions, escapeHtml } from './AiConnectionsFormat.ts';
export type { ConnectionTokenItem, AuthorCourseOption, RevealedTokenData, AiConnectionsPageOptions } from './AiConnectionsTypes.ts';

export function renderAiConnectionsPage(opts: AiConnectionsPageOptions): string {
  const isAuthor = opts.user.capabilities.includes('author');

  if (!isAuthor) {
    return `
      <div class="settings-container">
        <header class="settings-header">
          <h1 class="settings-title">Settings</h1>
          ${renderSettingsNav('ai-connections', false)}
        </header>
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
    <div class="settings-container settings-connections-container">
      <header class="settings-header">
        <h1 class="settings-title">Settings</h1>
        ${renderSettingsNav('ai-connections', true)}
      </header>
      <div class="connections-head">
        <div>
          <h2 class="connections-head-title">AI connections</h2>
          <p class="text-sm text-secondary">Let your tools create and edit courses with access you control.</p>
        </div>
        ${renderButton({
          id: 'btn-open-create-token',
          label: '+ Create access token',
          variant: 'primary',
          type: 'button',
        })}
      </div>

      ${
        opts.error && !opts.showCreateModal && !opts.replacingToken
          ? `
        <div id="connections-error" class="form-error mb-6 p-3 border border-danger rounded" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span> <span>${escapeHtml(opts.error)}</span>
        </div>
      `
          : '<div id="connections-error" class="sr-only" role="alert" aria-live="polite"></div>'
      }

      ${
        opts.successMessage
          ? `
        <div id="connections-success" class="mb-6 p-3 bg-surface border border-accent rounded text-sm text-success flex items-center gap-2" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span> <span>${escapeHtml(opts.successMessage)}</span>
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

      <nav class="filter-tab-bar" aria-label="Filter connections by status">
        <a href="/settings/ai-connections?filter=all" class="filter-tab-btn ${activeFilter === 'all' ? 'active' : ''}" ${activeFilter === 'all' ? 'aria-current="page"' : ''}>All (${tokens.length})</a>
        <a href="/settings/ai-connections?filter=active" class="filter-tab-btn ${activeFilter === 'active' ? 'active' : ''}" ${activeFilter === 'active' ? 'aria-current="page"' : ''}>Active</a>
        <a href="/settings/ai-connections?filter=expired" class="filter-tab-btn ${activeFilter === 'expired' ? 'active' : ''}" ${activeFilter === 'expired' ? 'aria-current="page"' : ''}>Expired</a>
        <a href="/settings/ai-connections?filter=revoked" class="filter-tab-btn ${activeFilter === 'revoked' ? 'active' : ''}" ${activeFilter === 'revoked' ? 'aria-current="page"' : ''}>Revoked</a>
      </nav>

      ${
        opts.isLoading
          ? `
        <div class="connections-loading" role="status" aria-busy="true" aria-live="polite">
          <span class="sr-only">Loading AI connections</span>
          <div class="connections-skeleton" aria-hidden="true"></div>
          <div class="connections-skeleton" aria-hidden="true"></div>
        </div>
      `
          : filteredTokens.length === 0 && tokens.length > 0
          ? `
        <div class="card p-8 bg-surface border border-subtle rounded-lg text-center" role="region" aria-label="No matching connections">
          <h2 class="text-base font-semibold mb-2">No ${activeFilter} connections</h2>
          <p class="text-sm text-secondary max-w-md mx-auto mb-6">None of your connections match this filter.</p>
          <a href="/settings/ai-connections?filter=all" class="btn btn-secondary">Show all connections</a>
        </div>
      `
          : filteredTokens.length === 0
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
                <th scope="col">Status</th>
                <th scope="col" class="whitespace-nowrap">Last used</th>
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

                  const setupAction =
                    token.isRevoked || token.status === 'expired'
                      ? '<button type="button" class="btn btn-secondary btn-compact" disabled aria-label="Setup unavailable for inactive connection">Setup</button>'
                      : `<a href="/settings/ai-connections/${encodeURIComponent(token.id)}/setup" class="btn ${token.status === 'never_used' ? 'btn-primary' : 'btn-secondary'} btn-compact" aria-label="Setup ${escapeHtml(token.label)}">Setup</a>`;

                  return `
                  <tr id="token-row-${escapeHtml(token.id)}">
                    <td>
                      <div class="connection-name">${escapeHtml(token.label)}</div>
                      <div class="connection-access">${formatScopeSummary(token.scopes)} · ${escapeHtml(formatCourseRestrictions(token.courseRestrictions, coursesMap))}</div>
                      <div class="connection-meta">Expires ${expiryDate} · <span class="font-mono">${escapeHtml(token.tokenIdentifier)}</span></div>
                    </td>
                    <td class="whitespace-nowrap">
                      ${renderStatusBadge({ status: badgeStatus, label: statusLabel })}
                    </td>
                    <td class="whitespace-nowrap">
                      <span class="text-sm text-secondary">${lastUsedText}</span>
                    </td>
                    <td class="text-right whitespace-nowrap">
                      <div class="connection-actions">
                        ${setupAction}
                        <button type="button" class="btn btn-secondary btn-compact" data-action="replace-token" data-token-id="${escapeHtml(token.id)}" aria-label="Replace ${escapeHtml(token.label)}">Replace</button>
                        ${
                          !token.isRevoked
                            ? `<button type="button" class="btn btn-destructive btn-compact" data-action="revoke-token" data-token-id="${escapeHtml(token.id)}" aria-label="Revoke ${escapeHtml(token.label)}">Revoke</button>`
                            : ''
                        }
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
              <article class="connection-mobile-card" id="mobile-token-card-${escapeHtml(token.id)}" role="listitem">
                <div class="connection-mobile-header">
                  <div class="connection-mobile-identity">
                    <div class="font-medium text-primary">${escapeHtml(token.label)}</div>
                    <div class="text-xs font-mono text-muted">${escapeHtml(token.tokenIdentifier)}</div>
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
                    <span class="text-secondary">${escapeHtml(formatCourseRestrictions(token.courseRestrictions, coursesMap))}</span>
                  </div>
                  <div class="connection-mobile-row-field connection-mobile-row-meta" style="display: flex; flex-direction: column; gap: 0.125rem; padding-top: 0.25rem;">
                    <div><span class="text-secondary font-medium">Last used: </span><span class="text-muted">${lastUsedText}</span></div>
                    <div><span class="text-secondary font-medium">Expires: </span><span class="text-muted">${expiryDate}</span></div>
                  </div>
                </div>
                <div class="connection-mobile-actions">
                  ${token.isRevoked || token.status === 'expired'
                    ? `<button type="button" class="btn btn-secondary btn-compact" data-action="replace-token" data-token-id="${escapeHtml(token.id)}" aria-label="Replace ${escapeHtml(token.label)}">Replace</button>`
                    : `<a href="/settings/ai-connections/${encodeURIComponent(token.id)}/setup" class="btn btn-secondary btn-compact" aria-label="Setup ${escapeHtml(token.label)}">Setup</a>
                       <button type="button" class="btn btn-secondary btn-compact" data-action="replace-token" data-token-id="${escapeHtml(token.id)}" aria-label="Replace ${escapeHtml(token.label)}">Replace</button>
                       <button type="button" class="btn btn-destructive btn-compact" data-action="revoke-token" data-token-id="${escapeHtml(token.id)}" aria-label="Revoke ${escapeHtml(token.label)}">Revoke</button>`}
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
