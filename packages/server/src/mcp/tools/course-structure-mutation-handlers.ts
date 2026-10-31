import { ValidationError } from 'zur-shared';
import type { McpToolResult } from '../types.ts';
import type { CourseMutationContext } from './course-mutation-shared.ts';

export async function handleCreateCourse(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, authService, courseService, actService } = ctx;
  authService.verifyMcpPermission(token, 'courses:create');

  const title = args?.title?.trim();
  if (!title) {
    throw new ValidationError('title is required');
  }

  const created = courseService.createCourseDraft(token.authorId, { title });

  if (args.description || args.category_id || args.tags || args.difficulty) {
    courseService.updateCourseMetadata(token.authorId, created.id, created.draftRevision, {
      description: args.description,
      categoryId: args.category_id,
      tags: args.tags,
      difficulty: args.difficulty,
    });
  }

  // Automatically allowlist the created course on the token if the token has course restrictions
  authService.allowlistCreatedCourse(token.id, created.id);

  const finalCourse = courseService.getCourse(token.authorId, created.id);

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId: created.id,
    toolName: 'create_course',
    idempotencyKey: args?.idempotency_key,
    baseRevision: 0,
    newRevision: finalCourse.draftRevision,
    affectedEntities: [created.id],
    newContent: finalCourse,
    outcome: 'success',
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(finalCourse, null, 2) }],
  };
}

export async function handleUpdateCourseMetadata(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, authService, courseService, actService } = ctx;
  const courseId = args?.course_id?.trim();
  if (!courseId) throw new ValidationError('course_id is required');
  const expectedRevision = Number(args?.expected_revision);
  if (!Number.isInteger(expectedRevision)) {
    throw new ValidationError('expected_revision integer is required');
  }
  if (!args?.metadata || typeof args.metadata !== 'object') {
    throw new ValidationError('metadata object is required');
  }

  authService.verifyMcpPermission(token, 'content:write', courseId);

  const priorCourse = courseService.getCourse(token.authorId, courseId);

  const updated = courseService.updateCourseMetadata(
    token.authorId,
    courseId,
    expectedRevision,
    {
      title: args.metadata.title,
      description: args.metadata.description,
      categoryId: args.metadata.category_id,
      tags: args.metadata.tags,
      difficulty: args.metadata.difficulty,
      language: args.metadata.language,
      prerequisites: args.metadata.prerequisites,
      learningOutcomes: args.metadata.learning_outcomes,
    }
  );

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId,
    toolName: 'update_course_metadata',
    idempotencyKey: args?.idempotency_key,
    baseRevision: expectedRevision,
    newRevision: updated.draftRevision,
    affectedEntities: [courseId],
    priorContent: priorCourse,
    newContent: updated,
    outcome: 'success',
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
  };
}

export async function handleCreateModule(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, authService, courseService, structureService, actService } = ctx;
  const courseId = args?.course_id?.trim();
  const title = args?.title?.trim();
  if (!courseId) throw new ValidationError('course_id is required');
  if (!title) throw new ValidationError('title is required');

  authService.verifyMcpPermission(token, 'content:write', courseId);

  const priorCourse = courseService.getCourse(token.authorId, courseId);
  const mod = structureService.addModule(token.authorId, courseId, title, args.position);
  const newCourse = courseService.getCourse(token.authorId, courseId);

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId,
    toolName: 'create_module',
    idempotencyKey: args?.idempotency_key,
    baseRevision: priorCourse.draftRevision,
    newRevision: newCourse.draftRevision,
    affectedEntities: [mod.id],
    newContent: mod,
    outcome: 'success',
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(mod, null, 2) }],
  };
}

export async function handleUpdateModule(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, authService, courseService, structureService, actService } = ctx;
  const courseId = args?.course_id?.trim();
  const moduleId = args?.module_id?.trim();
  const title = args?.title?.trim();
  if (!courseId) throw new ValidationError('course_id is required');
  if (!moduleId) throw new ValidationError('module_id is required');
  if (!title) throw new ValidationError('title is required');

  authService.verifyMcpPermission(token, 'content:write', courseId);

  const priorCourse = courseService.getCourse(token.authorId, courseId);
  const mod = structureService.updateModule(token.authorId, courseId, moduleId, title);
  const newCourse = courseService.getCourse(token.authorId, courseId);

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId,
    toolName: 'update_module',
    idempotencyKey: args?.idempotency_key,
    baseRevision: priorCourse.draftRevision,
    newRevision: newCourse.draftRevision,
    affectedEntities: [moduleId],
    newContent: mod,
    outcome: 'success',
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(mod, null, 2) }],
  };
}

