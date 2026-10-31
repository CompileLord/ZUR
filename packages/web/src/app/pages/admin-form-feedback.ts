const FIELD_ERROR_ATTR = 'data-field-error';

export function adminErrorField(message: string): 'currentPassword' | 'reason' | null {
  if (/password/i.test(message)) return 'currentPassword';
  if (/\breason\b/i.test(message)) return 'reason';
  return null;
}

export function clearFormErrors(form: HTMLFormElement): void {
  form.querySelectorAll<HTMLElement>(`[${FIELD_ERROR_ATTR}]`).forEach((el) => el.remove());
  form.querySelectorAll<HTMLElement>('[aria-invalid]').forEach((el) => {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  });
  const line = form.querySelector<HTMLElement>('.form-error:not([data-field-error])');
  if (line) {
    line.textContent = '';
    line.classList.add('hidden');
  }
}

export function showFormError(form: HTMLFormElement, message: string): void {
  const name = adminErrorField(message);
  const field = name ? form.querySelector<HTMLInputElement>(`[name="${name}"]`) : null;
  const holder = field?.closest('label');
  if (field && holder) {
    const note = document.createElement('p');
    note.className = 'form-error';
    note.id = `${name}-error`;
    note.setAttribute('role', 'alert');
    note.setAttribute(FIELD_ERROR_ATTR, '');
    note.textContent = message;
    holder.after(note);
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', note.id);
    field.focus();
    return;
  }
  const line = form.querySelector<HTMLElement>('.form-error:not([data-field-error])');
  if (!line) return;
  line.textContent = message;
  line.classList.remove('hidden');
  line.setAttribute('tabindex', '-1');
  line.focus();
}
