import net from 'node:net';
import type http from 'node:http';

type Env = Record<string, string | undefined>;

/**
 * ZUR_TRUST_PROXY: number of trusted reverse-proxy hops in front of the API.
 * 0/unset/invalid = never trust X-Forwarded-* (default, safe for direct exposure).
 * N = the client address is the Nth entry counted from the right of X-Forwarded-For
 * (Caddy appends the peer address it saw, so N=1 for a single Caddy).
 */
export function trustedHops(env: Env = process.env): number {
  const raw = (env.ZUR_TRUST_PROXY ?? '').trim();
  if (!/^\d{1,2}$/.test(raw)) return 0;
  return Number(raw);
}

function normalizeIp(value: string | undefined): string | null {
  if (!value) return null;
  let v = value.trim();
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  if (net.isIP(v) === 0) return null;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v);
  if (mapped && net.isIPv4(mapped[1])) return mapped[1];
  return v.toLowerCase();
}

function headerValue(req: http.IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v.join(',') : v;
}

export function getClientIp(req: http.IncomingMessage, env: Env = process.env): string {
  const socketIp = normalizeIp(req.socket?.remoteAddress) || 'unknown';
  const hops = trustedHops(env);
  if (hops === 0) return socketIp;
  const parts = (headerValue(req, 'x-forwarded-for') || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return socketIp;
  const candidate = normalizeIp(parts[Math.max(0, parts.length - hops)]);
  return candidate || socketIp;
}

/** True when the client connection is HTTPS: direct TLS, or a trusted proxy said so. */
export function isHttpsRequest(req: http.IncomingMessage, env: Env = process.env): boolean {
  if ((req.socket as any)?.encrypted) return true;
  const hops = trustedHops(env);
  if (hops === 0) return false;
  const parts = (headerValue(req, 'x-forwarded-proto') || '').split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts[Math.max(0, parts.length - hops)] === 'https';
}