export async function handleDeleteModule(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, db, authService, courseService, structureService, actService, recService } = ctx;
  const courseId = args?.course_id?.trim();
  const moduleId = args?.module_id?.trim();
  if (!courseId) throw new ValidationError('course_id is required');
  if (!moduleId) throw new ValidationError('module_id is required');

  authService.verifyMcpPermission(token, 'content:delete', courseId);

  const lessonCount = (
    db.prepare('SELECT COUNT(*) as count FROM lessons WHERE module_id = ?').get(moduleId) as any
  )?.count;

  if (lessonCount > 0 && args.confirm_delete_children !== true) {
    throw new ValidationError('Module contains lessons. Set confirm_delete_children: true to delete.');
  }

  recService.createSnapshot(token.authorId, courseId, `Auto-backup before deleting module ${moduleId}`);
  const priorCourse = courseService.getCourse(token.authorId, courseId);
  const result = structureService.deleteModule(token.authorId, courseId, moduleId);
  const newCourse = courseService.getCourse(token.authorId, courseId);

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId,
    toolName: 'delete_module',
    idempotencyKey: args?.idempotency_key,
    baseRevision: priorCourse.draftRevision,
    newRevision: newCourse.draftRevision,
    affectedEntities: [moduleId],
    outcome: 'success',
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export async function handleCreateLesson(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, authService, courseService, structureService, actService } = ctx;
  const courseId = args?.course_id?.trim();
  const moduleId = args?.module_id?.trim();
  const title = args?.title?.trim();
  if (!courseId) throw new ValidationError('course_id is required');
  if (!moduleId) throw new ValidationError('module_id is required');
  if (!title) throw new ValidationError('title is required');

  authService.verifyMcpPermission(token, 'content:write', courseId);

  const priorCourse = courseService.getCourse(token.authorId, courseId);
  const lesson = structureService.addLesson(
    token.authorId,
    courseId,
    moduleId,
    title,
    args.description,
    args.position
  );
  const newCourse = courseService.getCourse(token.authorId, courseId);

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId,
    toolName: 'create_lesson',
    idempotencyKey: args?.idempotency_key,
    baseRevision: priorCourse.draftRevision,
    newRevision: newCourse.draftRevision,
    affectedEntities: [lesson.id],
    newContent: lesson,
    outcome: 'success',
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(lesson, null, 2) }],
  };
}

export async function handleUpdateLesson(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, authService, courseService, structureService, actService } = ctx;
  const courseId = args?.course_id?.trim();
  const lessonId = args?.lesson_id?.trim();
  const title = args?.title?.trim();
  if (!courseId) throw new ValidationError('course_id is required');
  if (!lessonId) throw new ValidationError('lesson_id is required');
  if (!title) throw new ValidationError('title is required');

  authService.verifyMcpPermission(token, 'content:write', courseId);

  const priorCourse = courseService.getCourse(token.authorId, courseId);
  const lesson = structureService.updateLesson(token.authorId, courseId, lessonId, title, args.description);
  const newCourse = courseService.getCourse(token.authorId, courseId);

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId,
    toolName: 'update_lesson',
    idempotencyKey: args?.idempotency_key,
    baseRevision: priorCourse.draftRevision,
    newRevision: newCourse.draftRevision,
    affectedEntities: [lessonId],
    newContent: lesson,
    outcome: 'success',
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(lesson, null, 2) }],
  };
}

export async function handleDeleteLesson(ctx: CourseMutationContext): Promise<McpToolResult> {
  const { args, token, db, authService, courseService, structureService, actService, recService } = ctx;
  const courseId = args?.course_id?.trim();
  const lessonId = args?.lesson_id?.trim();
  if (!courseId) throw new ValidationError('course_id is required');
  if (!lessonId) throw new ValidationError('lesson_id is required');

  authService.verifyMcpPermission(token, 'content:delete', courseId);

  const stepCount = (
    db.prepare('SELECT COUNT(*) as count FROM steps WHERE lesson_id = ?').get(lessonId) as any
  )?.count;

  if (stepCount > 0 && args.confirm_delete_children !== true) {
    throw new ValidationError('Lesson contains steps. Set confirm_delete_children: true to delete.');
  }

  recService.createSnapshot(token.authorId, courseId, `Auto-backup before deleting lesson ${lessonId}`);
  const priorCourse = courseService.getCourse(token.authorId, courseId);
  const result = structureService.deleteLesson(token.authorId, courseId, lessonId);
  const newCourse = courseService.getCourse(token.authorId, courseId);

  actService.recordMutation({
    tokenId: token.id,
    authorId: token.authorId,
    courseId,
    toolName: 'delete_lesson',
    idempotencyKey: args?.idempotency_key,
    baseRevision: priorCourse.draftRevision,
    newRevision: newCourse.draftRevision,
    affectedEntities: [lessonId],
    outcome: 'success',
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}
