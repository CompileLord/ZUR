import { DatabaseSync } from 'node:sqlite';
import { ValidationError, NotFoundError } from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { CourseAutosaveService } from '../../services/course-autosave-service.ts';
import type { MediaService } from '../../services/media-service.ts';
import type { McpTool, McpToolResult } from '../types.ts';

export const CATALOG_READ_TOOL_NAMES = ['list_categories', 'get_step', 'list_media'];

export function createCatalogReadTools(): McpTool[] {
  return [
    {
      name: 'list_categories',
      description: 'Lists the course categories (id, name, slug) that can be used as category_id when creating or updating a course.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnly: true },
      requiredScope: 'courses:read',
    },
    {
      name: 'get_step',
      description: 'Retrieves a single step of an accessible course: metadata, content payload, content revision, and (for Python steps) test cases.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID that contains the step' },
          step_id: { type: 'string', description: 'Step ID' },
        },
        required: ['course_id', 'step_id'],
      },
      annotations: { readOnly: true },
      requiredScope: 'courses:read',
    },
    {
      name: 'list_media',
      description: 'Lists the uploaded image assets of an accessible course (id, MIME type, size, alt text, caption, reference count).',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
        },
        required: ['course_id'],
      },
      annotations: { readOnly: true },
      requiredScope: 'courses:read',
    },
  ];
}

export async function executeCatalogReadTool(
  name: string,
  args: any,
  token: ValidatedMcpToken,
  db: DatabaseSync,
  authService: McpAuthService,
  autosaveService: CourseAutosaveService,
  mediaService: MediaService
): Promise<McpToolResult> {
  switch (name) {
    case 'list_categories': {
      authService.verifyMcpPermission(token, 'courses:read');
      const categories = db.prepare('SELECT id, name, slug FROM categories ORDER BY name ASC').all();
      return { content: [{ type: 'text', text: JSON.stringify({ categories }, null, 2) }] };
    }

    case 'get_step': {
      const courseId = args?.course_id?.trim();
      const stepId = args?.step_id?.trim();
      if (!courseId) throw new ValidationError('course_id is required');
      if (!stepId) throw new ValidationError('step_id is required');

      authService.verifyMcpPermission(token, 'courses:read', courseId);

      // The step must belong to the authorised course (never trust step_id alone).
      const row = db
        .prepare(
          `SELECT s.id, s.lesson_id, s.type, s.title, s.position, s.is_required, s.estimated_duration_minutes
           FROM steps s
           JOIN lessons l ON s.lesson_id = l.id
           JOIN modules m ON l.module_id = m.id
           WHERE s.id = ? AND m.course_id = ?`
        )
        .get(stepId, courseId) as any;
      if (!row) {
        throw new NotFoundError("This page isn't available.");
      }

      let content: unknown = null;
      let revision: number | null = null;
      try {
        const c = autosaveService.getStepContent(token.authorId, stepId);
        content = c.content;
        revision = c.revision;
      } catch {
        content = null;
      }

      const result: Record<string, unknown> = {
        id: row.id,
        lessonId: row.lesson_id,
        type: row.type,
        title: row.title,
        position: row.position,
        isRequired: Boolean(row.is_required),
        estimatedDurationMinutes: row.estimated_duration_minutes,
        content,
        revision,
      };

      if (row.type === 'python') {
        const testCases = db
          .prepare('SELECT id, stdin, expected_stdout, is_hidden, position FROM test_cases WHERE step_id = ? ORDER BY is_hidden ASC, position ASC')
          .all(stepId) as any[];
        result.testCases = testCases.map((tc) => ({
          id: tc.id,
          stdin: tc.stdin,
          expectedStdout: tc.expected_stdout,
          isHidden: Boolean(tc.is_hidden),
          position: tc.position,
        }));
      }

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_media': {
      const courseId = args?.course_id?.trim();
      if (!courseId) throw new ValidationError('course_id is required');

      authService.verifyMcpPermission(token, 'courses:read', courseId);

      const assets = mediaService.listCourseAssets(token.authorId, courseId).map((a) => ({
        asset_id: a.id,
        course_id: a.courseId,
        mime_type: a.mimeType,
        file_size: a.fileSize,
        dimensions: a.dimensions,
        alt_text: a.altText,
        is_decorative: a.isDecorative,
        caption: a.caption,
        status: a.processingStatus,
        reference_count: a.referenceCount,
        markdown_reference: `![${a.isDecorative ? '' : (a.altText || 'image')}](zur-asset:${a.id})`,
        created_at: a.createdAt,
      }));
      return { content: [{ type: 'text', text: JSON.stringify({ course_id: courseId, assets }, null, 2) }] };
    }

    default:
      throw new ValidationError(`Unknown catalog read tool: ${name}`);
  }
}
