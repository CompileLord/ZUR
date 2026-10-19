import { processExecutionJob } from './worker.ts';
import { killAllActiveRuns } from './runner.ts';
import type { ExecutionService } from '../../server/src/services/execution-service.ts';

export interface DaemonOptions {
  service: Pick<ExecutionService, 'claimNextJob' | 'renewLease' | 'completeJob' | 'failJob' | 'purgeExpiredRunJobs'
    | 'recoverStuckJobsSafe' | 'releaseJob'>;
  workerId: string;
  /** Returns true once shutdown was requested. */
  shouldStop: () => boolean;
  idleMs?: number;
  heartbeatMs?: number;
  recoveryMs?: number;
  purgeMs?: number;
  /** After a stop request, how long the current job may keep running before it is killed and re-queued. */
  shutdownGraceMs?: number;
  process?: typeof processExecutionJob;
}

function logError(what: string, error: unknown): void {
  // Messages only: never log job payloads (code/stdin) or credentials.
  console.error(`[worker] ${what}: ${error instanceof Error ? error.message : String(error)}`);
}

/** Main worker loop. Resolves once stopped and the current job is finished or released. */
export async function runWorkerDaemon(options: DaemonOptions): Promise<void> {
  const { service, workerId, shouldStop } = options;
  const idleMs = options.idleMs ?? 250;
  const heartbeatMs = options.heartbeatMs ?? 10_000;
  const graceMs = options.shutdownGraceMs ?? 10_000;
  const process = options.process ?? processExecutionJob;

  const safely = (what: string, fn: () => void) => () => { try { fn(); } catch (error) { logError(what, error); } };
  const recovery = setInterval(safely('stuck-job recovery failed', () => { service.recoverStuckJobsSafe(); }), options.recoveryMs ?? 15_000);
  const cleanup = setInterval(safely('purge failed', () => { service.purgeExpiredRunJobs(); }), options.purgeMs ?? 60 * 60 * 1000);
  try { service.purgeExpiredRunJobs(); } catch (error) { logError('initial purge failed', error); }

  try {
    while (!shouldStop()) {
      let job;
      try { job = service.claimNextJob(workerId); }
      catch (error) {
        logError('claim failed', error);
        await new Promise((resolve) => setTimeout(resolve, Math.max(idleMs, 1000)));
        continue;
      }
      if (!job) { await new Promise((resolve) => setTimeout(resolve, idleMs)); continue; }

      const heartbeat = setInterval(safely('lease heartbeat failed', () => { service.renewLease(job.jobId, workerId); }), heartbeatMs);
      let graceTimer: NodeJS.Timeout | null = null;
      try {
        const work = process(job).then((result) => ({ kind: 'done' as const, result }));
        const interrupted = new Promise<{ kind: 'interrupted' }>((resolve) => {
          const watch = setInterval(() => {
            if (shouldStop()) {
              clearInterval(watch);
              graceTimer = setTimeout(() => resolve({ kind: 'interrupted' }), graceMs);
            }
          }, 50);
          work.finally(() => { clearInterval(watch); if (graceTimer) clearTimeout(graceTimer); }).catch(() => {});
        });
        const outcome = await Promise.race([work, interrupted]);
        if (outcome.kind === 'interrupted') {
          killAllActiveRuns();
          work.catch(() => {});
          try { service.releaseJob(job.jobId, workerId); } catch (error) { logError('release failed', error); }
        } else {
          service.completeJob(job.jobId, workerId, outcome.result);
        }
      } catch (error) {
        logError(`job ${job.jobId} failed`, error);
        try { service.failJob(job.jobId, workerId, { verdict: 'INTERNAL_ERROR', isInfrastructureFailure: true }); }
        catch (failure) { logError('failJob failed', failure); }
      } finally {
        clearInterval(heartbeat);
      }
    }
  } finally {
    clearInterval(recovery);
    clearInterval(cleanup);
  }
}
