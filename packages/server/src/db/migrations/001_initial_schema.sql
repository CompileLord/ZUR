-- ZUR Authoritative Relational Schema (PRD §17, tasks.json T006)
-- SQLite / PostgreSQL Compatible DDL

-- 1. Users & Capabilities
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  capabilities TEXT NOT NULL DEFAULT '["student"]', -- JSON array: student, author, admin
  account_status TEXT NOT NULL DEFAULT 'active', -- active, suspended, pending_deletion, purged
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status);

-- 2. Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);

-- 3. Verification & Reset Tokens
CREATE TABLE IF NOT EXISTS verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL, -- email_verification, password_reset
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_lookup ON verification_tokens(token_hash, type);

-- 4. Categories
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 5. Courses (Drafts and metadata)
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  tags TEXT NOT NULL DEFAULT '[]', -- JSON array of at most 5 normalized strings
  difficulty TEXT NOT NULL DEFAULT 'beginner', -- beginner, intermediate, advanced
  language TEXT NOT NULL DEFAULT 'en',
  learning_outcomes TEXT NOT NULL DEFAULT '[]', -- JSON array
  prerequisites TEXT NOT NULL DEFAULT '',
  estimated_duration_minutes INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'private', -- public, unlisted, private
  enrollment_policy TEXT NOT NULL DEFAULT 'invitation_only', -- open, invitation_only
  publication_status TEXT NOT NULL DEFAULT 'draft', -- draft, published, archived
  is_suspended INTEGER NOT NULL DEFAULT 0,
  draft_revision INTEGER NOT NULL DEFAULT 1,
  current_version_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_courses_owner_id ON courses(owner_id);
CREATE INDEX IF NOT EXISTS idx_courses_category_id ON courses(category_id);
CREATE INDEX IF NOT EXISTS idx_courses_publication ON courses(publication_status, visibility, is_suspended);

-- 6. Course Versions (Immutable published snapshots)
CREATE TABLE IF NOT EXISTS course_versions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL,
  snapshot_data TEXT NOT NULL, -- Full JSON snapshot of course structure, nodes, and test cases
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(course_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_course_versions_lookup ON course_versions(course_id, version_number);

-- 7. Modules
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_modules_course_pos ON modules(course_id, position);

-- 8. Lessons
CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_lessons_module_pos ON lessons(module_id, position);

-- 9. Steps
CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- theory, video, quiz, python
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 1,
  estimated_duration_minutes INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_steps_lesson_pos ON steps(lesson_id, position);

-- 10. Step Contents (Revisioned content payloads)
CREATE TABLE IF NOT EXISTS step_contents (
  id TEXT PRIMARY KEY,
  step_id TEXT UNIQUE NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  content_payload TEXT NOT NULL, -- JSON string
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 11. Test Cases (For Python steps)
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  step_id TEXT NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  stdin TEXT NOT NULL DEFAULT '',
  expected_stdout TEXT NOT NULL DEFAULT '',
  is_hidden INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_test_cases_step ON test_cases(step_id, is_hidden, position);

-- 12. Enrollments (Pinned to immutable course versions)
CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  pinned_version_id TEXT NOT NULL REFERENCES course_versions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active', -- active, left, revoked
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id, status);

-- 13. Invitations
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash TEXT UNIQUE NOT NULL,
  recipient_email TEXT,
  type TEXT NOT NULL, -- email, shareable_link
  max_uses INTEGER,
  uses_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  is_revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_course ON invitations(course_id, is_revoked);

-- 14. Code Drafts (Student autosaved workspace)
CREATE TABLE IF NOT EXISTS code_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  code TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(user_id, enrollment_id, step_id)
);

