import { renderIcon } from '../../components/common/icons.ts';
import { formatDate, sentenceCase, humanizeEnum } from '../../utils/formatters.ts';
import { table, pill, pageNav, escapeAdmin, renderActionDialog } from './admin-page-helpers.ts';

export function renderAdminExecutionContent(path: string, data: any): string {
      const jobs = data.jobs?.items || [];
      const query = new URLSearchParams(path.split('?')[1] || '');
      const isPaused = data.overview.execution.paused;

      const rows = jobs.map(
        (j: any) => `
        <tr>
          <td><code class="font-mono text-xs" title="${escapeAdmin(j.id)}">${escapeAdmin(j.id.slice(0, 12))}…</code> <button type="button" class="btn-icon btn-compact" data-copy-text="${escapeAdmin(j.id)}" title="Copy job ID" aria-label="Copy job ID">${renderIcon('copy', { size: 12 })}</button></td>
          <td><span class="text-secondary">${escapeAdmin(humanizeEnum(j.jobType))}</span></td>
          <td>${pill(sentenceCase(j.status), j.status === 'completed' ? 'success' : j.status === 'failed' ? 'danger' : j.status === 'running' ? 'info' : 'neutral')}</td>
          <td><time datetime="${escapeAdmin(j.createdAt)}" title="${escapeAdmin(j.createdAt)}" class="text-secondary">${formatDate(j.createdAt)}</time></td>
          <td><time datetime="${escapeAdmin(j.updatedAt)}" title="${escapeAdmin(j.updatedAt)}" class="text-secondary">${formatDate(j.updatedAt)}</time></td>
        </tr>
      `
      );

      return `
        <div class="admin-page-header">
          <h1 class="page-title">Execution</h1>
        </div>

        <div class="admin-overview-card execution-service-card mb-6">
          <div class="execution-service-header flex items-center justify-between flex-wrap gap-4">
            <div class="execution-service-status">
              <p class="execution-service-desc text-secondary text-sm">
                ${isPaused ? 'Execution is currently paused. No new student code runs are admitted.' : 'Execution is active. Disabling accepts no new jobs while preserving reading and code drafts.'}
              </p>
            </div>
            <button type="button" class="admin-switch ${isPaused ? 'is-paused' : 'is-on'}" role="switch" aria-checked="${isPaused ? 'false' : 'true'}" data-open-dialog="execution-toggle-dialog">
              <span class="admin-switch-track" aria-hidden="true"><span class="admin-switch-thumb"></span></span>
              <span class="admin-switch-text"><span class="admin-switch-state">${isPaused ? 'Runs paused' : 'Accepting runs'}</span><span class="admin-switch-action">${isPaused ? 'Reactivate execution…' : 'Pause new runs…'}</span></span>
            </button>
          </div>
        </div>

        <h2 class="section-title">Queue and worker health</h2>
        <div class="admin-stats-grid mb-6">
          <div class="stat-tile">
            <span class="stat-label">Queued jobs</span>
            <span class="stat-value">${data.overview.queue.queued}</span>
            <span class="stat-hint text-xs text-muted">Awaiting worker lease</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Running jobs</span>
            <span class="stat-value">${data.overview.queue.running}</span>
            <span class="stat-hint text-xs text-muted">Active in sandbox</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Oldest queued</span>
            <span class="stat-value stat-value-text">${escapeAdmin(data.overview.queue.oldestQueuedAt ? formatDate(data.overview.queue.oldestQueuedAt) : 'None')}</span>
            <span class="stat-hint text-xs text-muted">${escapeAdmin(data.overview.queue.oldestQueuedAt || 'No queued jobs')}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Worker health</span>
            <div class="mt-1">${pill(data.overview.workers.lastObservedAt ? 'Heartbeat active' : 'Unavailable', data.overview.workers.lastObservedAt ? 'success' : 'neutral')}</div>
            <span class="stat-hint text-xs text-muted" title="${escapeAdmin(data.overview.workers.health)}">${escapeAdmin(data.overview.workers.lastObservedAt ? data.overview.workers.health || 'Heartbeat telemetry' : 'Heartbeat telemetry')}</span>
          </div>
        </div>

        <form class="admin-filter-toolbar mb-4" action="/admin/execution" method="get">
          <div class="date-input-group flex items-center gap-2">
            <label for="exec-from" class="date-label text-xs text-muted">From</label>
            <input id="exec-from" type="date" name="from" class="form-input form-date" value="${escapeAdmin(query.get('from'))}">
          </div>
          <div class="date-input-group flex items-center gap-2">
            <label for="exec-to" class="date-label text-xs text-muted">To</label>
            <input id="exec-to" type="date" name="to" class="form-input form-date" value="${escapeAdmin(query.get('to'))}">
          </div>
          <button type="submit" class="btn btn-secondary btn-compact">Filter jobs</button>
          <span class="text-xs text-muted ml-auto">Dates in system timezone</span>
        </form>

        ${table(['Job reference', 'Type', 'State', 'Accepted', 'Updated'], rows, 'No execution jobs in this time range.', query.get('from') || query.get('to') ? '<a href="/admin/execution">Clear the date range</a> to see all jobs.' : 'Jobs appear here when learners run code.')}
        ${pageNav(data.jobs, path)}

        <!-- Accessible Dialog: Execution Toggle -->
        ${renderActionDialog({
          id: 'execution-toggle-dialog',
          title: isPaused ? 'Reactivate execution' : 'Pause new runs',
          target: 'Python Runner sandboxes',
          currentState: isPaused ? 'Admission paused' : 'Accepting jobs',
          resultingState: isPaused ? 'Accepting jobs' : 'Admission paused',
          effect: isPaused
            ? 'Reactivating accepts new student code execution jobs and dispatches them to runner sandboxes.'
            : 'Disabling accepts no new jobs. Reading, authoring, and saved student code remain available.',
          actionUrl: `/api/admin/execution/${isPaused ? 'resume' : 'pause'}`,
          buttonLabel: isPaused ? 'Reactivate execution' : 'Disable new execution',
          buttonVariant: isPaused ? 'primary' : 'danger',
          isDestructive: !isPaused
        })}
      `;
}
