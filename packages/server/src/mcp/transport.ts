import http from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  AuthorizationError,
  NotFoundError,
  RateLimitError,
} from 'zur-shared';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import {
  Server as V2Server,
  createMcpHandler,
  isLegacyRequest,
  ProtocolError,
  ProtocolErrorCode,
} from '@modelcontextprotocol/server';
import { toNodeHandler, toWebRequest } from '@modelcontextprotocol/node';
import { McpServer } from './mcp-server.ts';
import { listMcpResources, readMcpResource } from './resources.ts';
import { JSON_RPC_ERRORS } from './types.ts';
import type { ValidatedMcpToken } from '../services/mcp-token-service.ts';


interface StreamableSession {
  transport: StreamableHTTPServerTransport;
  server: Server;
  token: ValidatedMcpToken;
  rawToken: string;
}

export class McpHttpTransport {
  private mcpServer: McpServer;
  private sessions: Map<string, StreamableSession> = new Map();
  private v2NodeHandler: (req: http.IncomingMessage, res: http.ServerResponse, parsedBody?: any) => Promise<void>;

  constructor(mcpServer: McpServer) {
    this.mcpServer = mcpServer;
    const v2Handler = createMcpHandler(
      async ({ authInfo }) => {
        return this.createModernSdkServer((authInfo as any).validatedToken);
      },
      { legacy: 'reject' }
    );
    this.v2NodeHandler = toNodeHandler(v2Handler) as any;
  }

  isMcpRequest(pathname: string): boolean {
    return pathname === '/mcp' || pathname === '/api/mcp';
  }

