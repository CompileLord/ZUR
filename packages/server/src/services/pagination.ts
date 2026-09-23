import { DatabaseSync } from 'node:sqlite';
import type { PaginatedResult } from 'zur-shared';

export interface PaginationQueryOptions {
  countQuery: string;
  dataQuery: string;
  params: any[];
  limit?: number;
  offset?: number;
  maxLimit?: number;
}

export function paginate<T>(db: DatabaseSync, options: PaginationQueryOptions): PaginatedResult<T> {
  const maxLimit = options.maxLimit || 100;
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), maxLimit);
  const offset = Math.max(Number(options.offset) || 0, 0);

  // 1. Get total count
  const countRow = db.prepare(options.countQuery).get(...options.params) as { count: number } | undefined;
  const total = countRow ? Number(countRow.count) : 0;

  // 2. Fetch page items with LIMIT and OFFSET
  const paginatedSql = `${options.dataQuery} LIMIT ? OFFSET ?`;
  const items = db.prepare(paginatedSql).all(...options.params, limit, offset) as T[];

  const hasMore = offset + items.length < total;

  return {
    items,
    total,
    limit,
    offset,
    hasMore,
  };
}
