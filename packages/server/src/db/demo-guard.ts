/**
 * Refuses to run demo/fixture scripts (db:seed, db:demo-users) in production unless the
 * operator explicitly opts in with ZUR_ALLOW_DEMO_SEED=1. Exits the process on refusal.
 */
export function demoSeedBlockedReason(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV === 'production' && env.ZUR_ALLOW_DEMO_SEED !== '1') {
    return 'Refusing to run: NODE_ENV=production. Demo/seed scripts create accounts with publicly known passwords and (for db:seed) wipe data. Set ZUR_ALLOW_DEMO_SEED=1 only if you truly intend this.';
  }
  return null;
}

export function assertDemoSeedAllowed(scriptName: string, env: NodeJS.ProcessEnv = process.env): void {
  const reason = demoSeedBlockedReason(env);
  if (reason) {
    console.error(`[${scriptName}] ${reason}`);
    process.exit(1);
  }
}
