-- Migration 021: Durable publication idempotency tracking
CREATE TABLE IF NOT EXISTS publication_idempotency (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_payload_hash TEXT NOT NULL,
  response_payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_pub_idempotency_lookup ON publication_idempotency(owner_id, course_id, idempotency_key);
