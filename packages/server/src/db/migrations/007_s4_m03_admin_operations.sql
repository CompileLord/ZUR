CREATE TABLE IF NOT EXISTS admin_support_access (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_support_scope ON admin_support_access(admin_id, student_id, course_id, expires_at, revoked_at);

ALTER TABLE reports ADD COLUMN resolution_outcome TEXT;
ALTER TABLE reports ADD COLUMN internal_notes TEXT;
ALTER TABLE reports ADD COLUMN resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS deletion_registry (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  purged_at TEXT NOT NULL,
  reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deletion_registry_user ON deletion_registry(user_id);

CREATE TABLE IF NOT EXISTS privacy_exports (
  request_id TEXT PRIMARY KEY REFERENCES privacy_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  package_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  downloaded_at TEXT,
  download_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_privacy_exports_user_expiry ON privacy_exports(user_id, expires_at);
