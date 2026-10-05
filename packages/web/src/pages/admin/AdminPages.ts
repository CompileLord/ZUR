import { renderAdminShell } from '../../components/shells/AdminShell.ts';
import { renderIcon, type IconName } from '../../components/common/icons.ts';
import { formatDate, sentenceCase, humanizeEnum } from '../../utils/formatters.ts';

export function escapeAdmin(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}

const formField = (name: string, label: string, type = 'text', required = true) =>
  `<label class="form-group"><span class="form-label">${escapeAdmin(label)}</span><input class="form-input" name="${escapeAdmin(name)}" type="${type}" ${required ? 'required' : ''}></label>`;

const adminForm = (
  action: string,
  content: string,
  button: string = 'Save changes',
  method = 'post',
  buttonVariant: 'primary' | 'danger' = 'primary'
) =>
  `<form class="admin-mutation-form" data-admin-mutation action="${escapeAdmin(action)}" method="${escapeAdmin(method)}">${content}${formField('reason', 'Reason')}${formField('currentPassword', 'Confirm administrator password', 'password')}<button class="btn btn-${buttonVariant}" type="submit" ${action.endsWith('/waivers') ? 'disabled' : ''}>${escapeAdmin(button)}</button><p class="form-error hidden" role="alert"></p></form>`;

export interface TableCol {
  label: string;
  align?: 'left' | 'right' | 'center';
}

