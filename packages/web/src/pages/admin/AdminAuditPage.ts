import { renderIcon } from '../../components/common/icons.ts';
import { formatDate, humanizeEnum } from '../../utils/formatters.ts';
import { table, pageNav, escapeAdmin } from './admin-page-helpers.ts';
import { actionLabel } from './admin-labels.ts';

export function renderAdminAuditContent(path: string, data: any): string {
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
            <a href="/admin/audit/${encodeURIComponent(e.id)}" class="table-link font-medium" title="Action code: ${escapeAdmin(e.action)}" aria-label="${escapeAdmin(actionLabel(e.action))} (${escapeAdmin(e.action)})">
              ${escapeAdmin(actionLabel(e.action))}
            </a>
            <span class="audit-target-type text-secondary">${escapeAdmin(humanizeEnum(e.targetType))}</span>
          </td>
          <td class="audit-reason-cell"><span class="text-secondary">${escapeAdmin(e.reason || 'None given')}</span></td>
          <td class="audit-details-cell">
            <details class="audit-details">
              <summary>Details</summary>
              <dl>
                <div><dt>Action</dt><dd><code>${escapeAdmin(e.action)}</code></dd></div>
                <div><dt>Target</dt><dd><code>${escapeAdmin(e.targetType)} · ${escapeAdmin(e.targetId)}</code></dd></div>
                <div><dt>Correlation</dt><dd><code>${escapeAdmin(e.correlationId || 'None')}</code></dd></div>
              </dl>
            </details>
          </td>
        </tr>`);
      }

      return `
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
}

export function renderAdminAuditDetailContent(data: any): string {
      return `
        <p class="mb-4"><a href="/admin/audit" class="back-link">${renderIcon('arrow-left', { size: 14 })} Back to audit</a></p>
        <div class="admin-page-header">
          <h1 class="page-title">${escapeAdmin(actionLabel(data.action))}</h1>
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
