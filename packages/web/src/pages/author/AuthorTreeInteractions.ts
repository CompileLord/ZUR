import { stepEditHref } from './AuthorTreeModel.ts';

export interface AuthorTreeInitOptions {
  courseId: string;
  request: (path: string, method: string, body?: unknown) => Promise<any>;
  refresh: () => void;
  navigate?: (url: string) => void;
}

const WIDTH_KEY = 'zur_author_tree_width';
const MIN_W = 220;
const MAX_W = 560;
let pendingFocus: { kind: string; id: string } | null = null;

function readWidth(): number | null {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    return n >= MIN_W && n <= MAX_W ? n : null;
  } catch { return null; }
}

function reorderPath(courseId: string, kind: string, parent: string): { path: string; key: string } {
  const c = encodeURIComponent(courseId);
  if (kind === 'module') return { path: `/api/author/courses/${c}/modules/reorder`, key: 'moduleIds' };
  if (kind === 'lesson') return { path: `/api/author/courses/${c}/modules/${encodeURIComponent(parent)}/lessons/reorder`, key: 'lessonIds' };
  return { path: `/api/author/courses/${c}/lessons/${encodeURIComponent(parent)}/steps/reorder`, key: 'stepIds' };
}

/** Wires resize, drag-and-drop, keyboard/menu reordering and inline add-step. Safe to call after every render. */
export function initAuthorTree(root: ParentNode, opts: AuthorTreeInitOptions): void {
  const shell = root.querySelector<HTMLElement>('.shell-author');
  if (!shell) return;

  const pane = shell.querySelector<HTMLElement>('.author-tree-pane');
  const resizer = shell.querySelector<HTMLElement>('.tree-resizer');

  const setWidth = (w: number, persist: boolean) => {
    const v = Math.max(MIN_W, Math.min(MAX_W, Math.round(w)));
    shell.style.setProperty('--author-tree-w', `${v}px`);
    resizer?.setAttribute('aria-valuenow', String(v));
    if (persist) { try { localStorage.setItem(WIDTH_KEY, String(v)); } catch { /* storage unavailable */ } }
  };
  const stored = readWidth();
  if (stored) shell.style.setProperty('--author-tree-w', `${stored}px`);
  if (pane && resizer) {
    resizer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      resizer.setPointerCapture(e.pointerId);
      shell.classList.add('is-resizing');
      const left = pane.getBoundingClientRect().left;
      const onMove = (ev: PointerEvent) => setWidth(ev.clientX - left, false);
      const onUp = (ev: PointerEvent) => {
        resizer.removeEventListener('pointermove', onMove);
        resizer.removeEventListener('pointerup', onUp);
        shell.classList.remove('is-resizing');
        setWidth(ev.clientX - left, true);
      };
      resizer.addEventListener('pointermove', onMove);
      resizer.addEventListener('pointerup', onUp);
    });
    resizer.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      setWidth(pane.getBoundingClientRect().width + (e.key === 'ArrowRight' ? 16 : -16), true);
    });
    resizer.setAttribute('aria-valuenow', String(Math.round(pane.getBoundingClientRect().width)));
  }

  const siblingsOf = (el: HTMLElement): HTMLElement[] => {
    const scope = el.closest<HTMLElement>('[data-reorder-scope]') || shell;
    return Array.from(scope.querySelectorAll<HTMLElement>('[data-reorder]')).filter(
      (n) => n.dataset.reorder === el.dataset.reorder && n.dataset.parent === el.dataset.parent
    );
  };

  const commit = async (el: HTMLElement, ids: string[]) => {
    const kind = el.dataset.reorder!;
    const { path, key } = reorderPath(opts.courseId, kind, el.dataset.parent!);
    pendingFocus = { kind, id: el.dataset.id! };
    try {
      await opts.request(path, 'POST', { [key]: ids });
    } catch { /* refresh restores the server order */ }
    opts.refresh();
  };

  const move = (el: HTMLElement, dir: -1 | 1) => {
    const sibs = siblingsOf(el);
    const idx = sibs.indexOf(el);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= sibs.length) return;
    const ids = sibs.map((n) => n.dataset.id!);
    ids.splice(target, 0, ids.splice(idx, 1)[0]);
    void commit(el, ids);
  };

  if (pendingFocus) {
    const f = pendingFocus;
    pendingFocus = null;
    const el = Array.from(shell.querySelectorAll<HTMLElement>('[data-reorder]')).find((n) => n.dataset.reorder === f.kind && n.dataset.id === f.id);
    el?.querySelector<HTMLElement>('a, [data-reorder-menu]')?.focus();
  }

  let dragged: HTMLElement | null = null;
  const clearMarks = () => shell.querySelectorAll('.drop-before, .drop-after, .is-dragging').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'is-dragging'));
  const hostOf = (n: EventTarget | null): HTMLElement | null => (n as HTMLElement | null)?.closest?.('[data-reorder]') as HTMLElement | null;
  const sameGroup = (a: HTMLElement, b: HTMLElement) => a !== b && a.dataset.reorder === b.dataset.reorder && a.dataset.parent === b.dataset.parent && siblingsOf(a).includes(b);

  shell.addEventListener('dragstart', (e) => {
    const handle = (e.target as HTMLElement).closest?.('[draggable="true"]');
    const host = hostOf(handle);
    if (!host) return;
    dragged = host;
    e.stopPropagation();
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', host.dataset.id || ''); }
    host.classList.add('is-dragging');
  });
  shell.addEventListener('dragover', (e) => {
    const host = hostOf(e.target);
    if (!dragged || !host || !sameGroup(dragged, host)) return;
    e.preventDefault();
    const rect = (host.querySelector<HTMLElement>('[draggable="true"]') || host).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    shell.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    host.classList.add(after ? 'drop-after' : 'drop-before');
  });
  shell.addEventListener('drop', (e) => {
    const host = hostOf(e.target);
    const src = dragged;
    if (!src || !host || !sameGroup(src, host)) { clearMarks(); dragged = null; return; }
    e.preventDefault();
    const after = host.classList.contains('drop-after');
    const ids = siblingsOf(src).map((n) => n.dataset.id!).filter((id) => id !== src.dataset.id);
    ids.splice(ids.indexOf(host.dataset.id!) + (after ? 1 : 0), 0, src.dataset.id!);
    clearMarks();
    dragged = null;
    void commit(src, ids);
  });
  shell.addEventListener('dragend', () => { clearMarks(); dragged = null; });

  shell.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const host = hostOf(e.target);
      if (!host) return;
      e.preventDefault();
      move(host, e.key === 'ArrowUp' ? -1 : 1);
    }
  });

  let menu: (HTMLElement & { _trigger?: HTMLElement }) | null = null;
  const closeMenu = (restore = false) => {
    if (!menu) return;
    const trigger = menu._trigger;
    menu.remove();
    menu = null;
    trigger?.setAttribute('aria-expanded', 'false');
    if (restore) trigger?.focus();
  };
  shell.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest<HTMLElement>('.tree-row-menu-btn, [data-reorder-menu]');
    if (!btn) {
      if (!t.closest('.tree-row-menu')) closeMenu();
    } else {
      const wasOpen = menu && menu._trigger === btn;
      closeMenu();
      const host = hostOf(btn);
      if (!wasOpen && host) {
        const sibs = siblingsOf(host);
        const idx = sibs.indexOf(host);
        const m = document.createElement('div') as HTMLElement & { _trigger?: HTMLElement };
        menu = m;
        m.className = 'tree-row-menu';
        m.setAttribute('role', 'menu');
        m._trigger = btn;
        m.innerHTML = `
          <button type="button" role="menuitem" data-move="-1" ${idx <= 0 ? 'disabled' : ''}>Move up <kbd>Alt+&uarr;</kbd></button>
          <button type="button" role="menuitem" data-move="1" ${idx >= sibs.length - 1 ? 'disabled' : ''}>Move down <kbd>Alt+&darr;</kbd></button>`;
        const r = btn.getBoundingClientRect();
        m.style.top = `${r.bottom + 4}px`;
        m.style.left = `${Math.max(8, r.right - 190)}px`;
        shell.appendChild(m);
        btn.setAttribute('aria-expanded', 'true');
        m.addEventListener('click', (ev) => {
          const item = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-move]');
          if (!item || item.disabled) return;
          closeMenu();
          move(host, Number(item.dataset.move) as -1 | 1);
        });
        m.addEventListener('keydown', (ev) => {
          const items = Array.from(m.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
          const i = items.indexOf(document.activeElement as HTMLButtonElement);
          if (ev.key === 'Escape') { ev.preventDefault(); closeMenu(true); }
          else if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length]?.focus(); }
          else if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
        });
        m.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
      }
    }

    const addBtn = t.closest<HTMLElement>('.tree-add-step-btn');
    if (addBtn) {
      const form = addBtn.parentElement!.querySelector<HTMLFormElement>('.tree-add-step-form')!;
      form.hidden = false;
      addBtn.hidden = true;
      addBtn.setAttribute('aria-expanded', 'true');
      form.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    }
    if (t.closest('[data-add-step-cancel]')) {
      const form = t.closest<HTMLFormElement>('.tree-add-step-form')!;
      form.hidden = true;
      form.reset();
      const b = form.parentElement!.querySelector<HTMLButtonElement>('.tree-add-step-btn')!;
      b.hidden = false;
      b.setAttribute('aria-expanded', 'false');
      b.focus();
    }
  });

  shell.querySelectorAll<HTMLFormElement>('.tree-add-step-form').forEach((form) => {
    form.addEventListener('input', (e) => e.stopPropagation());
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape') form.querySelector<HTMLElement>('[data-add-step-cancel]')?.click(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        const step = await opts.request(
          `/api/author/courses/${encodeURIComponent(opts.courseId)}/lessons/${encodeURIComponent(form.dataset.addStepLesson!)}/steps`,
          'POST',
          { title: String(fd.get('title') || '').trim(), type: String(fd.get('type') || 'theory') }
        );
        if (step?.id && step?.type && opts.navigate) opts.navigate(stepEditHref(opts.courseId, step.type, step.id));
        else opts.refresh();
      } catch (err: any) {
        if (submit) submit.disabled = false;
        window.alert(err?.message || 'Could not add step');
      }
    });
  });
}

