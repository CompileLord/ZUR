import { renderAdminShell } from '../../components/shells/AdminShell.ts';
import { renderIcon, type IconName } from '../../components/common/icons.ts';
import { formatDate, sentenceCase, humanizeEnum } from '../../utils/formatters.ts';

export function escapeAdmin(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}

const formField = (name: string, label: string, type = 'text', required = true) =>
  `<label class="form-group"><span class="form-label">${escapeAdmin(label)}</span><input class="form-input" name="${escapeAdmin(name)}" type="${type}" ${required ? 'required' : ''}></label>`;

export interface ActionDialogOptions {
  id: string;
  title: string;
  target: string;
  currentState?: string;
  resultingState?: string;
  effect: string;
  actionUrl: string;
  method?: string;
  buttonLabel: string;
  buttonVariant?: 'primary' | 'danger';
  extraContent?: string;
  isDestructive?: boolean;
}

export function renderActionDialog(opts: ActionDialogOptions): string {
  const isDanger = opts.buttonVariant === 'danger' || opts.isDestructive;
  return `
    <dialog id="${escapeAdmin(opts.id)}" class="admin-modal-dialog" aria-labelledby="${escapeAdmin(opts.id)}-title">
      <div class="dialog-content">
        <div class="dialog-header">
          <h3 id="${escapeAdmin(opts.id)}-title" class="dialog-title">${escapeAdmin(opts.title)}</h3>
          <button type="button" class="dialog-close-btn" data-close-dialog aria-label="Close dialog">${renderIcon('x', { size: 16 })}</button>
        </div>
        <div class="dialog-body">
          <div class="admin-mutation-summary admin-action-effect-card ${isDanger ? 'danger' : ''} mb-3 p-3 bg-surface border border-subtle rounded text-xs space-y-1">
            <div class="flex justify-between"><span class="text-muted">Target:</span> <span class="font-mono text-primary font-medium">${escapeAdmin(opts.target)}</span></div>
            ${
              opts.currentState || opts.resultingState
                ? `<div class="flex justify-between"><span class="text-muted">Current state:</span> <span class="status-badge info">${escapeAdmin(opts.currentState || '—')}</span></div>
                   ${opts.resultingState ? `<div class="flex justify-between"><span class="text-muted">Resulting state:</span> <span class="status-badge ${isDanger ? 'danger' : 'success'}">${escapeAdmin(opts.resultingState)}</span></div>` : ''}`
                : ''
            }
            <div class="flex justify-between pt-1"><span class="text-muted">Proposed action:</span> <span class="font-medium text-primary">${escapeAdmin(opts.buttonLabel)}</span></div>
            ${opts.effect ? `<div class="mt-2 pt-2 border-t border-subtle text-secondary leading-relaxed">${escapeAdmin(opts.effect)}</div>` : ''}
          </div>

          <form class="admin-mutation-form" data-admin-mutation action="${escapeAdmin(opts.actionUrl)}" method="${escapeAdmin(opts.method || 'post')}">
            ${opts.extraContent || ''}
            ${formField('reason', 'Reason')}
            ${formField('currentPassword', 'Confirm administrator password', 'password')}
            <div class="dialog-footer flex justify-end gap-2">
              <button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button>
              <button class="btn btn-${opts.buttonVariant || (isDanger ? 'danger' : 'primary')}" type="submit">${escapeAdmin(opts.buttonLabel)}</button>
            </div>
            <p class="form-error hidden" role="alert"></p>
          </form>
        </div>
      </div>
    </dialog>
  `;
}

const adminForm = (
  action: string,
  content: string,
  button: string = 'Save changes',
  method = 'post',
  buttonVariant: 'primary' | 'danger' = 'primary',
  targetMeta?: { target: string; currentState?: string; resultingState?: string; effect?: string }
) => {
  const parts = action.split('/');
  const inferredTarget = targetMeta?.target || parts[parts.length - 2] || parts[parts.length - 1] || 'Operation target';
  const targetHeader = `
    <div class="admin-mutation-summary mb-3 p-3 bg-surface border border-subtle rounded text-xs space-y-1">
      <div class="flex justify-between"><span class="text-muted">Target:</span> <span class="font-mono text-primary font-medium">${escapeAdmin(targetMeta?.target || inferredTarget)}</span></div>
      ${targetMeta?.currentState ? `<div class="flex justify-between"><span class="text-muted">Current state:</span> <span class="status-badge info">${escapeAdmin(targetMeta.currentState)}</span></div>` : ''}
      ${targetMeta?.resultingState ? `<div class="flex justify-between"><span class="text-muted">Resulting state:</span> <span class="status-badge success">${escapeAdmin(targetMeta.resultingState)}</span></div>` : ''}
      ${targetMeta?.effect ? `<div class="mt-2 pt-2 border-t border-subtle text-secondary leading-relaxed">${escapeAdmin(targetMeta.effect)}</div>` : ''}
      <div class="flex justify-between pt-1"><span class="text-muted">Proposed action:</span> <span class="font-medium text-primary">${escapeAdmin(button)}</span></div>
    </div>
  `;
  return `<form class="admin-mutation-form" data-admin-mutation action="${escapeAdmin(action)}" method="${escapeAdmin(method)}">${targetHeader}${content}${formField('reason', 'Reason')}${formField('currentPassword', 'Confirm administrator password', 'password')}<div class="dialog-form-actions mt-4 flex items-center justify-end gap-2"><button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button><button class="btn btn-${buttonVariant}" type="submit" ${action.endsWith('/waivers') ? 'disabled' : ''}>${escapeAdmin(button)}</button></div><p class="form-error hidden" role="alert"></p></form>`;
};