-- 15. Execution Jobs (Queue coordination)
CREATE TABLE IF NOT EXISTS execution_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrollment_id TEXT REFERENCES enrollments(id) ON DELETE SET NULL,
  step_id TEXT NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL, -- run_samples, run_custom, submit, author_validation
  code TEXT NOT NULL,
  stdin TEXT,
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'queued', -- queued, running, completed, failed
  lease_expires_at TEXT,
  worker_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_lease ON execution_jobs(status, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_idempotency ON execution_jobs(idempotency_key);

-- 16. Assessment Attempts (Authoritative grading outcomes)
CREATE TABLE IF NOT EXISTS assessment_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
  step_id TEXT NOT NULL REFERENCES steps(id) ON DELETE RESTRICT,
  course_version_id TEXT NOT NULL REFERENCES course_versions(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  type TEXT NOT NULL, -- quiz, python
  verdict TEXT NOT NULL, -- PASSED, WRONG_ANSWER, SYNTAX_ERROR, RUNTIME_ERROR, TIME_LIMIT, MEMORY_LIMIT, OUTPUT_LIMIT, INTERNAL_ERROR
  code_snapshot TEXT,
  selected_options TEXT, -- JSON array of selected option IDs
  execution_time_ms INTEGER,
  is_infrastructure_failure INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_attempts_enrollment_step ON assessment_attempts(enrollment_id, step_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON assessment_attempts(user_id, verdict);

-- 17. Step Progress (Satisfied requirements)
CREATE TABLE IF NOT EXISTS step_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL REFERENCES steps(id) ON DELETE RESTRICT,
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  is_waived INTEGER NOT NULL DEFAULT 0,
  waiver_reason TEXT,
  waived_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(enrollment_id, step_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_enrollment ON step_progress(enrollment_id, is_completed, is_waived);

-- 18. Media Assets
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  dimensions TEXT, -- JSON { width, height }
  alt_text TEXT,
  is_decorative INTEGER NOT NULL DEFAULT 0,
  caption TEXT,
  processing_status TEXT NOT NULL DEFAULT 'processing', -- processing, ready, quarantined, failed
  reference_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_media_course ON media_assets(course_id, processing_status);

-- 19. Media Uploads (Bounded upload sessions)
CREATE TABLE IF NOT EXISTS media_uploads (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upload_token_hash TEXT UNIQUE NOT NULL,
  max_bytes INTEGER NOT NULL,
  allowed_mime TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 20. Reports (Issue triage)
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  course_version_id TEXT REFERENCES course_versions(id) ON DELETE SET NULL,
  step_id TEXT REFERENCES steps(id) ON DELETE SET NULL,
  type TEXT NOT NULL, -- broken_exercise, inappropriate_content, other
  description TEXT NOT NULL,
  submitted_code TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open, investigating, resolved
  resolution_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_course_status ON reports(course_id, status);

-- 21. Audit Events (Traceability of sensitive actions)
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  metadata TEXT, -- JSON metadata
  correlation_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_events(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id, created_at);

-- 22. Author Access Tokens (MCP Credentials)
CREATE TABLE IF NOT EXISTS author_access_tokens (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_identifier TEXT UNIQUE NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  scopes TEXT NOT NULL, -- JSON array of TokenScope
  course_restrictions TEXT, -- JSON array of course IDs or NULL for all owned
  expires_at TEXT NOT NULL,
  is_revoked INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_author_tokens_lookup ON author_access_tokens(token_hash, is_revoked);
CREATE INDEX IF NOT EXISTS idx_author_tokens_author ON author_access_tokens(author_id);

-- 23. Agent Mutations (Receipts and traceability)
CREATE TABLE IF NOT EXISTS agent_mutations (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL REFERENCES author_access_tokens(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  new_revision INTEGER NOT NULL,
  affected_entities TEXT NOT NULL, -- JSON array
  prior_content TEXT, -- JSON snapshot for recovery
  new_content TEXT, -- JSON snapshot after mutation
  outcome TEXT NOT NULL,
  correlation_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(token_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_mutations_course ON agent_mutations(course_id, created_at);

-- 24. Recovery Revisions (30-day draft recovery snapshots)
CREATE TABLE IF NOT EXISTS recovery_revisions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  content_snapshot TEXT NOT NULL, -- Full JSON draft snapshot
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_recovery_revisions_course ON recovery_revisions(course_id, revision_number);

-- 25. Deletion Registry (AC-20 Backup restore re-deletion log)
CREATE TABLE IF NOT EXISTS deletion_registry (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  purged_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deletion_registry_email ON deletion_registry(email_hash);
