export class ProfileGuard {
  private initialName: string;
  private saving = false;

  constructor(initialDisplayName: string) {
    this.initialName = (initialDisplayName || '').trim();
  }

  get initialDisplayName(): string {
    return this.initialName;
  }

  get isSaving(): boolean {
    return this.saving;
  }

  isDirty(currentValue: string): boolean {
    const trimmed = (currentValue || '').trim();
    return trimmed !== this.initialName && trimmed.length > 0;
  }

  shouldBlockNavigation(currentValue: string): boolean {
    return this.saving || this.isDirty(currentValue);
  }

  getNavigationPrompt(currentValue: string): string | null {
    if (this.saving) {
      return 'Profile changes are being saved. Leave this page?';
    }
    if (this.isDirty(currentValue)) {
      return 'You have unsaved changes. Leave this page?';
    }
    return null;
  }

  startSave(currentValue: string): boolean {
    if (this.saving || !this.isDirty(currentValue)) {
      return false;
    }
    this.saving = true;
    return true;
  }

  markSaveSuccess(savedDisplayName: string): void {
    this.saving = false;
    this.initialName = (savedDisplayName || '').trim();
  }

  markSaveFailure(): void {
    this.saving = false;
    // initialName remains intact, ensuring dirty state and navigation guards stay active
  }
}
