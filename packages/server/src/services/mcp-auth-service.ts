import { DatabaseSync } from 'node:sqlite';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ScopeRequiredError,
  TOKEN_SCOPE_PRESETS,
  type TokenScope,
} from 'zur-shared';
import type { ValidatedMcpToken } from './mcp-token-service.ts';

export { TOKEN_SCOPE_PRESETS };

export class McpAuthService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }


  verifyMcpPermission(token: ValidatedMcpToken, requiredScope: TokenScope, courseId?: string): void {
    const tokenRow = this.db.prepare(`
      SELECT id, author_id, scopes, course_restrictions, expires_at, is_revoked
      FROM author_access_tokens
      WHERE id = ?
    `).get(token.id) as any;

    if (!tokenRow) {
      throw new AuthenticationError('Token not found or invalid.');
    }

    if (tokenRow.is_revoked) {
      throw new AuthenticationError('Token has been revoked.');
    }

    if (new Date(tokenRow.expires_at) <= new Date()) {
      throw new AuthenticationError('Token has expired.');
    }

    const currentScopes: TokenScope[] = JSON.parse(tokenRow.scopes || '[]');
    if (!currentScopes.includes(requiredScope)) {
      throw new ScopeRequiredError(requiredScope);
    }

    const author = this.db.prepare(`
      SELECT id, capabilities, account_status, email_verified
      FROM users
      WHERE id = ?
    `).get(token.authorId) as any;

    if (!author || author.account_status !== 'active' || !author.email_verified) {
      throw new AuthorizationError('Author account is not active or verified.');
    }

    const capabilities: string[] = JSON.parse(author.capabilities || '[]');
    if (!capabilities.includes('author')) {
      throw new AuthorizationError('Author capability is required.');
    }

    if (courseId) {
      if (tokenRow.course_restrictions !== null) {
        const restrictions: string[] = JSON.parse(tokenRow.course_restrictions || '[]');
        if (!restrictions.includes(courseId)) {
          throw new AuthorizationError('Course is not in allowed course restrictions for this token.');
        }
      }

      const course = this.db.prepare(`
        SELECT id, owner_id, is_suspended FROM courses WHERE id = ?
      `).get(courseId) as any;

      if (!course || course.owner_id !== token.authorId) {
        throw new NotFoundError("This page isn't available.");
      }

      if (course.is_suspended) {
        throw new AuthorizationError('Course is suspended.');
      }
    }
  }

  allowlistCreatedCourse(tokenId: string, newCourseId: string): string[] | null {
    const row = this.db.prepare(`
      SELECT id, scopes, course_restrictions
      FROM author_access_tokens
      WHERE id = ?
    `).get(tokenId) as any;

    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    const scopes: TokenScope[] = JSON.parse(row.scopes || '[]');
    if (!scopes.includes('courses:create')) {
      throw new ScopeRequiredError('courses:create', 'Token lacks courses:create permission to register a new course.');
    }

    if (row.course_restrictions === null) {
      return null;
    }

    const existingList: string[] = JSON.parse(row.course_restrictions || '[]');
    if (!existingList.includes(newCourseId)) {
      existingList.push(newCourseId);
      this.db.prepare(`
        UPDATE author_access_tokens
        SET course_restrictions = ?
        WHERE id = ?
      `).run(JSON.stringify(existingList), tokenId);
    }

    return existingList;
  }

  preventSelfExpansion(
    token: ValidatedMcpToken,
    requestedScopes?: TokenScope[],
    requestedCourseIds?: string[]
  ): void {
    if (requestedScopes) {
      for (const scope of requestedScopes) {
        if (!token.scopes.includes(scope)) {
          throw new AuthorizationError(`Token cannot self-expand permissions to include scope: ${scope}`);
        }
      }
    }

    if (requestedCourseIds && token.courseRestrictions !== null) {
      for (const courseId of requestedCourseIds) {
        if (!token.courseRestrictions.includes(courseId)) {
          throw new AuthorizationError('Token cannot self-expand course restrictions.');
        }
      }
    }
  }
}
