-- 002_identity_and_privacy.sql
-- Module S1-M01: User Preferences and Privacy Requests (T016, T017)

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system', -- dark, light, system
  editor_font_size INTEGER NOT NULL DEFAULT 14, -- 12, 14, 16, 18
  indentation_spaces INTEGER NOT NULL DEFAULT 4, -- 2, 4
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL, -- export, deletion
  status TEXT NOT NULL DEFAULT 'submitted', -- submitted, pending, completed, failed
  consequence_acknowledged INTEGER NOT NULL DEFAULT 1,
  blocker_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_user ON privacy_requests(user_id, status);
