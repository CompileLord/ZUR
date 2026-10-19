import { getDatabase } from '../../server/src/db/database.ts';
import { ExecutionService } from '../../server/src/services/execution-service.ts';
import { runWorkerDaemon } from './daemon-loop.ts';

const dbPath = process.env.DATABASE_URL || 'data/zur.sqlite';
const service = new ExecutionService(getDatabase(dbPath));
const workerId = `worker-${process.pid}`;
let stopping = false;
const stop = () => { stopping = true; };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('uncaughtException', (error) => {
  console.error('[worker] uncaught exception:', error instanceof Error ? error.message : String(error));
});
process.on('unhandledRejection', (reason) => {
  console.error('[worker] unhandled rejection:', reason instanceof Error ? reason.message : String(reason));
});

await runWorkerDaemon({
  service,
  workerId,
  shouldStop: () => stopping,
  shutdownGraceMs: Number(process.env.ZUR_WORKER_SHUTDOWN_GRACE_MS) || 10_000,
});
console.log('[worker] stopped');
