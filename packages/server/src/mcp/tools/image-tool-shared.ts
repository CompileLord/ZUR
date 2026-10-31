import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { ValidationError, ConflictError } from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpToolResult } from '../types.ts';

export const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per PRD §11 & §23.5
export const MAX_INLINE_BASE64_BYTES = 1024 * 1024; // 1 MiB decoded per PRD §23.5

export function imageMutationIdentity(name: string, args: any, token: ValidatedMcpToken, db: DatabaseSync): {
  key: string; digest: string; prior: McpToolResult | null;
} {
  const key = args?.idempotency_key?.trim();
  if (!key) throw new ValidationError('idempotency_key is required');
  const expected = Number(args?.expected_revision);
  if (!Number.isInteger(expected)) throw new ValidationError('expected_revision integer is required');
  const canonical = { ...args };
  delete canonical.idempotency_key;
  const digest = crypto.createHash('sha256').update(JSON.stringify({ name, canonical })).digest('hex');
  const row = db.prepare('SELECT request_digest, affected_entities FROM agent_mutations WHERE token_id = ? AND idempotency_key = ?')
    .get(token.id, key) as { request_digest: string; affected_entities: string } | undefined;
  if (row && row.request_digest !== digest) throw new ConflictError('Idempotency key has already been used with different request parameters.');
  return { key, digest, prior: row ? JSON.parse(row.affected_entities) as McpToolResult : null };
}

export function saveImageMutation(name: string, courseId: string, baseRevision: number, result: McpToolResult,
  token: ValidatedMcpToken, db: DatabaseSync, identity: { key: string; digest: string }): void {
  db.prepare(`INSERT INTO agent_mutations
    (id, token_id, author_id, course_id, tool_name, idempotency_key, base_revision, new_revision,
     affected_entities, outcome, request_digest)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', ?)`)
    .run(crypto.randomUUID(), token.id, token.authorId, courseId, name, identity.key, baseRevision,
      baseRevision + 1, JSON.stringify(result), identity.digest);
}
