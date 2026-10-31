import crypto from 'node:crypto';
import { ValidationError } from 'zur-shared';
import type { McpToolResult } from '../types.ts';
import { assertSafeMarkdown } from './course-mutation-shared.ts';
import type { CourseMutationContext } from './course-mutation-shared.ts';

export async function handleCreateStep(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, db, authService, courseService, structureService, autosaveService, actService } = ctx;
  const courseId = args?.course_id?.trim();
  const lessonId = args?.lesson_id?.trim();
  const title = args?.title?.trim();
  const type = args?.type;
  if (!courseId) throw new ValidationError('course_id is required');
  if (!lessonId) throw new ValidationError('lesson_id is required');
  if (!title) throw new ValidationError('title is required');
  if (!type) throw new ValidationError('type is required');

  authService.verifyMcpPermission(token, 'content:write', courseId);

  const priorCourse = courseService.getCourse(token.authorId, courseId);

  if (args.content) {
    assertSafeMarkdown(args.content.markdown || args.content.instructionsMarkdown || args.content.prompt);
  }

  const step = structureService.addStep(token.authorId, courseId, lessonId, {
    title,
    type,
    position: args.position,
    isRequired: args.is_required,
    estimatedDurationMinutes: args.estimated_duration_minutes,
  });

  if (args.content) {
    const stepRow = db.prepare('SELECT revision FROM step_contents WHERE step_id = ?').get(step.id) as any;
    const currentRev = stepRow ? stepRow.revision : 1;
    autosaveService.saveStepContent(token.authorId, step.id, currentRev, args.content);
  }

  if (type === 'python' && Array.isArray(args.test_cases)) {
    const now = new Date().toISOString();
    db.prepare('DELETE FROM test_cases WHERE step_id = ?').run(step.id);
    for (let i = 0; i < args.test_cases.length; i++) {
      const tc = args.test_cases[i];
      db.prepare(
        `INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        step.id,
        tc.stdin ?? '',
        tc.expected_stdout ?? '',
        tc.is_hidden ? 1 : 0,
        i,
        now
      );
    }
  }

  const newCourse = courseService.getCourse(token.authorId, courseId);

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId,
    toolName: 'create_step',
    idempotencyKey: args?.idempotency_key,
    baseRevision: priorCourse.draftRevision,
    newRevision: newCourse.draftRevision,
    affectedEntities: [step.id],
    newContent: { step, content: args.content, testCases: args.test_cases },
    outcome: 'success',
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(step, null, 2) }],
  };
}

export async function handleUpdateStep(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, db, authService, courseService, structureService, autosaveService, actService } = ctx;
  const courseId = args?.course_id?.trim();
  const stepId = args?.step_id?.trim();
  if (!courseId) throw new ValidationError('course_id is required');
  if (!stepId) throw new ValidationError('step_id is required');

  authService.verifyMcpPermission(token, 'content:write', courseId);

  const priorCourse = courseService.getCourse(token.authorId, courseId);

  if (args.content) {
    assertSafeMarkdown(args.content.markdown || args.content.instructionsMarkdown || args.content.prompt);
  }

  const step = structureService.updateStep(token.authorId, courseId, stepId, {
    title: args.title,
    isRequired: args.is_required,
    estimatedDurationMinutes: args.estimated_duration_minutes,
  });

  if (args.content) {
    const stepRow = db.prepare('SELECT revision FROM step_contents WHERE step_id = ?').get(stepId) as any;
    const currentRev = args.expected_revision !== undefined ? Number(args.expected_revision) : (stepRow ? stepRow.revision : 1);
    autosaveService.saveStepContent(token.authorId, stepId, currentRev, args.content);
  }

  if (Array.isArray(args.test_cases)) {
    const now = new Date().toISOString();
    db.prepare('DELETE FROM test_cases WHERE step_id = ?').run(stepId);
    for (let i = 0; i < args.test_cases.length; i++) {
      const tc = args.test_cases[i];
      db.prepare(
        `INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        stepId,
        tc.stdin ?? '',
        tc.expected_stdout ?? '',
        tc.is_hidden ? 1 : 0,
        i,
        now
      );
    }
  }

  const newCourse = courseService.getCourse(token.authorId, courseId);

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId,
    toolName: 'update_step',
    idempotencyKey: args?.idempotency_key,
    baseRevision: priorCourse.draftRevision,
    newRevision: newCourse.draftRevision,
    affectedEntities: [stepId],
    newContent: { step, content: args.content, testCases: args.test_cases },
    outcome: 'success',
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(step, null, 2) }],
  };
}

export async function handleDeleteStep(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, authService, courseService, structureService, actService, recService } = ctx;
  const courseId = args?.course_id?.trim();
  const stepId = args?.step_id?.trim();
  if (!courseId) throw new ValidationError('course_id is required');
  if (!stepId) throw new ValidationError('step_id is required');

  authService.verifyMcpPermission(token, 'content:delete', courseId);

  recService.createSnapshot(token.authorId, courseId, `Auto-backup before deleting step ${stepId}`);
  const priorCourse = courseService.getCourse(token.authorId, courseId);
  const result = structureService.deleteStep(token.authorId, courseId, stepId);
  const newCourse = courseService.getCourse(token.authorId, courseId);

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId,
    toolName: 'delete_step',
    idempotencyKey: args?.idempotency_key,
    baseRevision: priorCourse.draftRevision,
    newRevision: newCourse.draftRevision,
    affectedEntities: [stepId],
    outcome: 'success',
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export async function handleDuplicateStep(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, authService, courseService, structureService, actService } = ctx;
  const courseId = args?.course_id?.trim();
  const stepId = args?.step_id?.trim();
  if (!courseId) throw new ValidationError('course_id is required');
  if (!stepId) throw new ValidationError('step_id is required');

  authService.verifyMcpPermission(token, 'content:write', courseId);

  const priorCourse = courseService.getCourse(token.authorId, courseId);
  const result = structureService.duplicateStep(token.authorId, courseId, stepId);
  authService.verifyMcpPermission(token, 'content:write', courseId);
  const newCourse = courseService.getCourse(token.authorId, courseId);

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId,
    toolName: 'duplicate_step',
    idempotencyKey: args?.idempotency_key,
    baseRevision: priorCourse.draftRevision,
    newRevision: newCourse.draftRevision,
    affectedEntities: [result.id],
    newContent: result,
    outcome: 'success',
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}
