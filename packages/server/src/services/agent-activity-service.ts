import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { NotFoundError } from 'zur-shared';

export interface RecordMutationParams {
  tokenId: string;
  authorId: string;
  courseId: string;
  toolName: string;
  idempotencyKey?: string;
  baseRevision: number;
  newRevision: number;
  affectedEntities: string[] | Record<string, unknown> | unknown[];
  priorContent?: unknown | null;
  newContent?: unknown | null;
  outcome?: 'success' | 'failure';
  correlationId?: string | null;
}

export interface AgentMutationSummary {
  id: string;
  tokenId: string;
  tokenLabel: string;
  toolName: string;
  baseRevision: number;
  newRevision: number;
  affectedEntities: unknown;
  outcome: string;
  correlationId: string | null;
  createdAt: string;
}

export interface AgentMutationDetail extends AgentMutationSummary {
  authorId: string;
  courseId: string;
  idempotencyKey: string;
  priorContent: unknown | null;
  newContent: unknown | null;
}

export interface ListAgentActivityOptions {
  page?: number;
  limit?: number;
  toolName?: string;
}

export interface PaginatedAgentActivity {
  items: AgentMutationSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export class AgentActivityService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private verifyCourseOwner(authorId: string, courseId: string): void {
    const course = this.db.prepare('SELECT owner_id FROM courses WHERE id = ?').get(courseId) as { owner_id: string } | undefined;
    if (!course || course.owner_id !== authorId) {
      throw new NotFoundError("This page isn't available.");
    }
  }

