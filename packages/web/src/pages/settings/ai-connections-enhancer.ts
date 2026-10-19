/**
 * Progressive behaviour for the AI connections dialogs (create / replace / revoke / reveal).
 *
 * The page markup is re-rendered wholesale by the route controller, so this module attaches
 * document-level listeners once and reacts to dialogs as they appear. It provides:
 *   - focus placement, Tab trapping, Escape-to-cancel and focus return
 *   - inline client-side validation that mirrors the server rules
 *   - preservation of non-secret form values after a server error
 *   - permission preset <-> scope checkbox synchronisation
 *   - a reliable, visibly confirmed "Copy token" action
 * The pure helpers are exported for unit tests; DOM wiring only runs in a browser.
 */

export const PRESET_SCOPES: Record<string, string[]> = {
  draft_authoring: ['courses:read', 'courses:create', 'content:write', 'media:write', 'exercises:validate'],
  read_only: ['courses:read'],
  full_course_control: [
    'courses:read',
    'courses:create',
    'content:write',
    'media:write',
    'exercises:validate',
    'content:delete',
    'courses:publish',
    'courses:manage',
  ],
};

export const PRESET_HINTS: Record<string, string> = {
  draft_authoring: 'Draft edits, media uploads, and exercise validation. Publishing & deletion off by default.',
  read_only: 'Can read your courses and drafts. Cannot change anything.',
  full_course_control: 'Everything, including deleting content, publishing and changing course access. Use with care.',
  custom: 'Choose exactly which permissions this connection gets under Detailed scope permissions.',
};

export interface TokenFormValues {
  label: string;
  password: string;
  scopes: string[];
  courseScopeType: 'all' | 'selected';
  selectedCourses: string[];
  /** Number of courses the author could pick from (0 when unknown). */
  availableCourses?: number;
}

export interface TokenFormErrors {
  label?: string;
  password?: string;
  scopes?: string;
  courses?: string;
}

export const MAX_LABEL_LENGTH = 80;

export function validateTokenForm(values: TokenFormValues): TokenFormErrors {
  const errors: TokenFormErrors = {};
  const label = values.label.trim();
  if (!label) errors.label = 'Enter a name for this connection.';
  else if (label.length > MAX_LABEL_LENGTH) errors.label = `Use ${MAX_LABEL_LENGTH} characters or fewer.`;
  if (!values.password) errors.password = 'Enter your current password to authorize this change.';
  if (values.scopes.length === 0) errors.scopes = 'Select at least one permission.';
  if (
    values.courseScopeType === 'selected' &&
    values.selectedCourses.length === 0 &&
    !values.scopes.includes('courses:create')
  ) {
    errors.courses =
      values.availableCourses === 0
        ? 'You have no courses to select. Allow all owned courses or enable courses:create.'
        : 'Select at least one course, enable courses:create, or allow all owned courses.';
  }
  return errors;
}

/** Preset name that exactly matches the scope list, otherwise "custom". */
export function presetForScopes(scopes: string[]): string {
  const set = new Set(scopes);
  for (const [name, list] of Object.entries(PRESET_SCOPES)) {
    if (list.length === set.size && list.every((scope) => set.has(scope))) return name;
  }
  return 'custom';
}

// ---------------------------------------------------------------------------------------------
// DOM wiring
// ---------------------------------------------------------------------------------------------

interface Draft {
  formId: string;
  label: string;
  preset: string;
  scopes: string[];
  courseScopeType: string;
  selectedCourses: string[];
  expiryDays: string;
}

const FORM_IDS = ['create-token-form', 'replace-token-form'];
const MODAL_IDS = ['create-token-modal', 'replace-token-modal', 'revoke-token-modal', 'token-reveal-modal'];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function visible(el: HTMLElement): boolean {
  return !el.closest('[hidden], .hidden') && el.getClientRects().length > 0;
}

function collect(form: HTMLFormElement): TokenFormValues {
  const get = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | RadioNodeList | null);
  const text = (name: string) => String((get(name) as HTMLInputElement | null)?.value ?? '');
  const preset = form.querySelector<HTMLSelectElement>('[name="preset"]')?.value;
  const checked = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="scopes"]:checked')).map((i) => i.value);
  const scopes = preset && preset !== 'custom' && PRESET_SCOPES[preset] ? PRESET_SCOPES[preset] : checked;
  const typeEl =
    form.querySelector<HTMLInputElement>('input[name="courseScopeType"]:checked') ||
    form.querySelector<HTMLInputElement>('input[name="courseScopeType"]');
  return {
    label: text('label'),
    password: text('password'),
    scopes,
    courseScopeType: typeEl?.value === 'selected' ? 'selected' : 'all',
    selectedCourses: Array.from(form.querySelectorAll<HTMLInputElement>('input[name="selectedCourses"]:checked')).map((i) => i.value),
    availableCourses: form.querySelectorAll('input[name="selectedCourses"]').length,
  };
}

