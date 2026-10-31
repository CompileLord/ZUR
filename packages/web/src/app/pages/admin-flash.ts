const FLASH_LIFETIME_MS = 10_000;

let pending: { message: string; at: number } | null = null;

export function setAdminFlash(message: string): void {
  pending = { message, at: Date.now() };
}

export function takeAdminFlash(): string | undefined {
  const flash = pending;
  pending = null;
  return flash && Date.now() - flash.at < FLASH_LIFETIME_MS ? flash.message : undefined;
}

type Wording = string | ((values: Record<string, string>) => string);

const WORDING: [string, RegExp, Wording][] = [
  ['POST', /^\/api\/admin\/users\/[^/]+\/grant-author$/, 'Author access granted.'],
  ['POST', /^\/api\/admin\/users\/[^/]+\/revoke-author$/, 'Author access revoked.'],
  ['POST', /^\/api\/admin\/users\/[^/]+\/suspend$/, 'Account suspended.'],
  ['POST', /^\/api\/admin\/users\/[^/]+\/restore$/, 'Account restored.'],
  ['POST', /^\/api\/admin\/courses\/[^/]+\/suspension$/, (v) => (v.suspended === 'true' ? 'Course suspended.' : 'Course restored.')],
  ['POST', /^\/api\/admin\/courses\/[^/]+\/archive-for-deletion$/, 'Course archived for deletion.'],
  ['POST', /^\/api\/admin\/courses\/[^/]+\/waivers$/, 'Step waived.'],
  ['POST', /^\/api\/admin\/categories$/, 'Category created.'],
  ['PUT', /^\/api\/admin\/categories\/[^/]+$/, 'Category renamed.'],
  ['DELETE', /^\/api\/admin\/categories\/[^/]+$/, 'Category removed.'],
  ['PATCH', /^\/api\/admin\/reports\/[^/]+$/, 'Report updated.'],
  ['POST', /^\/api\/admin\/media\/[^/]+\/quarantine$/, 'Media quarantined.'],
  ['POST', /^\/api\/admin\/media\/[^/]+\/restore$/, 'Media restored.'],
  ['DELETE', /^\/api\/admin\/media\/[^/]+$/, 'Media deleted.'],
  ['PATCH', /^\/api\/admin\/privacy-requests\/[^/]+$/, 'Privacy request updated.'],
  ['POST', /^\/api\/admin\/privacy-requests\/[^/]+$/, 'Account purged.'],
  ['POST', /^\/api\/admin\/execution\/pause$/, 'New runs paused.'],
  ['POST', /^\/api\/admin\/execution\/resume$/, 'Execution resumed.'],
  ['POST', /^\/api\/admin\/support-access\/[^/]+\/revoke$/, 'Support access revoked.'],
];

export function adminSuccessMessage(method: string, action: string, values: Record<string, string>): string {
  const match = WORDING.find(([m, pattern]) => m === method && pattern.test(action));
  if (!match) return 'Change saved.';
  return typeof match[2] === 'function' ? match[2](values) : match[2];
}
