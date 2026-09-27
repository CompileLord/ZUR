import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from 'zur-shared';
import type {
  User,
  UserPreferences,
  PrivacyRequest,
  AuthSession,
} from 'zur-shared';
import { hashPassword, verifyPassword } from './password-service.ts';

interface RateLimitRecord {
  attempts: number;
  lastAttemptAt: number;
}

export class IdentityService {
  private db: DatabaseSync;
  private rateLimitMap = new Map<string, RateLimitRecord>();

  constructor(db: DatabaseSync) {
    this.db = db;
    this.db.prepare('DELETE FROM privacy_exports WHERE expires_at<=?').run(new Date().toISOString());
  }

  private checkRateLimit(key: string, maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000): void {
    const now = Date.now();
    const record = this.rateLimitMap.get(key);

    if (!record) return;

    if (now - record.lastAttemptAt > windowMs) {
      this.rateLimitMap.delete(key);
      return;
    }

    if (record.attempts >= maxAttempts) {
      const retryAfterSeconds = Math.ceil((windowMs - (now - record.lastAttemptAt)) / 1000);
      throw new RateLimitError('Too many attempts. Please try again later.', retryAfterSeconds);
    }
  }

  private recordRateLimitFailure(key: string): void {
    const now = Date.now();
    const record = this.rateLimitMap.get(key);
    if (!record) {
      this.rateLimitMap.set(key, { attempts: 1, lastAttemptAt: now });
    } else {
      record.attempts += 1;
      record.lastAttemptAt = now;
    }
  }

  private clearRateLimit(key: string): void {
    this.rateLimitMap.delete(key);
  }

  /** Durable admission limit shared by API processes using the same database. */
  consumeRequestRateLimit(scope: string, key: string, maxAttempts: number, windowMs: number): void {
    const now = Date.now();
    const keyHash = crypto.createHash('sha256').update(`${scope}:${key}`).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const record = this.db.prepare('SELECT attempts,window_started_at FROM auth_request_limits WHERE key_hash=?')
        .get(keyHash) as { attempts: number; window_started_at: number } | undefined;
      if (record && now - record.window_started_at < windowMs && record.attempts >= maxAttempts) {
        throw new RateLimitError('Too many attempts. Please try again later.',
          Math.ceil((windowMs - (now - record.window_started_at)) / 1000));
      }
      if (!record || now - record.window_started_at >= windowMs) {
        this.db.prepare(`INSERT INTO auth_request_limits (key_hash,attempts,window_started_at,last_attempt_at)
          VALUES (?,1,?,?) ON CONFLICT(key_hash) DO UPDATE SET attempts=1,
          window_started_at=excluded.window_started_at,last_attempt_at=excluded.last_attempt_at`)
          .run(keyHash, now, now);
      } else {
        this.db.prepare('UPDATE auth_request_limits SET attempts=attempts+1,last_attempt_at=? WHERE key_hash=?')
          .run(now, keyHash);
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  private sanitizeUser(row: any): User {
    let capabilities: any[] = [];
    try {
      capabilities = typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : row.capabilities;
    } catch {
      capabilities = ['student'];
    }

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      emailVerified: Boolean(row.email_verified),
      capabilities,
      accountStatus: row.account_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // --- T013: Sign-Up & Email Verification ---

  signUp(data: { email: string; password: string; displayName: string }): {
    user: User;
    verificationToken: string;
  } {
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

    this.consumeRequestRateLimit('sign-in-email', email, 10, 15 * 60 * 1000);
    this.consumeRequestRateLimit('sign-in-ip', data.ipAddress || 'unknown', 60, 15 * 60 * 1000);

    const rateLimitKey = `signin:${email}:${data.ipAddress || 'unknown'}`;
    this.checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);

    const user = this.db.prepare(`
      SELECT id, email, password_hash, display_name, email_verified, capabilities, account_status, created_at, updated_at
      FROM users WHERE email = ?
    `).get(email) as any;

    if (!user || !verifyPassword(password, user.password_hash)) {
      this.recordRateLimitFailure(rateLimitKey);
      throw new AuthenticationError('Invalid email or password.');
    }

    if (user.account_status === 'suspended') {
      throw new AuthorizationError('This account is suspended. Contact support for assistance.');
    }

    if (user.account_status === 'pending_deletion' || user.account_status === 'purged') {
      throw new AuthenticationError('Invalid email or password.');
    }

    this.clearRateLimit(rateLimitKey);

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

    return true;
  }

  changePassword(userId: string, currentPassword: string, newPassword: string): boolean {
    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required.');
    }

    if (newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters.');
    }

    const user = this.db.prepare(`
      SELECT id, password_hash FROM users WHERE id = ?
    `).get(userId) as { id: string; password_hash: string } | undefined;

    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      throw new ValidationError('Current password is incorrect.');
    }

    const newHash = hashPassword(newPassword);
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?
    `).run(newHash, now, userId);

    return true;
  }

  verifyCurrentPassword(userId: string, password: string): boolean {
    if (!password) throw new ValidationError('Current password is required for this administrator action.');
    this.consumeRequestRateLimit('admin-reauth', userId, 10, 15 * 60 * 1000);
    const rateKey=`admin-reauth:${userId}`;
    this.checkRateLimit(rateKey,5,15*60*1000);
    const user = this.db.prepare('SELECT password_hash FROM users WHERE id=?').get(userId) as { password_hash: string } | undefined;
    if (!user || !verifyPassword(password, user.password_hash)) { this.recordRateLimitFailure(rateKey); throw new AuthenticationError('Reauthentication failed.'); }
    this.clearRateLimit(rateKey);
    return true;
  }

  // --- T016: Profile & Appearance Settings ---

  updateProfile(userId: string, data: { displayName: string }): User {
    const displayName = data.displayName?.trim();
    if (!displayName || displayName.length < 2 || displayName.length > 50) {
      throw new ValidationError('Display name must be between 2 and 50 characters.');
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?
    `).run(displayName, now, userId);

