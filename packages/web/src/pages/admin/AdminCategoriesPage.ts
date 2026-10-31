import { renderIcon } from '../../components/common/icons.ts';
import { formField, adminForm, table, escapeAdmin } from './admin-page-helpers.ts';

export function renderAdminCategoriesContent(data: any): string {
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

      return `
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
                <div class="flex justify-between"><span class="text-muted">Target category:</span> <span id="remove-category-target-name" class="font-mono text-primary font-medium">None selected</span></div>
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
}
