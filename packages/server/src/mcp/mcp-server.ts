import { DatabaseSync } from 'node:sqlite';
import {
  ZURError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  StaleRevisionError,
  RateLimitError,
} from 'zur-shared';
import type { ValidatedMcpToken } from '../services/mcp-token-service.ts';
import { McpTokenService } from '../services/mcp-token-service.ts';
import { McpAuthService } from '../services/mcp-auth-service.ts';
import { CourseService } from '../services/course-service.ts';
import { CourseStructureService } from '../services/course-structure-service.ts';
import { CourseAutosaveService } from '../services/course-autosave-service.ts';
import { MediaService } from '../services/media-service.ts';
import { CourseValidationService } from '../services/course-validation-service.ts';
import { CoursePublicationService } from '../services/course-publication-service.ts';
import { CourseLifecycleService } from '../services/course-lifecycle-service.ts';
import { McpRateLimiter } from './mcp-rate-limiter.ts';
import { listMcpResources, readMcpResource } from './resources.ts';
import {
  createCourseReadTools,
  executeCourseReadTool,
} from './tools/course-read-tools.ts';
import {
  createCourseMutationTools,
  executeCourseMutationTool,
} from './tools/course-mutation-tools.ts';
import {
  createImageTools,
  executeImageTool,
} from './tools/image-tools.ts';
import {
  createAssessmentPublicationTools,
  executeAssessmentPublicationTool,
} from './tools/assessment-publication-tools.ts';
import {
  createLifecycleTools,
  executeLifecycleTool,
} from './tools/lifecycle-tools.ts';
import {
  createBatchAuthoringTools,
  executeBatchAuthorTool,
} from './tools/batch-authoring-tool.ts';
import {
  JSON_RPC_ERRORS,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpTool,
  type McpToolResult,
} from './types.ts';

export class McpServer {
  private db: DatabaseSync;
  private tokenService: McpTokenService;
  private authService: McpAuthService;
  private courseService: CourseService;
  private structureService: CourseStructureService;
  private autosaveService: CourseAutosaveService;
  private mediaService: MediaService;
  private validationService: CourseValidationService;
  private publicationService: CoursePublicationService;
  private lifecycleService: CourseLifecycleService;
  private rateLimiter: McpRateLimiter;
  private tools: Map<string, McpTool> = new Map();

  constructor(
    db: DatabaseSync,
    rateLimiter?: McpRateLimiter
  ) {
    this.db = db;
    this.tokenService = new McpTokenService(db);
    this.authService = new McpAuthService(db);
    this.courseService = new CourseService(db);
    this.structureService = new CourseStructureService(db);
    this.autosaveService = new CourseAutosaveService(db);
    this.mediaService = new MediaService(db);
    this.validationService = new CourseValidationService(db);
    this.publicationService = new CoursePublicationService(db);
    this.lifecycleService = new CourseLifecycleService(db);
    this.rateLimiter = rateLimiter || new McpRateLimiter();

    this.registerTools();
  }

  getRateLimiter(): McpRateLimiter {
    return this.rateLimiter;
  }

  getTokenService(): McpTokenService {
    return this.tokenService;
  }

  private registerTools(): void {
    const allTools: McpTool[] = [
      ...createCourseReadTools(
        this.db,
        this.authService,
        this.courseService,
        this.structureService,
        this.autosaveService
      ),
      ...createCourseMutationTools(),
      ...createImageTools(),
      ...createAssessmentPublicationTools(),
      ...createLifecycleTools(),
      ...createBatchAuthoringTools(),
    ];

    for (const tool of allTools) {
      this.tools.set(tool.name, tool);
    }
  }

  getTool(name: string): McpTool | undefined {
    return this.tools.get(name);
  }

  listTools(): McpTool[] {
    return Array.from(this.tools.values());
  }

  async handleJsonRpcMessage(
    token: ValidatedMcpToken,
    message: any
  ): Promise<JsonRpcResponse | null> {
    if (!message || typeof message !== 'object') {
      return {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: 'Invalid Request: message must be an object',
        },
      };
    }

