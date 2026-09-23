export interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  compact?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  id?: string;
  className?: string;
  ariaLabel?: string;
  icon?: string;
}

export function renderButton(props: ButtonProps): string {
  const variant = props.variant || 'secondary';
  const variantClass = `btn-${variant}`;
  const compactClass = props.compact ? 'btn-compact' : '';
  const customClass = props.className || '';
  const disabledAttr = props.disabled ? 'disabled aria-disabled="true"' : '';
  const ariaLabelAttr = props.ariaLabel ? `aria-label="${props.ariaLabel}"` : '';
  const idAttr = props.id ? `id="${props.id}"` : '';

  return `
    <button
      type="${props.type || 'button'}"
      class="btn ${variantClass} ${compactClass} ${customClass}".trim()
      ${idAttr}
      ${ariaLabelAttr}
      ${disabledAttr}
    >
      ${props.icon ? `<span class="btn-icon-symbol" aria-hidden="true">${props.icon}</span>` : ''}
      <span>${props.label}</span>
    </button>
  `;
}
