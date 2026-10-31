const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export interface DialogFocusOptions {
  onEscape: () => void;
}

/** Keeps Tab inside `modal`, closes on Escape and returns focus to the opener on release. */
export function trapDialogFocus(modal: HTMLElement, options: DialogFocusOptions, doc: Document = document): () => void {
  const opener = doc.activeElement as HTMLElement | null;
  const onKeydown = (event: KeyboardEvent) => {
    if (!modal.isConnected) {
      doc.removeEventListener('keydown', onKeydown, true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      options.onEscape();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE));
    event.preventDefault();
    if (items.length === 0) return;
    const current = doc.activeElement as HTMLElement | null;
    const index = current && modal.contains(current) ? items.indexOf(current) : -1;
    const step = event.shiftKey ? -1 : 1;
    const next = index === -1 ? (event.shiftKey ? items.length - 1 : 0) : (index + step + items.length) % items.length;
    items[next].focus();
  };
  doc.addEventListener('keydown', onKeydown, true);
  return () => {
    doc.removeEventListener('keydown', onKeydown, true);
    opener?.focus?.();
  };
}
