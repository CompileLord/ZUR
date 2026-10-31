import { AuthenticationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Author access tokens for MCP clients.
export async function handleAuthorTokenRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, url, pathname, method, token, identityService, mcpTokenService, parseJsonBody, sendJson, limitTokenPasswordChecks } = rc;

  // Author Access Tokens (T053)
  if (method === 'POST' && pathname === '/api/author/tokens') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const body = await parseJsonBody(req);
    limitTokenPasswordChecks(user.id);
    const result = mcpTokenService.createToken(user.id, body);
    sendJson(res, 201, result);
    return true;
  }

  if (method === 'GET' && pathname === '/api/author/tokens') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const status = (url.searchParams.get('status') as any) || undefined;
    const tokens = mcpTokenService.listTokens(user.id, status);
    sendJson(res, 200, { tokens });
    return true;
  }

  const authorTokenReplaceMatch = pathname.match(/^\/api\/author\/tokens\/([a-zA-Z0-9_-]+)\/replace$/);
  if (method === 'POST' && authorTokenReplaceMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const tokenId = authorTokenReplaceMatch[1];
    const body = await parseJsonBody(req);
    limitTokenPasswordChecks(user.id);
    const result = mcpTokenService.replaceToken(user.id, tokenId, body);
    sendJson(res, 201, result);
    return true;
  }

  const authorTokenDetailMatch = pathname.match(/^\/api\/author\/tokens\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && authorTokenDetailMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const tokenId = authorTokenDetailMatch[1];
    const tokenData = mcpTokenService.getToken(user.id, tokenId);
    sendJson(res, 200, tokenData);
    return true;
  }

  if (method === 'DELETE' && authorTokenDetailMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const tokenId = authorTokenDetailMatch[1];
    mcpTokenService.revokeToken(user.id, tokenId);
    sendJson(res, 200, { success: true });
    return true;
  }

  return false;
}
