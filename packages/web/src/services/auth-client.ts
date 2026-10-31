import type { User, UserPreferences, PrivacyRequest } from 'zur-shared';
import { getSafeReturnDestination } from '../router/routes.ts';
import { DraftManager } from './draft-manager.ts';

// Legacy key from when the session token lived in browser storage; purged on startup.
const LEGACY_TOKEN_KEY = 'zur_session_token';
const USER_KEY = 'zur_current_user';

export const SESSION_EXPIRED_EVENT = 'zur:session-expired';
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface FetchApiOptions extends RequestInit {
  /** Abort the request after this many ms (default 30 000; 0 disables). */
  timeoutMs?: number;
}

export class ApiTimeoutError extends Error {
  readonly code = 'REQUEST_TIMEOUT';
  readonly statusCode = 0;
  readonly status = 0;
  readonly endpoint: string;
  readonly timeoutMs: number;
  constructor(endpoint: string, timeoutMs: number) {
    super('The request took too long. Check your connection and try again.');
    this.name = 'ApiTimeoutError';
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
  }
}

export class AuthClient {
  private static instance: AuthClient;
  private currentUser: User | null = null;
  /** Bumped on every sign-in/sign-out so stale 401s cannot expire a newer session. */
  private sessionEpoch = 0;

  // The session credential is the HttpOnly zur_session cookie; script never holds it.
  private constructor() {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    const cachedUser = localStorage.getItem(USER_KEY);
    if (cachedUser) {
      try {
        this.currentUser = JSON.parse(cachedUser);
      } catch {
        this.currentUser = null;
      }
    }
  }

  static getInstance(): AuthClient {
    if (!AuthClient.instance) {
      AuthClient.instance = new AuthClient();
    }
    return AuthClient.instance;
  }

  getUser(): User | null {
    return this.currentUser;
  }

  isAuthenticated(): boolean {
    return Boolean(this.currentUser);
  }

  setSession(user: User): void {
    this.sessionEpoch++;
    this.currentUser = user;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  clearSession(): void {
    if (this.currentUser) DraftManager.clearAllUserLocalDrafts(this.currentUser.id);
    this.sessionEpoch++;
    this.currentUser = null;
    localStorage.removeItem(USER_KEY);

    // Purge account-scoped cache per POLICY-001 §6
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('zur_account_') || key.startsWith('zur_draft_') || key.startsWith('zur_unsynced_') || key.startsWith('zur_job_'))) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }

  async fetchApi(endpoint: string, options: FetchApiOptions = {}): Promise<any> {
    const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal: callerSignal, ...init } = options;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    };

    // Never send an empty or malformed bearer credential; it would shadow the session cookie.
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'authorization' && !/^Bearer\s+\S+/.test(headers[key] || '')) delete headers[key];
    }
    const sentEpoch = this.currentUser ? this.sessionEpoch : null;

    const controller = new AbortController();
    let timedOut = false;
    const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : null;
    const onCallerAbort = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    let res: Response;
    let data: any;
    try {
      res = await fetch(endpoint, { credentials: 'same-origin', ...init, headers, signal: controller.signal });
      data = await res.json().catch(() => ({}));
    } catch (err) {
      if (timedOut) throw new ApiTimeoutError(endpoint, timeoutMs);
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }

    if (!res.ok) {
      if (res.status === 401 && endpoint !== '/api/auth/sign-in') {
        // Only the request that carried the still-current session expires it, so a burst of
        // concurrent 401s (or a 401 for an already-replaced session) emits exactly one event.
        if (sentEpoch !== null && this.currentUser && this.sessionEpoch === sentEpoch) {
          this.clearSession();
          this.emitSessionExpired(endpoint);
        }
      }
      const errorMsg = data?.error?.message || "This page isn't available.";
      const error = new Error(errorMsg);
      (error as any).code = data?.error?.code || 'ERROR';
      (error as any).statusCode = res.status;
      (error as any).status = res.status;
      (error as any).details = data?.error?.details;
      throw error;
    }

    return data;
  }

  private emitSessionExpired(path: string): void {
    try {
      globalThis.dispatchEvent?.(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { path } }));
    } catch {
      /* non-browser environment */
    }
  }

  async signIn(email: string, password: string): Promise<User> {
    const data = await this.fetchApi('/api/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.setSession(data.user);
    return data.user;
  }

  async signUp(displayName: string, email: string, password: string, adultConfirmed: boolean): Promise<{ user: User; deliveryStatus: string }> {
    const data = await this.fetchApi('/api/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify({ displayName, email, password, adultConfirmed }),
    });
    return data;
  }

  async verifyEmail(token: string): Promise<boolean> {
    const data = await this.fetchApi('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    if (this.currentUser) {
      this.currentUser.emailVerified = true;
      localStorage.setItem(USER_KEY, JSON.stringify(this.currentUser));
    }
    return Boolean(data.success);
  }

  async resendVerification(email: string): Promise<void> {
    await this.fetchApi('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async forgotPassword(email: string): Promise<void> {
    await this.fetchApi('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await this.fetchApi('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  }

  async signOut(): Promise<void> {
    try {
      await this.fetchApi('/api/auth/sign-out', { method: 'POST' });
    } catch {
      // Ignore network errors on signout
    } finally {
      this.clearSession();
    }
  }

  async signOutAll(): Promise<void> {
    try {
      await this.fetchApi('/api/auth/sign-out-all', { method: 'POST' });
    } finally {
      this.clearSession();
    }
  }

  async updateProfile(displayName: string): Promise<User> {
    const data = await this.fetchApi('/api/settings/profile', {
      method: 'PUT',
      body: JSON.stringify({ displayName }),
    });
    this.currentUser = data.user;
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  }

  async getAppearance(): Promise<UserPreferences> {
    return this.fetchApi('/api/settings/appearance');
  }

  async saveAppearance(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
    const data = await this.fetchApi('/api/settings/appearance', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
    if (prefs.theme) {
      localStorage.setItem('zur_theme_preference', prefs.theme);
    }
    return data;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.fetchApi('/api/settings/security/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  async getPrivacyStatus(): Promise<{ requests: PrivacyRequest[]; ownedCourseCount: number }> {
    return this.fetchApi('/api/settings/privacy/status');
  }

  async requestDataExport(currentPassword: string): Promise<any> {
    return this.fetchApi('/api/settings/privacy/export', { method: 'POST', body: JSON.stringify({ currentPassword }) });
  }

  async requestAccountDeletion(consequenceAcknowledged: boolean, currentPassword: string): Promise<any> {
    const data = await this.fetchApi('/api/settings/privacy/delete', {
      method: 'POST',
      body: JSON.stringify({ consequenceAcknowledged, currentPassword }),
    });
    this.clearSession();
    return data;
  }
}
