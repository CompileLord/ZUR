import path from 'node:path';

type Env = Record<string, string | undefined>;

export interface ConfigReport { errors: string[]; warnings: string[] }

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Collects every production misconfiguration so the operator fixes them in one pass.
 * Never includes secret values in messages (only variable names and the reason).
 */
export function checkProductionConfig(env: Env): ConfigReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const present = (k: string) => (env[k] ?? '').trim().length > 0;

  const db = (env.DATABASE_URL ?? '').trim();
  const dbIsFile = db !== '' && !URL_SCHEME.test(db) && db !== ':memory:';
  if (!db) errors.push('DATABASE_URL is required (path to the SQLite file).');
  else if (!dbIsFile) errors.push('DATABASE_URL must be a SQLite file path, not a URL or :memory:.');

  const reg = (env.DELETION_REGISTRY_PATH ?? '').trim();
  if (!reg) errors.push('DELETION_REGISTRY_PATH is required and must live outside the database directory (so restoring a backup cannot erase it).');
  else if (dbIsFile) {
    const rel = path.relative(path.resolve(path.dirname(db)), path.resolve(reg));
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) errors.push('DELETION_REGISTRY_PATH must be outside the directory that contains DATABASE_URL.');
  }

  // APP_BASE_URL is the variable email-delivery-service reads for links in emails.
  const appUrl = (env.APP_BASE_URL ?? '').trim();
  if (!appUrl) errors.push('APP_BASE_URL is required (public https URL, used in email links).');
  else {
    try { if (new URL(appUrl).protocol !== 'https:') errors.push('APP_BASE_URL must use https.'); }
    catch { errors.push('APP_BASE_URL is not a valid URL.'); }
  }

  // Production default provider is Postmark (email-delivery-service defaultProvider).
  const provider = (env.EMAIL_PROVIDER ?? 'postmark').trim() || 'postmark';
  if (provider !== 'postmark') errors.push('EMAIL_PROVIDER must be "postmark" (or unset) in production.');
  if (!present('POSTMARK_SERVER_TOKEN')) errors.push('POSTMARK_SERVER_TOKEN is required for email delivery.');
  if (!present('EMAIL_FROM')) errors.push('EMAIL_FROM is required for email delivery.');

  const hosts = (env.MCP_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  if (hosts.length === 0) errors.push('MCP_ALLOWED_HOSTS must list the public hostname(s), comma separated; otherwise MCP clients are rejected.');

  if (!present('ZUR_TRUST_PROXY')) warnings.push('ZUR_TRUST_PROXY is unset: X-Forwarded-For/Proto are ignored, so all clients share the proxy IP for rate limits. Set it to the number of proxy hops (1 behind Caddy).');
  return { errors, warnings };
}

/** Throws one aggregated error when invalid; returns warnings otherwise. */
export function validateProductionConfig(env: Env): string[] {
  const { errors, warnings } = checkProductionConfig(env);
  if (errors.length > 0) {
    throw new Error(`Invalid production configuration (${errors.length} problem${errors.length === 1 ? '' : 's'}):\n - ${errors.join('\n - ')}`);
  }
  return warnings;
}
