import crypto from 'node:crypto';

const KEY_LENGTH = 64;
/** Current cost parameters for NEW hashes (N=2^15, r=8, p=1). */
const CURRENT = { N: 32768, r: 8, p: 1 } as const;
/** Upper bounds accepted when verifying a stored hash (defends against a tampered DB row exhausting memory). */
const MAX_N = 1 << 20;
const MAX_R = 16;
const MAX_P = 4;

export interface ScryptParams { N: number; r: number; p: number }

function maxmemFor(params: ScryptParams): number {
  // scrypt needs ~128*N*r bytes; double it and add headroom.
  return 128 * params.N * params.r * 2 + 1024 * 1024;
}

function optionsFor(params: ScryptParams) {
  return { N: params.N, r: params.r, p: params.p, maxmem: maxmemFor(params) };
}

function formatHash(params: ScryptParams, salt: string, key: Buffer): string {
  return `scrypt$N=${params.N},r=${params.r},p=${params.p}$${salt}$${key.toString('hex')}`;
}

interface ParsedScrypt { params: ScryptParams; salt: string; key: Buffer }

function parseScrypt(storedHash: string): ParsedScrypt | null {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return null;
  const match = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parts[1]);
  if (!match) return null;
  const params = { N: Number(match[1]), r: Number(match[2]), p: Number(match[3]) };
  if (!Number.isInteger(params.N) || params.N < 2 || params.N > MAX_N || (params.N & (params.N - 1)) !== 0) return null;
  if (params.r < 1 || params.r > MAX_R || params.p < 1 || params.p > MAX_P) return null;
  if (!/^[a-f0-9]+$/i.test(parts[3]) || parts[3].length !== KEY_LENGTH * 2) return null;
  return { params, salt: parts[2], key: Buffer.from(parts[3], 'hex') };
}

function isLegacySha256(storedHash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(storedHash);
}

export function hashPassword(plainText: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(plainText, salt, KEY_LENGTH, optionsFor(CURRENT));
  return formatHash(CURRENT, salt, key);
}

/** Async variant: derivation runs on the libuv threadpool, so it does not block the event loop. */
export function hashPasswordAsync(plainText: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(plainText, salt, KEY_LENGTH, optionsFor(CURRENT), (error, key) => {
      if (error) reject(error); else resolve(formatHash(CURRENT, salt, key));
    });
  });
}

function legacyMatches(plainText: string, storedHash: string): boolean {
  const computed = crypto.createHash('sha256').update(plainText).digest();
  const original = Buffer.from(storedHash, 'hex');
  return computed.length === original.length && crypto.timingSafeEqual(computed, original);
}

/**
 * Verifies scrypt hashes (any stored parameters) and, for UPGRADE-ON-LOGIN only,
 * legacy unsalted SHA-256 hashes. Call needsRehash() after success to migrate.
 * hashPassword never produces the legacy form.
 */
export function verifyPassword(plainText: string, storedHash: string): boolean {
  if (typeof plainText !== 'string' || typeof storedHash !== 'string') return false;
  if (storedHash.startsWith('scrypt$')) {
    const parsed = parseScrypt(storedHash);
    if (!parsed) return false;
    const derived = crypto.scryptSync(plainText, parsed.salt, KEY_LENGTH, optionsFor(parsed.params));
    return crypto.timingSafeEqual(parsed.key, derived);
  }
  if (isLegacySha256(storedHash)) return legacyMatches(plainText, storedHash);
  return false;
}

export function verifyPasswordAsync(plainText: string, storedHash: string): Promise<boolean> {
  if (typeof plainText !== 'string' || typeof storedHash !== 'string') return Promise.resolve(false);
  if (storedHash.startsWith('scrypt$')) {
    const parsed = parseScrypt(storedHash);
    if (!parsed) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      crypto.scrypt(plainText, parsed.salt, KEY_LENGTH, optionsFor(parsed.params), (error, derived) => {
        if (error) reject(error); else resolve(crypto.timingSafeEqual(parsed.key, derived));
      });
    });
  }
  if (isLegacySha256(storedHash)) return Promise.resolve(legacyMatches(plainText, storedHash));
  return Promise.resolve(false);
}

/** True when a stored hash is legacy SHA-256 or scrypt with weaker-than-current parameters. */
export function needsRehash(storedHash: string): boolean {
  if (isLegacySha256(storedHash)) return true;
  const parsed = parseScrypt(storedHash);
  if (!parsed) return false;
  return parsed.params.N < CURRENT.N || parsed.params.r < CURRENT.r || parsed.params.p < CURRENT.p;
}

export function isLegacyPasswordHash(storedHash: string): boolean {
  return isLegacySha256(storedHash);
}

let dummyHash: string | null = null;
/** Burns the same scrypt cost as a real verification (unknown-user timing equalisation). */
export function verifyAgainstDummy(plainText: string): void {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  verifyPassword(plainText, dummyHash);
}
