import type { DatabaseSync } from 'node:sqlite';
import { NotFoundError, ValidationError } from 'zur-shared';

export function checkCourseOwnerOrAdmin(db: DatabaseSync, actorId: string, courseId: string): void {
  const course = db
    .prepare('SELECT owner_id FROM courses WHERE id = ?')
    .get(courseId) as any;
  if (!course) {
    throw new NotFoundError("This page isn't available.");
  }

  if (course.owner_id !== actorId) {
    throw new NotFoundError("This page isn't available.");
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const starCount = Math.max(3, Math.min(local.length - 2, 6));
  const maskedLocal =
    local.length > 1
      ? `${local[0]}${'*'.repeat(starCount)}${local[local.length - 1]}`
      : `${'*'.repeat(3)}`;
  return `${maskedLocal}@${domain}`;
}

export function getRequiredStepIdsForVersion(db: DatabaseSync, courseId: string, versionId?: string | null): string[] {
  if (versionId) {
    const vRow = db
      .prepare('SELECT snapshot_data FROM course_versions WHERE id = ?')
      .get(versionId) as any;
    if (vRow?.snapshot_data) {
      try {
        const snapshot = JSON.parse(vRow.snapshot_data);
        const stepIds: string[] = [];
        for (const mod of snapshot.modules || []) {
          for (const les of mod.lessons || []) {
            for (const st of les.steps || []) {
              if (st.isRequired) stepIds.push(st.id);
            }
          }
        }
        return stepIds;
      } catch {
        throw new ValidationError('The published course version could not be read.');
      }
    }
    throw new ValidationError('The published course version could not be read.');
  }

  const rows = db
    .prepare(
      `SELECT s.id
       FROM steps s
       JOIN lessons l ON s.lesson_id = l.id
       JOIN modules m ON l.module_id = m.id
       WHERE m.course_id = ? AND s.is_required = 1`
    )
    .all(courseId) as any[];
  return rows.map((r) => r.id);
}
