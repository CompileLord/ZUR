import { DatabaseSync } from 'node:sqlite';
import { ValidationError } from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { CourseService } from '../../services/course-service.ts';
import type { CourseStructureService } from '../../services/course-structure-service.ts';
import type { CourseAutosaveService } from '../../services/course-autosave-service.ts';
import type { McpToolResult } from '../types.ts';
import type { CourseMutationContext } from './course-mutation-shared.ts';
export { createCourseMutationTools } from './course-mutation-definitions.ts';
import { AgentActivityService } from '../../services/agent-activity-service.ts';
import { DraftRecoveryService } from '../../services/draft-recovery-service.ts';
import { handleCreateCourse, handleUpdateCourseMetadata, handleCreateModule, handleUpdateModule, handleDeleteModule, handleCreateLesson, handleUpdateLesson, handleDeleteLesson } from './course-structure-mutation-handlers.ts';
import { handleCreateStep, handleUpdateStep, handleDeleteStep, handleDuplicateStep } from './course-step-mutation-handlers.ts';
import { handleMoveContent, handleDuplicateContent } from './course-content-mutation-handlers.ts';

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
  const ctx: CourseMutationContext = { args, token, db, authService, courseService, structureService,
    autosaveService, actService, recService };

  switch (name) {
    case 'create_course':
      return handleCreateCourse(ctx);

    case 'update_course_metadata':
      return handleUpdateCourseMetadata(ctx);

    case 'create_module':
      return handleCreateModule(ctx);

    case 'update_module':
      return handleUpdateModule(ctx);

    case 'delete_module':
      return handleDeleteModule(ctx);

    case 'create_lesson':
      return handleCreateLesson(ctx);

    case 'update_lesson':
      return handleUpdateLesson(ctx);

    case 'delete_lesson':
      return handleDeleteLesson(ctx);

    case 'create_step':
      return handleCreateStep(ctx);

    case 'update_step':
      return handleUpdateStep(ctx);

    case 'delete_step':
      return handleDeleteStep(ctx);

    case 'duplicate_step':
      return handleDuplicateStep(ctx);

    case 'move_content':
      return handleMoveContent(ctx);

    case 'duplicate_content':
      return handleDuplicateContent(ctx);

    default:
      throw new ValidationError(`Unknown course mutation tool: ${name}`);
  }
}