  recordMutation(params: RecordMutationParams): AgentMutationDetail {
    const id = crypto.randomUUID();
    const idempotencyKey = params.idempotencyKey || `mcp-auto-${crypto.randomUUID()}`;
    const outcome = params.outcome || 'success';
    const now = new Date().toISOString();

    const affectedEntitiesJson = typeof params.affectedEntities === 'string'
      ? params.affectedEntities
      : JSON.stringify(params.affectedEntities);

    const priorContentJson = params.priorContent !== undefined && params.priorContent !== null
      ? (typeof params.priorContent === 'string' ? params.priorContent : JSON.stringify(params.priorContent))
      : null;

    const newContentJson = params.newContent !== undefined && params.newContent !== null
      ? (typeof params.newContent === 'string' ? params.newContent : JSON.stringify(params.newContent))
      : null;

    const existing = this.db
      .prepare('SELECT m.*, t.label as token_label FROM agent_mutations m LEFT JOIN author_access_tokens t ON m.token_id = t.id WHERE m.token_id = ? AND m.idempotency_key = ?')
      .get(params.tokenId, idempotencyKey) as any;

    if (existing) {
      let parsedEntities: any = [];
      try {
        parsedEntities = JSON.parse(existing.affected_entities);
      } catch {
        parsedEntities = [existing.affected_entities];
      }

      return {
        id: existing.id,
        tokenId: existing.token_id,
        tokenLabel: existing.token_label || 'Agent',
        authorId: existing.author_id,
        courseId: existing.course_id,
        toolName: existing.tool_name,
        idempotencyKey: existing.idempotency_key,
        baseRevision: existing.base_revision,
        newRevision: existing.new_revision,
        affectedEntities: parsedEntities,
        priorContent: existing.prior_content ? JSON.parse(existing.prior_content) : null,
        newContent: existing.new_content ? JSON.parse(existing.new_content) : null,
        outcome: existing.outcome,
        correlationId: existing.correlation_id || null,
        createdAt: existing.created_at,
      };
    }

    this.db.prepare(
      `INSERT INTO agent_mutations (
        id, token_id, author_id, course_id, tool_name, idempotency_key,
        base_revision, new_revision, affected_entities, prior_content, new_content,
        outcome, correlation_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.tokenId,
      params.authorId,
      params.courseId,
      params.toolName,
      idempotencyKey,
      params.baseRevision,
      params.newRevision,
      affectedEntitiesJson,
      priorContentJson,
      newContentJson,
      outcome,
      params.correlationId || null,
      now
    );

    const tokenRow = this.db.prepare('SELECT label FROM author_access_tokens WHERE id = ?').get(params.tokenId) as any;

    return {
      id,
      tokenId: params.tokenId,
      tokenLabel: tokenRow?.label || 'Agent',
      authorId: params.authorId,
      courseId: params.courseId,
      toolName: params.toolName,
      idempotencyKey,
      baseRevision: params.baseRevision,
      newRevision: params.newRevision,
      affectedEntities: params.affectedEntities,
      priorContent: params.priorContent ?? null,
      newContent: params.newContent ?? null,
      outcome,
      correlationId: params.correlationId || null,
      createdAt: now,
    };
  }

  listAgentActivity(authorId: string, courseId: string, options?: ListAgentActivityOptions): PaginatedAgentActivity {
    this.verifyCourseOwner(authorId, courseId);

    const page = Math.max(1, Number(options?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options?.limit) || 20));
    const offset = (page - 1) * limit;

    let countQuery = 'SELECT COUNT(*) as total FROM agent_mutations WHERE course_id = ? AND author_id = ?';
    let dataQuery = `
      SELECT m.id, m.token_id, t.label as token_label, m.tool_name, m.base_revision, m.new_revision,
             m.affected_entities, m.outcome, m.correlation_id, m.created_at
      FROM agent_mutations m
      LEFT JOIN author_access_tokens t ON m.token_id = t.id
      WHERE m.course_id = ? AND m.author_id = ?
    `;

    const params: any[] = [courseId, authorId];

    if (options?.toolName) {
      countQuery += ' AND tool_name = ?';
      dataQuery += ' AND m.tool_name = ?';
      params.push(options.toolName);
    }

    const countRow = this.db.prepare(countQuery).get(...params) as any;
    const total = countRow?.total || 0;

    dataQuery += ' ORDER BY m.created_at DESC, m.new_revision DESC LIMIT ? OFFSET ?';
    const rows = this.db.prepare(dataQuery).all(...params, limit, offset) as any[];

    const items: AgentMutationSummary[] = rows.map((r) => {
      let parsedEntities: any = [];
      try {
        parsedEntities = JSON.parse(r.affected_entities);
      } catch {
        parsedEntities = [r.affected_entities];
      }

      return {
        id: r.id,
        tokenId: r.token_id,
        tokenLabel: r.token_label || 'Agent',
        toolName: r.tool_name,
        baseRevision: r.base_revision,
        newRevision: r.new_revision,
        affectedEntities: parsedEntities,
        outcome: r.outcome,
        correlationId: r.correlation_id || null,
        createdAt: r.created_at,
      };
    });

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  getMutationDetail(authorId: string, mutationId: string): AgentMutationDetail {
    const row = this.db.prepare(`
      SELECT m.*, t.label as token_label
      FROM agent_mutations m
      LEFT JOIN author_access_tokens t ON m.token_id = t.id
      WHERE m.id = ?
    `).get(mutationId) as any;

    if (!row || row.author_id !== authorId) {
      throw new NotFoundError("This page isn't available.");
    }

    let parsedEntities: any = [];
    try {
      parsedEntities = JSON.parse(row.affected_entities);
    } catch {
      parsedEntities = [row.affected_entities];
    }

    let priorContent: any = null;
    if (row.prior_content) {
      try {
        priorContent = JSON.parse(row.prior_content);
      } catch {
        priorContent = row.prior_content;
      }
    }

    let newContent: any = null;
    if (row.new_content) {
      try {
        newContent = JSON.parse(row.new_content);
      } catch {
        newContent = row.new_content;
      }
    }

    return {
      id: row.id,
      tokenId: row.token_id,
      tokenLabel: row.token_label || 'Agent',
      authorId: row.author_id,
      courseId: row.course_id,
      toolName: row.tool_name,
      idempotencyKey: row.idempotency_key,
      baseRevision: row.base_revision,
      newRevision: row.new_revision,
      affectedEntities: parsedEntities,
      priorContent,
      newContent,
      outcome: row.outcome,
      correlationId: row.correlation_id || null,
      createdAt: row.created_at,
    };
  }
}
