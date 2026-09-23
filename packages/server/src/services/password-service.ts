import crypto from 'node:crypto';

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

export function hashPassword(plainText: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(plainText, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$N=16384,r=8,p=1$${salt}$${derivedKey.toString('hex')}`;
}

export function verifyPassword(plainText: string, storedHash: string): boolean {
  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) return false;
    const salt = parts[2];
    const originalKey = Buffer.from(parts[3], 'hex');
    const derivedKey = crypto.scryptSync(plainText, salt, KEY_LENGTH, SCRYPT_OPTIONS);
    if (originalKey.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(originalKey, derivedKey);
  }

  // Backward compatibility with 64-char sha256 hashes in seed fixtures
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const computed = crypto.createHash('sha256').update(plainText).digest();
    const original = Buffer.from(storedHash, 'hex');
    if (computed.length !== original.length) return false;
    return crypto.timingSafeEqual(computed, original);
  }

  return false;
}
