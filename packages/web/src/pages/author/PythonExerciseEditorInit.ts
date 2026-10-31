export function initPythonExerciseEditor(root: HTMLElement): void {
  const shell = root.querySelector<HTMLElement>('.shell-author');
  const markDirty = () => shell?.classList.add('is-dirty');
  const tabBtns = () => Array.from(root.querySelectorAll<HTMLElement>('.sub-tab-btn[data-tab]'));
  const dot = (tab: string) => root.querySelector<HTMLElement>(`.sub-tab-btn[data-tab="${tab}"] .step-dot`);
  const val = (id: string) => (root.querySelector<HTMLTextAreaElement | HTMLInputElement>(`#${id}`)?.value || '').trim();
  const sections = () => Array.from(root.querySelectorAll<HTMLElement>('#tab-tests .test-cases-section'));

  const cmEditors: Array<{ destroy: () => void }> = [];
  let cmMounted = false;
  const mountCodeEditors = () => {
    if (cmMounted) return;
    cmMounted = true;
    void import('../learning/codemirror-editor.ts').then(({ createCodeMirrorEditor }) => {
      for (const id of ['starter-code-input', 'ref-solution-input']) {
        const textarea = root.querySelector<HTMLTextAreaElement>(`#${id}`);
        if (!textarea || !textarea.isConnected) continue;
        cmEditors.push(createCodeMirrorEditor({
          textarea,
          indentationSpaces: 4,
          editorFontSize: 14,
          onModEnter: () => {},
          onEscape: () => {},
          onDocChange: () => { markDirty(); updateDots(); },
        }));
      }
    }).catch(() => {
      cmMounted = false;
    });
  };

  const setDot = (tab: string, state: string) => {
    const d = dot(tab);
    if (d) d.dataset.state = state;
  };
  const updateDots = () => {
    setDot('problem', val('problem-stmt-input') ? 'complete' : 'incomplete');
    setDot('code', val('starter-code-input') && val('ref-solution-input') ? 'complete' : 'incomplete');
    const [pub, hid] = sections().map((s) => s.querySelectorAll('.test-case-card').length);
    setDot('tests', pub > 0 && hid > 0 ? 'complete' : 'incomplete');
    const meta = root.querySelector('[data-test-count]');
    if (meta) meta.textContent = `(${pub ?? 0} public · ${hid ?? 0} hidden)`;
  };

  const renumber = () => {
    sections().forEach((section) => {
      const kind = section.dataset.kind === 'hidden' ? 'Hidden' : 'Public';
      const cards = section.querySelectorAll<HTMLElement>('.test-case-card');
      cards.forEach((card, i) => {
        card.dataset.visibility = kind.toLowerCase();
        const chip = card.querySelector<HTMLElement>('.visibility-chip');
        chip?.classList.toggle('vis-hidden', kind === 'Hidden');
        chip?.classList.toggle('vis-public', kind === 'Public');
        chip?.setAttribute('aria-pressed', String(kind === 'Hidden'));
        const title = card.querySelector('.test-title');
        if (title) title.textContent = `${kind} Test ${i + 1}`;
        card.querySelector('.remove-test')?.setAttribute('aria-label', `Remove ${kind.toLowerCase()} test ${i + 1}`);
      });
      const h = section.querySelector('.section-title');
      if (h) h.textContent = `${kind} test cases (${cards.length})`;
    });
    updateDots();
  };

  const showTab = (tab: string) => {
    root.querySelectorAll<HTMLElement>('.sub-tab-pane').forEach((pane) => { pane.style.display = pane.id === `tab-${tab}` ? '' : 'none'; });
    tabBtns().forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    if (tab === 'code') mountCodeEditors();
    if (tab === 'validation') root.querySelector<HTMLElement>('#tab-validation')?.scrollIntoView?.({ block: 'nearest' });
  };
  tabBtns().forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab || 'problem')));
  if (root.querySelector('#tab-code.active')) mountCodeEditors();

  const newRow = (kind: 'public' | 'hidden') => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="test-case-card" data-visibility="${kind}"><div class="test-header"><strong class="test-title"></strong><button type="button" class="visibility-chip vis-${kind}" data-action="toggle-test-visibility" aria-pressed="${kind === 'hidden'}" title="Switch between public (shown to students) and hidden (grading only)"><span class="chip-public">Public</span><span class="chip-hidden">Hidden</span></button><button type="button" class="btn btn-ghost btn-compact text-danger remove-test">Remove</button></div><div class="test-io"><div><label class="field-label text-xs">Standard Input (stdin)</label><textarea class="textarea-input code-editor font-mono test-stdin" rows="3" spellcheck="false"></textarea></div><div><label class="field-label text-xs">Expected Output (stdout)</label><textarea class="textarea-input code-editor font-mono test-stdout" rows="3" spellcheck="false"></textarea></div></div></div>`;
    return wrap.firstElementChild as HTMLElement;
  };
  for (const kind of ['public', 'hidden'] as const) {
    root.querySelector(`[data-action="add-${kind}-test"]`)?.addEventListener('click', (event) => {
      const button = event.currentTarget as HTMLElement;
      const row = newRow(kind);
      button.parentElement?.insertBefore(row, button);
      renumber();
      markDirty();
      row.querySelector<HTMLTextAreaElement>('.test-stdin')?.focus();
    });
  }
  root.querySelector('#tab-tests')?.addEventListener('click', (event) => {
    const target = event.target as Element;
    const remove = target.closest('.remove-test');
    if (remove) { remove.closest('.test-case-card')?.remove(); renumber(); markDirty(); return; }
    const chip = target.closest('[data-action="toggle-test-visibility"]');
    if (chip) {
      const card = chip.closest<HTMLElement>('.test-case-card');
      const [pub, hid] = sections();
      if (!card || !pub || !hid) return;
      const to = card.dataset.visibility === 'hidden' ? pub : hid;
      to.insertBefore(card, to.querySelector('[data-action^="add-"]'));
      renumber();
      markDirty();
    }
  });
  root.addEventListener('input', (event) => {
    if ((event.target as Element).closest('.sub-tab-pane')) updateDots();
  });
}
