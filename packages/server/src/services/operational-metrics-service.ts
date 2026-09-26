import type { DatabaseSync } from 'node:sqlite';

type RequestSample = {
  at: number;
  family: string;
  method: string;
  status: number;
  durationMs: number;
};

const WINDOW_MS = 5 * 60 * 1000;
const MAX_SAMPLES = 10_000;

function familyFor(pathname: string): string {
  if (pathname === '/healthz') return 'health';
  if (pathname.startsWith('/api/auth/')) return 'auth';
  if (pathname.startsWith('/api/execution/')) return 'execution';
  if (pathname.startsWith('/api/drafts') || pathname.includes('/autosave')) return 'autosave';
  if (pathname.startsWith('/api/admin/')) return 'admin';
  if (pathname === '/mcp' || pathname === '/api/mcp' || pathname.startsWith('/api/mcp/')) return 'mcp';
  if (pathname.startsWith('/api/')) return 'api';
  return 'web';
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

export class OperationalMetricsService {
  private readonly samples: RequestSample[] = [];
  private totalObserved = 0;

  recordRequest(method: string, pathname: string, status: number, durationMs: number, at = Date.now()): void {
    this.samples.push({ at, family: familyFor(pathname), method: method.toUpperCase(), status, durationMs: Math.max(0, durationMs) });
    this.totalObserved++;
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
  }

  snapshot(db: DatabaseSync, now = Date.now()) {
    const recent = this.samples.filter((sample) => sample.at >= now - WINDOW_MS);
    const accessDenialLikeResponses = recent.filter((sample) => sample.status === 403 || (sample.status === 404 && sample.family !== 'web' && sample.family !== 'health')).length;
    const counts: Record<string, { requests: number; failures: number; p95LatencyMs: number | null }> = {};
    for (const family of ['auth', 'execution', 'autosave', 'admin', 'mcp', 'api', 'web', 'health']) {
      const samples = recent.filter((sample) => sample.family === family);
      counts[family] = {
        requests: samples.length,
        failures: samples.filter((sample) => sample.status >= 400).length,
        p95LatencyMs: percentile(samples.map((sample) => sample.durationMs), 0.95),
      };
    }

    const oldestQueued = db.prepare("SELECT created_at FROM execution_jobs WHERE status='queued' ORDER BY created_at LIMIT 1").get() as { created_at: string } | undefined;
    const staleRunning = (db.prepare("SELECT COUNT(*) count FROM execution_jobs WHERE status='running' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?").get(new Date(now).toISOString()) as { count: number }).count;
    const infrastructureFailures24h = (db.prepare("SELECT COUNT(*) count FROM assessment_attempts WHERE is_infrastructure_failure=1 AND created_at >= ?").get(new Date(now - 86400000).toISOString()) as { count: number }).count;
    const deliveryIssues = (db.prepare("SELECT COUNT(*) count FROM invitations WHERE type='email' AND email_delivery_status IN ('failed','not_configured')").get() as { count: number }).count;
    const queueAgeSeconds = oldestQueued ? Math.max(0, Math.floor((now - Date.parse(oldestQueued.created_at)) / 1000)) : null;
    const alerts: { severity: 'warning' | 'critical'; code: string; message: string }[] = [];
    if (staleRunning > 0) alerts.push({ severity: 'critical', code: 'execution.stale_running', message: `${staleRunning} execution job(s) have expired worker leases.` });
    if (queueAgeSeconds !== null && queueAgeSeconds > 30) alerts.push({ severity: 'warning', code: 'execution.queue_age', message: `The oldest queued execution is ${queueAgeSeconds} seconds old.` });
    if (infrastructureFailures24h >= 5) alerts.push({ severity: 'warning', code: 'execution.infrastructure_failures', message: `${infrastructureFailures24h} infrastructure failures were recorded in the last 24 hours.` });
    if (deliveryIssues > 0) alerts.push({ severity: 'warning', code: 'email.delivery_issues', message: `${deliveryIssues} email invitation(s) have a delivery issue.` });
    if (counts.autosave.failures >= 3) alerts.push({ severity: 'warning', code: 'autosave.recent_failures', message: `${counts.autosave.failures} autosave/API request failure(s) were observed in the last five minutes.` });
    if (counts.auth.failures >= 20) alerts.push({ severity: 'warning', code: 'auth.recent_failures', message: `${counts.auth.failures} authentication request failure(s) were observed in the last five minutes.` });
    if (accessDenialLikeResponses >= 20) alerts.push({ severity: 'warning', code: 'auth.authorization_denials', message: 'Elevated authorization-denial or protected-resource-not-found responses were observed in the last five minutes.' });

    return {
      generatedAt: new Date(now).toISOString(),
      windowSeconds: WINDOW_MS / 1000,
      process: { uptimeSeconds: Math.floor(process.uptime()), residentBytes: process.memoryUsage().rss },
      requestMetrics: { retention: 'In-memory, last 10,000 requests; resets on process restart.', totalSinceStart: this.totalObserved, recentByFamily: counts },
      execution: { queueAgeSeconds, staleRunning, infrastructureFailures24h, separateWorkerHeartbeat: 'Unavailable — this deployment has no separate worker heartbeat.' },
      email: { deliveryIssues },
      accessDenialLikeResponses,
      alerts,
    };
  }
}
