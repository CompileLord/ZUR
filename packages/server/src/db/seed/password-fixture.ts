import { hashPassword as scryptHashPassword } from '../../services/password-service.ts';

// Fixture hashes are real salted scrypt hashes (never the legacy SHA-256 form). Memoised per
// plaintext so re-seeding in tests does not pay the scrypt cost for every user.
const fixtureHashCache = new Map<string, string>();
export function hashPassword(plain: string): string {
  let hash = fixtureHashCache.get(plain);
  if (!hash) { hash = scryptHashPassword(plain); fixtureHashCache.set(plain, hash); }
  return hash;
}
