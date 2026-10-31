import { renderIcon } from '../../components/common/icons.ts';
import { humanizeEnum } from '../../utils/formatters.ts';

export function escapeAdmin(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}

export const formField = (name: string, label: string, type = 'text', required = true, value = '') =>
  `<label class="form-group"><span class="form-label">${escapeAdmin(label)}</span><input class="form-input" name="${escapeAdmin(name)}" type="${type}"${value ? ` value="${escapeAdmin(value)}"` : ''} ${required ? 'required' : ''}></label>`;

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
                ? `<div class="flex justify-between"><span class="text-muted">Current state:</span> <span class="status-badge info">${escapeAdmin(opts.currentState || 'Unknown')}</span></div>
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

export const adminForm = (
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

export const table = (headers: (string | TableCol)[], rows: string[], empty: string, nextStep = '') => {
  const headerCells = headers.map((h) => {
    const label = typeof h === 'string' ? h : h.label;
    const alignClass = typeof h === 'object' && h.align === 'right' ? ' class="text-right"' : '';
    return `<th scope="col"${alignClass}>${escapeAdmin(label)}</th>`;
  }).join('');
  const regionLabel = `Table with columns ${headers.slice(0, 3).map((h) => (typeof h === 'string' ? h : h.label)).join(', ')}`;
  return `<div class="data-table-wrapper" role="region" tabindex="0" aria-label="${escapeAdmin(regionLabel)}"><table class="data-table admin-table"><thead><tr>${headerCells}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="empty-state"><span class="admin-empty"><span class="admin-empty-icon" aria-hidden="true">${renderIcon('list', { size: 20 })}</span><span class="admin-empty-title">${escapeAdmin(empty)}</span>${nextStep ? `<span class="admin-empty-next">${nextStep}</span>` : ''}</span></td></tr>`}</tbody></table></div>`;
};

export const pill = (text: string, kind = 'info') =>
  `<span class="status-badge ${kind}">${escapeAdmin(text)}</span>`;

export const idChip = (id: string, label: string) =>
  `<button type="button" class="admin-id-chip" data-copy-text="${escapeAdmin(id)}" title="Copy ${escapeAdmin(label)}" aria-label="Copy ${escapeAdmin(label)}"><span class="admin-id-chip-label">${escapeAdmin(label)}</span><code>${escapeAdmin(id)}</code>${renderIcon('copy', { size: 13 })}</button>`;

export const healthDot = (kind: 'ok' | 'warn' | 'bad' | 'idle') => `<span class="health-dot health-dot-${kind}" aria-hidden="true"></span>`;

export const reportTone = (status: string) => (status === 'open' ? 'warning' : status === 'investigating' ? 'info' : 'success');

export const detailHeader = (title: string, badge: string, chip: string) =>
  `<div class="admin-page-header admin-detail-header"><div class="admin-detail-title-row"><h1 class="page-title">${title}</h1>${badge}</div>${chip}</div>`;

export const pageNav = (data: any, path: string) => {
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

export function formatAuditAction(action: string): string {
  if (!action) return '';
  const parts = action.split(':');
  if (parts.length === 2) {
    const scope = humanizeEnum(parts[0]);
    const act = humanizeEnum(parts[1]);
    return `${act} ${scope.toLowerCase()}`;
  }
  return humanizeEnum(action);
}
