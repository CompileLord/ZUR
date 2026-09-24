import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError,
} from 'zur-shared';
import type { Invitation, InvitationType } from 'zur-shared';
import { EnrollmentService } from './enrollment-service.ts';

export interface CreateInvitationInput {
  type: InvitationType;
  recipientEmail?: string;
  maxUses?: number;
  expiresInDays?: number;
}

export interface InvitationPreview {
  valid: boolean;
  reason?: 'revoked' | 'expired' | 'exhausted' | null;
  course: {
    id: string;
    title: string;
    description: string;
    difficulty: string;
    estimatedDurationMinutes: number;
  };
  inviterName: string;
  type: InvitationType;
  recipientEmailMasked?: string | null;
  expiresAt: string;
}

export class InvitationService {
  private db: DatabaseSync;
  private enrollmentService: EnrollmentService;

  constructor(db: DatabaseSync, enrollmentService?: EnrollmentService) {
    this.db = db;
    this.enrollmentService = enrollmentService || new EnrollmentService(db);
  }

  private checkCourseOwnerOrAdmin(actorId: string, courseId: string): void {
    const course = this.db
      .prepare('SELECT owner_id FROM courses WHERE id = ?')
      .get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    const user = this.db
      .prepare('SELECT capabilities FROM users WHERE id = ?')
      .get(actorId) as any;
    let capabilities: string[] = [];
    try {
      capabilities = JSON.parse(user?.capabilities || '[]');
    } catch {
      capabilities = [];
    }

    const isAdmin = capabilities.includes('admin');
    if (course.owner_id !== actorId && !isAdmin) {
      throw new AuthorizationError('You do not have permission to manage invitations for this course.');
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const maskedLocal =
      local.length > 2
        ? `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`
        : `${local[0]}*`;
    const domainParts = domain.split('.');
    const maskedDomain = domainParts
      .map((part) =>
        part.length > 2
          ? `${part[0]}${'*'.repeat(part.length - 2)}${part[part.length - 1]}`
          : `${part[0]}*`
      )
      .join('.');
    return `${maskedLocal}@${maskedDomain}`;
  }

  createInvitation(
    ownerId: string,
    courseId: string,
    input: CreateInvitationInput
  ): { invitation: Invitation; token: string } {
    this.checkCourseOwnerOrAdmin(ownerId, courseId);

    const course = this.db
      .prepare('SELECT id, publication_status FROM courses WHERE id = ?')
      .get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    let recipientEmail: string | null = null;
    let maxUses: number | null = null;

    if (input.type === 'email') {
      if (!input.recipientEmail || !input.recipientEmail.includes('@')) {
        throw new ValidationError('A valid recipient email address is required.');
      }
      recipientEmail = input.recipientEmail.trim().toLowerCase();
      maxUses = 1;
    } else if (input.type === 'shareable_link') {
      recipientEmail = null;
      maxUses = input.maxUses ? Math.max(1, input.maxUses) : null;
    } else {
      throw new ValidationError('Invalid invitation type.');
    }

    const days = input.expiresInDays && input.expiresInDays > 0 ? input.expiresInDays : 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(plainToken);
    const id = `inv-${crypto.randomUUID()}`;

    this.db
      .prepare(
        `INSERT INTO invitations (
          id, course_id, inviter_id, token_hash, recipient_email,
          type, max_uses, uses_count, expires_at, is_revoked, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?)`
      )
      .run(
        id,
        courseId,
        ownerId,
        tokenHash,
        recipientEmail,
        input.type,
        maxUses,
        expiresAt,
        now
      );

    const invRow = this.db.prepare('SELECT * FROM invitations WHERE id = ?').get(id) as any;
    return {
      invitation: this.mapInvitationRow(invRow),
      token: plainToken,
    };
  }

  getInvitationPreview(token: string): InvitationPreview {
    const tokenHash = this.hashToken(token);
    const invitation = this.db
      .prepare('SELECT * FROM invitations WHERE token_hash = ?')
      .get(tokenHash) as any;

    if (!invitation) {
      throw new NotFoundError('Invalid invitation link.');
    }

    const course = this.db
      .prepare('SELECT id, title, description, difficulty, estimated_duration_minutes FROM courses WHERE id = ?')
      .get(invitation.course_id) as any;

    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    const inviter = this.db
      .prepare('SELECT display_name FROM users WHERE id = ?')
      .get(invitation.inviter_id) as any;

    const isRevoked = Boolean(invitation.is_revoked);
    const isExpired = new Date(invitation.expires_at) < new Date();
    const isExhausted =
      invitation.max_uses !== null && invitation.uses_count >= invitation.max_uses;

    let reason: 'revoked' | 'expired' | 'exhausted' | null = null;
    if (isRevoked) {
      reason = 'revoked';
    } else if (isExpired) {
      reason = 'expired';
    } else if (isExhausted) {
      reason = 'exhausted';
    }

    const valid = !isRevoked && !isExpired && !isExhausted;

    return {
      valid,
      reason,
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        difficulty: course.difficulty,
        estimatedDurationMinutes: course.estimated_duration_minutes,
      },
      inviterName: inviter?.display_name || 'Course Instructor',
      type: invitation.type,
      recipientEmailMasked: invitation.recipient_email
        ? this.maskEmail(invitation.recipient_email)
        : null,
      expiresAt: invitation.expires_at,
    };
  }