function showErrors(form: HTMLFormElement, errors: TokenFormErrors): void {
  const fields: Array<keyof TokenFormErrors> = ['label', 'password', 'scopes', 'courses'];
  let first: HTMLElement | null = null;
  for (const key of fields) {
    const slot = form.querySelector<HTMLElement>(`[data-field-error="${key}"]`);
    const message = errors[key];
    const input = key === 'label' || key === 'password' ? form.querySelector<HTMLElement>(`[name="${key}"]`) : null;
    if (slot) {
      slot.textContent = message || '';
      slot.hidden = !message;
    }
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
    if (message && !first) {
      first = input || form.querySelector<HTMLElement>(key === 'scopes' ? 'input[name="scopes"]' : 'input[name="courseScopeType"]:checked, input[name="courseScopeType"]');
      if (key === 'scopes') form.querySelector('details')?.setAttribute('open', '');
    }
  }
  first?.focus();
}

function clearFieldError(form: HTMLFormElement, key: keyof TokenFormErrors): void {
  const slot = form.querySelector<HTMLElement>(`[data-field-error="${key}"]`);
  if (slot) {
    slot.textContent = '';
    slot.hidden = true;
  }
  if (key === 'label' || key === 'password') form.querySelector(`[name="${key}"]`)?.removeAttribute('aria-invalid');
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function installAiConnectionsEnhancer(): void {
  if (typeof document === 'undefined') return;
  const w = window as unknown as { __zurAiConnEnhancer?: boolean };
  if (w.__zurAiConnEnhancer) return;
  w.__zurAiConnEnhancer = true;

  let draft: Draft | null = null;
  let trigger: string | null = null;
  let openModalId: string | null = null;

  const activeModal = (): HTMLElement | null => {
    for (const id of MODAL_IDS) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  };

  const syncPresetToScopes = (form: HTMLFormElement) => {
    const preset = form.querySelector<HTMLSelectElement>('#permission-preset');
    if (!preset) return;
    const hint = form.querySelector('#permission-preset-hint');
    if (hint) hint.textContent = PRESET_HINTS[preset.value] || '';
    const list = PRESET_SCOPES[preset.value];
    if (!list) return;
    form.querySelectorAll<HTMLInputElement>('input[name="scopes"]').forEach((box) => {
      box.checked = list.includes(box.value);
    });
  };

  const restoreDraft = (form: HTMLFormElement, d: Draft) => {
    const set = (name: string, value: string) => {
      const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
      if (el) el.value = value;
    };
    set('label', d.label);
    set('expiryDays', d.expiryDays);
    const preset = form.querySelector<HTMLSelectElement>('[name="preset"]');
    if (preset) {
      preset.value = d.preset;
      const hint = form.querySelector('#permission-preset-hint');
      if (hint) hint.textContent = PRESET_HINTS[d.preset] || '';
    }
    form.querySelectorAll<HTMLInputElement>('input[name="scopes"]').forEach((box) => {
      box.checked = d.scopes.includes(box.value);
    });
    if (d.preset === 'custom') form.querySelector('details')?.setAttribute('open', '');
    form.querySelectorAll<HTMLInputElement>('input[name="courseScopeType"]').forEach((radio) => {
      if (radio.type === 'radio') radio.checked = radio.value === d.courseScopeType;
    });
    const container = form.querySelector('#selected-courses-container, #replace-selected-courses-container');
    if (container && d.courseScopeType === 'selected') container.classList.remove('hidden');
    form.querySelectorAll<HTMLInputElement>('input[name="selectedCourses"]').forEach((box) => {
      box.checked = d.selectedCourses.includes(box.value);
    });
  };

  const placeFocus = (modal: HTMLElement) => {
    let target: HTMLElement | null = null;
    switch (modal.id) {
      case 'create-token-modal': {
        const hasError = Boolean(modal.querySelector('#create-token-error'));
        const label = modal.querySelector<HTMLInputElement>('#connection-name');
        const pw = modal.querySelector<HTMLInputElement>('#connection-password');
        target = hasError && label?.value ? pw : label;
        if (hasError) modal.querySelector<HTMLElement>('#create-token-error')?.setAttribute('tabindex', '-1');
        break;
      }
      case 'replace-token-modal':
        target = modal.querySelector<HTMLElement>('#replace-connection-password');
        break;
      case 'revoke-token-modal':
        target = modal.querySelector<HTMLElement>('[data-dialog-action="cancel"]');
        break;
      case 'token-reveal-modal':
        target = modal.querySelector<HTMLElement>('#btn-copy-token');
        break;
    }
    (target || modal.querySelector<HTMLElement>('.modal-dialog'))?.focus();
  };

  const onDomChange = () => {
    const modal = activeModal();
    if (modal && modal.id !== openModalId) {
      openModalId = modal.id;
      const form = modal.querySelector<HTMLFormElement>('form');
      if (form) {
        const hasError = Boolean(modal.querySelector('#create-token-error, #replace-token-error'));
        if (hasError && draft && draft.formId === form.id) restoreDraft(form, draft);
        else draft = null;
      }
      placeFocus(modal);
    } else if (modal && modal.id === openModalId) {
      // Same dialog re-rendered after a server error.
      const form = modal.querySelector<HTMLFormElement>('form');
      if (form && draft && draft.formId === form.id && modal.querySelector('#create-token-error, #replace-token-error') && !form.dataset.restored) {
        form.dataset.restored = '1';
        restoreDraft(form, draft);
        placeFocus(modal);
      }
    } else if (!modal && openModalId) {
      const closed = openModalId;
      openModalId = null;
      if (closed !== 'token-reveal-modal') {
        // Cancelled or finished: return focus to whatever opened the dialog.
        const el = trigger ? document.querySelector<HTMLElement>(trigger) : null;
        el?.focus();
      }
      if (closed === 'token-reveal-modal' || !document.getElementById('create-token-error')) draft = null;
    }
  };
  new MutationObserver(onDomChange).observe(document.body, { childList: true, subtree: true });

  // Remember what opened the dialog.
  document.addEventListener(
    'click',
    (event) => {
      const el = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action], #btn-open-create-token, #btn-empty-create-token');
      if (!el) return;
      if (el.id) trigger = `#${el.id}`;
      else if (el.dataset.action && el.dataset.tokenId) {
        trigger = `[data-action="${el.dataset.action}"][data-token-id="${CSS.escape(el.dataset.tokenId)}"]`;
      }
    },
    true
  );

  document.addEventListener('keydown', (event) => {
    const modal = activeModal();
    if (!modal) return;
    if (event.key === 'Escape') {
      // Never dismiss the one-time token by accident; it needs an explicit action.
      if (modal.id === 'token-reveal-modal') return;
      const cancel = modal.querySelector<HTMLElement>('[data-dialog-action="cancel"]');
      if (cancel) {
        event.preventDefault();
        cancel.click();
      }
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement as HTMLElement | null;
    if (!current || !modal.contains(current)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && current === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // Validation and draft capture (capture phase so we run before the route controller).
  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || !FORM_IDS.includes(form.id)) return;
      const values = collect(form);
      const errors = validateTokenForm(values);
      if (Object.keys(errors).length > 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showErrors(form, errors);
        return;
      }
      if (form.dataset.submitting === '1') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      form.dataset.submitting = '1';
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submit) {
        submit.disabled = true;
        submit.textContent = form.id === 'create-token-form' ? 'Creating…' : 'Replacing…';
      }
      draft = {
        formId: form.id,
        label: values.label,
        preset: form.querySelector<HTMLSelectElement>('[name="preset"]')?.value || 'custom',
        scopes: values.scopes,
        courseScopeType: values.courseScopeType,
        selectedCourses: values.selectedCourses,
        expiryDays: form.querySelector<HTMLSelectElement>('[name="expiryDays"]')?.value || '30',
      };
    },
    true
  );

  document.addEventListener('change', (event) => {
    const target = event.target as HTMLElement | null;
    const form = target?.closest<HTMLFormElement>('form');
    if (!target || !form || !FORM_IDS.includes(form.id)) return;
    if (target.id === 'permission-preset') {
      syncPresetToScopes(form);
      clearFieldError(form, 'scopes');
    } else if (target.matches('#scopes-checklist input[name="scopes"]')) {
      const preset = form.querySelector<HTMLSelectElement>('#permission-preset');
      if (preset) {
        preset.value = presetForScopes(collectChecked(form));
        const hint = form.querySelector('#permission-preset-hint');
        if (hint) hint.textContent = PRESET_HINTS[preset.value] || '';
      }
      clearFieldError(form, 'scopes');
    } else if (target.matches('input[name="courseScopeType"], input[name="selectedCourses"]')) {
      clearFieldError(form, 'courses');
    }
  });

  document.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement | null;
    const form = target?.closest<HTMLFormElement>('form');
    if (!target || !form || !FORM_IDS.includes(form.id)) return;
    if (target.name === 'label' || target.name === 'password') clearFieldError(form, target.name);
  });

  // Copy token: confirm visibly, and fall back when the async clipboard API is unavailable.
  document.addEventListener(
    'click',
    (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('#btn-copy-token');
      if (!button) return;
      event.stopImmediatePropagation();
      const input = document.getElementById('revealed-token-value') as HTMLInputElement | null;
      const note = document.getElementById('copy-announcement');
      if (!input) return;
      void copyTextToClipboard(input.value).then((ok) => {
        const original = 'Copy token';
        button.textContent = ok ? 'Copied!' : 'Copy failed';
        if (note) {
          note.textContent = ok
            ? 'Token copied. Store it in a secure client configuration.'
            : 'Copy failed. Reveal the token and copy it manually.';
        }
        window.setTimeout(() => {
          if (button.isConnected) button.textContent = original;
        }, 2000);
      });
    },
    true
  );
}

function collectChecked(form: HTMLFormElement): string[] {
  return Array.from(form.querySelectorAll<HTMLInputElement>('input[name="scopes"]:checked')).map((i) => i.value);
}

installAiConnectionsEnhancer();
