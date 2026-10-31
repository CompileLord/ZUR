import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError, RateLimitError } from 'zur-shared';
import type { User, AuthSession } from 'zur-shared';
import { hashPassword, verifyPassword, needsRehash, verifyAgainstDummy } from './password-service.ts';
import { IdentityAccountData } from './identity-account-data.ts';

const RATE_LIMIT_SWEEP_MS = 5 * 60 * 1000;

export { MAX_DURABLE_RATE_LIMIT_ROWS } from './identity-rate-limits.ts';

export class IdentityService extends IdentityAccountData {
  private sweeper: NodeJS.Timeout | null = null;

  constructor(db: DatabaseSync) {
    super(db);
    this.db.prepare('DELETE FROM privacy_exports WHERE expires_at<=?').run(new Date().toISOString());
    this.sweeper = setInterval(() => this.pruneRateLimits(), RATE_LIMIT_SWEEP_MS);
    this.sweeper.unref();
  }

  /** Stops the periodic limiter sweeper (tests / graceful shutdown). */
  dispose(): void {
    if (this.sweeper) { clearInterval(this.sweeper); this.sweeper = null; }
  }

  // --- T013: Sign-Up & Email Verification ---

  /** Pure input checks, run before the sign-up rate limiter so typos never consume the IP quota. */
  static validateSignUpInput(data: { email: string; password: string; displayName: string }): { email: string; displayName: string; password: string } {
    const email = data.email?.trim().toLowerCase();
    const displayName = data.displayName?.trim();
    const password = data.password;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError('A valid email address is required.');
    }
    if (!displayName || displayName.length < 2 || displayName.length > 50) {
      throw new ValidationError('Display name must be between 2 and 50 characters.');
    }
    if (!password || password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters.');
    }
    return { email, displayName, password };
  }

  signUp(data: { email: string; password: string; displayName: string }): {
    user: User;
    verificationToken: string;
  } {
    const { email, displayName, password } = IdentityService.validateSignUpInput(data);

    const existing = this.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      throw new ConflictError('An account with this email already exists.');
    }

    const userId = `user-${crypto.randomUUID()}`;
    const passwordHash = hashPassword(password);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, email_verified, capabilities, account_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, '["student"]', 'active', ?, ?)
    `).run(userId, email, passwordHash, displayName, now, now);

    // Initialize default appearance preferences
    this.db.prepare(`
      INSERT OR IGNORE INTO user_preferences (user_id, theme, editor_font_size, indentation_spaces, updated_at)
      VALUES (?, 'system', 14, 4, ?)
    `).run(userId, now);

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    this.db.prepare(`
      INSERT INTO verification_tokens (id, user_id, token_hash, type, expires_at, created_at)
      VALUES (?, ?, ?, 'email_verification', ?, ?)
    `).run(`vtok-${crypto.randomUUID()}`, userId, tokenHash, expiresAt, now);

    const created = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    return {
      user: this.sanitizeUser(created),
      verificationToken: token,
    };
  }

  verifyEmail(token: string): { success: boolean; userId: string } {
    if (!token) {
      throw new ValidationError('Verification token is required.');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();

    const record = this.db.prepare(`
      SELECT id, user_id, expires_at FROM verification_tokens
      WHERE token_hash = ? AND type = 'email_verification'
    `).get(tokenHash) as { id: string; user_id: string; expires_at: string } | undefined;

    if (!record || record.expires_at < now) {
      throw new ValidationError('Invalid or expired verification link.');
    }

    this.db.prepare(`
      UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?
    `).run(now, record.user_id);

    this.db.prepare('DELETE FROM verification_tokens WHERE id = ?').run(record.id);

    return { success: true, userId: record.user_id };
  }

  resendVerificationEmail(email: string): { success: boolean; verificationToken?: string } {
    const cleanEmail = email?.trim().toLowerCase();
    if (!cleanEmail) {
      throw new ValidationError('Email is required.');
    }

    const user = this.db.prepare(`
      SELECT id, email_verified FROM users WHERE email = ?
    `).get(cleanEmail) as { id: string; email_verified: number } | undefined;

    if (!user) {
      return { success: true };
    }

    if (user.email_verified === 1) {
      return { success: true };
    }

    // Cooldown check: 60 seconds
    const recent = this.db.prepare(`
      SELECT created_at FROM verification_tokens
      WHERE user_id = ? AND type = 'email_verification'
      ORDER BY created_at DESC LIMIT 1
    `).get(user.id) as { created_at: string } | undefined;

    if (recent) {
      const createdTime = new Date(recent.created_at).getTime();
      const elapsed = Date.now() - createdTime;
      if (elapsed < 60 * 1000) {
        const remaining = Math.ceil((60 * 1000 - elapsed) / 1000);
        throw new RateLimitError('Please wait before requesting another verification email.', remaining);
      }
    }

    this.db.prepare(`
      DELETE FROM verification_tokens WHERE user_id = ? AND type = 'email_verification'
    `).run(user.id);

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    this.db.prepare(`
      INSERT INTO verification_tokens (id, user_id, token_hash, type, expires_at, created_at)
      VALUES (?, ?, ?, 'email_verification', ?, ?)
    `).run(`vtok-${crypto.randomUUID()}`, user.id, tokenHash, expiresAt, now);

    return { success: true, verificationToken: token };
  }

  // --- T014: Sign-In, Sessions & Sign-Out ---

  signIn(data: { email: string; password: string; ipAddress?: string; userAgent?: string }): AuthSession {
    const email = data.email?.trim().toLowerCase();
    const password = data.password;

    if (!email || !password) {
      throw new ValidationError('Email and password are required.');
    }

    const ip = data.ipAddress || 'unknown';
    const windowMs = 15 * 60 * 1000;
    // All limits count FAILURES only: a classroom behind one IP signs in freely, and a third
    // party cannot lock a victim out. A correct sign-in resets the per-email counters, never the IP's.
    // (email, ip) pair: strict. email alone: distributed guessing. ip alone: spraying many emails.
    const pairKey = `${email}|${ip}`;
    this.checkFailureLimit('sign-in-fail-ip', ip, 100, windowMs);
    this.checkFailureLimit('sign-in-fail-pair', pairKey, 5, windowMs);
    this.checkFailureLimit('sign-in-fail-email', email, 50, windowMs);

    const user = this.db.prepare(`
      SELECT id, email, password_hash, display_name, email_verified, capabilities, account_status, created_at, updated_at
      FROM users WHERE email = ?
    `).get(email) as any;

    if (!user) {
      verifyAgainstDummy(password); // equalise timing with the real-user path
    }
    if (!user || !verifyPassword(password, user.password_hash)) {
      this.recordFailure('sign-in-fail-ip', ip, windowMs);
      this.recordFailure('sign-in-fail-pair', pairKey, windowMs);
      this.recordFailure('sign-in-fail-email', email, windowMs);
      throw new AuthenticationError('Invalid email or password.');
    }

    // Upgrade-on-login: legacy SHA-256 and weaker scrypt hashes are rehashed to current parameters.
    if (needsRehash(user.password_hash)) {
      this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(hashPassword(password), new Date().toISOString(), user.id);
    }

    if (user.account_status === 'suspended') {
      throw new AuthorizationError('This account is suspended. Contact support for assistance.');
    }

    if (user.account_status === 'pending_deletion' || user.account_status === 'purged') {
      throw new AuthenticationError('Invalid email or password.');
    }

    this.clearFailures('sign-in-fail-pair', pairKey);
    this.clearFailures('sign-in-fail-email', email);

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sessionId = `sess-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, user.id, tokenHash, expiresAt, data.userAgent || null, data.ipAddress || null, now);

    return {
      sessionId,
      token,
      expiresAt,
      user: this.sanitizeUser(user),
    };
  }

  authenticateSession(token: string): { session: { id: string; userId: string; expiresAt: string }; user: User } {
    if (!token) {
      throw new AuthenticationError('Authentication required.');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();

    const row = this.db.prepare(`
      SELECT s.id as session_id, s.user_id, s.expires_at,
             u.id, u.email, u.display_name, u.email_verified, u.capabilities, u.account_status, u.created_at, u.updated_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = ?
    `).get(tokenHash) as any;

    if (!row || row.expires_at < now) {
      throw new AuthenticationError('Session expired or invalid.');
    }

    if (row.account_status === 'suspended') {
      throw new AuthorizationError('Account suspended.');
    }

    if (row.account_status === 'pending_deletion' || row.account_status === 'purged') {
      throw new AuthenticationError('Account no longer active.');
    }

    return {
      session: {
        id: row.session_id,
        userId: row.user_id,
        expiresAt: row.expires_at,
      },
      user: this.sanitizeUser(row),
    };
  }

  signOut(token: string): boolean {
    if (!token) return true;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return true;
  }

  signOutAll(userId: string): boolean {
    if (!userId) return false;
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    return true;
  }

  // --- T015: Password Recovery & Security Settings ---

  requestPasswordReset(email: string): { success: boolean; resetToken?: string } {
    const cleanEmail = email?.trim().toLowerCase();
    if (!cleanEmail) {
      throw new ValidationError('Email is required.');
    }

    const user = this.db.prepare(`
      SELECT id, account_status FROM users WHERE email = ?
    `).get(cleanEmail) as { id: string; account_status: string } | undefined;

    // Generic response prevents account enumeration
    if (!user || user.account_status !== 'active') {
      return { success: true };
    }

    this.db.prepare(`
      DELETE FROM verification_tokens WHERE user_id = ? AND type = 'password_reset'
    `).run(user.id);

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    this.db.prepare(`
      INSERT INTO verification_tokens (id, user_id, token_hash, type, expires_at, created_at)
      VALUES (?, ?, ?, 'password_reset', ?, ?)
    `).run(`vtok-${crypto.randomUUID()}`, user.id, tokenHash, expiresAt, now);

    return { success: true, resetToken: token };
  }

  resetPassword(token: string, newPassword: string): boolean {
    if (!token) {
      throw new ValidationError('Reset token is required.');
    }

    if (!newPassword || newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters.');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();

    const record = this.db.prepare(`
      SELECT id, user_id, expires_at FROM verification_tokens
      WHERE token_hash = ? AND type = 'password_reset'
    `).get(tokenHash) as { id: string; user_id: string; expires_at: string } | undefined;

    if (!record || record.expires_at < now) {
      throw new ValidationError('Invalid or expired password reset link.');
    }

    const newHash = hashPassword(newPassword);

    this.db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?
    `).run(newHash, now, record.user_id);

    // Revoke all sessions on password reset
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(record.user_id);
    this.db.prepare('DELETE FROM verification_tokens WHERE id = ?').run(record.id);
    this.audit(record.user_id, 'password_reset_completed', record.user_id, 'Password reset via emailed link; all sessions revoked');

    return true;
  }

  /**
   * Changes the password. Requires the current password (rate-limited: 5 failures / 15 min per user),
   * revokes every session except `keepSessionId` and writes an audit event.
   * NOTE: when `keepSessionId` is omitted ALL sessions of the user are revoked (secure default);
   * the HTTP layer should pass the caller's current session id so the user stays signed in.
   */
  changePassword(userId: string, currentPassword: string, newPassword: string, keepSessionId?: string): boolean {
    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required.');
    }

    if (newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters.');
    }

    const windowMs = 15 * 60 * 1000;
    this.checkFailureLimit('change-password-fail', userId, 5, windowMs);

    const user = this.db.prepare(`
      SELECT id, password_hash FROM users WHERE id = ?
    `).get(userId) as { id: string; password_hash: string } | undefined;

    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      this.recordFailure('change-password-fail', userId, windowMs);
      if (user) this.audit(userId, 'password_change_failed', userId, 'Incorrect current password supplied');
      throw new ValidationError('Current password is incorrect.');
    }
    this.clearFailures('change-password-fail', userId);

    const newHash = hashPassword(newPassword);
    const now = new Date().toISOString();

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`
        UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?
      `).run(newHash, now, userId);
      const revoked = keepSessionId
        ? this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, keepSessionId)
        : this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      this.audit(userId, 'password_changed', userId, 'User changed their password', {
        otherSessionsRevoked: Number(revoked.changes), currentSessionKept: Boolean(keepSessionId),
      });
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }

    return true;
  }

  verifyCurrentPassword(userId: string, password: string): boolean {
    if (!password) throw new ValidationError('Current password is required for this administrator action.');
    const windowMs = 15 * 60 * 1000;
    this.checkFailureLimit('admin-reauth-fail', userId, 5, windowMs);
    const user = this.db.prepare('SELECT password_hash FROM users WHERE id=?').get(userId) as { password_hash: string } | undefined;
    if (!user || !verifyPassword(password, user.password_hash)) {
      this.recordFailure('admin-reauth-fail', userId, windowMs);
      throw new ValidationError('Password is incorrect.');
    }
    this.clearFailures('admin-reauth-fail', userId);
    return true;
  }

  // --- T018: Safe Denial Contract ---

  safeDenial(): NotFoundError {
    return new NotFoundError("This page isn't available.");
  }
}
