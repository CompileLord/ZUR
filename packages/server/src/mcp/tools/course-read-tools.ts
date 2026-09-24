import { DatabaseSync } from 'node:sqlite';
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
import type { McpTool, McpToolResult } from '../types.ts';

export function createCourseReadTools(
  db: DatabaseSync,
  authService: McpAuthService,
  courseService: CourseService,
  structureService: CourseStructureService,
  autosaveService: CourseAutosaveService
): McpTool[] {
  return [
    {
      name: 'get_author_context',
      description: 'Returns the authenticated author profile, token permissions, course restrictions, and platform limits.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      annotations: {
        readOnly: true,
      },
      requiredScope: 'courses:read',
    },
    {
      name: 'list_courses',
      description: 'Returns a paginated list of accessible courses based on token course restrictions and author ownership.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Number of courses to return (1-100, default 20)' },
          offset: { type: 'integer', description: 'Number of courses to skip (default 0)' },
          search: { type: 'string', description: 'Search term for course title or description' },
          status: { type: 'string', enum: ['draft', 'published', 'archived'], description: 'Filter by publication status' },
        },
      },
      annotations: {
        readOnly: true,
      },
      requiredScope: 'courses:read',
    },
    {
      name: 'get_course',
      description: 'Retrieves a single course by ID with specified projection (metadata, outline, or full tree).',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Unique course ID' },
          projection: {
            type: 'string',
            enum: ['metadata', 'outline', 'full'],
            description: 'Detail level: metadata (basic info), outline (module/lesson/step tree), or full (hydrated step contents)',
          },
        },
        required: ['course_id'],
      },
      annotations: {
        readOnly: true,
      },
      requiredScope: 'courses:read',
    },
  ];
}

export async function executeCourseReadTool(
  name: string,
  args: any,
  token: ValidatedMcpToken,
  db: DatabaseSync,
  authService: McpAuthService,
  courseService: CourseService,
  structureService: CourseStructureService,
  autosaveService: CourseAutosaveService
): Promise<McpToolResult> {
  switch (name) {
    case 'get_author_context': {
      authService.verifyMcpPermission(token, 'courses:read');

      const user = db.prepare('SELECT id, display_name, email, capabilities, account_status FROM users WHERE id = ?').get(token.authorId) as any;
      if (!user) {
        throw new NotFoundError("This page isn't available.");
      }

      const result = {
        author: {
          id: user.id,
          displayName: user.display_name,
          email: user.email,
          capabilities: JSON.parse(user.capabilities || '[]'),
          accountStatus: user.account_status,
        },
        token: {
          id: token.id,
          identifier: token.tokenIdentifier,
          label: token.label,
          scopes: token.scopes,
          courseRestrictions: token.courseRestrictions,
          expiresAt: token.expiresAt,
          lastUsedAt: token.lastUsedAt,
        },
        limits: {
          maxBatchOperations: 100,
          maxPayloadBytes: 1048576,
          maxImageBytes: 5242880,
          rateLimitPerMinute: 60,
          maxStepsPerLesson: 20,
        },
        supportedContent: ['theory', 'video', 'quiz', 'python'],
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'list_courses': {
      authService.verifyMcpPermission(token, 'courses:read');

      const limit = Math.min(100, Math.max(1, Number(args?.limit) || 20));
      const offset = Math.max(0, Number(args?.offset) || 0);
      const search = args?.search?.trim();
      const status = args?.status;

      const { courses: ownedCourses } = courseService.listOwnedCourses(token.authorId, {
        limit: 1000,
        offset: 0,
        search,
        status,
      });

      let filtered = ownedCourses;
      if (token.courseRestrictions !== null) {
        const allowedSet = new Set(token.courseRestrictions);
        filtered = ownedCourses.filter((c) => allowedSet.has(c.id));
      }

      const paginated = filtered.slice(offset, offset + limit);

      const result = {
        courses: paginated,
        total: filtered.length,
        limit,
        offset,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'get_course': {
      const courseId = args?.course_id?.trim();
      if (!courseId) {
        throw new ValidationError('course_id is required');
      }

      authService.verifyMcpPermission(token, 'courses:read', courseId);

      const projection = args?.projection || 'metadata';
      const course = courseService.getCourse(token.authorId, courseId);

      if (projection === 'metadata') {
        return {
          content: [{ type: 'text', text: JSON.stringify(course, null, 2) }],
        };
      }

      const tree = structureService.getCourseTree(token.authorId, courseId);

      if (projection === 'outline') {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ...course, structure: tree }, null, 2) }],
        };
      }

      if (projection === 'full') {
        const fullModules = [];
        for (const mod of tree.modules) {
          const fullLessons = [];
          for (const les of mod.lessons) {
            const fullSteps = [];
            for (const step of les.steps) {
              let stepDetail: any = { ...step };
              try {
                const contentResult = autosaveService.getStepContent(token.authorId, step.id);
                stepDetail.content = contentResult.content;
                stepDetail.revision = contentResult.revision;
              } catch {
                stepDetail.content = null;
              }

              if (step.type === 'python') {
                const testCases = db
                  .prepare('SELECT id, stdin, expected_stdout, is_hidden, position FROM test_cases WHERE step_id = ? ORDER BY is_hidden ASC, position ASC')
                  .all(step.id) as any[];
                stepDetail.testCases = testCases.map((tc) => ({
                  id: tc.id,
                  stdin: tc.stdin,
                  expectedStdout: tc.expected_stdout,
                  isHidden: Boolean(tc.is_hidden),
                  position: tc.position,
                }));
              }

              fullSteps.push(stepDetail);
            }
            fullLessons.push({ ...les, steps: fullSteps });
          }
          fullModules.push({ ...mod, lessons: fullLessons });
        }

        const fullCourse = {
          ...course,
          structure: {
            ...tree,
            modules: fullModules,
          },
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(fullCourse, null, 2) }],
        };
      }

      throw new ValidationError(`Invalid projection: ${projection}. Valid values: metadata, outline, full.`);
    }

    default:
      throw new ValidationError(`Unknown course read tool: ${name}`);
  }
}
