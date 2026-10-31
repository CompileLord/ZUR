import { renderIcon, type IconName } from '../../components/common/icons.ts';
import { stateLabel } from './admin-labels.ts';
import { formField, adminForm, table, pill, pageNav, escapeAdmin } from './admin-page-helpers.ts';

export function renderAdminMediaContent(path: string, data: any): string {
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
          <td>${pill(stateLabel(a.processingStatus), a.processingStatus === 'ready' ? 'success' : a.processingStatus === 'quarantined' ? 'warning' : 'neutral')}</td>
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

      return `
        <div class="admin-page-header">
          <h1 class="page-title">Media</h1>
        </div>

        ${table(['Preview', 'Asset', 'Course', 'Type / size', 'Processing', { label: 'References', align: 'right' }, 'Review'], rows, 'No media assets.', 'Uploads from authors appear here for review.')}
        ${pageNav(data, path)}
        ${dialogs}
      `;
}
