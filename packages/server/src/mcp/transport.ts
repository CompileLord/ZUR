import http from 'node:http';
import { AuthenticationError, AuthorizationError } from 'zur-shared';
import { McpServer } from './mcp-server.ts';
import { JSON_RPC_ERRORS } from './types.ts';

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

export class McpHttpTransport {
  private mcpServer: McpServer;

  constructor(mcpServer: McpServer) {
    this.mcpServer = mcpServer;
  }

  isMcpRequest(pathname: string): boolean {
    return pathname === '/mcp' || pathname === '/api/mcp';
  }

  async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // 1. CORS Preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      });
      res.end();
      return;
    }

    // 2. HTTP Method Validation (POST only)
    if (req.method !== 'POST') {
      this.sendJsonRpcResponse(res, 405, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: 'HTTP method not allowed. MCP requires POST.',
        },
      });
      return;
    }

    // 3. Host and Origin Validation (DNS rebinding and CSRF protection)
    const host = req.headers.host || '';
    if (!host) {
      this.sendJsonRpcResponse(res, 400, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: 'Host header is required.',
        },
      });
      return;
    }

    const origin = req.headers.origin;
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);
        const isLocalHost = allowedHosts.has(originUrl.hostname) || originUrl.host === host;
        if (!isLocalHost && !originUrl.host.endsWith('.zur.internal')) {
          this.sendJsonRpcResponse(res, 403, {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: JSON_RPC_ERRORS.FORBIDDEN,
              message: 'Cross-origin request rejected.',
            },
          });
          return;
        }
      } catch {
        this.sendJsonRpcResponse(res, 403, {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: JSON_RPC_ERRORS.FORBIDDEN,
            message: 'Invalid Origin header.',
          },
        });
        return;
      }
    }

    // 4. Content-Type Validation
    const contentType = req.headers['content-type'] || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      this.sendJsonRpcResponse(res, 415, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: 'Unsupported Media Type. Content-Type must be application/json.',
        },
      });
      return;
    }

    // 5. Authentication Header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.sendJsonRpcResponse(res, 401, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: JSON_RPC_ERRORS.UNAUTHORIZED,
          message: 'Missing or malformed Authorization header. Expected "Bearer zur_at_...".',
        },
      });
      return;
    }

    const rawToken = authHeader.substring(7).trim();
    let validatedToken;
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
      });
      return;
    }

    // 6. Rate Limiting Check (60 calls/minute per token)
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
        { 'Retry-After': String(rateCheck.retryAfterSeconds) }
      );
      return;
    }

    // 7. Read Body with 1 MiB limit
    const contentLength = Number(req.headers['content-length']);
    if (contentLength && contentLength > MAX_BODY_BYTES) {
      this.sendJsonRpcResponse(res, 413, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: 'Payload Too Large: maximum request size is 1 MiB.',
        },
      });
      req.resume();
      return;
    }

    let bodyBuffer: Buffer;
    try {
      bodyBuffer = await this.readRequestBody(req, MAX_BODY_BYTES);
    } catch (sizeErr: any) {
      this.sendJsonRpcResponse(res, 413, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: 'Payload Too Large: maximum request size is 1 MiB.',
        },
      });
      req.resume();
      return;
    }

    // 8. Parse JSON Body
    let parsedBody: any;
    try {
      const rawText = bodyBuffer.toString('utf-8');
      parsedBody = JSON.parse(rawText);
    } catch {
      this.sendJsonRpcResponse(res, 400, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: JSON_RPC_ERRORS.PARSE_ERROR,
          message: 'Parse error: Request body is not valid JSON.',
        },
      });
      return;
    }

    // 9. Process Single or Batch JSON-RPC
    if (Array.isArray(parsedBody)) {
      if (parsedBody.length === 0) {
        this.sendJsonRpcResponse(res, 400, {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: JSON_RPC_ERRORS.INVALID_REQUEST,
            message: 'Invalid Request: batch array cannot be empty.',
          },
        });
        return;
      }

      const responses = [];
      for (const msg of parsedBody) {
        const resp = await this.mcpServer.handleJsonRpcMessage(validatedToken, msg);
        if (resp !== null) {
          responses.push(resp);
        }
      }

      if (responses.length === 0) {
        res.writeHead(204);
        res.end();
        return;
      }

      this.sendJsonRpcResponse(res, 200, responses);
      return;
    }

    const singleResponse = await this.mcpServer.handleJsonRpcMessage(validatedToken, parsedBody);
    if (singleResponse === null) {
      res.writeHead(204);
      res.end();
      return;
    }

    this.sendJsonRpcResponse(res, 200, singleResponse);
  }

  private readRequestBody(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalLength = 0;
      let exceeded = false;

      req.on('data', (chunk: Buffer) => {
        if (exceeded) return;
        totalLength += chunk.length;
        if (totalLength > maxBytes) {
          exceeded = true;
          req.pause();
          reject(new Error('Payload too large'));
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (!exceeded) {
          resolve(Buffer.concat(chunks));
        }
      });

      req.on('error', reject);
    });
  }

  private sendJsonRpcResponse(
    res: http.ServerResponse,
    statusCode: number,
    payload: any,
    extraHeaders: Record<string, string> = {}
  ): void {
    const jsonText = JSON.stringify(payload);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonText),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      ...extraHeaders,
    });
    res.end(jsonText);
  }
}
