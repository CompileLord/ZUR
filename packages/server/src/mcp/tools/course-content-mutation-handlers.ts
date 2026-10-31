import { ValidationError, StaleRevisionError } from 'zur-shared';
import type { McpToolResult } from '../types.ts';
import { renumberSiblingsAfterMove } from './course-mutation-shared.ts';
import type { CourseMutationContext } from './course-mutation-shared.ts';

export async function handleMoveContent(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, db, authService, courseService, structureService, actService, recService } = ctx;
  const courseId = args?.course_id?.trim();
  const contentType = args?.content_type?.trim();
  const id = args?.id?.trim();
  const targetParentId = args?.target_parent_id?.trim() || undefined;
  const rawPosition = args?.position ?? args?.new_position;
  const position = rawPosition !== undefined ? Number(rawPosition) : undefined;
  const expectedRevision = args?.expected_revision !== undefined ? Number(args.expected_revision) : undefined;

  if (!courseId) throw new ValidationError('course_id is required');
  if (!contentType) throw new ValidationError('content_type is required');
  if (!id) throw new ValidationError('id is required');

  authService.verifyMcpPermission(token, 'content:write', courseId);

  const priorCourse = courseService.getCourse(token.authorId, courseId);
  if (expectedRevision !== undefined && priorCourse.draftRevision !== expectedRevision) {
    throw new StaleRevisionError(
      'Course revision conflict',
      priorCourse.draftRevision,
      { courseId, currentRevision: priorCourse.draftRevision }
    );
  }

  recService.createSnapshot(token.authorId, courseId, `Auto-backup before moving ${contentType} ${id}`);
  const result = structureService.moveContent(token.authorId, courseId, contentType as any, id, targetParentId, position);
  renumberSiblingsAfterMove(db, contentType as any, id, position);
  authService.verifyMcpPermission(token, 'content:write', courseId);

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId,
    toolName: 'move_content',
    idempotencyKey: args?.idempotency_key,
    baseRevision: priorCourse.draftRevision,
    newRevision: result.newRevision,
    affectedEntities: [id],
    newContent: { contentType, id, targetParentId, position },
    outcome: 'success',
  });

  const response = {
    ...result,
    content_type: contentType,
    id,
    new_parent_id: targetParentId,
    new_position: position,
    draft_revision: result.newRevision,
    new_revision: result.newRevision,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
  };
}

export async function handleDuplicateContent(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, authService, courseService, structureService, actService, recService } = ctx;
  const courseId = args?.course_id?.trim();
  const contentType = args?.content_type?.trim();
  const id = args?.id?.trim();
  const targetParentId = args?.target_parent_id?.trim() || undefined;
  const expectedRevision = args?.expected_revision !== undefined ? Number(args.expected_revision) : undefined;

  if (!courseId) throw new ValidationError('course_id is required');
  if (!contentType) throw new ValidationError('content_type is required');
  if (!id) throw new ValidationError('id is required');

  authService.verifyMcpPermission(token, 'content:write', courseId);

  const priorCourse = courseService.getCourse(token.authorId, courseId);
  if (expectedRevision !== undefined && priorCourse.draftRevision !== expectedRevision) {
    throw new StaleRevisionError(
      'Course revision conflict',
      priorCourse.draftRevision,
      { courseId, currentRevision: priorCourse.draftRevision }
    );
  }

  recService.createSnapshot(token.authorId, courseId, `Auto-backup before duplicating ${contentType} ${id}`);
  const result = structureService.duplicateContent(token.authorId, courseId, contentType as any, id, targetParentId);
  authService.verifyMcpPermission(token, 'content:write', courseId);

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId,
    toolName: 'duplicate_content',
    idempotencyKey: args?.idempotency_key,
    baseRevision: priorCourse.draftRevision,
    newRevision: result.newRevision,
    affectedEntities: [result.createdId],
    newContent: result.createdSummary,
    outcome: 'success',
  });

  const response = {
    ...result,
    content_type: contentType,
    id,
    duplicate_id: result.createdId,
    created_id: result.createdId,
    draft_revision: result.newRevision,
    new_revision: result.newRevision,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
  };
}
