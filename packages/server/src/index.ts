import { getDatabase } from './db/database.ts';
import { runMigrations } from './db/migrate.ts';
import { createServer } from './server.ts';
import { reapplyDeletions } from './db/reapply-deletions.ts';

const PORT = Number(process.env.PORT || 3001);
const DB_PATH = process.env.DATABASE_URL || 'data/zur.sqlite';

runMigrations(DB_PATH);
if (process.env.DELETION_REGISTRY_PATH) reapplyDeletions(DB_PATH);
else if (process.env.NODE_ENV === 'production') throw new Error('Production startup requires an independent DELETION_REGISTRY_PATH.');
const db = getDatabase(DB_PATH);
const server = createServer(db);

server.listen(PORT, () => {
  console.log(`ZUR Server listening on http://localhost:${PORT}`);
});
