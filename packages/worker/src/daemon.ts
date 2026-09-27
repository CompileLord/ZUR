import { getDatabase } from '../../server/src/db/database.ts';
import { ExecutionService } from '../../server/src/services/execution-service.ts';
import { processExecutionJob } from './worker.ts';

const dbPath = process.env.DATABASE_URL || 'data/zur.sqlite';
const service = new ExecutionService(getDatabase(dbPath));
service.purgeExpiredRunJobs();
const cleanup = setInterval(() => service.purgeExpiredRunJobs(), 60 * 60 * 1000);
const workerId = `worker-${process.pid}`;
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

while (!stopping) {
  const job = service.claimNextJob(workerId);
  if (!job) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    continue;
  }
  const heartbeat = setInterval(() => service.renewLease(job.jobId, workerId), 10_000);
  try {
    const result = await processExecutionJob(job);
    service.completeJob(job.jobId, workerId, result);
  } catch {
    service.failJob(job.jobId, workerId, { verdict: 'INTERNAL_ERROR', isInfrastructureFailure: true });
  } finally {
    clearInterval(heartbeat);
  }
}
clearInterval(cleanup);
