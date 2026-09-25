-- 005_product_analytics.sql
-- Module S4-M02: Privacy-safe product analytics (T076)

CREATE TABLE IF NOT EXISTS product_analytics_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  pseudonymous_user_id TEXT NOT NULL,
  course_id TEXT,
  course_version_id TEXT,
  step_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS product_analytics_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_course_event ON product_analytics_events(course_id, event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_user_event ON product_analytics_events(pseudonymous_user_id, event_name);