/** Adds the "needs fixes" dot to tree step rows after an asynchronous validation call. Idempotent. */
export function applyInvalidStepDots(root: ParentNode, invalidStepIds: string[]): void {
  const ids = new Set(invalidStepIds);
  root.querySelectorAll<HTMLElement>('.steps-table tr[data-id]').forEach((row) => {
    const has = row.querySelector('.tree-invalid-dot');
    const cell = row.querySelector('.col-title');
    if (ids.has(row.dataset.id!) && !has) cell?.insertAdjacentHTML('beforeend', '<span class="tree-invalid-dot" role="img" aria-label="Needs fixes before publishing" title="Needs fixes before publishing"></span>');
    else if (!ids.has(row.dataset.id!) && has) has.remove();
  });
  root.querySelectorAll<HTMLElement>('.tree-step[data-id]').forEach((row) => {
    const has = row.querySelector('.tree-invalid-dot');
    if (ids.has(row.dataset.id!) && !has) {
      const label = row.querySelector('.tree-label');
      label?.insertAdjacentHTML('afterend', '<span class="tree-invalid-dot" role="img" aria-label="Needs fixes before publishing" title="Needs fixes before publishing"></span>');
    } else if (!ids.has(row.dataset.id!) && has) {
      has.remove();
    }
  });
}

/** Non-blocking: resolves to step ids with blocking validation errors, or [] on any failure. */
export async function fetchInvalidStepIds(request: (route: string, method?: string, body?: unknown) => Promise<any>, courseId: string): Promise<string[]> {
  try {
    const r = await request(`/api/author/courses/${encodeURIComponent(courseId)}/validate`, 'POST', {});
    const errs: Array<{ stepId?: string; blocking?: boolean }> = Array.isArray(r?.errors) ? r.errors : [];
    return Array.from(new Set(errs.filter((e) => e.blocking !== false && e.stepId).map((e) => e.stepId as string)));
  } catch {
    return [];
  }
}
