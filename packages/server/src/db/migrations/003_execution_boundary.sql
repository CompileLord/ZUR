-- 003_execution_boundary.sql
-- Module S1-M02: Python assessment and execution boundary (T020, T021, T024)

-- 1. Extend execution_jobs for payload storage and attempt reference
ALTER TABLE execution_jobs ADD COLUMN result_payload TEXT;
ALTER TABLE execution_jobs ADD COLUMN attempt_id TEXT;

-- 2. System Settings (for operator kill switch and operational flags)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO system_settings (key, value) VALUES ('execution_paused', 'false');