  private isValidHost(hostHeader: string | undefined): boolean {
    if (!hostHeader) return false;
    const hostWithoutPort = hostHeader.replace(/:[0-9]+$/, '').toLowerCase();
    if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostWithoutPort)) {
      return true;
    }
    if (hostWithoutPort === 'zur.internal' || hostWithoutPort.endsWith('.zur.internal')) {
      return true;
    }
    if (process.env.MCP_ALLOWED_HOSTS) {
      const extraHosts = process.env.MCP_ALLOWED_HOSTS.split(',').map((h) => h.trim().toLowerCase());
      if (extraHosts.includes(hostWithoutPort) || extraHosts.includes(hostHeader.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  private getAllowedOrigin(originHeader: string | undefined, hostHeader: string | undefined): string | null {
    if (!originHeader || !hostHeader || !this.isValidHost(hostHeader)) return null;
    try {
      const origin = new URL(originHeader);
      if (origin.origin !== originHeader || !['http:', 'https:'].includes(origin.protocol)) return null;
      const host = hostHeader.toLowerCase();
      const loopback = ['localhost', '127.0.0.1', '[::1]'];
      const hostName = host.replace(/:[0-9]+$/, '');
      // Browser origins must match the addressed host. Deployed hosts require HTTPS.
      if (origin.host.toLowerCase() !== host) return null;
      if (!loopback.includes(hostName) && origin.protocol !== 'https:') return null;
      return originHeader;
    } catch {
      return null;
    }
  }

  private createSdkServer(token: ValidatedMcpToken): Server {
    const server = new Server(
      {
        name: 'zur-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.mcpServer.listTools().map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations,
        })),
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const toolArgs = request.params.arguments || {};

      const tool = this.mcpServer.getTool(toolName);
      if (!tool) {
        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${toolName}`);
      }

      if (tool.requiredScope) {
        try {
          this.mcpServer.getAuthService().verifyMcpPermission(token, tool.requiredScope);
        } catch (scopeErr: any) {
          return {
            content: [{ type: 'text', text: scopeErr.message || `Scope ${tool.requiredScope} is required` }],
            isError: true,
          };
        }
      }

      const acquired = this.mcpServer.getRateLimiter().acquireConcurrency(token.authorId);
      if (!acquired) {
        throw new RateLimitError('Too many concurrent tool executions for this author. Please wait.', 1);
      }

      try {
        return await this.mcpServer.dispatchTool(toolName, toolArgs, token);
      } finally {
        this.mcpServer.getRateLimiter().releaseConcurrency(token.authorId);
      }
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: listMcpResources(),
      };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      const resource = readMcpResource(uri);
      if (!resource) {
        throw new NotFoundError(`Resource not found: ${uri}`);
      }
      return {
        contents: [resource],
      };
    });

    return server;
  }

  private createModernSdkServer(token: ValidatedMcpToken): V2Server {
    const server = new V2Server(
      {
        name: 'zur-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    server.setRequestHandler('tools/list', async () => {
      return {
        tools: this.mcpServer.listTools().map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations,
        })),
      };
    });

    server.setRequestHandler('tools/call', async (request: any) => {
      const toolName = request.params?.name;
      const toolArgs = request.params?.arguments || {};

      const tool = this.mcpServer.getTool(toolName);
      if (!tool) {
        throw new ProtocolError(ProtocolErrorCode.MethodNotFound, `Tool not found: ${toolName}`);
      }

      if (tool.requiredScope) {
        try {
          this.mcpServer.getAuthService().verifyMcpPermission(token, tool.requiredScope);
        } catch (scopeErr: any) {
          return {
            content: [{ type: 'text', text: scopeErr.message || `Scope ${tool.requiredScope} is required` }],
            isError: true,
          };
        }
      }

      const acquired = this.mcpServer.getRateLimiter().acquireConcurrency(token.authorId);
      if (!acquired) {
        throw new RateLimitError('Too many concurrent tool executions for this author. Please wait.', 1);
      }

      try {
        return await this.mcpServer.dispatchTool(toolName, toolArgs, token);
      } finally {
        this.mcpServer.getRateLimiter().releaseConcurrency(token.authorId);
      }
    });

    server.setRequestHandler('resources/list', async () => {
      return {
        resources: listMcpResources(),
      };
    });

    server.setRequestHandler('resources/read', async (request: any) => {
      const uri = request.params?.uri;
      const resource = readMcpResource(uri);
      if (!resource) {
        throw new ProtocolError(ProtocolErrorCode.ResourceNotFound, `Resource not found: ${uri}`);
      }
      return {
        contents: [resource],
      };
    });

    return server;
  }

  async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const host = req.headers.host;
    if (!this.isValidHost(host)) {
      this.sendJsonRpcResponse(res, 400, { jsonrpc: '2.0', id: null, error: {
        code: JSON_RPC_ERRORS.INVALID_REQUEST, message: 'Invalid or untrusted Host header.',
      }});
      return;
    }
    const origin = req.headers.origin;
    const allowedOrigin = this.getAllowedOrigin(origin, host);
    if (origin !== undefined && !allowedOrigin) {
      this.sendJsonRpcResponse(res, 403, { jsonrpc: '2.0', id: null, error: {
        code: JSON_RPC_ERRORS.FORBIDDEN, message: 'Cross-origin request rejected: untrusted Origin.',
      }});
      return;
    }
    if (req.method === 'OPTIONS') {
      const headers: Record<string, string> = {
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
      };
      if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
      res.writeHead(204, headers);
      res.end();
      return;
    }
    if (!['POST', 'GET', 'DELETE'].includes(req.method || '')) {
      this.sendJsonRpcResponse(res, 405, { jsonrpc: '2.0', id: null, error: {
        code: JSON_RPC_ERRORS.INVALID_REQUEST, message: 'HTTP method not allowed.',
      }}, allowedOrigin);
      return;
    }

    if (req.method === 'POST' && req.headers['content-length'] === undefined) {
      this.sendJsonRpcResponse(res, 411, { jsonrpc: '2.0', id: null, error: {
        code: JSON_RPC_ERRORS.INVALID_REQUEST, message: 'Content-Length is required for bounded MCP requests.',
      }}, allowedOrigin);
      req.resume();
      return;
    }
    if (req.method === 'POST' && Number(req.headers['content-length']) > 1024 * 1024) {
      this.sendJsonRpcResponse(res, 413, { jsonrpc: '2.0', id: null, error: {
        code: JSON_RPC_ERRORS.INVALID_REQUEST, message: 'Payload Too Large: maximum request size is 1 MiB.',
      }}, allowedOrigin);
      req.resume();
      return;
    }

    // 5. Content-Type Validation (for POST when not Streamable SSE or when application/json is expected)
    const contentType = req.headers['content-type'] || '';
    if (req.method === 'POST' && !contentType.toLowerCase().includes('application/json')) {
      this.sendJsonRpcResponse(res, 415, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: 'Unsupported Media Type. Content-Type must be application/json.',
        },
      }, allowedOrigin);
      return;
    }

    // 6. Authentication Header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.sendJsonRpcResponse(res, 401, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: JSON_RPC_ERRORS.UNAUTHORIZED,
          message: 'Missing or malformed Authorization header. Expected "Bearer zur_at_...".',
        },
      }, allowedOrigin);
      return;
    }

    const rawToken = authHeader.substring(7).trim();
    let validatedToken: ValidatedMcpToken;
    try {
      validatedToken = this.mcpServer.getTokenService().validateToken(rawToken);
    } catch (authErr: any) {
      const statusCode = authErr instanceof AuthorizationError ? 403 : 401;
      const errorCode = authErr instanceof AuthorizationError ? JSON_RPC_ERRORS.FORBIDDEN : JSON_RPC_ERRORS.UNAUTHORIZED;
      this.sendJsonRpcResponse(res, statusCode, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: errorCode,
          message: authErr.message || 'Authentication failed.',
        },
      }, allowedOrigin);
      return;
    }

    // 7. Rate Limiting Check (60 calls/minute per token)
    const rateCheck = this.mcpServer.getRateLimiter().checkRateLimit(validatedToken.id);
    if (!rateCheck.allowed) {
      this.sendJsonRpcResponse(
        res,
        429,
        {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: JSON_RPC_ERRORS.RATE_LIMITED,
            message: 'Rate limit exceeded. Maximum 60 calls per minute per token.',
            data: { retryAfterSeconds: rateCheck.retryAfterSeconds },
          },
        },
        allowedOrigin,
        { 'Retry-After': String(rateCheck.retryAfterSeconds) }
      );
      return;
    }

    const sessionIdHeader = req.headers['mcp-session-id'] as string | undefined;
    // Delegate all protocol messages to the official Streamable HTTP transport.

    {
      if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
      }

      if (sessionIdHeader) {
        const session = this.sessions.get(sessionIdHeader);
        if (!session) {
          this.sendJsonRpcResponse(res, 404, {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: JSON_RPC_ERRORS.NOT_FOUND,
              message: 'Session not found.',
            },
          }, allowedOrigin);
          return;
        }

        if (session.token.id !== validatedToken.id || session.rawToken !== rawToken) {
          this.sendJsonRpcResponse(res, 403, { jsonrpc: '2.0', id: null, error: {
            code: JSON_RPC_ERRORS.FORBIDDEN, message: 'Session credential mismatch.',
          }}, allowedOrigin);
          return;
        }

        if (req.method === 'DELETE') {
          await session.transport.handleRequest(req, res);
          await session.server.close();
          this.sessions.delete(sessionIdHeader);
          return;
        }

        (req as any).auth = { token: rawToken, validatedToken };
        await session.transport.handleRequest(req, res);
        return;
      }

      // Route modern 2026-07-28 protocol requests to official v2 handler, legacy to Streamable HTTP
      let parsedBody: any;
      if (req.method === 'POST') {
        let bodyText = '';
        for await (const chunk of req) {
          bodyText += chunk;
        }
        try {
          parsedBody = bodyText ? JSON.parse(bodyText) : undefined;
        } catch {
          this.sendJsonRpcResponse(res, 400, {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: JSON_RPC_ERRORS.PARSE_ERROR,
              message: 'Parse error: invalid JSON.',
            },
          }, allowedOrigin);
          return;
        }
      }

      const webRequest = await toWebRequest(req, parsedBody);
      const isLegacy = await isLegacyRequest(webRequest, parsedBody);

      if (!isLegacy) {
        (req as any).auth = { token: rawToken, validatedToken };
        await this.v2NodeHandler(req, res, parsedBody);
        return;
      }

      // New Streamable HTTP connection (legacy initialization)
      let sdkServer: Server;
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          this.sessions.set(sid, {
            transport,
            server: sdkServer,
            token: validatedToken,
            rawToken,
          });
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          this.sessions.delete(sid);
        }
      };

      sdkServer = this.createSdkServer(validatedToken);
      await sdkServer.connect(transport);

      (req as any).auth = { token: rawToken, validatedToken };
      await transport.handleRequest(req, res, parsedBody);
      return;
    }

  }

  private sendJsonRpcResponse(
    res: http.ServerResponse,
    statusCode: number,
    payload: any,
    allowedOrigin: string | null = null,
    extraHeaders: Record<string, string> = {}
  ): void {
    const jsonText = JSON.stringify(payload);
    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonText),
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      ...extraHeaders,
    };
    if (allowedOrigin) {
      headers['Access-Control-Allow-Origin'] = allowedOrigin;
    }
    res.writeHead(statusCode, headers as any);
    res.end(jsonText);
  }
}
