CREATE TABLE IF NOT EXISTS author_validation_admissions (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_author_validation_admissions ON author_validation_admissions(author_id, started_at, completed_at);