    const updated = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return this.sanitizeUser(updated);
  }

  getPreferences(userId: string): UserPreferences {
    const row = this.db.prepare(`
      SELECT user_id, theme, editor_font_size, indentation_spaces, updated_at
      FROM user_preferences WHERE user_id = ?
    `).get(userId) as any;

    if (!row) {
      return {
        userId,
        theme: 'system',
        editorFontSize: 14,
        indentationSpaces: 4,
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      userId: row.user_id,
      theme: row.theme,
      editorFontSize: row.editor_font_size,
      indentationSpaces: row.indentation_spaces,
      updatedAt: row.updated_at,
    };
  }

  updatePreferences(
    userId: string,
    prefs: { theme?: 'dark' | 'light' | 'system'; editorFontSize?: number; indentationSpaces?: number }
  ): UserPreferences {
    const current = this.getPreferences(userId);

    const theme = prefs.theme ?? current.theme;
    if (!['dark', 'light', 'system'].includes(theme)) {
      throw new ValidationError('Theme must be dark, light, or system.');
    }

    const editorFontSize = prefs.editorFontSize ?? current.editorFontSize;
    if (![12, 14, 16, 18].includes(editorFontSize)) {
      throw new ValidationError('Editor font size must be 12, 14, 16, or 18.');
    }

    const indentationSpaces = prefs.indentationSpaces ?? current.indentationSpaces;
    if (![2, 4].includes(indentationSpaces)) {
      throw new ValidationError('Indentation spaces must be 2 or 4.');
    }

    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO user_preferences (user_id, theme, editor_font_size, indentation_spaces, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        theme = excluded.theme,
        editor_font_size = excluded.editor_font_size,
        indentation_spaces = excluded.indentation_spaces,
        updated_at = excluded.updated_at
    `).run(userId, theme, editorFontSize, indentationSpaces, now);

    return {
      userId,
      theme,
      editorFontSize,
      indentationSpaces,
      updatedAt: now,
    };
  }

  // --- T017: Privacy Request Intake & Sole-Owner Course Check ---

  requestDataExport(userId: string): { requestId: string; exportPayload: any } {
    const userRow = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!userRow) {
      throw new NotFoundError("This page isn't available.");
    }

    const user = this.sanitizeUser(userRow);

    const enrollments = this.db.prepare(`
      SELECT e.id, e.course_id, e.pinned_version_id, e.status, c.title as course_title
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE e.user_id = ?
    `).all(userId);

    const stepProgress = this.db.prepare(`
      SELECT p.enrollment_id, p.step_id, p.is_completed, p.is_waived, p.completed_at
      FROM step_progress p
      JOIN enrollments e ON p.enrollment_id = e.id
      WHERE e.user_id = ?
    `).all(userId);

    const attempts = this.db.prepare(`
      SELECT id, enrollment_id, step_id, type, verdict, execution_time_ms, code_snapshot, created_at
      FROM assessment_attempts
      WHERE user_id = ?
    `).all(userId);

    const exportPayload = {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      enrollments,
      stepProgress,
      assessmentAttempts: attempts,
      exportedAt: new Date().toISOString(),
    };

    const requestId = `priv-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`INSERT INTO privacy_requests (id,user_id,request_type,status,consequence_acknowledged,blocker_reason,created_at,updated_at) VALUES (?,?,'export','completed',1,NULL,?,?)`).run(requestId,userId,now,now);
      this.db.prepare(`INSERT INTO privacy_exports(request_id,user_id,package_json,expires_at,created_at) VALUES(?,?,?,?,?)`).run(requestId,userId,JSON.stringify(exportPayload),expiresAt,now);
      this.db.prepare(`INSERT INTO audit_events(id,actor_id,action,target_type,target_id,reason,metadata,correlation_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),userId,'privacy_request:export_requested','user',userId,'User requested their own account export',JSON.stringify({requestId,expiresAt}),crypto.randomUUID(),now);
      this.db.exec('COMMIT');
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
    return { requestId, exportPayload, downloadUrl:`/api/settings/privacy/exports/${encodeURIComponent(requestId)}`, expiresAt };
  }

  requestAccountDeletion(userId: string, consequenceAcknowledged: boolean): { success: boolean; requestId: string } {
    if (!consequenceAcknowledged) {
      throw new ValidationError('You must acknowledge the consequences of deletion.');
    }

    // Sole-Owner Course Check (PRD §15, tasks.json T017, POLICY-001 §4)
    let committed = false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const ownedCourses = this.db.prepare(`
        SELECT id, title, publication_status FROM courses WHERE owner_id = ? AND publication_status != 'archived'
      `).all(userId) as Array<{ id: string; title: string; publication_status: string }>;

      if (ownedCourses.length > 0) {
        const courseTitles = ownedCourses.map((c) => `“${c.title}”`).join(', ');
        const blockerReason = `User is sole owner of active courses (${courseTitles}). Ownership must be transferred or course archived before deletion.`;

        const reqId = `priv-${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        this.db.prepare(`
          INSERT INTO privacy_requests (id, user_id, request_type, status, consequence_acknowledged, blocker_reason, created_at, updated_at)
          VALUES (?, ?, 'deletion', 'failed', 1, ?, ?, ?)
        `).run(reqId, userId, blockerReason, now, now);

        this.db.prepare(`INSERT INTO audit_events (id, actor_id, action, target_type, target_id, reason, metadata, created_at)
          VALUES (?, ?, 'request_account_deletion_blocked', 'user', ?, ?, ?, ?)`).run(
          `aud-${crypto.randomUUID()}`, userId, userId, 'Sole-owner course blocks deletion',
          JSON.stringify({ requestId: reqId, courseIds: ownedCourses.map((course) => course.id) }), now);
        this.db.exec('COMMIT');
        committed = true;

        throw new ConflictError(
          `Cannot delete account: You are the sole owner of course(s): ${courseTitles}. You must transfer ownership or archive them before deletion.`
        );
      }

      const now = new Date().toISOString();
      const requestId = `priv-${crypto.randomUUID()}`;

      // Mark account pending_deletion and invalidate active sessions
      this.db.prepare(`
        UPDATE users SET account_status = 'pending_deletion', updated_at = ? WHERE id = ?
      `).run(now, userId);

      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      this.db.prepare('UPDATE author_access_tokens SET is_revoked = 1 WHERE author_id = ?').run(userId);

      this.db.prepare(`
        INSERT INTO privacy_requests (id, user_id, request_type, status, consequence_acknowledged, blocker_reason, created_at, updated_at)
        VALUES (?, ?, 'deletion', 'pending', 1, NULL, ?, ?)
      `).run(requestId, userId, now, now);

      // Audit event
      this.db.prepare(`
        INSERT INTO audit_events (id, actor_id, action, target_type, target_id, reason, created_at)
        VALUES (?, ?, 'request_account_deletion', 'user', ?, 'User self-service privacy deletion request', ?)
      `).run(`aud-${crypto.randomUUID()}`, userId, userId, now);

      this.db.exec('COMMIT');
      committed = true;
      return { success: true, requestId };
    } catch (error) {
      if (!committed) this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getPrivacyStatus(userId: string): { requests: PrivacyRequest[]; ownedCourseCount: number } {
    this.db.prepare('DELETE FROM privacy_exports WHERE expires_at<=?').run(new Date().toISOString());
    const requestsRaw = this.db.prepare(`
      SELECT p.id, p.user_id, p.request_type, p.status, p.consequence_acknowledged, p.blocker_reason, p.created_at, p.updated_at,
        (SELECT expires_at FROM privacy_exports x WHERE x.request_id=p.id) export_expires_at
      FROM privacy_requests p WHERE p.user_id = ? ORDER BY p.created_at DESC
    `).all(userId) as any[];

    const ownedCourses = this.db.prepare(`
      SELECT COUNT(*) as count FROM courses WHERE owner_id = ? AND publication_status != 'archived'
    `).get(userId) as { count: number };

    const requests: PrivacyRequest[] = requestsRaw.map((r) => ({
      id: r.id,
      userId: r.user_id,
      requestType: r.request_type,
      status: r.status,
      consequenceAcknowledged: Boolean(r.consequence_acknowledged),
      blockerReason: r.blocker_reason,
      exportExpiresAt: r.export_expires_at || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return {
      requests,
      ownedCourseCount: ownedCourses.count,
    };
  }

  getPrivacyExport(userId:string,requestId:string):string {
    const row=this.db.prepare(`SELECT package_json,expires_at FROM privacy_exports WHERE request_id=? AND user_id=?`).get(requestId,userId) as any;
    if(!row)throw new NotFoundError("This page isn't available.");
    if(Date.parse(row.expires_at)<=Date.now()){this.db.prepare('DELETE FROM privacy_exports WHERE request_id=?').run(requestId);throw new NotFoundError("This page isn't available.");}
    this.db.prepare(`UPDATE privacy_exports SET downloaded_at=?,download_count=download_count+1 WHERE request_id=?`).run(new Date().toISOString(),requestId);
    return row.package_json;
  }

  // --- T018: Safe Denial Contract ---

  safeDenial(): NotFoundError {
    return new NotFoundError("This page isn't available.");
  }
}
