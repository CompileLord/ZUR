import { DatabaseSync } from 'node:sqlite';
import { ValidationError } from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { CourseService } from '../../services/course-service.ts';
import type { CourseStructureService } from '../../services/course-structure-service.ts';
import type { CourseAutosaveService } from '../../services/course-autosave-service.ts';
import type { AgentActivityService } from '../../services/agent-activity-service.ts';
import type { DraftRecoveryService } from '../../services/draft-recovery-service.ts';

export interface CourseMutationContext {
  args: any;
  token: ValidatedMcpToken;
  db: DatabaseSync;
  authService: McpAuthService;
  courseService: CourseService;
  structureService: CourseStructureService;
  autosaveService: CourseAutosaveService;
  actService: AgentActivityService;
  recService: DraftRecoveryService;
}

export function assertSafeMarkdown(text?: string): void {
if (!text || typeof text !== 'string') return;
if (/<script/i.test(text) || /javascript:/i.test(text) || /<\/?(iframe|object|embed)/i.test(text)) {
  throw new ValidationError('Unsafe Markdown containing dangerous script or HTML tags is rejected.');
}
if (/!\[.*?\]\((https?:\/\/[^)]+)\)/i.test(text)) {
  throw new ValidationError('External image URLs in Markdown are rejected. Use zur-asset references.');
}
}

/**
 * CourseStructureService.moveContent writes the requested position verbatim, which leaves
 * ties with siblings (and therefore an unchanged order). After a move, renumber the
 * destination siblings 0..n-1 so the moved node really lands at the requested index.
 */
export function renumberSiblingsAfterMove(
  db: DatabaseSync,
  contentType: 'module' | 'lesson' | 'step',
  id: string,
  requestedPosition: number | undefined
): void {
  const spec = {
    module: { table: 'modules', parent: 'course_id' },
    lesson: { table: 'lessons', parent: 'module_id' },
    step: { table: 'steps', parent: 'lesson_id' },
  }[contentType];
  if (!spec) return;
  const row = db.prepare(`SELECT ${spec.parent} AS parent_id FROM ${spec.table} WHERE id = ?`).get(id) as { parent_id: string } | undefined;
  if (!row) return;
  const siblings = db
    .prepare(`SELECT id FROM ${spec.table} WHERE ${spec.parent} = ? AND id != ? ORDER BY position ASC, created_at ASC`)
    .all(row.parent_id, id) as Array<{ id: string }>;
  const ordered = siblings.map((x) => x.id);
  if (requestedPosition === undefined) {
    // No explicit target index: keep the node's existing rank among its (possibly new) siblings.
    const all = db
      .prepare(`SELECT id FROM ${spec.table} WHERE ${spec.parent} = ? ORDER BY position ASC, created_at ASC`)
      .all(row.parent_id) as Array<{ id: string }>;
    ordered.length = 0;
    ordered.push(...all.map((x) => x.id));
  } else {
    ordered.splice(Math.max(0, Math.min(requestedPosition, ordered.length)), 0, id);
  }
  const update = db.prepare(`UPDATE ${spec.table} SET position = ? WHERE id = ?`);
  ordered.forEach((sid, i) => update.run(i, sid));
}
