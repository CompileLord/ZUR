export function markAuthorShellDirty(target: EventTarget | null): boolean {
  const shell = (target as Element | null)?.closest?.('.shell-author');
  if (!shell) return false;
  shell.classList.add('is-dirty');
  const saveButton = shell.querySelector('.author-header-right > button.btn-primary');
  if (saveButton && saveButton.textContent === 'Saved') saveButton.textContent = 'Save changes';
  return true;
}