    if (message.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: message.id ?? null,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: 'Invalid Request: jsonrpc must be "2.0"',
        },
      };
    }

    const { id, method, params } = message;
    const isNotification = id === undefined || id === null;

    if (!method || typeof method !== 'string') {
      return {
        jsonrpc: '2.0',
        id: id ?? null,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: 'Invalid Request: method is required',
        },
      };
    }

    try {
      const result = await this.executeMethod(token, method, params);

      if (isNotification) {
        return null;
      }

      return {
        jsonrpc: '2.0',
        id,
        result,
      };
    } catch (err: any) {
      if (isNotification) {
        return null;
      }

      const jsonRpcError = this.mapErrorToJsonRpc(err);
      return {
        jsonrpc: '2.0',
        id,
        error: jsonRpcError,
      };
    }
  }

  private async executeMethod(
    token: ValidatedMcpToken,
    method: string,
    params: any
  ): Promise<any> {
    switch (method) {
      case 'initialize': {
        const clientVersion = params?.protocolVersion || '2024-11-05';
        return {
          protocolVersion: clientVersion,
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: {
            name: 'zur-mcp-server',
            version: '1.0.0',
          },
        };
      }

      case 'notifications/initialized': {
        return {};
      }

      case 'ping': {
        return {};
      }

      case 'resources/list': {
        return {
          resources: listMcpResources(),
        };
      }

      case 'resources/read': {
        const uri = params?.uri;
        if (!uri || typeof uri !== 'string') {
          throw new ValidationError('uri parameter is required');
        }

        const resource = readMcpResource(uri);
        if (!resource) {
          throw new NotFoundError(`Resource not found: ${uri}`);
        }

        return {
          contents: [resource],
        };
      }

      case 'tools/list': {
        const tools = Array.from(this.tools.values()).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations,
        }));

        return { tools };
      }

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        if (!toolName || typeof toolName !== 'string') {
          throw new ValidationError('name parameter is required for tools/call');
        }

        const tool = this.tools.get(toolName);
        if (!tool) {
          const err: any = new Error(`Tool not found: ${toolName}`);
          err.code = JSON_RPC_ERRORS.METHOD_NOT_FOUND;
          throw err;
        }

        if (tool.requiredScope) {
          try {
            this.authService.verifyMcpPermission(token, tool.requiredScope);
          } catch (scopeErr: any) {
            return {
              content: [{ type: 'text', text: scopeErr.message || `Scope ${tool.requiredScope} is required` }],
              isError: true,
            };
          }
        }

        const acquired = this.rateLimiter.acquireConcurrency(token.authorId);
        if (!acquired) {
          throw new RateLimitError('Too many concurrent tool executions for this author. Please wait.', 1);
        }

        try {
          return await this.dispatchTool(toolName, toolArgs, token);
        } finally {
          this.rateLimiter.releaseConcurrency(token.authorId);
        }
      }

      default: {
        const err: any = new Error(`Method not found: ${method}`);
        err.code = JSON_RPC_ERRORS.METHOD_NOT_FOUND;
        throw err;
      }
    }
  }

  private async dispatchTool(
    name: string,
    args: any,
    token: ValidatedMcpToken
  ): Promise<McpToolResult> {
    try {
      if (['get_author_context', 'list_courses', 'get_course'].includes(name)) {
        return await executeCourseReadTool(
          name,
          args,
          token,
          this.db,
          this.authService,
          this.courseService,
          this.structureService,
          this.autosaveService
        );
      }

      if (
        [
          'create_course',
          'update_course_metadata',
          'create_module',
          'update_module',
          'delete_module',
          'create_lesson',
          'update_lesson',
          'delete_lesson',
          'create_step',
          'update_step',
          'delete_step',
          'duplicate_step',
        ].includes(name)
      ) {
        return await executeCourseMutationTool(
          name,
          args,
          token,
          this.db,
          this.authService,
          this.courseService,
          this.structureService,
          this.autosaveService
        );
      }

      if (['create_image_upload', 'complete_image_upload', 'get_image', 'update_image_metadata'].includes(name)) {
        return await executeImageTool(
          name,
          args,
          token,
          this.db,
          this.authService,
          this.mediaService
        );
      }

      if (['validate_exercise', 'validate_course', 'publish_course'].includes(name)) {
        return await executeAssessmentPublicationTool(
          name,
          args,
          token,
          this.db,
          this.authService,
          this.validationService,
          this.publicationService
        );
      }

      if (['set_course_access', 'archive_course', 'restore_course', 'delete_draft_course'].includes(name)) {
        return await executeLifecycleTool(
          name,
          args,
          token,
          this.db,
          this.authService,
          this.lifecycleService
        );
      }

      if (name === 'batch_author') {
        return await executeBatchAuthorTool(
          name,
          args,
          token,
          this.db,
          this.authService,
          this.structureService
        );
      }

      throw new ValidationError(`Unsupported tool: ${name}`);
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: err.message || 'Operation failed' }],
        isError: true,
      };
    }
  }

  private mapErrorToJsonRpc(err: any): { code: number; message: string; data?: any } {
    if (err?.code && typeof err.code === 'number') {
      return {
        code: err.code,
        message: err.message,
        data: err.data,
      };
    }

    if (err instanceof StaleRevisionError || err?.code === 'STALE_REVISION' || err?.code === 'REVISION_CONFLICT') {
      return {
        code: JSON_RPC_ERRORS.REVISION_CONFLICT,
        message: err.message,
        data: (err as any).details,
      };
    }

    if (err?.code === 'SCOPE_REQUIRED') {
      return {
        code: JSON_RPC_ERRORS.SCOPE_REQUIRED,
        message: err.message,
        data: (err as any).details,
      };
    }

    if (err instanceof RateLimitError || err?.code === 'RATE_LIMITED') {
      return {
        code: JSON_RPC_ERRORS.RATE_LIMITED,
        message: err.message,
        data: { retryAfterSeconds: (err as any).retryAfterSeconds || 60 },
      };
    }

    if (err instanceof AuthenticationError || err?.code === 'UNAUTHENTICATED') {
      return {
        code: JSON_RPC_ERRORS.UNAUTHORIZED,
        message: err.message,
      };
    }

    if (err instanceof AuthorizationError || err?.code === 'FORBIDDEN') {
      return {
        code: JSON_RPC_ERRORS.FORBIDDEN,
        message: err.message,
      };
    }

    if (err instanceof NotFoundError || err?.code === 'NOT_FOUND') {
      return {
        code: JSON_RPC_ERRORS.NOT_FOUND,
        message: err.message,
      };
    }

    if (err instanceof ConflictError || err?.code === 'CONFLICT') {
      return {
        code: JSON_RPC_ERRORS.CONFLICT,
        message: err.message,
      };
    }

    if (err instanceof ValidationError || err?.code === 'VALIDATION_ERROR') {
      return {
        code: JSON_RPC_ERRORS.INVALID_PARAMS,
        message: err.message,
      };
    }

    return {
      code: JSON_RPC_ERRORS.INTERNAL_ERROR,
      message: err.message || 'Internal server error',
    };
  }
}
