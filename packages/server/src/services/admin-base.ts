import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { NotFoundError, ValidationError } from 'zur-shared';
import { OperationalMetricsService } from './operational-metrics-service.ts';

export class AdminBase {
  protected readonly db: DatabaseSync;
  protected readonly operationalMetrics?: OperationalMetricsService;
  constructor(db: DatabaseSync, operationalMetrics?: OperationalMetricsService) {
    this.db = db;
    this.operationalMetrics = operationalMetrics;
  }

  requireAdmin(adminId: string): void {
    const row = this.db.prepare('SELECT capabilities, account_status FROM users WHERE id = ?').get(adminId) as any;
    if (!row || row.account_status !== 'active' || !(JSON.parse(row.capabilities || '[]') as string[]).includes('admin')) {
      throw new NotFoundError("This page isn't available.");
    }
  }

  protected page(limit: number, offset: number) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new ValidationError('Invalid pagination.');
  }

  protected transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  protected sanitizeReason(value: string) {
    let clean = value.replace(/```[\s\S]*?```/g, '[redacted code]');
    if (/(^|\n)\s*(?:const|let|var|function|class|import|from|def|return|SELECT|INSERT|UPDATE|DELETE)\b/m.test(clean)
      || /`[^`]+`/.test(clean)
      || /\bprint\s*\(/i.test(clean)
      || /\b[A-Za-z_$][\w$]*\s*=\s*(?:[-+]?\d|["'`{[]|true\b|false\b|null\b|None\b|\w+\s*\()/i.test(clean)) {
      return '[reason redacted because it contained code]';
    }
    clean = clean
      .replace(/\b(?:api[-_ ]?token|password|passwd|secret|token|api[-_ ]?key|credential|authorization)\b\s*(?:[:=]|\bis\b)\s*(?:bearer\s+)?[^\s,;]+/gi, '[redacted credential]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
      .replace(/https?:\/\/[^\s]+/gi, '[redacted URL]')
      .replace(/\b(?:sk|pk|ghp|github_pat|xox[baprs])-[_A-Za-z0-9-]{8,}\b/gi, '[redacted token]');
    return clean;
  }

  protected reason(reason: string) {
    const clean = typeof reason === 'string' ? reason.trim() : '';
    if (clean.length < 8 || clean.length > 1000) throw new ValidationError('Provide a reason between 8 and 1000 characters.');
    return this.sanitizeReason(clean);
  }

  protected audit(actorId: string, action: string, targetType: string, targetId: string, reason: string, metadata?: Record<string, unknown>) {
    this.db.prepare(`INSERT INTO audit_events (id, actor_id, action, target_type, target_id, reason, metadata, correlation_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), actorId, action, targetType, targetId,
      this.reason(reason), metadata ? JSON.stringify(metadata) : null, crypto.randomUUID(), new Date().toISOString());
  }
}
