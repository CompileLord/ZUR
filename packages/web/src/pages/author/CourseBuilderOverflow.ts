import { renderIcon } from '../../components/common/icons.ts';

/** Overflow (three-dot) menu holding destructive row actions. Uses the existing data-confirm-delete submit flow. */
export function overflowDelete(label: string, action: string, confirmText: string, itemLabel: string): string {
  return `
    <details class="row-overflow">
      <summary class="row-overflow-btn" aria-label="More actions for ${label}" title="More actions">${renderIcon('more-vertical', { size: 16 })}</summary>
      <div class="row-overflow-menu" role="group" aria-label="More actions for ${label}">
        <form method="POST" action="${action}" data-confirm-delete="${confirmText}">
          <button type="submit" class="row-overflow-item is-danger">${renderIcon('trash', { size: 14 })}${itemLabel}</button>
        </form>
      </div>
    </details>`;
}

/** Closes open row overflow menus on outside click or Escape. Safe to call after every render. */
export function initRowOverflowMenus(root: ParentNode): void {
  const open = () => Array.from(root.querySelectorAll<HTMLDetailsElement>('details.row-overflow[open]'));
  const onClick = (e: Event) => {
    if (!root.querySelector('details.row-overflow')) { document.removeEventListener('click', onClick, true); return; }
    open().forEach((d) => { if (!d.contains(e.target as Node)) d.open = false; });
  };
  document.addEventListener('click', onClick, true);
  root.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Escape') return;
    const d = open()[0];
    if (!d) return;
    d.open = false;
    d.querySelector<HTMLElement>('summary')?.focus();
  });
  root.querySelectorAll<HTMLDetailsElement>('details.row-overflow').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) open().forEach((o) => { if (o !== d) o.open = false; });
  }));
}