export interface TableCol {
  label: string;
  align?: 'left' | 'right' | 'center';
}

const table = (headers: (string | TableCol)[], rows: string[], empty: string, nextStep = '') => {
  const headerCells = headers.map((h) => {
    const label = typeof h === 'string' ? h : h.label;
    const alignClass = typeof h === 'object' && h.align === 'right' ? ' class="text-right"' : '';
    return `<th scope="col"${alignClass}>${escapeAdmin(label)}</th>`;
  }).join('');
  return `<div class="data-table-wrapper"><table class="data-table admin-table"><thead><tr>${headerCells}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="empty-state"><span class="admin-empty"><span class="admin-empty-icon" aria-hidden="true">${renderIcon('list', { size: 20 })}</span><span class="admin-empty-title">${escapeAdmin(empty)}</span>${nextStep ? `<span class="admin-empty-next">${nextStep}</span>` : ''}</span></td></tr>`}</tbody></table></div>`;
};

const pill = (text: string, kind = 'info') =>
  `<span class="status-badge ${kind}">${escapeAdmin(text)}</span>`;

const idChip = (id: string, label: string) =>
  `<button type="button" class="admin-id-chip" data-copy-text="${escapeAdmin(id)}" title="Copy ${escapeAdmin(label)}" aria-label="Copy ${escapeAdmin(label)}"><span class="admin-id-chip-label">${escapeAdmin(label)}</span><code>${escapeAdmin(id)}</code>${renderIcon('copy', { size: 13 })}</button>`;

const healthDot = (kind: 'ok' | 'warn' | 'bad' | 'idle') => `<span class="health-dot health-dot-${kind}" aria-hidden="true"></span>`;

const reportTone = (status: string) => (status === 'open' ? 'warning' : status === 'investigating' ? 'info' : 'success');

const detailHeader = (title: string, badge: string, chip: string) =>
  `<div class="admin-page-header admin-detail-header"><div class="admin-detail-title-row"><h1 class="page-title">${title}</h1>${badge}</div>${chip}</div>`;

const pageNav = (data: any, path: string) => {
  if (!data || !Number.isFinite(data.total) || !Number.isFinite(data.limit) || data.total === 0) return '';
  const params = new URLSearchParams(path.split('?')[1] || '');
  const offset = Number(params.get('offset') || 0), limit = data.limit;
  const link = (next: number, label: string) => {
    const q = new URLSearchParams(params);
    q.set('offset', String(next));
    q.set('limit', String(limit));
    return `<a class="btn btn-secondary btn-compact" href="${escapeAdmin(`${path.split('?')[0]}?${q}`)}">${label}</a>`;
  };
  return `<nav class="admin-pagination" aria-label="Result pages"><span>Showing ${offset + 1}–${Math.min(offset + data.items.length, data.total)} of ${data.total}</span>${offset > 0 ? link(Math.max(0, offset - limit), 'Previous') : ''}${offset + limit < data.total ? link(offset + limit, 'Next') : ''}</nav>`;
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

export function renderAdminPageContent(
  path: string,
  data: any,
  error?: string,
  adminUser?: { displayName: string; email: string }
): { title: string; content: string } {
  const route = path.split('?')[0];
  const title =
    route === '/admin'
      ? 'Platform status'
      : route.startsWith('/admin/users')
      ? 'Users'
      : route.startsWith('/admin/courses')
      ? 'Courses'
      : route.startsWith('/admin/categories')
      ? 'Categories'
      : route.startsWith('/admin/reports')
      ? 'Reports'
      : route.startsWith('/admin/media')
      ? 'Media'
      : route.startsWith('/admin/execution')
      ? 'Execution'
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

      type Attention = { tone: 'critical' | 'warning'; icon: IconName; html: string; href?: string; cta?: string; role?: string };
      const attention: Attention[] = [];
      if (data.openReports > 0) {
        attention.push({
          tone: 'warning',
          icon: 'alert-triangle',
          html: `<strong>${data.openReports} open report${data.openReports === 1 ? '' : 's'}</strong> awaiting triage`,
          href: '/admin/reports?status=open',
          cta: 'Triage reports',
        });
      }
      if (data.execution?.paused) {
        attention.push({
          tone: 'warning',
          icon: 'alert-triangle',
          html: '<strong>Execution admission paused</strong> — new student code jobs are blocked',
          href: '/admin/execution',
          cta: 'Open execution',
        });
      }
      if (data.executionInfrastructureErrors?.failures > 0) {
        const f = data.executionInfrastructureErrors.failures;
        attention.push({
          tone: 'warning',
          icon: 'alert-triangle',
          html: `<strong>${escapeAdmin(f)} runner failure${f === 1 ? '' : 's'}</strong> in the last 24h`,
          href: '/admin/execution',
          cta: 'Review jobs',
        });
      }
      if (data.emailDeliveryIssues > 0) {
        attention.push({
          tone: 'warning',
          icon: 'info',
          html: `<strong>${data.emailDeliveryIssues} email delivery issue(s)</strong> detected`,
          href: '/admin/users',
          cta: 'Review accounts',
        });
      }
      for (const alert of data.operational?.alerts || []) {
        const critical = alert.severity === 'critical';
        attention.push({
          tone: critical ? 'critical' : 'warning',
          icon: 'alert-triangle',
          html: `<strong>${escapeAdmin(alert.code)}</strong> ${escapeAdmin(alert.message)}`,
          role: critical ? 'alert' : 'status',
        });
      }

      const attentionHtml = attention.length
        ? `<ul class="attention-items-list">${attention
            .map(
              (a) => `<li class="admin-attention-banner ${a.tone}"${a.role ? ` role="${a.role}"` : ''}>
                <span class="admin-attention-content">${renderIcon(a.icon, { size: 16 })}<span>${a.html}</span></span>
                ${a.href ? `<a href="${a.href}" class="btn btn-secondary btn-compact">${a.cta}</a>` : ''}
              </li>`
            )
            .join('')}</ul>`
        : `<p class="ops-alert-calm" role="status">${renderIcon('check', { size: 16 })} Nothing needs attention right now.</p>`;

      const hasEmailData = data.email && data.email.status && data.email.status !== 'No delivery data';
      const errAvailable = errRateDisplay !== 'Unavailable';
      const errObserved = Boolean(errRate && errRate.numerator > 0);

      const notConfigured = (text = 'Not configured') => `<span class="admin-chip-quiet">${text}</span>`;

      content = `
        <div class="admin-page-header">
          <h1 class="page-title">Platform status</h1>
          <p class="admin-page-subtitle text-secondary">Updated <time datetime="${escapeAdmin(data.refreshedAt)}" title="${escapeAdmin(data.refreshedAt)}">${escapeAdmin(refreshedDisplay)}</time></p>
        </div>

        <section class="admin-attention-section" aria-label="Operational alerts">
          <h2 class="admin-section-heading">Needs attention${attention.length ? ` <span class="status-badge warning">${attention.length}</span>` : ''}</h2>
          ${attentionHtml}
        </section>

        <section class="admin-health-section" aria-labelledby="health-title">
          <div class="admin-health-heading">
            <h2 id="health-title" class="admin-section-heading">Health</h2>
            <details class="admin-info-popover">
              <summary aria-label="About this telemetry">${renderIcon('info', { size: 15 })}<span>About telemetry</span></summary>
              <div class="admin-info-popover-panel">
                <p>Request samples are in memory and reset on process restart. p95 values use the last five minutes; no request payloads or user identifiers are retained.</p>
                <p>Telemetry status: queue ${escapeAdmin(data.telemetry.queue)}, worker heartbeat ${escapeAdmin(data.telemetry.workerHeartbeat)}, email ${escapeAdmin(data.telemetry.email)}, internal errors ${escapeAdmin(data.telemetry.internalErrorRate || 'unavailable')}.</p>
              </div>
            </details>
          </div>
          <div class="admin-health-strip">
            <div class="health-item">
              <span class="health-label">${healthDot(data.execution.paused ? 'warn' : 'ok')} Execution</span>
              <strong class="health-value">${data.execution.paused ? 'Admission paused' : 'Accepting jobs'}</strong>
              <span class="health-hint">New Python jobs ${data.execution.paused ? 'are paused' : 'can be accepted'}.</span>
            </div>
            <div class="health-item">
              <span class="health-label">${healthDot(data.queue.queued > 0 ? 'warn' : 'ok')} Queue</span>
              <strong class="health-value">${data.queue.queued} queued · ${data.queue.running} running</strong>
              <span class="health-hint">Oldest queued: ${escapeAdmin(data.queue.oldestQueuedAt ? formatDate(data.queue.oldestQueuedAt) : 'No queued jobs')}</span>
              <span class="health-hint">Runner heartbeat: ${data.workers.lastObservedAt ? `last observed ${escapeAdmin(formatDate(data.workers.lastObservedAt))}` : `${notConfigured()} <span class="sr-only">No separate worker heartbeat configured</span>`}</span>
            </div>
            <div class="health-item">
              <span class="health-label">${healthDot(!errAvailable ? 'idle' : errObserved ? 'warn' : 'ok')} Internal-error rate</span>
              <strong class="health-value">${errAvailable ? errRateDisplay : notConfigured('Unavailable')}</strong>
              <span class="health-hint">${errRateSub}</span>
              ${data.operational ? '<a href="#recent-request-metrics">Recent request metrics</a>' : ''}
            </div>
            <div class="health-item">
              <span class="health-label">${healthDot(data.emailDeliveryIssues > 0 ? 'warn' : hasEmailData ? 'ok' : 'idle')} Email delivery</span>
              <strong class="health-value">${data.emailDeliveryIssues > 0 ? `${data.emailDeliveryIssues} issue(s)` : hasEmailData ? 'Normal' : notConfigured('No telemetry')}</strong>
              <span class="health-hint">${escapeAdmin(data.email?.lastSentAt ? `Last sent ${formatDate(data.email.lastSentAt)}` : 'No delivery events recorded')}</span>
            </div>
          </div>
        </section>

        ${
          data.operational?.requestMetrics
            ? `<details id="recent-request-metrics" class="disclosure-card mt-3">
                <summary class="cursor-pointer font-medium">Recent request metrics</summary>
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

      content = `
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
    } else if (route.startsWith('/admin/users/')) {
      const u = data.user;
      const supported = data.supportRecords;
      const isSuspended = u.accountStatus === 'suspended';
      const hasAuthor = u.capabilities.includes('author');

      const enrollmentOptions = (data.enrollments || []).map(
        (e: any) => `<option value="${escapeAdmin(e.courseId)}">${escapeAdmin(e.title)} (pinned ${escapeAdmin(e.pinnedVersionId || 'latest')})</option>`
      ).join('');

      content = `
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
                    ${table(['Step', 'State', 'Evidence'], e.progress.map((p: any) => `<tr><td>${escapeAdmin(p.title || p.stepId)}</td><td>${p.isWaived ? 'Waived' : p.isCompleted ? 'Completed' : 'Not complete'}</td><td>${escapeAdmin(p.waiverReason || p.completedAt || '—')}</td></tr>`), 'No progress records.')}
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
              <td>${escapeAdmin(r.blocker_reason || '—')}</td>
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
    } else if (route === '/admin/courses') {
      const searchParams = new URLSearchParams(path.split('?')[1] || '');
      const searchVal = searchParams.get('search') || '';

      const rows = (data.items || []).map(
        (c: any) => `
        <tr>
          <td class="course-title-cell"><a href="/admin/courses/${encodeURIComponent(c.id)}" class="table-link font-medium">${escapeAdmin(c.title)}</a></td>
          <td class="course-owner-cell"><span class="text-secondary">${escapeAdmin(c.owner_name)}</span></td>
          <td class="admin-nowrap">${pill(sentenceCase(c.publication_status), c.publication_status === 'published' ? 'success' : 'neutral')}</td>
          <td class="admin-nowrap">${pill(sentenceCase(c.visibility), 'neutral')}</td>
          <td class="text-right admin-nowrap"><span class="font-mono text-secondary">${escapeAdmin(c.latest_version ?? '—')}</span></td>
          <td class="admin-nowrap">${c.is_suspended ? pill('Suspended', 'danger') : pill('Available', 'success')}</td>
          <td class="text-right admin-nowrap">${c.open_reports > 0 ? `<a href="/admin/reports" class="status-badge warning" title="${c.open_reports} open reports">${c.open_reports}</a>` : `<span class="text-muted">0</span>`}</td>
        </tr>
      `
      );

      content = `
        <div class="admin-page-header">
          <h1 class="page-title">Courses</h1>
        </div>

        <form class="admin-filter-toolbar" action="/admin/courses" method="get">
          <div class="search-input-wrapper">
            <span class="search-input-icon" aria-hidden="true">${renderIcon('search', { size: 16 })}</span>
            <input class="form-input search-input" name="search" placeholder="Search by course title…" value="${escapeAdmin(searchVal)}" aria-label="Search courses">
          </div>
          <button type="submit" class="btn btn-secondary btn-compact">Search</button>
          ${searchVal ? `<a href="/admin/courses" class="btn btn-ghost btn-compact">Clear search</a>` : ''}
        </form>

        ${table(
          ['Course', 'Owner', 'Publication', 'Visibility', { label: 'Latest version', align: 'right' }, 'Availability', { label: 'Open reports', align: 'right' }],
          rows,
          'No matching courses.',
          searchVal ? '<a href="/admin/courses">Clear search</a> to list every course.' : 'Courses appear here once an author creates one.'
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
        .map((v: any) => `
          <li class="admin-version-row">
            <div class="admin-version-meta">
              <span class="admin-version-name">Version ${v.versionNumber}</span>
              <span class="text-secondary text-xs">Published ${formatDate(v.createdAt)}</span>
              ${idChip(v.id, 'Version ID')}
            </div>
            <a href="/admin/courses/${encodeURIComponent(data.id)}?versionId=${encodeURIComponent(v.id)}" class="btn btn-secondary btn-compact">Inspect exact snapshot</a>
          </li>
        `)
        .join('');

      content = `
        <p class="mb-4"><a href="/admin/courses" class="back-link">${renderIcon('arrow-left', { size: 14 })} Back to courses</a></p>
        ${detailHeader(escapeAdmin(data.title), data.isSuspended ? pill('Suspended', 'danger') : pill('Available', 'success'), idChip(data.id, 'Course ID'))}

        ${inspectionBanner}
        ${snapshotInspectionPanel}

        <div class="admin-detail-layout">
          <div class="admin-detail-main">
        <div class="admin-entity-card mb-5">
          <div class="admin-definition-grid">
            <div class="admin-def-item">
              <span class="admin-def-label">Owner</span>
              <span class="admin-def-value">${escapeAdmin(data.ownerName)}<br><span class="text-secondary text-xs">${escapeAdmin(data.ownerEmail)}</span></span>
            </div>
            <div class="admin-def-item">
              <span class="admin-def-label">Published release</span>
              <span class="admin-def-value">Version ${escapeAdmin(data.latestVersion || '—')}</span>
            </div>
            <div class="admin-def-item">
              <span class="admin-def-label">Active enrollments</span>
              <span class="admin-def-value font-mono">${data.activeEnrollments}</span>
            </div>
            <div class="admin-def-item">
              <span class="admin-def-label">Open reports</span>
              <span class="admin-def-value">${data.openReports > 0 ? `<a href="/admin/reports" class="status-badge warning">${data.openReports} open</a>` : `<span class="text-muted">0</span>`}</span>
            </div>
          </div>
        </div>

        <div class="admin-section-card mb-6">
          <h2 class="section-title">Published versions</h2>
          <ul class="admin-version-rows">${versionsList || '<li class="text-muted">No published releases yet.</li>'}</ul>
        </div>
          </div>
          <aside class="admin-detail-side admin-actions-card" aria-label="Course actions">
            <h2 class="admin-side-title">Course actions</h2>
            <div class="admin-actions-stack">
              <button type="button" class="btn btn-secondary" data-open-dialog="dialog-course-waiver">${renderIcon('alert-triangle', { size: 14 })} Waive broken step…</button>
              ${
                data.ownerDeletionPending && data.publicationStatus !== 'archived'
                  ? `<button type="button" class="btn btn-warning" data-open-dialog="dialog-course-archive">Archive to resolve ownership blocker…</button>`
                  : ''
              }
              ${data.isSuspended ? `<button type="button" class="btn btn-primary" data-open-dialog="dialog-course-availability">${renderIcon('play', { size: 14 })} Restore availability…</button>` : ''}
            </div>
            ${data.isSuspended ? '' : `<div class="admin-danger-zone"><h3>Danger zone</h3><button type="button" class="btn btn-danger" data-open-dialog="dialog-course-availability">${renderIcon('alert-triangle', { size: 14 })} Suspend course…</button></div>`}
          </aside>
        </div>

        <!-- Dialog: Course Availability -->
        ${renderActionDialog({
          id: 'dialog-course-availability',
          title: `${data.isSuspended ? 'Restore availability' : 'Suspend course'} · ${escapeAdmin(data.title)}`,
          target: `${escapeAdmin(data.title)} (${data.id})`,
          currentState: data.isSuspended ? 'Suspended' : 'Available',
          resultingState: data.isSuspended ? 'Available' : 'Suspended',
          effect: data.isSuspended
            ? 'Restores course visibility in catalog and unblocks learning sessions.'
            : 'Hides course from catalog and halts active learner workspace admissions.',
          actionUrl: `/api/admin/courses/${encodeURIComponent(data.id)}/suspension`,
          buttonLabel: data.isSuspended ? 'Restore availability' : 'Suspend course',
          buttonVariant: data.isSuspended ? 'primary' : 'danger',
          isDestructive: !data.isSuspended,
          extraContent: `<input type="hidden" name="suspended" value="${!data.isSuspended}">`
        })}

        <!-- Dialog: Step Waiver -->
        <dialog id="dialog-course-waiver" class="admin-modal-dialog" aria-labelledby="dialog-course-waiver-title">
          <div class="dialog-content">
            <div class="dialog-header">
              <h3 id="dialog-course-waiver-title" class="dialog-title">Waive broken step · ${escapeAdmin(data.title)}</h3>
              <button type="button" class="dialog-close-btn" data-close-dialog aria-label="Close dialog">${renderIcon('x', { size: 16 })}</button>
            </div>
            <div class="dialog-body">
              <div class="admin-action-effect-card warning mb-1">
                <span class="effect-label">Notice on progression waivers:</span>
                <p class="effect-description text-secondary text-xs mt-1 leading-relaxed">
                  Only active enrollments pinned to the selected immutable version can be affected. This satisfies progress without awarding a passing verdict. The affected scope is rechecked server-side before commit.
                </p>
              </div>

              <form class="admin-mutation-form" data-admin-mutation action="/api/admin/courses/${encodeURIComponent(data.id)}/waivers" method="post">
                <label class="form-group">
                  <span class="form-label">Version and required step</span>
                  <select class="form-input form-select" name="versionStep" data-waiver-step required>
                    <option value="">Select version and step…</option>
                    ${versionOptions}
                  </select>
                </label>
                <input type="hidden" name="reviewedAffectedCount" value="0">
                <p class="waiver-review-count text-secondary text-xs my-1 p-2 bg-canvas border border-subtle rounded" role="status">
                  Choose a step to review affected enrollments.
                </p>
                ${formField('reason', 'Reason')}
                ${formField('currentPassword', 'Confirm administrator password', 'password')}
                <div class="dialog-footer flex justify-end gap-2">
                  <button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button>
                  <button class="btn btn-primary" type="submit" disabled>Review and apply waiver</button>
                </div>
                <p class="form-error hidden" role="alert"></p>
              </form>
            </div>
          </div>
        </dialog>

        <!-- Dialog: Owner Deletion Archive -->
        ${
          data.ownerDeletionPending && data.publicationStatus !== 'archived'
            ? renderActionDialog({
                id: 'dialog-course-archive',
                title: `Archive course · ${escapeAdmin(data.title)}`,
                target: `${escapeAdmin(data.title)} (${data.id})`,
                currentState: data.publicationStatus,
                resultingState: 'Archived',
                effect: 'Archiving resolves the owner deletion request blocker after the retention period.',
                actionUrl: `/api/admin/courses/${encodeURIComponent(data.id)}/archive-for-deletion`,
                buttonLabel: 'Archive to resolve ownership blocker',
                buttonVariant: 'primary'
              })
            : ''
        }
      `;
    } else if (route === '/admin/categories') {
      const rows = (data.items || []).map(
        (c: any) => `
        <tr>
          <td class="category-name-cell"><strong>${escapeAdmin(c.name)}</strong></td>
          <td class="text-right admin-nowrap"><span class="font-mono text-secondary">${c.usageCount}</span></td>
          <td class="admin-actions-cell admin-nowrap">
            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-secondary btn-compact" data-edit-category-id="${escapeAdmin(c.id)}" data-edit-category-name="${escapeAdmin(c.name)}" data-edit-category-usage="${c.usageCount}">
                ${renderIcon('edit', { size: 14 })}
                <span>Edit</span>
              </button>
              <button type="button" class="btn btn-danger btn-compact" data-remove-category-id="${escapeAdmin(c.id)}" data-remove-category-name="${escapeAdmin(c.name)}" data-remove-category-usage="${c.usageCount}">
                ${renderIcon('trash', { size: 14 })}
                <span>Remove</span>
              </button>
            </div>
          </td>
        </tr>
      `
      );

      content = `
        <div class="admin-header-with-actions admin-page-header">
          <div>
            <h1 class="page-title">Categories</h1>
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
              <button type="button" class="dialog-close-btn" data-close-dialog aria-label="Close dialog">${renderIcon('x', { size: 16 })}</button>
            </div>
            <div class="dialog-body">
              <p class="text-sm text-secondary mb-3">Create a course category for public discovery. Requires administrator reauthentication.</p>
              ${adminForm('/api/admin/categories', '<label class="form-group"><span class="form-label">Category name</span><input class="form-input" name="name" required placeholder="e.g. Data Structures"></label>', 'Create category')}
            </div>
          </div>
        </dialog>

        <!-- Accessible Dialog: Edit Category -->
        <dialog id="edit-category-dialog" class="admin-modal-dialog" aria-labelledby="edit-category-title">
          <div class="dialog-content">
            <div class="dialog-header">
              <h3 id="edit-category-title" class="dialog-title">Edit category</h3>
              <button type="button" class="dialog-close-btn" data-close-dialog aria-label="Close dialog">${renderIcon('x', { size: 16 })}</button>
            </div>
            <div class="dialog-body">
              <form id="edit-category-form" class="admin-mutation-form" data-admin-mutation action="/api/admin/categories" method="put">
                <label class="form-group">
                  <span class="form-label">Category name</span>
                  <input id="edit-category-name" class="form-input" name="name" required>
                </label>
                ${formField('reason', 'Reason')}
                ${formField('currentPassword', 'Confirm administrator password', 'password')}
                <div class="dialog-footer flex justify-end gap-2">
                  <button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button>
                  <button class="btn btn-primary" type="submit">Save category</button>
                </div>
                <p class="form-error hidden" role="alert"></p>
              </form>
            </div>
          </div>
        </dialog>

        <!-- Accessible Dialog: Remove Category -->
        <dialog id="remove-category-dialog" class="admin-modal-dialog" aria-labelledby="remove-category-title" data-category-items="${escapeAdmin(JSON.stringify((data.items || []).map((c: any) => ({ id: c.id, name: c.name, usageCount: c.usageCount }))))}">
          <div class="dialog-content">
            <div class="dialog-header">
              <h3 id="remove-category-title" class="dialog-title">Remove category</h3>
              <button type="button" class="dialog-close-btn" data-close-dialog aria-label="Close dialog">${renderIcon('x', { size: 16 })}</button>
            </div>
            <div class="dialog-body">
              <div class="admin-mutation-summary admin-action-effect-card danger mb-3 p-3 bg-surface border border-subtle rounded text-xs space-y-1">
                <div class="flex justify-between"><span class="text-muted">Target category:</span> <span id="remove-category-target-name" class="font-mono text-primary font-medium">—</span></div>
                <div class="flex justify-between"><span class="text-muted">Course usage:</span> <span id="remove-category-target-usage" class="status-badge info">0</span></div>
                <div id="remove-category-consequence-warning" class="mt-2 pt-2 border-t border-subtle text-secondary leading-relaxed">Select an eligible replacement category before removal.</div>
              </div>

              <p id="edit-category-usage-warning" class="text-xs text-muted mb-2 hidden"></p>

              <form id="delete-category-form" class="admin-mutation-form" data-admin-mutation action="/api/admin/categories" method="delete">
                <div id="replacement-category-group" class="form-group hidden">
                  <label for="edit-category-replacement-select" class="form-label">Replacement category</label>
                  <select id="edit-category-replacement-select" class="form-select form-input" name="replacementId">
                    <option value="">Select a replacement category…</option>
                  </select>
                  <span class="form-help text-xs text-muted mt-1 block">Courses currently assigned to this category will be reassigned.</span>
                </div>
                ${formField('reason', 'Reason')}
                ${formField('currentPassword', 'Confirm administrator password', 'password')}
                <div class="dialog-footer flex justify-end gap-2">
                  <button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button>
                  <button class="btn btn-danger" type="submit">Remove category</button>
                </div>
                <p class="form-error hidden" role="alert"></p>
              </form>
            </div>
          </div>
        </dialog>
      `;
    } else if (route === '/admin/reports') {
      const searchParams = new URLSearchParams(path.split('?')[1] || '');
      const activeStatus = searchParams.get('status') || '';

      const rows = (data.items || []).map(
        (r: any) => `
        <tr class="report-row report-row-${escapeAdmin(r.status)}">
          <td><a href="/admin/reports/${encodeURIComponent(r.id)}" class="table-link font-medium">${escapeAdmin(humanizeEnum(r.type))}</a></td>
          <td><span class="text-secondary">${escapeAdmin(r.courseTitle)}</span></td>
          <td><span class="text-secondary">${escapeAdmin(r.reporterName)}</span></td>
          <td>${pill(sentenceCase(r.status), reportTone(r.status))}</td>
          <td><time datetime="${escapeAdmin(r.createdAt)}" title="${escapeAdmin(r.createdAt)}" class="text-secondary">${formatDate(r.createdAt)}</time></td>
        </tr>
      `
      );

      const emptyMessage = activeStatus === 'open'
        ? 'No open reports.'
        : activeStatus
        ? 'No reports match these filters.'
        : 'No reports submitted.';

      content = `
        <div class="admin-page-header">
          <h1 class="page-title">Reports</h1>
        </div>

        <div class="admin-toolbar-row mb-4">
          <nav class="segmented-control" aria-label="Filter reports by status">
            <a href="/admin/reports" class="segmented-control-btn ${!activeStatus ? 'active' : ''}" ${!activeStatus ? 'aria-current="page"' : ''}>All</a>
            <a href="/admin/reports?status=open" class="segmented-control-btn ${activeStatus === 'open' ? 'active' : ''}" ${activeStatus === 'open' ? 'aria-current="page"' : ''}>Open</a>
            <a href="/admin/reports?status=investigating" class="segmented-control-btn ${activeStatus === 'investigating' ? 'active' : ''}" ${activeStatus === 'investigating' ? 'aria-current="page"' : ''}>Investigating</a>
            <a href="/admin/reports?status=resolved" class="segmented-control-btn ${activeStatus === 'resolved' ? 'active' : ''}" ${activeStatus === 'resolved' ? 'aria-current="page"' : ''}>Resolved</a>
          </nav>
        </div>

        ${table(['Type', 'Course', 'Reporter', 'Status', 'Submitted'], rows, emptyMessage, activeStatus ? '<a href="/admin/reports">Show all reports</a>' : 'Learner reports appear here for triage.')}
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
        ${detailHeader(`${escapeAdmin(humanizeEnum(data.type))} · ${escapeAdmin(data.courseTitle)}`, pill(sentenceCase(data.status), reportTone(data.status)), idChip(data.id, 'Report ID'))}

        <div class="admin-detail-layout">
          <div class="admin-detail-main">
            <div class="admin-section-card mb-4">
              <h2 class="section-title">Report description</h2>
              <p class="text-sm leading-relaxed">${escapeAdmin(data.description)}</p>
            </div>

            <div class="report-context-panel mb-4">
              <h3 class="text-sm font-semibold mb-3">Reported learning context</h3>
              <dl class="admin-context-list">
                <div><dt>Course</dt><dd><a href="/admin/courses/${encodeURIComponent(data.courseId)}" class="underline font-medium">${escapeAdmin(data.courseTitle)}</a></dd></div>
                <div><dt>Immutable version</dt><dd>${versionLinkHtml}</dd></div>
                <div><dt>Step</dt><dd>${stepLinkHtml}</dd></div>
              </dl>
              ${data.versionDetails?.createdAt ? `<p class="text-xs text-muted mt-3 pt-2 border-t border-subtle">Pinned to immutable version published ${formatDate(data.versionDetails.createdAt)}.</p>` : ''}
            </div>

            ${data.submittedCode ? `<details class="disclosure-card mb-4"><summary class="cursor-pointer font-medium">Consented submitted code</summary><div class="disclosure-body"><pre class="code-pre">${escapeAdmin(data.submittedCode)}</pre></div></details>` : ''}
          </div>

          <aside class="admin-detail-side admin-triage-card" aria-labelledby="triage-title">
            <h2 id="triage-title" class="admin-side-title">Resolution and triage</h2>
            <form data-admin-mutation action="/api/admin/reports/${encodeURIComponent(data.id)}" method="patch" class="admin-mutation-form">
              <label class="form-group">
                <span class="form-label">Status</span>
                <select name="status" class="form-input form-select">
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
              <div class="flex justify-end gap-2 mt-4">
                <button class="btn btn-primary" type="submit">Update report</button>
              </div>
              <p class="form-error hidden" role="alert"></p>
            </form>
          </aside>
        </div>
      `;
    } else if (route === '/admin/media') {
      const mediaThumb = (mime: string) => {
        const kind = String(mime || '').split('/')[0];
        const ext = String(mime || '').split('/')[1]?.split('+')[0]?.toUpperCase() || 'FILE';
        const icon: IconName = kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'file-text';
        return `<span class="media-thumb media-thumb-${escapeAdmin(kind || 'file')}" aria-hidden="true">${renderIcon(icon, { size: 20 })}<span class="media-thumb-ext">${escapeAdmin(ext.slice(0, 5))}</span></span>`;
      };

      const rows = (data.items || []).map(
        (a: any) => `
        <tr>
          <td class="media-thumb-cell">${mediaThumb(a.mimeType)}</td>
          <td>
            <div class="media-cell-wrapper flex items-center gap-2">
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
              <button type="button" class="dialog-close-btn" data-close-dialog aria-label="Close dialog">${renderIcon('x', { size: 16 })}</button>
            </div>
            <div class="dialog-body">
              <p class="text-xs text-secondary mb-3">Asset ID: <code class="font-mono">${escapeAdmin(a.id)}</code> · Course: <strong>${escapeAdmin(a.courseTitle)}</strong> · Retained references: <strong>${a.referenceCount}</strong></p>

              ${
                a.processingStatus === 'ready'
                  ? `<div class="dialog-section mb-4 p-3 bg-canvas border border-subtle rounded">
                      <h4 class="text-sm font-semibold mb-1">Safe preview</h4>
                      <p class="text-xs text-muted mb-2">Inspect asset using an authorized preview token without rendering unvetted public thumbnails.</p>
                      <form data-admin-preview action="/api/admin/media/${encodeURIComponent(a.id)}/preview" method="post">
                        ${formField('reason', 'Preview review reason')}
                        ${formField('currentPassword', 'Confirm administrator password', 'password')}
                        <div class="flex justify-end gap-2 mt-3">
                          <button class="btn btn-secondary" type="submit">Safe preview</button>
                        </div>
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
                      <p class="text-xs text-muted mb-2">Permanently purge this quarantined asset. Allowed because retained references are 0.</p>
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
          <h1 class="page-title">Media</h1>
        </div>

        ${table(['Preview', 'Asset', 'Course', 'Type / size', 'Processing', { label: 'References', align: 'right' }, 'Review'], rows, 'No media assets.', 'Uploads from authors appear here for review.')}
        ${pageNav(data, path)}
        ${dialogs}
      `;
    } else if (route === '/admin/execution') {
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

      content = `
        <div class="admin-page-header">
          <h1 class="page-title">Execution</h1>
        </div>

        <div class="admin-overview-card execution-service-card mb-6">
          <div class="execution-service-header flex items-center justify-between flex-wrap gap-4">
            <div class="execution-service-status">
              <div class="flex items-center gap-2 mb-1">
                ${pill(isPaused ? 'Admission: Paused' : 'Admission: Accepting jobs', isPaused ? 'warning' : 'success')}
              </div>
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
            <span class="stat-hint text-xs text-muted" title="${escapeAdmin(data.overview.workers.health)}">${escapeAdmin(data.overview.workers.health || 'Heartbeat telemetry')}</span>
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

      const hasAnyFilter = Boolean(hasAdvancedActive || query.get('action') || query.get('reason'));

      const activeAdvancedCount = [
        query.get('actorId'),
        query.get('targetType'),
        query.get('targetId'),
        query.get('correlationId'),
        query.get('from'),
        query.get('to'),
      ].filter(Boolean).length;

      const dayKey = (iso: string) => {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? String(iso) : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      };
      const dayLabel = (iso: string) => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        const today = new Date();
        const yesterday = new Date(today.getTime() - 86400000);
        if (dayKey(iso) === dayKey(today.toISOString())) return 'Today';
        if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Yesterday';
        return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      };
      const clock = (iso: string) => {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      };

      let lastDay = '';
      const rows: string[] = [];
      for (const e of data.items || []) {
        const key = dayKey(e.createdAt);
        if (key !== lastDay) {
          lastDay = key;
          rows.push(`<tr class="audit-day-row"><th scope="colgroup" colspan="5">${escapeAdmin(dayLabel(e.createdAt))}</th></tr>`);
        }
        rows.push(`
        <tr>
          <td class="admin-nowrap"><time datetime="${escapeAdmin(e.createdAt)}" title="${escapeAdmin(e.createdAt)}" class="text-secondary">${escapeAdmin(clock(e.createdAt) || formatDate(e.createdAt))}</time></td>
          <td class="admin-nowrap"><span class="font-medium">${escapeAdmin(e.actorName)}</span></td>
          <td>
            <a href="/admin/audit/${encodeURIComponent(e.id)}" class="table-link font-medium" title="Action code: ${escapeAdmin(e.action)}" aria-label="${escapeAdmin(formatAuditAction(e.action))} (${escapeAdmin(e.action)})">
              ${escapeAdmin(formatAuditAction(e.action))}
            </a>
            <span class="audit-target-type text-secondary">${escapeAdmin(humanizeEnum(e.targetType))}</span>
          </td>
          <td class="audit-reason-cell"><span class="text-secondary">${escapeAdmin(e.reason || '—')}</span></td>
          <td class="audit-details-cell">
            <details class="audit-details">
              <summary>Details</summary>
              <dl>
                <div><dt>Action</dt><dd><code>${escapeAdmin(e.action)}</code></dd></div>
                <div><dt>Target</dt><dd><code>${escapeAdmin(e.targetType)} · ${escapeAdmin(e.targetId)}</code></dd></div>
                <div><dt>Correlation</dt><dd><code>${escapeAdmin(e.correlationId || '—')}</code></dd></div>
              </dl>
            </details>
          </td>
        </tr>`);
      }

      content = `
        <div class="admin-page-header">
          <h1 class="page-title">Audit</h1>
        </div>

        <form class="admin-audit-filter-form mb-4" action="/admin/audit" method="get">
          <div class="audit-primary-row flex items-center gap-2 flex-wrap">
            <div class="search-input-wrapper">
              <span class="search-input-icon" aria-hidden="true">${renderIcon('search', { size: 16 })}</span>
              <input class="form-input search-input" name="action" placeholder="Filter by action (e.g. course:publish)…" value="${escapeAdmin(query.get('action'))}" aria-label="Action filter">
            </div>
            <input class="form-input audit-reason-input" name="reason" placeholder="Reason contains…" value="${escapeAdmin(query.get('reason'))}" aria-label="Reason filter">
            <button type="submit" class="btn btn-secondary btn-compact">Search audit</button>
          </div>

          <details class="disclosure-card admin-advanced-filters mt-3" ${hasAdvancedActive ? 'open' : ''}>
            <summary class="cursor-pointer text-xs font-medium text-secondary py-1">${renderIcon('filter', { size: 14 })} Advanced filters ${activeAdvancedCount ? `(${activeAdvancedCount} active)` : ''}</summary>
            <div class="advanced-filters-grid mt-3 grid grid-cols-2 gap-3">
              ${filter('actorId', 'Actor ID')}
              ${filter('targetType', 'Target type')}
              ${filter('targetId', 'Target ID')}
              ${filter('correlationId', 'Correlation ID')}
              ${filter('from', 'From', 'date')}
              ${filter('to', 'To', 'date')}
            </div>
          </details>
        </form>

        ${table(['Time', 'Actor', 'Action', 'Reason', 'Details'], rows, 'No audit events match these filters.', hasAnyFilter ? '<a href="/admin/audit">Clear filters</a> to see recent activity.' : 'Administrative actions will be recorded here.')}
        ${pageNav(data, path)}
      `;
    } else if (route.startsWith('/admin/audit/')) {
      content = `
        <p class="mb-4"><a href="/admin/audit" class="back-link">${renderIcon('arrow-left', { size: 14 })} Back to audit</a></p>
        <div class="admin-page-header">
          <h1 class="page-title">${escapeAdmin(formatAuditAction(data.action))}</h1>
          <p class="admin-page-subtitle text-secondary">Raw action: <code class="font-mono text-xs">${escapeAdmin(data.action)}</code></p>
        </div>

        <div class="admin-entity-card mb-6">
          ${table(['Field', 'Value'], Object.entries(data).filter(([key]) => key !== 'metadata').map(([key, value]) => `<tr><th scope="row" class="w-1/3">${escapeAdmin(key)}</th><td>${escapeAdmin(value)}</td></tr>`), 'No event details.')}
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

  return {
    title,
    content: `<div class="admin-page-content">${err}${content}</div>`,
  };
}

export function renderAdminPage(
  path: string,
  data: any,
  error?: string,
  adminUser = { displayName: 'Administrator', email: '' }
): string {
  const { title, content } = renderAdminPageContent(path, data, error, adminUser);
  return renderAdminShell({
    activePath: path.split('?')[0],
    adminUser,
    headerTitle: title,
    content,
  });
}
