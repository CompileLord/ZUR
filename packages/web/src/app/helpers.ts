import { app } from './state.ts';

export function safeSessionStorageGet(key: string): string | null {
  try {
    return window.sessionStorage ? window.sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function safeSessionStorageSet(key: string, value: string): void {
  try {
    if (window.sessionStorage) {
      window.sessionStorage.setItem(key, value);
    }
  } catch {}
}

export function safeSessionStorageRemove(key: string): void {
  try {
    if (window.sessionStorage) {
      window.sessionStorage.removeItem(key);
    }
  } catch {}
}

export function cleanupActiveModals(): void {
  if (app.activeModalCleanup) {
    try {
      app.activeModalCleanup();
    } catch {}
    app.activeModalCleanup = null;
  }
  if (app.activeModalKeydownListener) {
    try {
      document.removeEventListener('keydown', app.activeModalKeydownListener);
    } catch {}
    app.activeModalKeydownListener = null;
  }
}

export function s2Current(path: string): boolean { return window.location.pathname + window.location.search === path; }

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
