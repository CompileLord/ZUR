import type { UserPreferences } from 'zur-shared';

export interface AppearanceSaveQueueOptions {
  delayMs?: number;
  save: (prefs: Partial<UserPreferences>) => Promise<UserPreferences>;
  onSaving?: () => void;
  onSuccess?: (saved: UserPreferences, isLatest: boolean) => void;
  onError?: (error: any) => void;
}

export class AppearanceSaveQueue {
  private latestPrefs: Partial<UserPreferences> | null = null;
  private pending = false;
  private _hasUnsavedChanges = false;
  private _lastError: any = null;
  private active: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly options: AppearanceSaveQueueOptions;

  constructor(options: AppearanceSaveQueueOptions) {
    this.options = options;
  }

  get isPending(): boolean {
    return this.pending || this._hasUnsavedChanges || this.active !== null || this.timer !== undefined;
  }

  get hasUnsavedChanges(): boolean {
    return this._hasUnsavedChanges;
  }

  get lastError(): any {
    return this._lastError;
  }

  get currentPreferences(): Partial<UserPreferences> | null {
    return this.latestPrefs ? { ...this.latestPrefs } : null;
  }

  update(prefs: Partial<UserPreferences>): void {
    this.latestPrefs = { ...this.latestPrefs, ...prefs };
    this.pending = true;
    this._hasUnsavedChanges = true;
    this._lastError = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.options.onSaving?.();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.options.delayMs ?? 200);
  }

  async flush(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (this.active) {
      await this.active;
      // If new edits were queued during the active save, flush them.
      // Do NOT recurse simply because _hasUnsavedChanges is true (which happens if the active save just failed).
      if (this.pending) {
        return this.flush();
      }
      return !this._hasUnsavedChanges;
    }

    // If there are no pending new edits and no unsaved changes, return success.
    if (!this.pending && !this._hasUnsavedChanges) {
      return true;
    }

    if (!this.latestPrefs) {
      return true;
    }

    this.pending = true;
    this.active = this.savePending();
    try {
      await this.active;
    } finally {
      this.active = null;
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = undefined;
      }
    }

    if (this.pending) {
      return this.flush();
    }

    return !this._hasUnsavedChanges;
  }

  private async savePending(): Promise<void> {
    while (this.pending && this.latestPrefs) {
      this.pending = false;
      const snapshot = { ...this.latestPrefs };
      this.options.onSaving?.();
      try {
        const saved = await this.options.save(snapshot);
        this._lastError = null;
        this._hasUnsavedChanges = this.pending;
        const isLatest = !this.pending;
        this.options.onSuccess?.(saved, isLatest);
      } catch (error) {
        this._lastError = error;
        this._hasUnsavedChanges = true;
        this.pending = false;
        this.options.onError?.(error);
        break; // Stop immediately; do not loop on failure
      }
    }
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.pending = false;
    this._hasUnsavedChanges = false;
    this._lastError = null;
  }
}
