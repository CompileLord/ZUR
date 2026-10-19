/**
 * Delegated click handlers that replace inline `onclick=` attributes so the
 * app can run under a CSP without 'unsafe-inline' script attributes.
 *
 *   data-action="go-back"            history.back() or fall back to /courses
 *   data-action-fn="name"            calls window[name]() (identifier only)
 *   data-quiz-type="single_choice"   quiz editor segmented control
 */
export function toActionFnName(expression: string): string {
  const name = String(expression || '').trim().replace(/\(\s*\)\s*;?$/, '');
  return /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(name) ? name : '';
}

export function handleDelegatedClick(event: Event, win: any = globalThis, doc?: Document): boolean {
  const target = event.target as Element | null;
  const el = target?.closest?.('[data-action], [data-action-fn], [data-quiz-type]') as HTMLElement | null;
  if (!el) return false;
  if (el.dataset.action === 'go-back') {
    if (win.history.length > 1) win.history.back();
    else win.location.href = '/courses';
    return true;
  }
  const fnName = el.dataset.actionFn;
  if (fnName) {
    const fn = fnName.split('.').reduce((obj: any, key) => (obj ? obj[key] : undefined), win);
    if (typeof fn === 'function') fn();
    return true;
  }
  const quizType = el.dataset.quizType;
  if (quizType) {
    const sel = (doc ?? document).getElementById('quiz-type-select') as HTMLSelectElement | null;
    if (sel) {
      sel.value = quizType;
      sel.dispatchEvent(new Event('change'));
      el.parentElement?.querySelectorAll('.segmented-control-btn').forEach((b) => b.classList.remove('active'));
      el.classList.add('active');
    }
    return true;
  }
  return false;
}

let installed = false;
export function installDelegatedActions(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('click', (event) => {
    handleDelegatedClick(event);
  });
}
