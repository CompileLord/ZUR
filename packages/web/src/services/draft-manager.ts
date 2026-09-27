import type { CodeDraftResponse } from 'zur-shared';

export interface LocalDraftRecord {
  code: string;
  revision: number;
  timestamp: number;
}

export class DraftManager {
  private static STORAGE_PREFIX = 'zur_draft_';
  private static UNSYNCED_PREFIX = 'zur_unsynced_';
  private static memoryDrafts = new Map<string, LocalDraftRecord>();
  private static memoryUnsynced = new Map<string, { enrollmentId: string; stepId: string }>();

  static markUnsynced(userId: string, enrollmentId: string, stepId: string, unsynced: boolean): void {
    const key = `${this.UNSYNCED_PREFIX}${userId}_${enrollmentId}_${stepId}`;
    if (unsynced) this.memoryUnsynced.set(key, { enrollmentId, stepId });
    else this.memoryUnsynced.delete(key);
    try {
      if (unsynced) localStorage.setItem(key, JSON.stringify({ enrollmentId, stepId }));
      else localStorage.removeItem(key);
    } catch { return; }
  }

  static hasUnsyncedWork(userId: string): boolean {
    const prefix = `${this.UNSYNCED_PREFIX}${userId}_`;
    if ([...this.memoryUnsynced.keys()].some((key) => key.startsWith(prefix))) return true;
    try {
      return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .some((key) => key?.startsWith(prefix));
    } catch { return false; }
  }

  static async syncUnsyncedWork(userId: string): Promise<void> {
    const prefix = `${this.UNSYNCED_PREFIX}${userId}_`;
    let storedKeys: string[] = [];
    try { storedKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(prefix))); }
    catch { storedKeys = []; }
    const entries = [...new Set([...this.memoryUnsynced.keys(), ...storedKeys])]
      .filter((key) => key.startsWith(prefix));
    for (const key of entries) {
      const scope = this.memoryUnsynced.get(key) || JSON.parse(localStorage.getItem(key) || '{}');
      if (typeof scope.enrollmentId !== 'string' || typeof scope.stepId !== 'string') {
        throw new Error('A local draft cannot be identified. Keep it on this device and contact support.');
      }
      const local = this.loadLocalDraft(userId, scope.enrollmentId, scope.stepId);
      if (!local) { this.markUnsynced(userId, scope.enrollmentId, scope.stepId, false); continue; }
      const server = await this.fetchServerDraft(scope.enrollmentId, scope.stepId);
      if (server.code === local.code) {
        this.markUnsynced(userId, scope.enrollmentId, scope.stepId, false);
        continue;
      }
      if (server.revision !== local.revision) {
        throw new Error('A newer saved draft exists. Resolve the conflict before signing out.');
      }
      await this.saveServerDraft(scope.enrollmentId, scope.stepId, local.code, local.revision);
      this.markUnsynced(userId, scope.enrollmentId, scope.stepId, false);
    }
  }

  static getStorageKey(userId: string, enrollmentId: string, stepId: string): string {
    return `${this.STORAGE_PREFIX}${userId}_${enrollmentId}_${stepId}`;
  }

  static loadLocalDraft(userId: string, enrollmentId: string, stepId: string): LocalDraftRecord | null {
    try {
      const key = this.getStorageKey(userId, enrollmentId, stepId);
      const raw = localStorage.getItem(key);
      if (!raw) return this.memoryDrafts.get(key) || null;
      return JSON.parse(raw);
    } catch {
      return this.memoryDrafts.get(this.getStorageKey(userId, enrollmentId, stepId)) || null;
    }
  }

  static saveLocalDraft(userId: string, enrollmentId: string, stepId: string, code: string, revision: number): boolean {
    try {
      const key = this.getStorageKey(userId, enrollmentId, stepId);
      const record: LocalDraftRecord = {
        code,
        revision,
        timestamp: Date.now(),
      };
      this.memoryDrafts.set(key, record);
      localStorage.setItem(key, JSON.stringify(record));
      return true;
    } catch {
      return false;
    }
  }

  static clearLocalDraft(userId: string, enrollmentId: string, stepId: string): void {
    const key = this.getStorageKey(userId, enrollmentId, stepId);
    this.memoryDrafts.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      // Best-effort removal
    }
  }

  /**
   * Clears all local drafts belonging to this user upon sign-out (PRD §12.3, AC-11)
   */
  static clearAllUserLocalDrafts(userId: string): void {
    for (const key of this.memoryDrafts.keys()) if (key.startsWith(`${this.STORAGE_PREFIX}${userId}_`)) this.memoryDrafts.delete(key);
    for (const key of this.memoryUnsynced.keys()) if (key.startsWith(`${this.UNSYNCED_PREFIX}${userId}_`)) this.memoryUnsynced.delete(key);
    try {
      const prefix = `${this.STORAGE_PREFIX}${userId}_`;
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(prefix) || key.startsWith(`${this.UNSYNCED_PREFIX}${userId}_`))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // Best-effort cleanup on sign-out
    }
  }

  static async fetchServerDraft(enrollmentId: string, stepId: string): Promise<CodeDraftResponse> {
    const res = await fetch(`/api/drafts?enrollmentId=${encodeURIComponent(enrollmentId)}&stepId=${encodeURIComponent(stepId)}`);
    if (!res.ok) {
      throw new Error(`Failed to load draft: ${res.statusText}`);
    }
    return res.json();
  }

  static async saveServerDraft(
    enrollmentId: string,
    stepId: string,
    code: string,
    baseRevision: number
  ): Promise<CodeDraftResponse> {
    const res = await fetch('/api/drafts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId, stepId, code, baseRevision }),
    });

    if (res.status === 409) {
      const conflict = await res.json();
      const err: any = new Error('STALE_REVISION');
      err.conflict = conflict.error || conflict;
      throw err;
    }

    if (!res.ok) {
      throw new Error(`Failed to save draft: ${res.statusText}`);
    }

    return res.json();
  }

  static async resetServerDraft(enrollmentId: string, stepId: string): Promise<CodeDraftResponse> {
    const res = await fetch('/api/drafts/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId, stepId }),
    });

    if (!res.ok) {
      throw new Error(`Failed to reset draft: ${res.statusText}`);
    }

    return res.json();
  }
}
