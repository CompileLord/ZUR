import type http from 'node:http';
import { AuthorizationError } from 'zur-shared';
import { isHttpsRequest, trustedHops } from './client-ip.ts';

type Env = Record<string, string | undefined>;

/** Applied to every response (setHeader, so later writeHead calls keep them). */
export function applySecurityHeaders(req: http.IncomingMessage, res: http.ServerResponse, env: Env = process.env): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Every response of this process is dynamic API data; handlers may override (e.g. assets).
  res.setHeader('Cache-Control', 'no-store');
  if (env.ZUR_FORCE_HSTS === '1' || isHttpsRequest(req, env)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
}

// ---- Session cookie -------------------------------------------------------

export const SESSION_COOKIE_MAX_AGE = 30 * 24 * 3600;

function cookieAttributes(req: http.IncomingMessage, env: Env): string {
  const secure = env.NODE_ENV === 'production' || isHttpsRequest(req, env);
  return `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function sessionCookie(req: http.IncomingMessage, token: string, env: Env = process.env): string {
  return `zur_session=${token}; ${cookieAttributes(req, env)}; Max-Age=${SESSION_COOKIE_MAX_AGE}`;
}

/** Same attributes as sessionCookie so browsers reliably replace it. */
export function clearSessionCookie(req: http.IncomingMessage, env: Env = process.env): string {
  return `zur_session=; ${cookieAttributes(req, env)}; Max-Age=0`;
}

// ---- CORS -----------------------------------------------------------------

export function allowedCorsOrigins(env: Env = process.env): string[] {
  const configured = (env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (configured.length > 0) return configured;
  return env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'];
}

export function matchingCorsOrigin(req: http.IncomingMessage, env: Env = process.env): string | null {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !origin) return null;
  return allowedCorsOrigins(env).includes(origin) ? origin : null;
}

export function applyCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse, env: Env = process.env): void {
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id'); // grants nothing without Allow-Origin
  const origin = matchingCorsOrigin(req, env);
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
}

export function handlePreflight(req: http.IncomingMessage, res: http.ServerResponse, env: Env = process.env): void {
  applyCorsHeaders(req, res, env);
  if (matchingCorsOrigin(req, env)) {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Upload-Token');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  res.writeHead(204);
  res.end();
}

// ---- CSRF -----------------------------------------------------------------

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hasSessionCookie(req: http.IncomingMessage): boolean {
  return /(?:^|;\s*)zur_session=[^;]+/.test(req.headers.cookie || '');
}

function sameOrigin(origin: string, req: http.IncomingMessage, env: Env): boolean {
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  if (url.origin !== origin) return false;
  const hosts = [req.headers.host];
  if (trustedHops(env) > 0) {
    const fwd = req.headers['x-forwarded-host'];
    if (typeof fwd === 'string') hosts.push(fwd.split(',').pop()!.trim());
  }
  if (hosts.some((h) => h && h.toLowerCase() === url.host.toLowerCase())) return true;
  if (env.APP_BASE_URL) { try { if (new URL(env.APP_BASE_URL).origin === origin) return true; } catch { /* ignore */ } }
  return allowedCorsOrigins(env).includes(origin);
}

/**
 * Cookie-authenticated state-changing requests must come from our own origin.
 * Bearer-authenticated requests are immune (a cross-site page cannot attach the header),
 * and non-browser clients that send neither Origin nor Sec-Fetch-Site are allowed.
 */
export function assertCsrfSafe(req: http.IncomingMessage, env: Env = process.env): void {
  const method = (req.method || 'GET').toUpperCase();
  if (!STATE_CHANGING.has(method)) return;
  if (typeof req.headers.authorization === 'string' && /^Bearer\s/i.test(req.headers.authorization)) return;
  if (!hasSessionCookie(req)) return;
  const origin = req.headers.origin;
  if (typeof origin === 'string') {
    if (sameOrigin(origin, req, env)) return;
    throw new AuthorizationError('Cross-origin request rejected.');
  }
  const site = req.headers['sec-fetch-site'];
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') {
    throw new AuthorizationError('Cross-origin request rejected.');
  }
}
