CREATE TABLE IF NOT EXISTS auth_request_limits (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL,
  last_attempt_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_request_limits_last_attempt ON auth_request_limits(last_attempt_at);
