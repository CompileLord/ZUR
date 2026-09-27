import { escapeHtml } from '../../utils/escape-html.ts';
export interface TextInputProps {
  id: string;
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password' | 'number';
  value?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string;
}

export function renderTextInput(props: TextInputProps): string {
  const type = props.type || 'text';
  const errorId = `${props.id}-error`;
  const hintId = `${props.id}-hint`;
  const ariaDescribedBy = [
    props.error ? errorId : null,
    props.hint ? hintId : null,
  ].filter(Boolean).join(' ');

  return `
    <div class="form-group" id="group-${escapeHtml(props.id)}">
      <label for="${escapeHtml(props.id)}" class="form-label">
        ${escapeHtml(props.label)} ${props.required ? '<span class="text-danger" aria-hidden="true">*</span>' : ''}
      </label>
      <input
        type="${type}"
        id="${escapeHtml(props.id)}"
        name="${escapeHtml(props.name)}"
        class="form-input ${props.error ? 'has-error' : ''}"
        value="${escapeHtml(props.value || '')}"
        ${props.placeholder ? `placeholder="${escapeHtml(props.placeholder)}"` : ''}
        ${props.required ? 'required' : ''}
        ${props.disabled ? 'disabled' : ''}
        ${ariaDescribedBy ? `aria-describedby="${escapeHtml(ariaDescribedBy)}"` : ''}
        ${props.error ? 'aria-invalid="true"' : ''}
      />
      ${props.hint ? `<span id="${escapeHtml(hintId)}" class="form-hint">${escapeHtml(props.hint)}</span>` : ''}
      ${props.error ? `
        <span id="${escapeHtml(errorId)}" class="form-error" role="alert">
          <span aria-hidden="true">⚠</span> ${escapeHtml(props.error)}
        </span>
      ` : ''}
    </div>
  `;
}

export interface StatusBadgeProps {
  status: 'success' | 'warning' | 'danger' | 'info';
  label: string;
  icon?: string;
}

export function renderStatusBadge(props: StatusBadgeProps): string {
  const defaultIcons = {
    success: '✓',
    warning: '⚠',
    danger: '✕',
    info: 'ℹ',
  };
  const icon = props.icon || defaultIcons[props.status];

  return `
    <span class="status-badge ${props.status}">
      <span aria-hidden="true">${icon}</span>
      <span>${escapeHtml(props.label)}</span>
    </span>
  `;
}

export interface SaveIndicatorProps {
  status: 'saved' | 'saving' | 'unsaved';
  lastSavedAt?: string;
}

export function renderSaveIndicator(props: SaveIndicatorProps): string {
  let text = 'Saved';
  let icon = '✓';
  if (props.status === 'saving') {
    text = 'Saving…';
    icon = '↻';
  } else if (props.status === 'unsaved') {
    text = 'Not saved — retrying';
    icon = '⚠';
  }

  return `
    <div class="save-indicator ${props.status}" role="status" aria-live="polite">
      <span aria-hidden="true">${icon}</span>
      <span>${text}</span>
    </div>
  `;
}
