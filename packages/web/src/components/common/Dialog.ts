export interface DialogProps {
  id: string;
  title: string;
  bodyHtml: string;
  confirmLabel: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  variant?: 'confirm' | 'form' | 'conflict';
  hideCancel?: boolean;
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
          ${props.hideCancel ? '' : `<button type="button" class="btn btn-secondary" data-dialog-action="cancel">
            ${props.cancelLabel || 'Cancel'}
          </button>`}
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

export interface ActionConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  isDestructive?: boolean;
}

function escapeDialogText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openMessageDialog(opts: ActionConfirmOptions & { hideCancel?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderDialog({
      id: 'leave-confirm-dialog',
      title: escapeDialogText(opts.title),
      bodyHtml: `<p>${escapeDialogText(opts.message)}</p>`,
      confirmLabel: escapeDialogText(opts.confirmLabel),
      cancelLabel: escapeDialogText(opts.cancelLabel || 'Cancel'),
      isDestructive: opts.isDestructive,
      variant: 'confirm',
      hideCancel: opts.hideCancel,
    });
    const backdrop = wrapper.firstElementChild as HTMLElement;
    document.body.append(backdrop);
    const cancel = backdrop.querySelector<HTMLElement>('[data-dialog-action="cancel"]');
    const confirm = backdrop.querySelector<HTMLElement>('[data-dialog-action="confirm"]')!;

    const finish = (confirmed: boolean) => {
      document.removeEventListener('keydown', onKeydown, true);
      backdrop.remove();
      previouslyFocused?.focus?.();
      resolve(confirmed);
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      } else if (event.key === 'Tab') {
        const order = cancel ? [cancel, confirm] : [confirm];
        const index = order.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        order[(index + (event.shiftKey ? order.length - 1 : 1)) % order.length].focus();
      }
    };
    document.addEventListener('keydown', onKeydown, true);
    cancel?.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop) finish(false); });
    (cancel ?? confirm).focus();
  });
}

/**
 * Branded replacement for window.confirm in navigation guards.
 * Resolves true when the user chooses to leave, false when they stay.
 */
export function confirmLeaveDialog(opts: LeaveConfirmOptions): Promise<boolean> {
  return openMessageDialog({
    title: opts.title || 'Leave without saving?',
    message: opts.message,
    confirmLabel: opts.leaveLabel || 'Leave without saving',
    cancelLabel: opts.stayLabel || 'Stay',
    isDestructive: true,
  });
}

/** In-page replacement for window.confirm. Resolves true only on the explicit confirm action. */
export function confirmActionDialog(opts: ActionConfirmOptions): Promise<boolean> {
  return openMessageDialog(opts);
}

/** In-page replacement for window.alert. Resolves once the user dismisses it. */
export async function alertDialog(message: string, title = 'Something went wrong'): Promise<void> {
  await openMessageDialog({ title, message, confirmLabel: 'OK', hideCancel: true });
}
