import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { CourseService } from '../../services/course-service.ts';
import type { CourseStructureService } from '../../services/course-structure-service.ts';
import type { CourseAutosaveService } from '../../services/course-autosave-service.ts';
import { AgentActivityService } from '../../services/agent-activity-service.ts';
import { DraftRecoveryService } from '../../services/draft-recovery-service.ts';
import type { McpTool, McpToolResult } from '../types.ts';

export function createCourseMutationTools(): McpTool[] {
  return [
    {
      name: 'create_course',
      description: 'Creates a new draft course owned by the author and allowlists it on the current token.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Course title (required, max 200 characters)' },
          description: { type: 'string', description: 'Short course summary' },
          category_id: { type: 'string', description: 'Category identifier' },
          tags: { type: 'array', items: { type: 'string' }, description: 'At most 5 tags' },
          difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'], description: 'Course level' },
        },
        required: ['title'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'courses:create',
    },
    {
      name: 'update_course_metadata',
      description: 'Updates metadata of an existing draft course with optimistic concurrency check.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID to update' },
          expected_revision: { type: 'integer', description: 'Current draft_revision for conflict prevention' },
          metadata: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              category_id: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
              language: { type: 'string' },
              prerequisites: { type: 'string' },
              learning_outcomes: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        required: ['course_id', 'expected_revision', 'metadata'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'create_module',
      description: 'Creates a module in the course hierarchy.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          title: { type: 'string', description: 'Module title' },
          position: { type: 'integer', description: 'Zero-based position index' },
        },
        required: ['course_id', 'title'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'update_module',
      description: 'Renames a module in the course.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          module_id: { type: 'string', description: 'Module ID' },
          title: { type: 'string', description: 'New module title' },
        },
        required: ['course_id', 'module_id', 'title'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'delete_module',
      description: 'Deletes a module. If the module contains lessons, confirm_delete_children must be true.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          module_id: { type: 'string', description: 'Module ID' },
          confirm_delete_children: { type: 'boolean', description: 'Must be true if module contains lessons' },
        },
        required: ['course_id', 'module_id'],
      },
      annotations: {
        destructive: true,
      },
      requiredScope: 'content:delete',
    },
    {
      name: 'create_lesson',
      description: 'Creates a lesson under a specified module.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          module_id: { type: 'string', description: 'Parent module ID' },
          title: { type: 'string', description: 'Lesson title' },
          description: { type: 'string', description: 'Optional lesson description' },
          position: { type: 'integer', description: 'Zero-based position index' },
        },
        required: ['course_id', 'module_id', 'title'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'update_lesson',
      description: 'Updates a lesson title and description.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          lesson_id: { type: 'string', description: 'Lesson ID' },
          title: { type: 'string', description: 'Lesson title' },
          description: { type: 'string', description: 'Lesson description' },
        },
        required: ['course_id', 'lesson_id', 'title'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'delete_lesson',
      description: 'Deletes a lesson. If the lesson contains steps, confirm_delete_children must be true.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          lesson_id: { type: 'string', description: 'Lesson ID' },
          confirm_delete_children: { type: 'boolean', description: 'Must be true if lesson contains steps' },
        },
        required: ['course_id', 'lesson_id'],
      },
      annotations: {
        destructive: true,
      },
      requiredScope: 'content:delete',
    },
    {
      name: 'create_step',
      description: 'Creates a step (theory, video, quiz, or python) in a lesson with 1-20 steps limit.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          lesson_id: { type: 'string', description: 'Lesson ID' },
          title: { type: 'string', description: 'Step title' },
          type: { type: 'string', enum: ['theory', 'video', 'quiz', 'python'], description: 'Step type' },
          position: { type: 'integer', description: 'Zero-based position' },
          is_required: { type: 'boolean', description: 'Whether required for course completion (default true)' },
          estimated_duration_minutes: { type: 'integer', description: 'Estimated time in minutes' },
          content: { type: 'object', description: 'Optional step content payload matching step type' },
          test_cases: {
            type: 'array',
            description: 'Optional test cases for python exercises',
            items: {
              type: 'object',
              required: ['stdin', 'expected_stdout'],
              properties: {
                stdin: { type: 'string' },
                expected_stdout: { type: 'string' },
                is_hidden: { type: 'boolean' },
              },
            },
          },
        },
        required: ['course_id', 'lesson_id', 'title', 'type'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'update_step',
      description: 'Updates a step metadata and optionally its content payload.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          step_id: { type: 'string', description: 'Step ID' },
          expected_revision: { type: 'integer', description: 'Expected revision of the step content' },
          title: { type: 'string', description: 'New step title' },
          is_required: { type: 'boolean', description: 'Whether required' },
          estimated_duration_minutes: { type: 'integer', description: 'Estimated duration in minutes' },
          content: { type: 'object', description: 'New step content payload' },
          test_cases: {
            type: 'array',
            description: 'New test cases for python exercises',
            items: {
              type: 'object',
              required: ['stdin', 'expected_stdout'],
              properties: {
                stdin: { type: 'string' },
                expected_stdout: { type: 'string' },
                is_hidden: { type: 'boolean' },
              },
            },
          },
        },
        required: ['course_id', 'step_id'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'delete_step',
      description: 'Deletes a step from a lesson.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          step_id: { type: 'string', description: 'Step ID' },
        },
        required: ['course_id', 'step_id'],
      },
      annotations: {
        destructive: true,
      },
      requiredScope: 'content:delete',
    },
    {
      name: 'duplicate_step',
      description: 'Duplicates an existing step into the same lesson with fresh IDs.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          step_id: { type: 'string', description: 'Step ID to duplicate' },
        },
        required: ['course_id', 'step_id'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
  ];
}

export async function executeCourseMutationTool(
  name: string,
  args: any,
  token: ValidatedMcpToken,
  db: DatabaseSync,
  authService: McpAuthService,
  courseService: CourseService,
  structureService: CourseStructureService,
  autosaveService: CourseAutosaveService,
  activityService?: AgentActivityService,
  recoveryService?: DraftRecoveryService
): Promise<McpToolResult> {
  const actService = activityService || new AgentActivityService(db);
  const recService = recoveryService || new DraftRecoveryService(db);

  switch (name) {
    case 'create_course': {
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

    case 'update_course_metadata': {
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

    case 'create_module': {
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

    case 'update_module': {
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

    case 'delete_module': {
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

    case 'create_lesson': {
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

    case 'update_lesson': {
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

    case 'delete_lesson': {
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

    case 'create_step': {
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

    case 'update_step': {
      const courseId = args?.course_id?.trim();
      const stepId = args?.step_id?.trim();
      if (!courseId) throw new ValidationError('course_id is required');
      if (!stepId) throw new ValidationError('step_id is required');

      authService.verifyMcpPermission(token, 'content:write', courseId);

      const priorCourse = courseService.getCourse(token.authorId, courseId);

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

    case 'delete_step': {
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

    case 'duplicate_step': {
      const courseId = args?.course_id?.trim();
      const stepId = args?.step_id?.trim();
      if (!courseId) throw new ValidationError('course_id is required');
      if (!stepId) throw new ValidationError('step_id is required');

      authService.verifyMcpPermission(token, 'content:write', courseId);

      const priorCourse = courseService.getCourse(token.authorId, courseId);
      const result = structureService.duplicateStep(token.authorId, courseId, stepId);
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

    default:
      throw new ValidationError(`Unknown course mutation tool: ${name}`);
  }
}
