import type { User, UserPreferences, PrivacyRequest } from 'zur-shared';
import { getSafeReturnDestination } from '../router/routes.ts';
import { DraftManager } from './draft-manager.ts';

const TOKEN_KEY = 'zur_session_token';
const USER_KEY = 'zur_current_user';

export class AuthClient {
  private static instance: AuthClient;
  private currentUser: User | null = null;
  private token: string | null = null;

  private constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
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

  getToken(): string | null {
    return this.token;
  }

  isAuthenticated(): boolean {
    return Boolean(this.currentUser && this.token);
  }

  setSession(token: string, user: User): void {
    this.token = token;
    this.currentUser = user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  clearSession(): void {
    if (this.currentUser) DraftManager.clearAllUserLocalDrafts(this.currentUser.id);
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem(TOKEN_KEY);
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

  async fetchApi(endpoint: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(endpoint, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data?.error?.message || "This page isn't available.";
      const error = new Error(errorMsg);
      (error as any).code = data?.error?.code || 'ERROR';
      (error as any).statusCode = res.status;
      (error as any).details = data?.error?.details;
      throw error;
    }

    return data;
  }

  async signIn(email: string, password: string): Promise<User> {
    const data = await this.fetchApi('/api/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.setSession(data.token, data.user);
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

  async requestDataExport(): Promise<any> {
    return this.fetchApi('/api/settings/privacy/export', { method: 'POST' });
  }

  async requestAccountDeletion(consequenceAcknowledged: boolean): Promise<any> {
    const data = await this.fetchApi('/api/settings/privacy/delete', {
      method: 'POST',
      body: JSON.stringify({ consequenceAcknowledged }),
    });
    this.clearSession();
    return data;
  }
}
