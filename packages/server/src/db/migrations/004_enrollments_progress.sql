-- 004_enrollments_progress.sql
-- Module S2-M03: Enrollment and Progress tracking (T045, T047)

ALTER TABLE enrollments ADD COLUMN last_visited_step_id TEXT;
