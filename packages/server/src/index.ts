import { getDatabase, closeDatabase } from './db/database.ts';
import { runMigrations } from './db/migrate.ts';
import { createServer } from './server.ts';
import { reapplyDeletions } from './db/reapply-deletions.ts';
import { ensureDeletionRegistry } from './db/deletion-registry.ts';
import { validateProductionConfig } from './http/config.ts';
import { installShutdownHandlers } from './http/shutdown.ts';

if (process.env.NODE_ENV === 'production') {
  try {
    for (const warning of validateProductionConfig(process.env)) {
      console.warn(JSON.stringify({ level: 'warn', event: 'config.warning', message: warning }));
    }
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

const PORT = Number(process.env.PORT || 3001);
const DB_PATH = process.env.DATABASE_URL || 'data/zur.sqlite';

runMigrations(DB_PATH);
if (process.env.DELETION_REGISTRY_PATH) {
  if (ensureDeletionRegistry()) console.warn(JSON.stringify({ level: 'warn', event: 'deletion_registry.created', note: 'Registry file did not exist and was created empty. If this is not a first install, restore it from backup before serving traffic.' }));
  reapplyDeletions(DB_PATH);
}
else if (process.env.NODE_ENV === 'production') throw new Error('Production startup requires an independent DELETION_REGISTRY_PATH.');
const db = getDatabase(DB_PATH);
const server = createServer(db);

installShutdownHandlers({ server, cleanup: () => closeDatabase() });

server.listen(PORT, () => {
  console.log(`ZUR Server listening on http://localhost:${PORT}`);
});
