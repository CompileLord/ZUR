import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ALL_TOKEN_SCOPES,
  type TokenScope,
  type AuthorAccessToken,
} from 'zur-shared';
import { verifyPassword } from './password-service.ts';

export type TokenStatus = 'never_used' | 'active' | 'expired' | 'revoked';

export interface AuthorTokenSummary {
  id: string;
  authorId: string;
  tokenIdentifier: string;
  label: string;
  scopes: TokenScope[];
  courseRestrictions: string[] | null;
  expiresAt: string;
  isRevoked: boolean;
  lastUsedAt?: string | null;
  createdAt: string;
  status: TokenStatus;
}

export interface CreateTokenOptions {
  password: string;
  label: string;
  scopes: TokenScope[];
  courseRestrictions?: string[] | null;
  expiryDays?: number;
}

export interface ReplaceTokenOptions {
  password: string;
  label?: string;
  scopes?: TokenScope[];
  courseRestrictions?: string[] | null;
  expiryDays?: number;
}

export interface ValidatedMcpToken {
  id: string;
  authorId: string;
  tokenIdentifier: string;
  label: string;
  scopes: TokenScope[];
  courseRestrictions: string[] | null;
  expiresAt: string;
  lastUsedAt?: string | null;
  createdAt: string;
}

export class McpTokenService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }


  private computeStatus(isRevoked: boolean, expiresAt: string, lastUsedAt?: string | null): TokenStatus {
    if (isRevoked) {
      return 'revoked';
    }
    if (new Date(expiresAt) <= new Date()) {
      return 'expired';
    }
    if (lastUsedAt) {
      return 'active';
    }
    return 'never_used';
  }

  createToken(authorId: string, options: CreateTokenOptions): { token: AuthorTokenSummary; rawToken: string } {
    const label = options.label?.trim();
    if (!label) {
      throw new ValidationError('Connection label is required.');
    }

    if (!Array.isArray(options.scopes) || options.scopes.length === 0) {
      throw new ValidationError('At least one scope must be selected.');
    }

    for (const scope of options.scopes) {
      if (!ALL_TOKEN_SCOPES.includes(scope)) {
        throw new ValidationError(`Invalid scope: ${scope}`);
      }
    }

    const expiryDays = options.expiryDays ?? 30;
    if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 90) {
      throw new ValidationError('Expiry must be between 1 and 90 days.');
    }

    const user = this.db.prepare(`
      SELECT id, email_verified, password_hash, capabilities, account_status
      FROM users WHERE id = ?
    `).get(authorId) as any;

    if (!user) {
      throw new NotFoundError("This page isn't available.");
    }

    if (!options.password || !verifyPassword(options.password, user.password_hash)) {
      throw new AuthenticationError('Invalid password.');
    }

    if (user.account_status !== 'active') {
      throw new AuthorizationError('Account must be active to issue AI connection tokens.');
    }

    if (!user.email_verified) {
      throw new AuthorizationError('Email verification is required to issue AI connection tokens.');
    }

    const capabilities: string[] = JSON.parse(user.capabilities || '[]');
    if (!capabilities.includes('author')) {
      throw new AuthorizationError('Author capability is required to issue AI connection tokens.');
    }

    let courseRestrictions: string[] | null = null;
    if (Array.isArray(options.courseRestrictions)) {
      courseRestrictions = Array.from(new Set(options.courseRestrictions.map((id) => id.trim()).filter(Boolean)));
      if (courseRestrictions.length === 0 && !options.scopes.includes('courses:create')) {
        throw new ValidationError('Either select at least one course, enable course creation, or grant access to all owned courses.');
      }

      for (const courseId of courseRestrictions) {
        const course = this.db.prepare(`
          SELECT id, owner_id FROM courses WHERE id = ?
        `).get(courseId) as any;
        if (!course || course.owner_id !== authorId) {
          throw new NotFoundError("This page isn't available.");
        }
      }
    }

    const identifier = `zat_${crypto.randomBytes(8).toString('hex')}`;
    const secret = crypto.randomBytes(32).toString('hex');
    const rawToken = `zur_at_${identifier}_${secret}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const id = `tok-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO author_access_tokens (
        id, author_id, token_identifier, token_hash, label, scopes, course_restrictions, expires_at, is_revoked, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      authorId,
      identifier,
      tokenHash,
      label,
      JSON.stringify(options.scopes),
      courseRestrictions ? JSON.stringify(courseRestrictions) : null,
      expiresAt,
      now
    );

    const token: AuthorTokenSummary = {
      id,
      authorId,
      tokenIdentifier: identifier,
      label,
      scopes: options.scopes,
      courseRestrictions,
      expiresAt,
      isRevoked: false,
      lastUsedAt: null,
      createdAt: now,
      status: 'never_used',
    };

    return { token, rawToken };
  }

  listTokens(authorId: string, statusFilter?: 'all' | 'active' | 'expired' | 'revoked'): AuthorTokenSummary[] {
    const rows = this.db.prepare(`
      SELECT id, author_id, token_identifier, label, scopes, course_restrictions, expires_at, is_revoked, last_used_at, created_at
      FROM author_access_tokens
      WHERE author_id = ?
      ORDER BY created_at DESC
    `).all(authorId) as any[];

    const tokens: AuthorTokenSummary[] = rows.map((row) => {
      const isRevoked = Boolean(row.is_revoked);
      const scopes = JSON.parse(row.scopes || '[]') as TokenScope[];
      const courseRestrictions = row.course_restrictions ? (JSON.parse(row.course_restrictions) as string[]) : null;
      const status = this.computeStatus(isRevoked, row.expires_at, row.last_used_at);

      return {
        id: row.id,
        authorId: row.author_id,
        tokenIdentifier: row.token_identifier,
        label: row.label,
        scopes,
        courseRestrictions,
        expiresAt: row.expires_at,
        isRevoked,
        lastUsedAt: row.last_used_at,
        createdAt: row.created_at,
        status,
      };
    });

    if (statusFilter && statusFilter !== 'all') {
      return tokens.filter((t) => {
        if (statusFilter === 'active') return t.status === 'active' || t.status === 'never_used';
        return t.status === statusFilter;
      });
    }

    return tokens;
  }

  getToken(authorId: string, tokenId: string): AuthorTokenSummary {
    const row = this.db.prepare(`
      SELECT id, author_id, token_identifier, label, scopes, course_restrictions, expires_at, is_revoked, last_used_at, created_at
      FROM author_access_tokens
      WHERE id = ? AND author_id = ?
    `).get(tokenId, authorId) as any;

    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    const isRevoked = Boolean(row.is_revoked);
    const scopes = JSON.parse(row.scopes || '[]') as TokenScope[];
    const courseRestrictions = row.course_restrictions ? (JSON.parse(row.course_restrictions) as string[]) : null;
    const status = this.computeStatus(isRevoked, row.expires_at, row.last_used_at);

    return {
      id: row.id,
      authorId: row.author_id,
      tokenIdentifier: row.token_identifier,
      label: row.label,
      scopes,
      courseRestrictions,
      expiresAt: row.expires_at,
      isRevoked,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      status,
    };
  }

  revokeToken(authorId: string, tokenId: string): void {
    const token = this.db.prepare(`
      SELECT id, author_id FROM author_access_tokens WHERE id = ? AND author_id = ?
    `).get(tokenId, authorId);

    if (!token) {
      throw new NotFoundError("This page isn't available.");
    }

    this.db.prepare(`
      UPDATE author_access_tokens
      SET is_revoked = 1
      WHERE id = ? AND author_id = ?
    `).run(tokenId, authorId);
  }

  replaceToken(authorId: string, tokenId: string, options: ReplaceTokenOptions): { token: AuthorTokenSummary; rawToken: string } {
    const existing = this.getToken(authorId, tokenId);

    if (options.scopes) {
      for (const scope of options.scopes) {
        if (!existing.scopes.includes(scope)) {
          throw new ValidationError('Token replacement cannot widen scope permissions.');
        }
      }
    }

    const label = options.label || existing.label;
    const scopes = options.scopes || existing.scopes;
    const courseRestrictions = options.courseRestrictions !== undefined ? options.courseRestrictions : existing.courseRestrictions;
    const expiryDays = options.expiryDays ?? 30;

    const result = this.createToken(authorId, {
      password: options.password,
      label,
      scopes,
      courseRestrictions,
      expiryDays,
    });

    this.revokeToken(authorId, tokenId);
    return result;
  }

  validateToken(rawToken: string): ValidatedMcpToken {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new AuthenticationError('Invalid token format.');
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    let row = this.db.prepare(`
      SELECT id, author_id, token_identifier, token_hash, label, scopes, course_restrictions, expires_at, is_revoked, last_used_at, created_at
      FROM author_access_tokens
      WHERE token_hash = ?
    `).get(tokenHash) as any;

    if (!row) {
      const match = rawToken.match(/^zur_at_([^_]+)_(.+)$/);
      if (match) {
        const identifier = match[1];
        const secret = match[2];
        const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
        row = this.db.prepare(`
          SELECT id, author_id, token_identifier, token_hash, label, scopes, course_restrictions, expires_at, is_revoked, last_used_at, created_at
          FROM author_access_tokens
          WHERE token_identifier = ? AND (token_hash = ? OR token_hash = ?)
        `).get(identifier, tokenHash, secretHash) as any;
      }
    }

    if (!row) {
      throw new AuthenticationError('Invalid authentication token.');
    }

    if (row.is_revoked) {
      throw new AuthenticationError('Token has been revoked.');
    }

    if (new Date(row.expires_at) <= new Date()) {
      throw new AuthenticationError('Token has expired.');
    }

    const author = this.db.prepare(`
      SELECT id, capabilities, account_status, email_verified
      FROM users
      WHERE id = ?
    `).get(row.author_id) as any;

    if (!author) {
      throw new AuthorizationError('Author account no longer exists.');
    }

    if (author.account_status !== 'active') {
      throw new AuthorizationError('Author account is not active.');
    }

    if (!author.email_verified) {
      throw new AuthorizationError('Author email is unverified.');
    }

    const capabilities: string[] = JSON.parse(author.capabilities || '[]');
    if (!capabilities.includes('author')) {
      throw new AuthorizationError('Author capability is required.');
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE author_access_tokens
      SET last_used_at = ?
      WHERE id = ?
    `).run(now, row.id);

    return {
      id: row.id,
      authorId: row.author_id,
      tokenIdentifier: row.token_identifier,
      label: row.label,
      scopes: JSON.parse(row.scopes || '[]') as TokenScope[],
      courseRestrictions: row.course_restrictions ? (JSON.parse(row.course_restrictions) as string[]) : null,
      expiresAt: row.expires_at,
      lastUsedAt: now,
      createdAt: row.created_at,
    };
  }
}
