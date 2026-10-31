import { renderIcon, type IconName } from '../../components/common/icons.ts';
import { formatDate } from '../../utils/formatters.ts';
import { table, healthDot, escapeAdmin } from './admin-page-helpers.ts';

export function renderAdminOverviewContent(data: any): string {
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
          html: '<strong>Execution admission paused.</strong> New student code jobs are blocked.',
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
      const suspended = data.suspendedCourses;
      if (suspended && Number(suspended.count) > 0) {
        const items: any[] = Array.isArray(suspended.items) ? suspended.items : [];
        const n = Number(suspended.count);
        const list = items.length
          ? `<ul class="admin-attention-sublist">${items.map((c) => `<li><a href="/admin/courses/${encodeURIComponent(String(c.id))}">${escapeAdmin(c.title)}</a>${c.ownerName ? ` <span class="text-muted">by ${escapeAdmin(c.ownerName)}</span>` : ''}</li>`).join('')}</ul>`
          : '';
        attention.push({
          tone: 'warning',
          icon: 'alert-triangle',
          html: `<strong>${n} suspended course${n === 1 ? '' : 's'}</strong>${list}`,
          href: '/admin/courses',
          cta: 'Review courses',
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

      return `
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
}
