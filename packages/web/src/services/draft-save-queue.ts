export interface DraftSaveResponse {
  code: string;
  revision: number;
}

export interface DraftSaveQueueOptions {
  revision: number;
  delayMs?: number;
  save: (code: string, baseRevision: number) => Promise<DraftSaveResponse>;
  onAcknowledged: (saved: DraftSaveResponse, submittedCode: string, latestCode: string) => void;
  onFailure: (error: any, latestCode: string) => void;
}

export class DraftSaveQueue {
  private revisionValue: number;
  private latestCode = '';
  private pending = false;
  private active: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastErrorValue: any = null;
  private readonly options: DraftSaveQueueOptions;

  constructor(options: DraftSaveQueueOptions) {
    this.options = options;
    this.revisionValue = options.revision;
  }

  get revision(): number { return this.revisionValue; }
  get code(): string { return this.latestCode; }
  get lastError(): any { return this.lastErrorValue; }

  update(code: string): void {
    this.latestCode = code;
    this.pending = true;
    this.lastErrorValue = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, this.options.delayMs ?? 1000);
  }

  setServerState(code: string, revision: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.latestCode = code;
    this.revisionValue = revision;
    this.pending = false;
    this.lastErrorValue = null;
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.active) return this.active;
    if (!this.pending) return;
    this.active = this.savePending();
    try { await this.active; }
    finally {
      this.active = null;
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.pending) await this.flush();
  }

  private async savePending(): Promise<void> {
    while (this.pending) {
      this.pending = false;
      const submittedCode = this.latestCode;
      try {
        const saved = await this.options.save(submittedCode, this.revisionValue);
        this.revisionValue = saved.revision;
        this.lastErrorValue = null;
        this.options.onAcknowledged(saved, submittedCode, this.latestCode);
      } catch (error) {
        this.pending = false;
        this.lastErrorValue = error;
        this.options.onFailure(error, this.latestCode);
      }
    }
  }
}
