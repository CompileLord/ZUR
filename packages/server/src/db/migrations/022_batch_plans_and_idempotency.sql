-- Migration 022: Batch change plans, idempotency request digests, and upload session staging
ALTER TABLE agent_mutations ADD COLUMN request_digest TEXT;

ALTER TABLE media_uploads ADD COLUMN expected_checksum TEXT;
ALTER TABLE media_uploads ADD COLUMN staged_file_path TEXT;
ALTER TABLE media_uploads ADD COLUMN uploaded_bytes INTEGER DEFAULT 0;
ALTER TABLE media_uploads ADD COLUMN uploaded_checksum TEXT;
ALTER TABLE media_uploads ADD COLUMN status TEXT DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS course_change_plans (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL REFERENCES author_access_tokens(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  base_revision INTEGER NOT NULL,
  request_digest TEXT NOT NULL,
  plan_payload TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_change_plans_lookup ON course_change_plans(token_id, course_id);
