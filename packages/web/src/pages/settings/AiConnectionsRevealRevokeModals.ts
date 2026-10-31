import { escapeHtml, formatScopeSummary, formatCourseRestrictions } from './AiConnectionsFormat.ts';
import type { ConnectionTokenItem, RevealedTokenData } from './AiConnectionsTypes.ts';

export function renderTokenRevealModal(revealed: RevealedTokenData): string {
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
              value="${escapeHtml(revealed.rawToken)}"
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
              <span class="font-medium text-primary">${escapeHtml(revealed.label)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">Access summary:</span>
              <span class="font-medium text-primary">${formatScopeSummary(revealed.scopes)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">Course access:</span>
              <span class="font-medium text-primary">${escapeHtml(formatCourseRestrictions(revealed.courseRestrictions))}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">Expires:</span>
              <span class="font-medium text-primary">${expiryFormatted}</span>
            </div>
          </div>
        </div>

        <footer class="dialog-footer flex justify-between items-center pt-3 border-t border-subtle">
          <span class="text-xs text-muted">If lost, token must be replaced.</span>
          <div class="flex items-center gap-2">
            <button type="button" class="btn btn-secondary" data-dialog-action="cancel" id="btn-close-reveal">Close</button>
            <a href="/settings/ai-connections/${encodeURIComponent(revealed.id)}/setup" class="btn btn-primary" id="btn-view-setup">
              I've saved it, view setup
            </a>
          </div>
        </footer>
      </div>
    </div>
  `;
}

export function renderRevokeConfirmationModal(token: ConnectionTokenItem): string {
  return `
    <div id="revoke-token-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="revoke-token-title">
      <div class="modal-dialog confirm" tabindex="-1">
        <header class="dialog-header">
          <h2 id="revoke-token-title" class="dialog-title text-danger">Revoke connection</h2>
        </header>

        <div class="dialog-body space-y-3 py-3 text-sm">
          <p>
            Are you sure you want to revoke <strong>${escapeHtml(token.label)}</strong> (<code>${escapeHtml(token.tokenIdentifier)}</code>)?
          </p>
          <div class="p-3 bg-raised border border-subtle rounded text-xs text-secondary">
            This connection will lose access. Existing course content will remain.
          </div>
        </div>

        <footer class="dialog-footer flex justify-end gap-3 pt-4 border-t border-subtle">
          <button type="button" class="btn btn-secondary" data-dialog-action="cancel">Cancel</button>
          <button type="button" class="btn btn-destructive" id="btn-confirm-revoke" data-token-id="${escapeHtml(token.id)}">
            Revoke token
          </button>
        </footer>
      </div>
    </div>
  `;
}