  acceptInvitation(
    userId: string,
    token: string
  ): { success: boolean; enrollment: any; courseId: string } {
    const tokenHash = this.hashToken(token);
    const invitation = this.db
      .prepare('SELECT * FROM invitations WHERE token_hash = ?')
      .get(tokenHash) as any;

    if (!invitation) {
      throw new NotFoundError('Invalid invitation link.');
    }

    if (invitation.is_revoked === 1) {
      throw new ConflictError('This invitation has been revoked.');
    }

    if (new Date(invitation.expires_at) < new Date()) {
      throw new ConflictError('This invitation has expired.');
    }

    if (invitation.max_uses !== null && invitation.uses_count >= invitation.max_uses) {
      throw new ConflictError('This invitation use limit has been reached.');
    }

    if (invitation.type === 'email') {
      const user = this.db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as any;
      if (!user) {
        throw new NotFoundError("This page isn't available.");
      }
      if (user.email.toLowerCase() !== invitation.recipient_email.toLowerCase()) {
        throw new AuthorizationError('This invitation was issued to another email address.');
      }
    }

    // Enroll student (enforces revocation invariant: revoked students cannot enroll)
    const enrollment = this.enrollmentService.enrollStudent(userId, invitation.course_id, {
      isDirectOpen: true,
    });

    // Atomically increment uses_count
    this.db
      .prepare('UPDATE invitations SET uses_count = uses_count + 1 WHERE id = ?')
      .run(invitation.id);

    return {
      success: true,
      enrollment,
      courseId: invitation.course_id,
    };
  }

  listInvitations(ownerId: string, courseId: string): Invitation[] {
    this.checkCourseOwnerOrAdmin(ownerId, courseId);

    const rows = this.db
      .prepare(
        'SELECT * FROM invitations WHERE course_id = ? ORDER BY created_at DESC'
      )
      .all(courseId) as any[];

    return rows.map((r) => this.mapInvitationRow(r));
  }

  revokeInvitation(ownerId: string, invitationId: string): { success: boolean } {
    const inv = this.db.prepare('SELECT course_id FROM invitations WHERE id = ?').get(invitationId) as any;
    if (!inv) {
      throw new NotFoundError('Invitation not found.');
    }

    this.checkCourseOwnerOrAdmin(ownerId, inv.course_id);

    this.db
      .prepare('UPDATE invitations SET is_revoked = 1 WHERE id = ?')
      .run(invitationId);

    return { success: true };
  }

  resendOrRegenerateInvitation(
    ownerId: string,
    invitationId: string
  ): { invitation: Invitation; token: string } {
    const inv = this.db.prepare('SELECT * FROM invitations WHERE id = ?').get(invitationId) as any;
    if (!inv) {
      throw new NotFoundError('Invitation not found.');
    }

    this.checkCourseOwnerOrAdmin(ownerId, inv.course_id);

    const newPlainToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = this.hashToken(newPlainToken);
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    this.db
      .prepare(
        'UPDATE invitations SET token_hash = ?, expires_at = ?, is_revoked = 0 WHERE id = ?'
      )
      .run(newTokenHash, newExpiresAt, invitationId);

    const updated = this.db.prepare('SELECT * FROM invitations WHERE id = ?').get(invitationId) as any;
    return {
      invitation: this.mapInvitationRow(updated),
      token: newPlainToken,
    };
  }

  private mapInvitationRow(row: any): Invitation {
    return {
      id: row.id,
      courseId: row.course_id,
      inviterId: row.inviter_id,
      tokenHash: row.token_hash,
      recipientEmail: row.recipient_email ?? null,
      type: row.type as InvitationType,
      maxUses: row.max_uses ?? null,
      usesCount: row.uses_count,
      expiresAt: row.expires_at,
      isRevoked: Boolean(row.is_revoked),
      createdAt: row.created_at,
    };
  }
}
