import { DatabaseSync } from 'node:sqlite';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { CourseLifecycleService } from '../../services/course-lifecycle-service.ts';
import type { McpTool, McpToolResult } from '../types.ts';

export function createLifecycleTools(): McpTool[] {
  return [
    {
      name: 'set_course_access',
      description: 'Configures live course visibility (public, unlisted, private) and enrollment policy (open, invitation_only).',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          visibility: { type: 'string', enum: ['public', 'unlisted', 'private'], description: 'Discovery visibility' },
          enrollment_policy: { type: 'string', enum: ['open', 'invitation_only'], description: 'Joining policy' },
        },
        required: ['course_id', 'visibility', 'enrollment_policy'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'courses:manage',
    },
    {
      name: 'archive_course',
      description: 'Archives a course, stopping new enrollments while allowing active learners to continue.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID to archive' },
        },
        required: ['course_id'],
      },
      annotations: {
        destructive: true,
      },
      requiredScope: 'courses:manage',
    },
    {
      name: 'restore_course',
      description: 'Restores an archived course back to published or draft status.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID to restore' },
        },
        required: ['course_id'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'courses:manage',
    },
    {
      name: 'delete_draft_course',
      description: 'Permanently deletes a never-published draft course. Published courses cannot be deleted and must be archived instead.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID of the never-published draft to delete' },
        },
        required: ['course_id'],
      },
      annotations: {
        destructive: true,
      },
      requiredScope: 'content:delete',
    },
  ];
}

export async function executeLifecycleTool(
  name: string,
  args: any,
  token: ValidatedMcpToken,
  db: DatabaseSync,
  authService: McpAuthService,
  lifecycleService: CourseLifecycleService
): Promise<McpToolResult> {
  switch (name) {
    case 'set_course_access': {
      const courseId = args?.course_id?.trim();
      const visibility = args?.visibility;
      const enrollmentPolicy = args?.enrollment_policy;

      if (!courseId) throw new ValidationError('course_id is required');
      if (!visibility) throw new ValidationError('visibility is required');
      if (!enrollmentPolicy) throw new ValidationError('enrollment_policy is required');

      authService.verifyMcpPermission(token, 'courses:manage', courseId);

      const updated = lifecycleService.setCourseAccessPolicy(token.authorId, courseId, {
        visibility,
        enrollmentPolicy,
      });

      const effectSummary = `Visibility set to ${visibility} and enrollment policy set to ${enrollmentPolicy}. Existing enrollments remain pinned.`;

      return {
        content: [{ type: 'text', text: JSON.stringify({ ...updated, effectSummary }, null, 2) }],
      };
    }

    case 'archive_course': {
      const courseId = args?.course_id?.trim();
      if (!courseId) throw new ValidationError('course_id is required');

      authService.verifyMcpPermission(token, 'courses:manage', courseId);

      const archived = lifecycleService.archiveCourse(token.authorId, courseId);
      return {
        content: [{ type: 'text', text: JSON.stringify(archived, null, 2) }],
      };
    }

    case 'restore_course': {
      const courseId = args?.course_id?.trim();
      if (!courseId) throw new ValidationError('course_id is required');

      authService.verifyMcpPermission(token, 'courses:manage', courseId);

      const restored = lifecycleService.restoreCourse(token.authorId, courseId);
      return {
        content: [{ type: 'text', text: JSON.stringify(restored, null, 2) }],
      };
    }

    case 'delete_draft_course': {
      const courseId = args?.course_id?.trim();
      if (!courseId) throw new ValidationError('course_id is required');

      authService.verifyMcpPermission(token, 'content:delete', courseId);

      const result = lifecycleService.deleteCourseDraft(token.authorId, courseId);
      return {
        content: [{ type: 'text', text: JSON.stringify({ ...result, course_id: courseId }, null, 2) }],
      };
    }

    default:
      throw new ValidationError(`Unknown lifecycle tool: ${name}`);
  }
}
