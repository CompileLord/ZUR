#!/usr/bin/env node
// Prints CSP sha256 hashes for every inline <script> in packages/web/dist/index.html.
// With --check, verifies that deploy/Caddyfile contains each of them (run after `npm run build`).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(root, 'packages/web/dist/index.html'), 'utf8');
const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
if (process.argv.includes('--check')) {
  const caddy = readFileSync(path.join(root, 'deploy/Caddyfile'), 'utf8');
  const missing = hashes.filter((h) => !caddy.includes(h));
  if (missing.length) {
    console.error('CSP hash missing from deploy/Caddyfile:', missing.join(' '));
    process.exit(1);
  }
  console.log(`OK: ${hashes.length} inline script hash(es) present in deploy/Caddyfile`);
} else {
  console.log(hashes.join('\n'));
}