const table = (headers: (string | TableCol)[], rows: string[], empty: string) => {
  const headerCells = headers.map((h) => {
    const label = typeof h === 'string' ? h : h.label;
    const alignClass = typeof h === 'object' && h.align === 'right' ? ' class="text-right"' : '';
    return `<th scope="col"${alignClass}>${escapeAdmin(label)}</th>`;
  }).join('');
  return `<div class="data-table-wrapper"><table class="data-table"><thead><tr>${headerCells}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="empty-state">${escapeAdmin(empty)}</td></tr>`}</tbody></table></div>`;
};

const pill = (text: string, kind = 'info') =>
  `<span class="status-badge ${kind}">${escapeAdmin(text)}</span>`;

const pageNav = (data: any, path: string) => {
  if (!data || !Number.isFinite(data.total) || !Number.isFinite(data.limit)) return '';
  const params = new URLSearchParams(path.split('?')[1] || '');
  const offset = Number(params.get('offset') || 0), limit = data.limit;
  const link = (next: number, label: string) => {
    const q = new URLSearchParams(params);
    q.set('offset', String(next));
    q.set('limit', String(limit));
    return `<a class="btn btn-secondary btn-compact" href="${escapeAdmin(`${path.split('?')[0]}?${q}`)}">${label}</a>`;
  };
  return `<nav class="admin-pagination" aria-label="Result pages"><span>Showing ${data.total ? offset + 1 : 0}–${Math.min(offset + data.items.length, data.total)} of ${data.total}</span>${offset > 0 ? link(Math.max(0, offset - limit), 'Previous') : ''}${offset + limit < data.total ? link(offset + limit, 'Next') : ''}</nav>`;
};

function formatAuditAction(action: string): string {
  if (!action) return '';
  const parts = action.split(':');
  if (parts.length === 2) {
    const scope = humanizeEnum(parts[0]);
    const act = humanizeEnum(parts[1]);
    return `${act} ${scope.toLowerCase()}`;
  }
  return humanizeEnum(action);
}

export function renderAdminPage(
  path: string,
  data: any,
  error?: string,
  adminUser = { displayName: 'Administrator', email: '' }
): string {
  const route = path.split('?')[0];
  const title =
    route === '/admin'
      ? 'Platform status'
      : route.startsWith('/admin/users')
      ? 'Users and capabilities'
      : route.startsWith('/admin/courses')
      ? 'Course administration'
      : route.startsWith('/admin/categories')
      ? 'Categories'
      : route.startsWith('/admin/reports')
      ? 'Reports'
      : route.startsWith('/admin/media')
      ? 'Media operations'
      : route.startsWith('/admin/execution')
      ? 'Execution operations'
      : 'Audit';

  const err = error
    ? `<div class="alert alert-danger" role="alert">${escapeAdmin(error)} <button class="btn btn-secondary btn-compact" type="button" data-admin-retry>Retry</button></div>`
    : '';

  let content = `<section class="admin-page-content"><p class="text-secondary">Loading operational records…</p></section>`;

  if (data) {
    if (route === '/admin') {
      const errRate = data.internalErrorRate;
      let errRateDisplay = 'Unavailable';
      let errRateSub = 'Last 5 minutes (resets on restart)';
      if (errRate) {
        const numErrors = errRate.numerator ?? 0;
        const numRequests = errRate.denominator ?? 0;
        const windowLabel =
          errRate.windowLabel ||
          (errRate.window === '5m' ? 'Last 5 minutes' : errRate.window) ||
          'Last 5 minutes';
        if (errRate.status === 'available' && errRate.rateFormatted) {
          errRateDisplay = errRate.rateFormatted;
          errRateSub = `${escapeAdmin(numErrors)} 5xx error${numErrors === 1 ? '' : 's'} / ${escapeAdmin(numRequests)} request${numRequests === 1 ? '' : 's'} · ${escapeAdmin(windowLabel)}`;
        } else {
          errRateDisplay = 'Unavailable';
          errRateSub = `Insufficient telemetry (${escapeAdmin(numRequests)} request${numRequests === 1 ? '' : 's'} in ${escapeAdmin(windowLabel)} · resets on restart)`;
        }
      } else if (typeof data.internalErrors === 'number') {
        errRateDisplay = 'Unavailable';
        errRateSub = `${escapeAdmin(data.internalErrors)} 5xx error${data.internalErrors === 1 ? '' : 's'} recorded (no denominator)`;
      }

      const refreshedDisplay = formatDate(data.refreshedAt) || escapeAdmin(data.refreshedAt);

      content = `
        <div class="admin-page-header">
          <h1 class="page-title">Platform status</h1>
          <p class="admin-page-subtitle text-secondary">Updated <time datetime="${escapeAdmin(data.refreshedAt)}" title="${escapeAdmin(data.refreshedAt)}">${escapeAdmin(refreshedDisplay)}</time></p>
        </div>

        ${
          data.operational
            ? `<section class="admin-alerts-section" aria-labelledby="ops-alert-title">
                <h2 id="ops-alert-title" class="sr-only">Operational alerts</h2>
                ${
                  data.operational.alerts?.length
                    ? `<ul class="ops-alert-list">
                        ${data.operational.alerts
                          .map(
                            (alert: any) =>
                              `<li class="ops-alert ${alert.severity === 'critical' ? 'critical' : ''}" role="${alert.severity === 'critical' ? 'alert' : 'status'}">
                                <strong>${escapeAdmin(alert.code)}</strong> ${escapeAdmin(alert.message)}
                              </li>`
                          )
                          .join('')}
                      </ul>`
                    : '<p class="ops-alert-calm text-secondary" role="status">No active threshold alerts.</p>'
                }
              </section>`
            : ''
        }

        <div class="admin-ops-grid">
          <article class="admin-overview-card">
            <div class="card-header">
              <h2>Execution</h2>
              ${pill(data.execution.paused ? 'Disabled' : 'Available', data.execution.paused ? 'warning' : 'success')}
            </div>
            <div class="card-metric-value">${data.execution.paused ? 'Paused' : 'Available'}</div>
            <p class="card-hint">New Python jobs ${data.execution.paused ? 'are paused' : 'can be accepted'}.${data.executionInfrastructureErrors ? ` ${escapeAdmin(data.executionInfrastructureErrors.failures)} runner failure${data.executionInfrastructureErrors.failures === 1 ? '' : 's'} in 24h.` : ''}</p>
            <div class="card-action">
              <a href="/admin/execution" class="card-action-link">Execution operations</a>
            </div>
          </article>

          <article class="admin-overview-card">
            <div class="card-header">
              <h2>Queue</h2>
              ${pill(data.queue.queued > 0 ? `${data.queue.queued} queued` : 'Idle', data.queue.queued > 0 ? 'info' : 'neutral')}
            </div>
            <div class="card-metric-value"><strong>${data.queue.queued} queued · ${data.queue.running} running</strong></div>
            <p class="card-hint">Oldest queued: ${escapeAdmin(data.queue.oldestQueuedAt || 'No queued jobs')}</p>
            <div class="card-action">
              <a href="/admin/execution" class="card-action-link">Review jobs</a>
            </div>
          </article>

          <article class="admin-overview-card">
            <div class="card-header">
              <h2>Runner telemetry</h2>
              ${pill(data.workers.lastObservedAt ? 'Active' : 'Unavailable', data.workers.lastObservedAt ? 'info' : 'warning')}
            </div>
            <div class="card-metric-value text-muted">${escapeAdmin(data.workers.health)}</div>
            <p class="card-hint">Last observed: ${escapeAdmin(data.workers.lastObservedAt || 'Unavailable')}</p>
          </article>

          <article class="admin-overview-card">
            <div class="card-header">
              <h2>Internal-error rate</h2>
              ${pill(errRateDisplay === 'Unavailable' ? 'Unavailable' : (errRate && errRate.numerator > 0 ? 'Errors observed' : 'No 5xx errors'), errRateDisplay === 'Unavailable' ? 'neutral' : (errRate && errRate.numerator > 0 ? 'warning' : 'success'))}
            </div>
            <div class="card-metric-value"><strong>${errRateDisplay}</strong></div>
            <p class="card-hint">${errRateSub}</p>
            ${data.operational ? '<div class="card-action"><a href="#recent-request-metrics">Recent request metrics</a></div>' : ''}
          </article>

          <article class="admin-overview-card">
            <div class="card-header">
              <h2>Outstanding reports</h2>
              ${pill(data.openReports > 0 ? `${data.openReports} open` : 'None', data.openReports > 0 ? 'warning' : 'neutral')}
            </div>
            <div class="card-metric-value"><strong>${data.openReports}</strong></div>
            <p class="card-hint">Learner reports awaiting triage</p>
            <div class="card-action">
              <a href="/admin/reports" class="card-action-link">Open report triage</a>
            </div>
          </article>

          <article class="admin-overview-card">
            <div class="card-header">
              <h2>Email delivery</h2>
              ${pill(data.emailDeliveryIssues > 0 ? `${data.emailDeliveryIssues} issue(s)` : 'Normal', data.emailDeliveryIssues > 0 ? 'warning' : 'neutral')}
            </div>
            <div class="card-metric-value"><strong>${data.emailDeliveryIssues} issue(s)</strong></div>
            <p class="card-hint">${escapeAdmin(data.email?.status || 'No delivery data')} · last sent ${escapeAdmin(data.email?.lastSentAt || 'unavailable')}</p>
            <div class="card-action">
              <a href="/admin/users" class="card-action-link">Review account records</a>
            </div>
          </article>
        </div>

        <details class="disclosure-card telemetry-disclosure">
          <summary>Telemetry status and explanation</summary>
          <div class="disclosure-body">
            <p class="text-muted mb-2">Request samples are in memory and reset on process restart. p95 values use the last five minutes; no request payloads or user identifiers are retained.</p>
            <p class="text-muted">Telemetry status: queue ${escapeAdmin(data.telemetry.queue)}, worker heartbeat ${escapeAdmin(data.telemetry.workerHeartbeat)}, email ${escapeAdmin(data.telemetry.email)}, internal errors ${escapeAdmin(data.telemetry.internalErrorRate || 'unavailable')}.</p>
          </div>
        </details>

        ${
          data.operational?.requestMetrics
            ? `<details id="recent-request-metrics" class="disclosure-card mt-3">
                <summary>Recent request metrics</summary>
                <div class="disclosure-body">
                  ${table(
                    ['Service', { label: 'Requests', align: 'right' }, { label: 'Failures', align: 'right' }, { label: 'p95 latency', align: 'right' }],
                    Object.entries(data.operational.requestMetrics.recentByFamily).map(
                      ([name, metric]: any) =>
                        `<tr><th scope="row">${escapeAdmin(name)}</th><td class="text-right">${metric.requests}</td><td class="text-right">${metric.failures}</td><td class="text-right">${metric.p95LatencyMs === null ? 'Unavailable' : `${metric.p95LatencyMs} ms`}</td></tr>`
                    ),
                    'No requests observed in the current window.'
                  )}
                </div>
              </details>`
            : ''
        }
      `;
    } else if (route === '/admin/users') {
      const searchParams = new URLSearchParams(path.split('?')[1] || '');
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

      content = `
        <div class="admin-page-header">
          <h1 class="page-title">Users and capabilities</h1>
          <p class="admin-page-subtitle text-secondary">Manage platform accounts, role capabilities, and audited support sessions.</p>
        </div>

        <form class="admin-filter-toolbar" action="/admin/users" method="get">
          <div class="search-input-wrapper">
            <span class="search-input-icon" aria-hidden="true">${renderIcon('search', { size: 16 })}</span>
            <input class="form-input search-input" name="search" placeholder="Search by name or email…" value="${escapeAdmin(searchParams.get('search'))}" aria-label="Search users">
          </div>
          <div class="filter-select-wrapper">
            <label for="user-status-select" class="sr-only">Status</label>
            <select id="user-status-select" name="status" class="form-input form-select" aria-label="Filter by status">
              <option value="">All</option>
              ${['active', 'suspended', 'pending_deletion', 'purged'].map((s) => `<option value="${s}" ${searchParams.get('status') === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <button type="submit" class="btn btn-secondary btn-compact">Search</button>
        </form>

        ${table(['User', 'Email', 'Verification', 'Capabilities', 'Account state', 'Created'], rows, 'No matching users.')}
        ${pageNav(data, path)}
      `;
    } else if (route.startsWith('/admin/users/')) {
      const u = data.user;
      const actions = ['grant-author', 'revoke-author', 'suspend', 'restore'];
      const supported = data.supportRecords;

      content = `
        <p class="mb-4"><a href="/admin/users" class="back-link">${renderIcon('arrow-left', { size: 14 })} Back to users</a></p>
        <div class="admin-page-header">
          <h1 class="page-title">${escapeAdmin(u.displayName)}</h1>
          <p class="admin-page-subtitle text-secondary">User ID: <code class="font-mono text-xs">${escapeAdmin(u.id)}</code></p>
        </div>

        <div class="admin-section-card mb-6">
          <dl class="admin-definition-list">
            <dt>Email</dt><dd>${escapeAdmin(u.email)}</dd>
            <dt>Capabilities</dt><dd><div class="badge-cluster">${u.capabilities.map((c: string) => pill(sentenceCase(c), 'neutral')).join('')}</div></dd>
            <dt>Account state</dt><dd>${pill(sentenceCase(u.accountStatus), u.accountStatus === 'active' ? 'success' : 'warning')}</dd>
            <dt>Verified</dt><dd>${u.emailVerified ? pill('Yes', 'success') : pill('No', 'neutral')}</dd>
          </dl>
        </div>

        <h2 class="section-title">Access controls</h2>
        <div class="admin-ops-grid mb-6">
          ${actions.map((action) => adminForm(`/api/admin/users/${encodeURIComponent(u.id)}/${action}`, `<input type="hidden" name="action" value="${action}">`, humanizeEnum(action))).join('')}
        </div>

        <h2 class="section-title">Support access to learning records</h2>
        <div class="space-y-4 mb-6">
          ${(data.enrollments || []).map((e: any) => `
            <section class="admin-overview-card">
              <h3 class="font-semibold text-sm mb-1">${escapeAdmin(e.title)} · ${escapeAdmin(e.status)} · pinned version ${escapeAdmin(e.pinnedVersionId)}</h3>
              ${adminForm('/api/admin/support-access', `<input type="hidden" name="userId" value="${escapeAdmin(u.id)}"><input type="hidden" name="courseId" value="${escapeAdmin(e.courseId)}">`, 'Start 30-minute support access')}
            </section>
          `).join('')}
        </div>

        ${
          supported
            ? `<aside class="alert alert-warning mb-6" role="status">
                <strong>Audited support access is active.</strong> ${escapeAdmin(supported.support.reason)} · expires ${escapeAdmin(supported.support.expiresAt)} · ${escapeAdmin(supported.course.title)}.
                ${adminForm(`/api/admin/support-access/${encodeURIComponent(supported.support.grantId)}/revoke`, '', 'End support access')}
              </aside>
              <h2 class="section-title">Learning records · ${escapeAdmin(supported.course.title)}</h2>
              <div class="space-y-4 mb-6">
                ${supported.enrollments.map((e: any) => `
                  <section class="admin-overview-card">
                    <h3 class="font-semibold text-sm mb-2">Version ${e.versionNumber} · ${escapeAdmin(e.status)}</h3>
                    ${table(['Step', 'State', 'Evidence'], e.progress.map((p: any) => `<tr><td>${escapeAdmin(p.title || p.stepId)}</td><td>${p.isWaived ? 'Waived' : p.isCompleted ? 'Completed' : 'Not complete'}</td><td>${escapeAdmin(p.waiverReason || p.completedAt || '—')}</td></tr>`), 'No progress records.')}
                    ${table(['Attempt', 'Step', 'Verdict', 'Date'], e.attempts.map((a: any) => `<tr><td>${a.attemptNumber}</td><td>${escapeAdmin(a.stepId)}</td><td>${escapeAdmin(a.verdict)}</td><td>${escapeAdmin(a.createdAt)}</td></tr>`), 'No assessment attempts.')}
                  </section>
                `).join('')}
              </div>`
            : ''
        }

        <h2 class="section-title">Privacy requests</h2>
        ${table(
          ['Type', 'Status', 'Blocker', 'Created', 'Support action'],
          (data.privacyRequests || []).map((r: any) => `
            <tr>
              <td>${escapeAdmin(r.request_type)}</td>
              <td>${pill(sentenceCase(r.status), r.status === 'completed' ? 'success' : 'neutral')}</td>
              <td>${escapeAdmin(r.blocker_reason || '—')}</td>
              <td><time datetime="${escapeAdmin(r.created_at)}" title="${escapeAdmin(r.created_at)}">${formatDate(r.created_at)}</time></td>
              <td>
                ${
                  r.request_type === 'deletion' && ['pending', 'submitted'].includes(r.status)
                    ? adminForm(`/api/admin/privacy-requests/${encodeURIComponent(r.id)}`, '', 'Purge account after review')
                    : r.request_type === 'export' && ['pending', 'submitted'].includes(r.status)
                    ? `<form class="admin-mutation-form" data-admin-export action="/api/admin/privacy-requests/${encodeURIComponent(r.id)}/export" method="post">
                        ${formField('reason', 'Export fulfillment reason')}
                        ${formField('currentPassword', 'Confirm administrator password', 'password')}
                        <button class="btn btn-primary" type="submit">Prepare export for user</button>
                        <p class="form-error hidden" role="alert"></p>
                      </form>`
                    : adminForm(`/api/admin/privacy-requests/${encodeURIComponent(r.id)}`, `<select class="form-input" name="status"><option>pending</option><option>failed</option></select>`, 'Update request status', 'patch')
                }
              </td>
            </tr>
          `),
          'No privacy requests.'
        )}
      `;
    } else if (route === '/admin/courses') {
      const searchParams = new URLSearchParams(path.split('?')[1] || '');
      const rows = (data.items || []).map(
        (c: any) => `
        <tr>
          <td><a href="/admin/courses/${encodeURIComponent(c.id)}" class="table-link font-medium">${escapeAdmin(c.title)}</a></td>
          <td><span class="text-secondary">${escapeAdmin(c.owner_name)}</span></td>
          <td>${pill(sentenceCase(c.publication_status), c.publication_status === 'published' ? 'success' : 'neutral')}</td>
          <td>${pill(sentenceCase(c.visibility), 'neutral')}</td>
          <td class="text-right"><span class="font-mono text-secondary">${escapeAdmin(c.latest_version ?? '—')}</span></td>
          <td>${c.is_suspended ? pill('Suspended', 'danger') : pill('Available', 'success')}</td>
          <td class="text-right">${c.open_reports > 0 ? `<span class="status-badge warning">${c.open_reports}</span>` : `<span class="text-muted">0</span>`}</td>
        </tr>
      `
      );

      content = `
        <div class="admin-page-header">
          <h1 class="page-title">Course administration</h1>
          <p class="admin-page-subtitle text-secondary">Inspect published releases, visibility, waivers, and report metrics.</p>
        </div>

        <form class="admin-filter-toolbar" action="/admin/courses" method="get">
          <div class="search-input-wrapper">
            <span class="search-input-icon" aria-hidden="true">${renderIcon('search', { size: 16 })}</span>
            <input class="form-input search-input" name="search" placeholder="Search by course title…" value="${escapeAdmin(searchParams.get('search'))}" aria-label="Search courses">
          </div>
          <button type="submit" class="btn btn-secondary btn-compact">Search</button>
        </form>

        ${table(
          ['Course', 'Owner', 'Publication', 'Visibility', { label: 'Latest version', align: 'right' }, 'Availability', { label: 'Open reports', align: 'right' }],
          rows,
          'No matching courses.'
        )}
        ${pageNav(data, path)}
      `;
    } else if (route.startsWith('/admin/courses/')) {
      const query = new URLSearchParams(path.split('?')[1] || '');
      const targetVersionId = query.get('versionId');
      const targetStepId = query.get('stepId');
      const targetVersion = targetVersionId && data.versions ? data.versions.find((v: any) => v.id === targetVersionId) : null;
      const targetStep = targetVersion && targetStepId ? targetVersion.steps.find((s: any) => s.id === targetStepId) : null;

      let inspectionBanner = '';
      let snapshotInspectionPanel = '';
      if (targetVersionId) {
        if (!targetVersion) {
          inspectionBanner = `<aside class="alert alert-warning my-3" role="status"><strong>Requested immutable version not found:</strong> Version snapshot <code>${escapeAdmin(targetVersionId)}</code> is not recorded for this course.</aside>`;
        } else {
          const isLatest = targetVersion.versionNumber === data.latestVersion;
          let stepInspection = '';
          if (targetStep) {
            const problemHtml = targetStep.content?.problemStatement
              ? `<div class="step-detail-problem mt-2"><strong class="text-xs text-muted uppercase">Problem statement:</strong><p class="text-sm mt-1">${escapeAdmin(targetStep.content.problemStatement)}</p></div>`
              : '';
            const starterHtml = targetStep.content?.starterCode
              ? `<div class="step-detail-starter mt-2"><strong class="text-xs text-muted uppercase">Starter code:</strong><pre class="p-2 bg-canvas border border-subtle rounded text-xs overflow-x-auto">${escapeAdmin(targetStep.content.starterCode)}</pre></div>`
              : '';
            stepInspection = `<div class="target-step-card border border-subtle p-3 rounded mt-2 bg-subtle" data-inspected-step="${escapeAdmin(targetStep.id)}"><h4 class="text-sm font-semibold mb-1">Target step snapshot: ${escapeAdmin(targetStep.title)}</h4><p class="text-xs text-secondary mb-1">${escapeAdmin(targetStep.moduleTitle || 'Module')} › ${escapeAdmin(targetStep.lessonTitle || 'Lesson')} · Type: <code>${escapeAdmin(targetStep.type)}</code> · ${targetStep.isRequired ? 'Required' : 'Optional'}</p>${problemHtml}${starterHtml}</div>`;
          }

          snapshotInspectionPanel = `
            <section class="exact-version-inspection-panel border border-accent p-3 rounded my-3" data-inspected-version="${escapeAdmin(targetVersion.id)}" role="region" aria-label="Exact Version Inspection">
              <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
                <h3 class="text-sm font-bold">Version ${escapeAdmin(targetVersion.versionNumber)} · ${isLatest ? 'Latest' : 'Historical'}${targetStep ? ` · ${escapeAdmin(targetStep.title)}` : ''}</h3>
                <span class="status-badge ${isLatest ? 'success' : 'warning'}">${isLatest ? 'Latest release' : 'Historical'}</span>
              </div>
              ${stepInspection}
              <details class="text-xs text-muted mt-2">
                <summary class="cursor-pointer font-medium py-1">Technical snapshot details</summary>
                <div class="mt-1 pl-2 border-l border-subtle space-y-1">
                  <p>Version ID: <code>${escapeAdmin(targetVersion.id)}</code></p>
                  <p>Published: ${escapeAdmin(targetVersion.createdAt)}</p>
                  ${targetStep ? `<p>Step ID: <code>${escapeAdmin(targetStep.id)}</code> · ${targetStep.isRequired ? 'Required' : 'Optional'}</p>` : ''}
                </div>
              </details>
            </section>
          `;
        }
      }

      const versionOptions = (data.versions || []).flatMap((v: any) =>
        (v.steps || []).filter((s: any) => s.isRequired).map((s: any) => {
          const val = `${v.id}|${s.id}`;
          const isSelected = targetVersionId === v.id && targetStepId === s.id;
          return `<option value="${escapeAdmin(val)}" ${isSelected ? 'selected' : ''}>Version ${v.versionNumber} · ${escapeAdmin(s.title)}</option>`;
        })
      ).join('');

      const versionsList = (data.versions || [])
        .map((v: any) => `<li>Version ${v.versionNumber} (${escapeAdmin(v.id)}) · Published ${escapeAdmin(v.createdAt)} · <a href="/admin/courses/${encodeURIComponent(data.id)}?versionId=${encodeURIComponent(v.id)}" class="underline text-xs">Inspect exact snapshot</a></li>`)
        .join('');

      content = `
        <p class="mb-4"><a href="/admin/courses" class="back-link">${renderIcon('arrow-left', { size: 14 })} Back to courses</a></p>
        <div class="admin-page-header">
          <h1 class="page-title">${escapeAdmin(data.title)}</h1>
          <p class="admin-page-subtitle text-secondary">Course ID: <code class="font-mono text-xs">${escapeAdmin(data.id)}</code></p>
        </div>

        ${inspectionBanner}
        ${snapshotInspectionPanel}

        <div class="admin-section-card mb-6">
          <dl class="admin-definition-list">
            <dt>Owner</dt><dd>${escapeAdmin(data.ownerName)} · ${escapeAdmin(data.ownerEmail)}</dd>
            <dt>Published release</dt><dd>Version ${escapeAdmin(data.latestVersion || '—')}</dd>
            <dt>Active enrollments</dt><dd>${data.activeEnrollments}</dd>
            <dt>Open reports</dt><dd>${data.openReports}</dd>
            <dt>State</dt><dd>${data.isSuspended ? pill('Suspended', 'danger') : pill('Available', 'success')}</dd>
          </dl>
        </div>

        ${
          data.ownerDeletionPending && data.publicationStatus !== 'archived'
            ? `<aside class="alert alert-warning mb-6"><strong>Owner deletion request is pending.</strong> Archiving this course will unblock deletion after the retention period. ${adminForm(`/api/admin/courses/${encodeURIComponent(data.id)}/archive-for-deletion`, '', 'Archive to resolve ownership blocker')}</aside>`
            : ''
        }

        <h2 class="section-title">Immutable published releases</h2>
        <ul class="text-sm list-disc pl-5 mb-6">${versionsList || '<li>No published releases yet.</li>'}</ul>

        <h2 class="section-title">Availability</h2>
        <div class="mb-6">
          ${adminForm(`/api/admin/courses/${encodeURIComponent(data.id)}/suspension`, `<label class="form-group"><span class="form-label">Action</span><select class="form-input" name="suspended"><option value="${!data.isSuspended}">${data.isSuspended ? 'Restore availability' : 'Suspend course'}</option></select></label>`, 'Apply availability change')}
        </div>

        <h2 class="section-title">Waive a broken required step</h2>
        <p class="text-secondary text-sm mb-3">Only active enrollments pinned to the selected immutable version can be affected. This satisfies progress without awarding a pass. The affected count is rechecked before commit.</p>
        ${adminForm(`/api/admin/courses/${encodeURIComponent(data.id)}/waivers`, `<label class="form-group"><span class="form-label">Version and required step</span><select class="form-input" name="versionStep" data-waiver-step required>${versionOptions}</select></label><input type="hidden" name="reviewedAffectedCount" value="0"><p class="waiver-review-count text-secondary text-sm" role="status">Choose a step to review affected enrollments.</p>`, 'Review and apply waiver')}
      `;
    } else if (route === '/admin/categories') {
      const rows = (data.items || []).map(
        (c: any) => `
        <tr>
          <td><strong>${escapeAdmin(c.name)}</strong></td>
          <td class="text-right"><span class="font-mono text-secondary">${c.usageCount}</span></td>
          <td>
            <button type="button" class="btn btn-secondary btn-compact" data-edit-category-id="${escapeAdmin(c.id)}" data-edit-category-name="${escapeAdmin(c.name)}" data-edit-category-usage="${c.usageCount}">
              ${renderIcon('edit', { size: 14 })}
              <span>Edit</span>
            </button>
          </td>
        </tr>
      `
      );

      content = `
        <div class="admin-header-with-actions admin-page-header">
          <div>
            <h1 class="page-title">Categories</h1>
            <p class="admin-page-subtitle text-secondary">Organize courses across catalog discovery. Changes require administrator confirmation.</p>
          </div>
          <button type="button" class="btn btn-primary" data-open-dialog="new-category-dialog">
            ${renderIcon('plus', { size: 16 })}
            <span>New category</span>
          </button>
        </div>

        ${table(['Category', { label: 'Course usage', align: 'right' }, 'Actions'], rows, 'No categories.')}

        <!-- Accessible Dialog: New Category -->
        <dialog id="new-category-dialog" class="admin-modal-dialog" aria-labelledby="new-category-title">
          <div class="dialog-content">
            <div class="dialog-header">
              <h3 id="new-category-title" class="dialog-title">New category</h3>
              <button type="button" class="dialog-close-btn" data-close-dialog aria-label="Close">${renderIcon('x', { size: 16 })}</button>
            </div>
            <div class="dialog-body">
              <p class="text-sm text-secondary mb-3">Create a new course category. Requires administrator confirmation.</p>
              ${adminForm('/api/admin/categories', '<label class="form-group"><span class="form-label">Name</span><input class="form-input" name="name" required placeholder="e.g. Data Structures"></label>', 'Create category')}
            </div>
            <div class="dialog-footer">
              <button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button>
            </div>
          </div>
        </dialog>

        <!-- Accessible Dialog: Edit Category -->
        <dialog id="edit-category-dialog" class="admin-modal-dialog" aria-labelledby="edit-category-title">
          <div class="dialog-content">
            <div class="dialog-header">
              <h3 id="edit-category-title" class="dialog-title">Edit category</h3>
              <button type="button" class="dialog-close-btn" data-close-dialog aria-label="Close">${renderIcon('x', { size: 16 })}</button>
            </div>
            <div class="dialog-body">
              <form id="edit-category-form" class="admin-mutation-form" data-admin-mutation action="/api/admin/categories" method="put">
                <label class="form-group">
                  <span class="form-label">Category name</span>
                  <input id="edit-category-name" class="form-input" name="name" required>
                </label>
                ${formField('reason', 'Reason')}
                ${formField('currentPassword', 'Confirm administrator password', 'password')}
                <button class="btn btn-primary" type="submit">Save category</button>
                <p class="form-error hidden" role="alert"></p>
              </form>

              <hr class="dialog-divider my-4">

              <div class="danger-zone-compact">
                <h4 class="text-sm font-semibold text-danger mb-1">Remove category</h4>
                <p id="edit-category-usage-warning" class="text-xs text-muted mb-2"></p>
                <form id="delete-category-form" class="admin-mutation-form" data-admin-mutation action="/api/admin/categories" method="delete">
                  <div id="replacement-category-group" class="form-group hidden">
                    <label for="edit-category-replacement-id" class="form-label">Replacement category ID</label>
                    <input id="edit-category-replacement-id" class="form-input" name="replacementId" placeholder="ID of category to reassign courses to">
                  </div>
                  ${formField('reason', 'Reason')}
                  ${formField('currentPassword', 'Confirm administrator password', 'password')}
                  <button class="btn btn-danger" type="submit">Remove category</button>
                  <p class="form-error hidden" role="alert"></p>
                </form>
              </div>
            </div>
            <div class="dialog-footer">
              <button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button>
            </div>
          </div>
        </dialog>
      `;
    } else if (route === '/admin/reports') {
      const searchParams = new URLSearchParams(path.split('?')[1] || '');
      const activeStatus = searchParams.get('status') || '';

      const rows = (data.items || []).map(
        (r: any) => `
        <tr>
          <td><a href="/admin/reports/${encodeURIComponent(r.id)}" class="table-link font-medium">${escapeAdmin(humanizeEnum(r.type))}</a></td>
          <td><span class="text-secondary">${escapeAdmin(r.courseTitle)}</span></td>
          <td><span class="text-secondary">${escapeAdmin(r.reporterName)}</span></td>
          <td>${pill(sentenceCase(r.status), r.status === 'open' ? 'warning' : r.status === 'investigating' ? 'info' : 'success')}</td>
          <td><time datetime="${escapeAdmin(r.createdAt)}" title="${escapeAdmin(r.createdAt)}" class="text-secondary">${formatDate(r.createdAt)}</time></td>
        </tr>
      `
      );

      content = `
        <div class="admin-page-header">
          <h1 class="page-title">Reports</h1>
          <p class="admin-page-subtitle text-secondary">Triage learner reports, exercise issues, and content feedback.</p>
        </div>

        <div class="admin-toolbar-row mb-4">
          <nav class="segmented-control" aria-label="Filter reports by status">
            <a href="/admin/reports" class="segmented-control-btn ${!activeStatus ? 'active' : ''}" ${!activeStatus ? 'aria-current="page"' : ''}>All</a>
            <a href="/admin/reports?status=open" class="segmented-control-btn ${activeStatus === 'open' ? 'active' : ''}" ${activeStatus === 'open' ? 'aria-current="page"' : ''}>Open</a>
            <a href="/admin/reports?status=investigating" class="segmented-control-btn ${activeStatus === 'investigating' ? 'active' : ''}" ${activeStatus === 'investigating' ? 'aria-current="page"' : ''}>Investigating</a>
            <a href="/admin/reports?status=resolved" class="segmented-control-btn ${activeStatus === 'resolved' ? 'active' : ''}" ${activeStatus === 'resolved' ? 'aria-current="page"' : ''}>Resolved</a>
          </nav>
        </div>

        ${table(['Type', 'Course', 'Reporter', 'Status', 'Submitted'], rows, 'No reports in this view.')}
        ${pageNav(data, path)}
      `;
    } else if (route.startsWith('/admin/reports/')) {
      const hasValidVersion = Boolean(data.courseVersionId && data.versionDetails);
      const versionLabel = data.versionNumber ? `Version ${data.versionNumber}` : data.courseVersionId || 'Unavailable';
      const versionParam = hasValidVersion ? `versionId=${encodeURIComponent(data.courseVersionId)}` : '';
      const stepParam = hasValidVersion && data.stepId ? `&stepId=${encodeURIComponent(data.stepId)}` : '';
      const targetCourseUrl = data.courseId && hasValidVersion ? `/admin/courses/${encodeURIComponent(data.courseId)}?${versionParam}${stepParam}` : null;

      const versionLinkHtml = targetCourseUrl
        ? `<a href="${escapeAdmin(targetCourseUrl)}" class="admin-exact-version-link font-medium underline" data-report-version-link>${escapeAdmin(versionLabel)}${data.versionDetails ? (data.versionDetails.isLatest ? ' (latest published)' : ' (historical version, not newest)') : ''}</a>`
        : `<span class="text-muted" data-report-version-unavailable>Unavailable — no version snapshot recorded</span>`;

      const stepLabel = data.stepTitle ? `${data.stepTitle} (${data.stepId})` : data.stepId || 'Course-level';
      const stepLinkHtml = data.stepId
        ? targetCourseUrl
          ? `<a href="${escapeAdmin(targetCourseUrl)}" class="admin-exact-step-link font-medium underline" data-report-step-link>${escapeAdmin(stepLabel)}</a>`
          : `<span class="text-muted" data-report-step-unavailable>${escapeAdmin(stepLabel)}</span>`
        : `<span class="text-muted">Course-level report</span>`;

      content = `
        <p class="mb-4"><a href="/admin/reports" class="back-link">${renderIcon('arrow-left', { size: 14 })} Back to reports</a></p>
        <div class="admin-page-header">
          <h1 class="page-title">${escapeAdmin(humanizeEnum(data.type))} · ${escapeAdmin(data.courseTitle)}</h1>
          <p class="admin-page-subtitle text-secondary">Status: ${pill(sentenceCase(data.status), data.status === 'open' ? 'warning' : data.status === 'investigating' ? 'info' : 'success')}</p>
        </div>

        <div class="admin-section-card mb-4">
          <h2 class="section-title">Report description</h2>
          <p class="text-sm leading-relaxed">${escapeAdmin(data.description)}</p>
        </div>

        <div class="report-context-panel border border-subtle p-3 rounded mb-4 bg-subtle">
          <h3 class="text-sm font-semibold mb-2">Reported learning context</h3>
          <p class="text-sm mb-1"><strong>Course:</strong> <a href="/admin/courses/${encodeURIComponent(data.courseId)}" class="underline">${escapeAdmin(data.courseTitle)}</a></p>
          <p class="text-sm mb-1"><strong>Immutable version:</strong> ${versionLinkHtml}</p>
          <p class="text-sm mb-1"><strong>Step:</strong> ${stepLinkHtml}</p>
          ${data.versionDetails?.createdAt ? `<p class="text-xs text-muted mt-2">Pinned to version published ${escapeAdmin(data.versionDetails.createdAt)}.</p>` : ''}
        </div>

        ${data.submittedCode ? `<details class="disclosure-card mb-4"><summary>Consented submitted code</summary><div class="disclosure-body"><pre class="code-pre">${escapeAdmin(data.submittedCode)}</pre></div></details>` : ''}

        <h2 class="section-title">Resolution and triage</h2>
        <form data-admin-mutation action="/api/admin/reports/${encodeURIComponent(data.id)}" method="patch" class="admin-mutation-form">
          <label class="form-group">
            <span class="form-label">Status</span>
            <select name="status" class="form-input">
              <option value="open" ${data.status === 'open' ? 'selected' : ''}>Open</option>
              <option value="investigating" ${data.status === 'investigating' ? 'selected' : ''}>Investigating</option>
              <option value="resolved" ${data.status === 'resolved' ? 'selected' : ''}>Resolved</option>
            </select>
          </label>
          ${formField('outcome', 'Resolution outcome', 'text', false)}
          <label class="form-group">
            <span class="form-label">Internal notes</span>
            <textarea class="form-input form-textarea" name="internalNotes">${escapeAdmin(data.internalNotes || '')}</textarea>
          </label>
          ${formField('reason', 'Reason')}
          ${formField('currentPassword', 'Confirm administrator password', 'password')}
          <button class="btn btn-primary" type="submit">Update report</button>
          <p class="form-error hidden" role="alert"></p>
        </form>
      `;
    } else if (route === '/admin/media') {
      const rows = (data.items || []).map(
        (a: any) => `
        <tr>
          <td>
            <div class="media-cell-wrapper">
              <span class="media-placeholder-icon" aria-hidden="true">${renderIcon('image', { size: 16 })}</span>
              <code class="font-mono text-xs" title="${escapeAdmin(a.id)}">${escapeAdmin(a.id.slice(0, 8))}…</code>
              <button type="button" class="btn-icon btn-compact" data-copy-text="${escapeAdmin(a.id)}" title="Copy asset ID" aria-label="Copy asset ID">${renderIcon('copy', { size: 13 })}</button>
            </div>
          </td>
          <td><span class="text-secondary">${escapeAdmin(a.courseTitle)}</span></td>
          <td><span class="font-mono text-xs text-secondary">${escapeAdmin(a.mimeType)}</span> <span class="text-muted text-xs">· ${Math.ceil(a.fileSize / 1024)} KB</span></td>
          <td>${pill(sentenceCase(a.processingStatus), a.processingStatus === 'ready' ? 'success' : a.processingStatus === 'quarantined' ? 'warning' : 'neutral')}</td>
          <td class="text-right"><span class="font-mono text-secondary">${a.referenceCount}</span></td>
          <td>
            <button type="button" class="btn btn-secondary btn-compact" data-open-dialog="media-dialog-${escapeAdmin(a.id)}">Review</button>
          </td>
        </tr>
      `
      );

      const dialogs = (data.items || []).map(
        (a: any) => `
        <dialog id="media-dialog-${escapeAdmin(a.id)}" class="admin-modal-dialog" aria-labelledby="media-dialog-title-${escapeAdmin(a.id)}">
          <div class="dialog-content">
            <div class="dialog-header">
              <h3 id="media-dialog-title-${escapeAdmin(a.id)}" class="dialog-title">Asset review: <code>${escapeAdmin(a.id.slice(0, 8))}…</code></h3>
              <button type="button" class="dialog-close-btn" data-close-dialog aria-label="Close">${renderIcon('x', { size: 16 })}</button>
            </div>
            <div class="dialog-body">
              <p class="text-xs text-secondary mb-3">Asset ID: <code class="font-mono">${escapeAdmin(a.id)}</code> · Course: <strong>${escapeAdmin(a.courseTitle)}</strong> · Retained references: <strong>${a.referenceCount}</strong></p>

              ${
                a.processingStatus === 'ready'
                  ? `<div class="dialog-section mb-4">
                      <h4 class="text-sm font-semibold mb-2">Safe preview</h4>
                      <p class="text-xs text-muted mb-2">Inspect asset using authorized preview token without rendering unvetted public thumbnails.</p>
                      <form data-admin-preview action="/api/admin/media/${encodeURIComponent(a.id)}/preview" method="post">
                        ${formField('reason', 'Preview review reason')}
                        ${formField('currentPassword', 'Confirm administrator password', 'password')}
                        <button class="btn btn-secondary" type="submit">Safe preview</button>
                      </form>
                    </div>`
                  : ''
              }

              <div class="dialog-section mb-4">
                <h4 class="text-sm font-semibold mb-2">${a.processingStatus === 'quarantined' ? 'Restore asset' : 'Quarantine asset'}</h4>
                ${adminForm(`/api/admin/media/${encodeURIComponent(a.id)}/${a.processingStatus === 'quarantined' ? 'restore' : 'quarantine'}`, '', a.processingStatus === 'quarantined' ? 'Restore asset' : 'Quarantine asset')}
              </div>

              ${
                a.processingStatus === 'quarantined' && a.referenceCount === 0
                  ? `<div class="dialog-section danger-zone-compact">
                      <h4 class="text-sm font-semibold text-danger mb-2">Delete unreferenced asset</h4>
                      <p class="text-xs text-muted mb-2">Permanently purge this quarantined asset. Allowed only because retained references are 0.</p>
                      ${adminForm(`/api/admin/media/${encodeURIComponent(a.id)}`, '', 'Delete unreferenced asset', 'delete', 'danger')}
                    </div>`
                  : ''
              }
            </div>
            <div class="dialog-footer">
              <button type="button" class="btn btn-secondary" data-close-dialog>Close</button>
            </div>
          </div>
        </dialog>
      `
      ).join('');

      content = `
        <div class="admin-page-header">
          <h1 class="page-title">Media operations</h1>
          <p class="admin-page-subtitle text-secondary">Authorized asset quarantine and safe inspection. Raw binaries are never displayed directly.</p>
        </div>

        ${table(['Asset', 'Course', 'Type / size', 'Processing', { label: 'References', align: 'right' }, 'Review'], rows, 'No media assets.')}
        ${pageNav(data, path)}
        ${dialogs}
      `;
    } else if (route === '/admin/execution') {
      const jobs = data.jobs?.items || [];
      const query = new URLSearchParams(path.split('?')[1] || '');

      const rows = jobs.map(
        (j: any) => `
        <tr>
          <td><code class="font-mono text-xs" title="${escapeAdmin(j.id)}">${escapeAdmin(j.id.slice(0, 12))}…</code></td>
          <td><span class="text-secondary">${escapeAdmin(humanizeEnum(j.jobType))}</span></td>
          <td>${pill(sentenceCase(j.status), j.status === 'completed' ? 'success' : j.status === 'failed' ? 'danger' : j.status === 'running' ? 'info' : 'neutral')}</td>
          <td><time datetime="${escapeAdmin(j.createdAt)}" title="${escapeAdmin(j.createdAt)}" class="text-secondary">${formatDate(j.createdAt)}</time></td>
          <td><time datetime="${escapeAdmin(j.updatedAt)}" title="${escapeAdmin(j.updatedAt)}" class="text-secondary">${formatDate(j.updatedAt)}</time></td>
        </tr>
      `
      );

      content = `
        <div class="admin-page-header">
          <h1 class="page-title">Execution operations</h1>
          <p class="admin-page-subtitle text-secondary">Monitor runner queues, worker health, and emergency job admission kill switch.</p>
        </div>

        <div class="admin-overview-card execution-service-card mb-6">
          <div class="execution-service-header">
            <div class="execution-service-status">
              ${pill(data.overview.execution.paused ? 'Execution: Paused' : 'Execution: Enabled', data.overview.execution.paused ? 'warning' : 'success')}
              <p class="execution-service-desc text-secondary">
                ${data.overview.execution.paused ? 'Execution is currently paused. No new student code runs are admitted.' : 'Disabling accepts no new jobs. Reading and saved code remain available.'}
              </p>
            </div>
            <button type="button" class="btn ${data.overview.execution.paused ? 'btn-secondary' : 'btn-danger'}" data-open-dialog="execution-toggle-dialog">
              ${data.overview.execution.paused ? 'Reactivate execution…' : 'Disable new execution…'}
            </button>
          </div>
        </div>

        <h2 class="section-title">Queue and worker health</h2>
        <div class="admin-stats-grid mb-6">
          <div class="stat-tile">
            <span class="stat-label">Queued jobs</span>
            <span class="stat-value font-mono">${data.overview.queue.queued}</span>
            <span class="stat-hint text-xs text-muted">Awaiting worker lease</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Running jobs</span>
            <span class="stat-value font-mono">${data.overview.queue.running}</span>
            <span class="stat-hint text-xs text-muted">Active in sandbox</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Oldest queued</span>
            <span class="stat-value text-sm font-mono">${escapeAdmin(data.overview.queue.oldestQueuedAt ? formatDate(data.overview.queue.oldestQueuedAt) : 'None')}</span>
            <span class="stat-hint text-xs text-muted">${escapeAdmin(data.overview.queue.oldestQueuedAt || 'No queued jobs')}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Worker health</span>
            <div class="mt-1">${pill(data.overview.workers.lastObservedAt ? 'Active' : 'Unavailable', data.overview.workers.lastObservedAt ? 'success' : 'neutral')}</div>
            <span class="stat-hint text-xs text-muted" title="${escapeAdmin(data.overview.workers.health)}">${escapeAdmin(data.overview.workers.health || 'Heartbeat telemetry')}</span>
          </div>
        </div>

        <form class="admin-filter-toolbar mb-4" action="/admin/execution" method="get">
          <div class="date-input-group">
            <label for="exec-from" class="date-label">From</label>
            <input id="exec-from" type="date" name="from" class="form-input form-date" value="${escapeAdmin(query.get('from'))}">
          </div>
          <div class="date-input-group">
            <label for="exec-to" class="date-label">To</label>
            <input id="exec-to" type="date" name="to" class="form-input form-date" value="${escapeAdmin(query.get('to'))}">
          </div>
          <button type="submit" class="btn btn-secondary btn-compact">Filter jobs</button>
        </form>

        ${table(['Job reference', 'Type', 'State', 'Accepted', 'Updated'], rows, 'No execution jobs in this time range.')}
        ${pageNav(data.jobs, path)}

        <!-- Accessible Dialog: Execution Toggle -->
        <dialog id="execution-toggle-dialog" class="admin-modal-dialog" aria-labelledby="execution-dialog-title">
          <div class="dialog-content">
            <div class="dialog-header">
              <h3 id="execution-dialog-title" class="dialog-title">${data.overview.execution.paused ? 'Reactivate execution' : 'Disable new execution'}</h3>
              <button type="button" class="dialog-close-btn" data-close-dialog aria-label="Close">${renderIcon('x', { size: 16 })}</button>
            </div>
            <div class="dialog-body">
              <p class="text-sm text-secondary mb-3">
                ${data.overview.execution.paused ? 'Reactivating accepts new code execution jobs and sends them to runner sandboxes.' : 'Disabling accepts no new jobs. Reading, authoring, and saved student code remain available.'}
              </p>
              ${adminForm(`/api/admin/execution/${data.overview.execution.paused ? 'resume' : 'pause'}`, '', data.overview.execution.paused ? 'Reactivate execution' : 'Disable new execution', 'post', data.overview.execution.paused ? 'primary' : 'danger')}
            </div>
            <div class="dialog-footer">
              <button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button>
            </div>
          </div>
        </dialog>
      `;
    } else if (route === '/admin/audit') {
      const query = new URLSearchParams(path.split('?')[1] || '');
      const filter = (name: string, label: string, type = 'text') =>
        `<label class="form-group"><span class="form-label">${escapeAdmin(label)}</span><input name="${escapeAdmin(name)}" type="${type}" class="form-input" value="${escapeAdmin(query.get(name))}"></label>`;

      const hasAdvancedActive = Boolean(
        query.get('actorId') ||
        query.get('targetType') ||
        query.get('targetId') ||
        query.get('correlationId') ||
        query.get('from') ||
        query.get('to')
      );

      const activeAdvancedCount = [
        query.get('actorId'),
        query.get('targetType'),
        query.get('targetId'),
        query.get('correlationId'),
        query.get('from'),
        query.get('to'),
      ].filter(Boolean).length;

      const rows = (data.items || []).map(
        (e: any) => `
        <tr>
          <td class="admin-nowrap"><time datetime="${escapeAdmin(e.createdAt)}" title="${escapeAdmin(e.createdAt)}" class="text-secondary">${formatDate(e.createdAt)}</time></td>
          <td class="admin-nowrap"><span class="font-medium">${escapeAdmin(e.actorName)}</span></td>
          <td class="admin-nowrap">
            <a href="/admin/audit/${encodeURIComponent(e.id)}" class="table-link font-medium" title="Action code: ${escapeAdmin(e.action)}" aria-label="${escapeAdmin(formatAuditAction(e.action))} (${escapeAdmin(e.action)})">
              ${escapeAdmin(formatAuditAction(e.action))}
            </a>
          </td>
          <td><span class="text-secondary">${escapeAdmin(e.targetType)} · <code class="font-mono text-xs">${escapeAdmin(e.targetId)}</code></span></td>
          <td><span class="text-secondary">${escapeAdmin(e.reason || '—')}</span></td>
          <td><code class="font-mono text-xs text-muted">${escapeAdmin(e.correlationId || '—')}</code></td>
        </tr>
      `
      );

      content = `
        <div class="admin-page-header">
          <h1 class="page-title">Audit</h1>
          <p class="admin-page-subtitle text-secondary">Authoritative immutable log of administrative mutations and agent interactions.</p>
        </div>

        <form class="admin-audit-filter-form mb-4" action="/admin/audit" method="get">
          <div class="audit-primary-row">
            <div class="search-input-wrapper">
              <span class="search-input-icon" aria-hidden="true">${renderIcon('search', { size: 16 })}</span>
              <input class="form-input search-input" name="action" placeholder="Filter by action (e.g. course:publish)…" value="${escapeAdmin(query.get('action'))}" aria-label="Action filter">
            </div>
            <input class="form-input audit-reason-input" name="reason" placeholder="Reason contains…" value="${escapeAdmin(query.get('reason'))}" aria-label="Reason filter">
            <button type="submit" class="btn btn-secondary btn-compact">Search audit</button>
          </div>

          <details class="disclosure-card admin-advanced-filters mt-2" ${hasAdvancedActive ? 'open' : ''}>
            <summary class="cursor-pointer text-xs font-medium text-secondary py-1">${renderIcon('filter', { size: 14 })} Advanced filters ${activeAdvancedCount ? `(${activeAdvancedCount} active)` : ''}</summary>
            <div class="advanced-filters-grid mt-3">
              ${filter('actorId', 'Actor ID')}
              ${filter('targetType', 'Target type')}
              ${filter('targetId', 'Target ID')}
              ${filter('correlationId', 'Correlation ID')}
              ${filter('from', 'From', 'date')}
              ${filter('to', 'To', 'date')}
            </div>
          </details>
        </form>

        ${table(['Time', 'Actor', 'Action', 'Target', 'Reason', 'Correlation'], rows, 'No audit events match these filters.')}
        ${pageNav(data, path)}
      `;
    } else if (route.startsWith('/admin/audit/')) {
      content = `
        <p class="mb-4"><a href="/admin/audit" class="back-link">${renderIcon('arrow-left', { size: 14 })} Back to audit</a></p>
        <div class="admin-page-header">
          <h1 class="page-title">${escapeAdmin(formatAuditAction(data.action))}</h1>
          <p class="admin-page-subtitle text-secondary">Raw action: <code class="font-mono text-xs">${escapeAdmin(data.action)}</code></p>
        </div>

        <div class="mb-6">
          ${table(['Field', 'Value'], Object.entries(data).filter(([key]) => key !== 'metadata').map(([key, value]) => `<tr><th scope="row">${escapeAdmin(key)}</th><td>${escapeAdmin(value)}</td></tr>`), 'No event details.')}
        </div>

        ${
          data.metadata
            ? `<div class="admin-section-card">
                <h2 class="section-title">Permitted structured changes</h2>
                <pre class="code-pre">${escapeAdmin(JSON.stringify(data.metadata, null, 2))}</pre>
              </div>`
            : ''
        }
      `;
    }
  }

  return renderAdminShell({
    activePath: path.split('?')[0],
    adminUser,
    headerTitle: title,
    content: `<div class="admin-page-content">${err}${content}</div>`,
  });
}
