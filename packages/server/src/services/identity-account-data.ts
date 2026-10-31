import crypto from 'node:crypto';
import { ValidationError, NotFoundError, ConflictError } from 'zur-shared';
import type { User, UserPreferences, PrivacyRequest } from 'zur-shared';
import { IdentityRateLimits } from './identity-rate-limits.ts';

/**
 * Middle layer of IdentityService: account data (profile, appearance preferences, privacy export and deletion).
 * IdentityService extends this class, which extends IdentityRateLimits, so each file stays small while the
 * public API and `this` semantics stay unchanged.
 */
export abstract class IdentityAccountData extends IdentityRateLimits {
  abstract verifyCurrentPassword(userId: string, password: string): boolean;

  protected audit(actorId: string | null, action: string, targetId: string, reason: string, metadata?: Record<string, unknown>): void {
    this.db.prepare(`INSERT INTO audit_events (id, actor_id, action, target_type, target_id, reason, metadata, created_at)
      VALUES (?, ?, ?, 'user', ?, ?, ?, ?)`).run(`aud-${crypto.randomUUID()}`, actorId, action, targetId, reason,
      metadata ? JSON.stringify(metadata) : null, new Date().toISOString());
  }

  protected sanitizeUser(row: any): User {
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

  // --- T016: Profile & Appearance Settings ---

  updateProfile(userId: string, data: { displayName: unknown }): User {
    const displayName = typeof data?.displayName === 'string' ? data.displayName.trim() : '';
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

  /** Export and deletion need the caller's current password (rate limited via verifyCurrentPassword). */
  private requirePrivacyReauth(userId: string, currentPassword?: string): void {
    if (!currentPassword) throw new ValidationError('Current password is required for this action.');
    this.verifyCurrentPassword(userId, currentPassword);
  }

  requestDataExport(userId: string, currentPassword?: string): { requestId: string; exportPayload: any; downloadUrl: string; expiresAt: string } {
    this.requirePrivacyReauth(userId, currentPassword);
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

  requestAccountDeletion(userId: string, consequenceAcknowledged: boolean, currentPassword?: string): { success: boolean; requestId: string } {
    if (!consequenceAcknowledged) {
      throw new ValidationError('You must acknowledge the consequences of deletion.');
    }
    this.requirePrivacyReauth(userId, currentPassword);

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
}
