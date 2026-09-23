export interface DialogProps {
  id: string;
  title: string;
  bodyHtml: string;
  confirmLabel: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  variant?: 'confirm' | 'form' | 'conflict';
}

export function renderDialog(props: DialogProps): string {
  const variantClass = props.variant ? `modal-dialog ${props.variant}` : 'modal-dialog';
  const confirmBtnClass = props.isDestructive ? 'btn-destructive' : 'btn-primary';

  return `
    <div id="${props.id}" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="${props.id}-title">
      <div class="${variantClass}" tabindex="-1">
        <header class="dialog-header">
          <h2 id="${props.id}-title" class="dialog-title">${props.title}</h2>
        </header>

        <div class="dialog-body">
          ${props.bodyHtml}
        </div>

        <footer class="dialog-footer flex justify-end gap-3">
          <button type="button" class="btn btn-secondary" data-dialog-action="cancel">
            ${props.cancelLabel || 'Cancel'}
          </button>
          <button type="button" class="btn ${confirmBtnClass}" data-dialog-action="confirm">
            ${props.confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  `;
}

export interface DrawerProps {
  id: string;
  title: string;
  bodyHtml: string;
  variant?: 'standard' | 'detail';
}

export function renderDrawer(props: DrawerProps): string {
  const variantClass = props.variant === 'detail' ? 'drawer detail' : 'drawer';

  return `
    <aside id="${props.id}" class="${variantClass}" role="complementary" aria-labelledby="${props.id}-title">
      <div class="drawer-header flex justify-between items-center">
        <h2 id="${props.id}-title" class="drawer-title">${props.title}</h2>
        <button type="button" class="btn-icon btn-compact" data-drawer-action="close" aria-label="Close drawer">✕</button>
      </div>

      <div class="drawer-body">
        ${props.bodyHtml}
      </div>
    </aside>
  `;
}
