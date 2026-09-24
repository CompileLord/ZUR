import { DatabaseSync } from 'node:sqlite';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { AgentActivityService } from '../../services/agent-activity-service.ts';
import type { DraftRecoveryService } from '../../services/draft-recovery-service.ts';
import type { McpTool, McpToolResult } from '../types.ts';

export function createAgentActivityTools(): McpTool[] {
  return [
    {
      name: 'get_agent_activity',
      description: 'Lists agent mutation receipts and activity history for a course.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          page: { type: 'integer', description: 'Page number (default: 1)' },
          limit: { type: 'integer', description: 'Items per page (default: 20, max: 100)' },
          tool_name: { type: 'string', description: 'Filter by tool name' },
        },
        required: ['course_id'],
      },
      annotations: {
        readOnly: true,
      },
      requiredScope: 'courses:read',
    },
    {
      name: 'restore_draft_revision',
      description: 'Restores a previous draft revision from recovery storage, creating a new draft revision without altering published versions or enrollments.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          revision_id: { type: 'string', description: 'Recovery revision ID to restore' },
          expected_revision: { type: 'integer', description: 'Current draft_revision for conflict prevention' },
        },
        required: ['course_id', 'revision_id', 'expected_revision'],
      },
      annotations: {
        destructive: true,
      },
      requiredScope: 'content:write',
    },
  ];
}

export async function executeAgentActivityTool(
  name: string,
  args: any,
  token: ValidatedMcpToken,
  db: DatabaseSync,
  authService: McpAuthService,
  activityService: AgentActivityService,
  recoveryService: DraftRecoveryService
): Promise<McpToolResult> {
  switch (name) {
    case 'get_agent_activity': {
      const courseId = args?.course_id?.trim();
      if (!courseId) {
        throw new ValidationError('course_id is required');
      }

      authService.verifyMcpPermission(token, 'courses:read', courseId);

      const page = args?.page !== undefined ? Number(args.page) : 1;
      const limit = args?.limit !== undefined ? Number(args.limit) : 20;
      const toolName = args?.tool_name?.trim() || undefined;

      const activity = activityService.listAgentActivity(token.authorId, courseId, {
        page,
        limit,
        toolName,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(activity, null, 2) }],
      };
    }

    case 'restore_draft_revision': {
      const courseId = args?.course_id?.trim();
      if (!courseId) {
        throw new ValidationError('course_id is required');
      }
      const revisionId = args?.revision_id?.trim();
      if (!revisionId) {
        throw new ValidationError('revision_id is required');
      }
      const expectedRevision = Number(args?.expected_revision);
      if (!Number.isInteger(expectedRevision)) {
        throw new ValidationError('expected_revision integer is required');
      }

      authService.verifyMcpPermission(token, 'content:write', courseId);

      const result = recoveryService.restoreDraftRevision(
        token.authorId,
        courseId,
        revisionId,
        expectedRevision
      );

      // Record recovery mutation in agent_mutations
      activityService.recordMutation({
        tokenId: token.id,
        authorId: token.authorId,
        courseId,
        toolName: 'restore_draft_revision',
        baseRevision: expectedRevision,
        newRevision: result.newRevision,
        affectedEntities: [courseId],
        outcome: 'success',
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      throw new ValidationError(`Unsupported activity tool: ${name}`);
  }
}
