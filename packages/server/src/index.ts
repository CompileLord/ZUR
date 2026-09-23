import { getDatabase } from './db/database.ts';
import { runMigrations } from './db/migrate.ts';
import { createServer } from './server.ts';

const PORT = Number(process.env.PORT || 3001);
const DB_PATH = process.env.DATABASE_URL || 'data/zur.sqlite';

runMigrations(DB_PATH);
const db = getDatabase(DB_PATH);
const server = createServer(db);

server.listen(PORT, () => {
  console.log(`ZUR Server listening on http://localhost:${PORT}`);
});
