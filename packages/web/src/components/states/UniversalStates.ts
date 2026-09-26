export interface StatePresentationOptions {
  title?: string;
  message: string;
  actionText?: string;
  actionHref?: string;
  actionOnClick?: string;
  secondaryText?: string;
}

export function renderLoadingSkeleton(ariaLabel: string = 'Loading content'): string {
  return `
    <div class="state-container state-loading" role="status" aria-busy="true" aria-label="${ariaLabel}">
      <div class="skeleton-line skeleton-title" aria-hidden="true"></div>
      <div class="skeleton-line skeleton-text" aria-hidden="true"></div>
      <div class="skeleton-line skeleton-text short" aria-hidden="true"></div>
      <span class="sr-only">${ariaLabel}…</span>
    </div>
  `;
}

export function renderEmptyState(opts: { title: string; message: string; actionText?: string; actionHref?: string }): string {
  return `
    <div class="state-container state-empty" role="region" aria-label="${opts.title}">
      <div class="empty-icon" aria-hidden="true">◇</div>
      <h3 class="state-heading">${opts.title}</h3>
      <p class="state-message">${opts.message}</p>
      ${opts.actionText && opts.actionHref ? `
        <div class="state-actions mt-4">
          <a href="${opts.actionHref}" class="btn btn-primary">${opts.actionText}</a>
        </div>
      ` : ''}
    </div>
  `;
}

export function renderNoMatchesState(query: string, clearFiltersHref: string): string {
  return `
    <div class="state-container state-no-matches" role="region" aria-label="No results found">
      <h3 class="state-heading">No courses match “${escapeHtml(query)}”</h3>
      <p class="state-message">Try adjusting your search terms or clearing filters.</p>
      <div class="state-actions mt-4">
        <a href="${escapeHtml(clearFiltersHref)}" class="btn btn-secondary btn-compact">Clear filters</a>
      </div>
    </div>
  `;
}

export function renderAccessDeniedState(reason?: string): string {
  return `
    <div class="state-container state-denied" role="alert">
      <h2 class="state-heading">This page isn't available.</h2>
      <p class="state-message">${escapeHtml(reason || 'You do not have permission to view this content.')}</p>
      <div class="state-actions mt-4">
        <a href="/courses" class="btn btn-secondary btn-compact">Return to courses</a>
      </div>
    </div>
  `;
}

export function renderNotFoundState(): string {
  return `
    <div class="state-container state-not-found" role="alert">
      <h2 class="state-heading">This page isn't available.</h2>
      <p class="state-message">The link you followed may be broken or the page may have been removed.</p>
      <div class="state-actions mt-4">
        <a href="/courses" class="btn btn-secondary btn-compact">Return to courses</a>
      </div>
    </div>
  `;
}

export function renderOfflineBanner(localPersistenceConfirmed = false): string {
  return `
    <div class="offline-banner" role="status" aria-live="polite">
      <span class="offline-icon" aria-hidden="true">⚡</span>
      <span>${localPersistenceConfirmed ? 'You are offline. Changes are stored on this device. Reconnect to sync.' : 'You are offline. Changes have not been confirmed saved. Keep this page open and reconnect to sync.'}</span>
    </div>
  `;
}

export function renderSaveFailureAlert(retryActionName: string = 'retrySave()'): string {
  return `
    <div class="save-failure-banner" role="alert">
      <span class="failure-icon" aria-hidden="true">⚠</span>
      <span class="failure-text">Could not save changes to server. Your edits are held locally.</span>
      <button type="button" class="btn btn-secondary btn-compact ml-auto" onclick="${retryActionName}">
        Retry
      </button>
    </div>
  `;
}

export function renderRateLimitAlert(retryAfterSeconds: number): string {
  return `
    <div class="rate-limit-banner" role="alert">
      <span class="limit-icon" aria-hidden="true">⏱</span>
      <span>Too many requests. Please wait ${retryAfterSeconds} seconds before trying again. Your code has been preserved.</span>
    </div>
  `;
}

export function renderJobQueuedState(attemptId: string, status: 'QUEUED' | 'RUNNING'): string {
  const isRunning = status === 'RUNNING';
  return `
    <div class="state-job-progress" role="status" aria-live="polite" data-attempt-id="${attemptId}">
      <span class="job-status-spinner" aria-hidden="true">↻</span>
      <span class="job-status-text">${isRunning ? 'Running tests…' : 'Queued for execution…'}</span>
      <span class="job-attempt-id text-muted text-xs">ID: ${attemptId}</span>
    </div>
  `;
}

export function renderInfrastructureFailurePanel(attemptId: string, onRetryAction: string = 'retryExecution()', persistence: 'server-saved' | 'attempt-snapshot' | 'unconfirmed' = 'unconfirmed'): string {
  const recoveryText = persistence === 'server-saved' ? 'Your code is saved.' : persistence === 'attempt-snapshot' ? 'Your submitted code is available in Attempts.' : 'Your current edits have not been confirmed saved.';
  return `
    <div class="error-panel infrastructure-failure" role="alert">
      <h3 class="error-panel-title">We couldn't check this submission.</h3>
      <p class="error-panel-body">A temporary runner issue prevented completion. ${recoveryText}</p>
      <div class="error-panel-actions mt-3 flex items-center gap-3">
        <button type="button" class="btn btn-secondary btn-compact" onclick="${onRetryAction}">
          Try again
        </button>
        <span class="text-muted text-xs">Ref: <code>${escapeHtml(attemptId)}</code></span>
      </div>
    </div>
  `;
}

export function renderConflictComparisonModal(opts: {
  localContent: string;
  serverContent: string;
  currentRevision: number;
  onKeepLocal: string;
  onAcceptServer: string;
}): string {
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="conflict-dialog-title">
      <div class="modal-dialog conflict" tabindex="-1">
        <header class="dialog-header">
          <h2 id="conflict-dialog-title" class="dialog-title">Resolve conflicting edits</h2>
          <p class="text-secondary text-sm">A newer version (Revision ${opts.currentRevision}) was saved from another window or connection.</p>
        </header>

        <div class="conflict-diff-panes grid grid-cols-2 gap-4">
          <div class="diff-pane local">
            <h4 class="font-semibold text-sm mb-2">Your unsaved changes</h4>
            <div class="code-block"><pre><code>${escapeHtml(opts.localContent)}</code></pre></div>
          </div>
          <div class="diff-pane server">
            <h4 class="font-semibold text-sm mb-2">Server version (Revision ${opts.currentRevision})</h4>
            <div class="code-block"><pre><code>${escapeHtml(opts.serverContent)}</code></pre></div>
          </div>
        </div>

        <footer class="dialog-footer flex justify-end gap-3 mt-4">
          <button type="button" class="btn btn-secondary" onclick="${opts.onAcceptServer}">
            Load server version
          </button>
          <button type="button" class="btn btn-primary" onclick="${opts.onKeepLocal}">
            Overwrite with my changes
          </button>
        </footer>
      </div>
    </div>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
