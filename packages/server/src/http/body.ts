import type http from 'node:http';
import { ZURError, ValidationError } from 'zur-shared';

export const DEFAULT_JSON_LIMIT = 1024 * 1024; // 1 MiB
/** Base64 image upload JSON (10 MiB image => ~13.4 MiB base64) */
export const ASSET_JSON_LIMIT = 15 * 1024 * 1024;

/** An HTTP-level rejection after which the connection must not be reused (body unread). */
export class HttpRejection extends ZURError {
  readonly closeConnection = true;
  constructor(status: number, message: string) {
    super('VALIDATION_ERROR', message, status);
    this.name = 'HttpRejection';
  }
}

export function isJsonContentType(value: string | undefined): boolean {
  if (!value) return false;
  return value.split(';')[0].trim().toLowerCase() === 'application/json';
}

function hasBody(req: http.IncomingMessage): boolean {
  if (req.headers['transfer-encoding']) return true;
  const len = req.headers['content-length'];
  return len !== undefined && len !== '0';
}

export async function parseJsonBody(req: http.IncomingMessage, limit: number = DEFAULT_JSON_LIMIT): Promise<any> {
  if (!hasBody(req)) return {};
  if (!isJsonContentType(req.headers['content-type'])) {
    throw new HttpRejection(415, 'Content-Type must be application/json.');
  }
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    throw new HttpRejection(413, 'Request body is too large.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    if (size > limit) throw new HttpRejection(413, 'Request body is too large.');
    chunks.push(buf);
  }
  if (size === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ValidationError('Request body is not valid JSON.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ValidationError('Request body must be a JSON object.');
  }
  return parsed;
}

/** Throws ValidationError unless every named field is a string within [min,max] chars. */
export function requireStrings(body: any, fields: Record<string, { max: number; min?: number }>): void {
  for (const [name, { max, min = 1 }] of Object.entries(fields)) {
    const v = body?.[name];
    if (typeof v !== 'string' || v.length < min || v.length > max) {
      throw new ValidationError(`${name} must be a string of ${min} to ${max} characters.`, { field: name });
    }
  }
}
