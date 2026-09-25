import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { ValidationError } from 'zur-shared';
import type { DomainEventName, ProductAnalyticsEvent } from 'zur-shared';

const eventNames = new Set<DomainEventName>([
  'course.created', 'course.published', 'enrollment.accepted',
  'step.completed', 'exercise.run', 'exercise.submitted',
  'hint.revealed', 'course.completed',
]);

export class ProductAnalyticsService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) { this.db = db; }

  private salt(): string {
    let row = this.db.prepare('SELECT salt FROM product_analytics_config WHERE id = 1').get() as { salt: string } | undefined;
    if (!row) {
      this.db.prepare('INSERT OR IGNORE INTO product_analytics_config (id, salt) VALUES (1, ?)').run(crypto.randomBytes(32).toString('hex'));
      row = this.db.prepare('SELECT salt FROM product_analytics_config WHERE id = 1').get() as { salt: string };
    }
    return row.salt;
  }

  recordEvent(input: {
    eventName: DomainEventName;
    userId: string;
    courseId?: string;
    courseVersionId?: string;
    stepId?: string;
    metadata?: Record<string, unknown>;
    isPreview?: boolean;
    idempotencyKey?: string;
  }): ProductAnalyticsEvent | null {
    if (!eventNames.has(input.eventName)) throw new ValidationError('Unknown product event.');
    if (input.isPreview) return null;
    const user = this.db.prepare('SELECT capabilities FROM users WHERE id = ?').get(input.userId) as { capabilities: string } | undefined;
    if (!user) throw new ValidationError('Unknown analytics actor.');
    const capabilities = JSON.parse(user.capabilities) as string[];
    if (capabilities.includes('admin')) return null;

    const allowedMetadata: Record<string, string | number | boolean> = {};
    if (input.eventName === 'exercise.submitted' && typeof input.metadata?.verdict === 'string') {
      const verdict = input.metadata.verdict;
      if (['PASSED', 'WRONG_ANSWER', 'SYNTAX_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT', 'MEMORY_LIMIT', 'OUTPUT_LIMIT', 'INTERNAL_ERROR'].includes(verdict)) {
        allowedMetadata.verdict = verdict;
      }
    }
    if (input.eventName === 'exercise.run' && typeof input.metadata?.mode === 'string' && ['samples', 'custom'].includes(input.metadata.mode)) {
      allowedMetadata.mode = input.metadata.mode;
    }
    if (input.eventName === 'hint.revealed' && typeof input.metadata?.hintIndex === 'number') {
      allowedMetadata.hintIndex = input.metadata.hintIndex;
    }
    const event: ProductAnalyticsEvent = {
      id: `evt-${crypto.randomUUID()}`,
      eventName: input.eventName,
      pseudonymousUserId: crypto.createHmac('sha256', this.salt()).update(input.userId).digest('hex').slice(0, 32),
      courseId: input.courseId || null,
      courseVersionId: input.courseVersionId || null,
      stepId: input.stepId || null,
      metadata: allowedMetadata,
      createdAt: new Date().toISOString(),
    };
    const idempotencyKey = input.idempotencyKey
      ? crypto.createHmac('sha256', this.salt()).update(`${input.eventName}:${input.idempotencyKey}`).digest('hex')
      : null;
    const inserted = this.db.prepare(`INSERT OR IGNORE INTO product_analytics_events
      (id, event_name, pseudonymous_user_id, course_id, course_version_id, step_id, metadata, created_at, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      event.id, event.eventName, event.pseudonymousUserId, event.courseId,
      event.courseVersionId, event.stepId, JSON.stringify(event.metadata), event.createdAt, idempotencyKey,
    );
    return inserted.changes === 1 ? event : null;
  }

  listEvents(filter: {
    eventName?: string;
    courseId?: string;
    limit?: number;
    excludeStaffOrPreview?: boolean;
  } = {}): ProductAnalyticsEvent[] {
    const limit = Math.min(100, Math.max(1, filter.limit || 50));
    let sql = 'SELECT * FROM product_analytics_events WHERE 1=1';
    const args: (string | number)[] = [];
    if (filter.eventName) { sql += ' AND event_name = ?'; args.push(filter.eventName); }
    if (filter.courseId) { sql += ' AND course_id = ?'; args.push(filter.courseId); }
    if (filter.excludeStaffOrPreview) {
      const staffIds = (this.db.prepare('SELECT id, capabilities FROM users').all() as Array<{ id: string; capabilities: string }>)
        .filter((user) => (JSON.parse(user.capabilities) as string[]).some((capability) => ['author', 'admin'].includes(capability)))
        .map((user) => crypto.createHmac('sha256', this.salt()).update(user.id).digest('hex').slice(0, 32));
      if (staffIds.length > 0) {
        sql += ` AND pseudonymous_user_id NOT IN (${staffIds.map(() => '?').join(',')})`;
        args.push(...staffIds);
      }
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    args.push(limit);
    const visibleRows = this.db.prepare(sql).all(...args) as any[];
    return visibleRows.map((row) => ({
      id: row.id,
      eventName: row.event_name,
      pseudonymousUserId: row.pseudonymous_user_id,
      courseId: row.course_id,
      courseVersionId: row.course_version_id,
      stepId: row.step_id,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
    }));
  }
}
