import type { CodeDraftResponse } from 'zur-shared';

export interface LocalDraftRecord {
  code: string;
  revision: number;
  timestamp: number;
}

export class DraftManager {
  private static STORAGE_PREFIX = 'zur_draft_';

  static getStorageKey(userId: string, enrollmentId: string, stepId: string): string {
    return `${this.STORAGE_PREFIX}${userId}_${enrollmentId}_${stepId}`;
  }

  static loadLocalDraft(userId: string, enrollmentId: string, stepId: string): LocalDraftRecord | null {
    try {
      const key = this.getStorageKey(userId, enrollmentId, stepId);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static saveLocalDraft(userId: string, enrollmentId: string, stepId: string, code: string, revision: number): void {
    try {
      const key = this.getStorageKey(userId, enrollmentId, stepId);
      const record: LocalDraftRecord = {
        code,
        revision,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(record));
    } catch {
      // LocalStorage might be unavailable or full
    }
  }

  static clearLocalDraft(userId: string, enrollmentId: string, stepId: string): void {
    try {
      const key = this.getStorageKey(userId, enrollmentId, stepId);
      localStorage.removeItem(key);
    } catch {
      // Best-effort removal
    }
  }

  /**
   * Clears all local drafts belonging to this user upon sign-out (PRD §12.3, AC-11)
   */
  static clearAllUserLocalDrafts(userId: string): void {
    try {
      const prefix = `${this.STORAGE_PREFIX}${userId}_`;
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
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
