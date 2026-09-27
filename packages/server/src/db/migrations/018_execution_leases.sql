ALTER TABLE execution_jobs ADD COLUMN lease_token TEXT;
ALTER TABLE execution_jobs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE execution_jobs ADD COLUMN deadline_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_user_idempotency ON execution_jobs(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_execution_admission ON execution_jobs(status, created_at);
