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

export interface LeaveConfirmOptions {
  title?: string;
  message: string;
  stayLabel?: string;
  leaveLabel?: string;
}

function escapeDialogText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Branded replacement for window.confirm in navigation guards.
 * Resolves true when the user chooses to leave, false when they stay.
 */
export function confirmLeaveDialog(opts: LeaveConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderDialog({
      id: 'leave-confirm-dialog',
      title: escapeDialogText(opts.title || 'Leave without saving?'),
      bodyHtml: `<p>${escapeDialogText(opts.message)}</p>`,
      confirmLabel: escapeDialogText(opts.leaveLabel || 'Leave without saving'),
      cancelLabel: escapeDialogText(opts.stayLabel || 'Stay'),
      isDestructive: true,
      variant: 'confirm',
    });
    const backdrop = wrapper.firstElementChild as HTMLElement;
    document.body.append(backdrop);
    const stay = backdrop.querySelector<HTMLElement>('[data-dialog-action="cancel"]')!;
    const leave = backdrop.querySelector<HTMLElement>('[data-dialog-action="confirm"]')!;

    const finish = (leaving: boolean) => {
      document.removeEventListener('keydown', onKeydown, true);
      backdrop.remove();
      previouslyFocused?.focus?.();
      resolve(leaving);
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      } else if (event.key === 'Tab') {
        const order = [stay, leave];
        const index = order.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        order[(index + (event.shiftKey ? order.length - 1 : 1)) % order.length].focus();
      }
    };
    document.addEventListener('keydown', onKeydown, true);
    stay.addEventListener('click', () => finish(false));
    leave.addEventListener('click', () => finish(true));
    backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop) finish(false); });
    stay.focus();
  });
}
