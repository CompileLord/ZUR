import type { DatabaseSync } from 'node:sqlite';
import { ValidationError } from 'zur-shared';
import type { CourseRosterResponse, RosterItem, EnrollmentStatus } from 'zur-shared';
import { checkCourseOwnerOrAdmin, getRequiredStepIdsForVersion, maskEmail } from './teacher-roster-access.ts';

export function listRoster(
  db: DatabaseSync,
  actorId: string,
  courseId: string,
  options: {
    search?: string;
    status?: string;
    versionNumber?: number;
    limit?: number;
    offset?: number;
  } = {}
): CourseRosterResponse {
  checkCourseOwnerOrAdmin(db, actorId, courseId);
  if (options.status && !['active', 'left', 'revoked'].includes(options.status)) throw new ValidationError('Invalid enrollment status filter.');
  if (options.versionNumber !== undefined && (!Number.isSafeInteger(options.versionNumber) || options.versionNumber < 1)) throw new ValidationError('Invalid course version filter.');
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100)) throw new ValidationError('Limit must be between 1 and 100.');
  if (options.offset !== undefined && (!Number.isSafeInteger(options.offset) || options.offset < 0)) throw new ValidationError('Invalid roster offset.');
  if (options.search && options.search.length > 100) throw new ValidationError('Search is too long.');

  const versionRows = db
    .prepare(
      'SELECT id, version_number FROM course_versions WHERE course_id = ? ORDER BY version_number ASC'
    )
    .all(courseId) as any[];
  const versions = versionRows.map((v) => ({
    id: v.id,
    versionNumber: v.version_number,
  }));

  let baseQuery = `
    FROM enrollments e
    JOIN users u ON e.user_id = u.id
    JOIN course_versions cv ON e.pinned_version_id = cv.id
    WHERE e.course_id = ?
  `;
  const params: any[] = [courseId];

  if (options.status) {
    baseQuery += ' AND e.status = ?';
    params.push(options.status);
  }

  if (options.versionNumber) {
    baseQuery += ' AND cv.version_number = ?';
    params.push(options.versionNumber);
  }

  if (options.search && options.search.trim()) {
    baseQuery += ' AND LOWER(u.display_name) LIKE ?';
    params.push(`%${options.search.trim().toLowerCase()}%`);
  }

  const countRow = db
    .prepare(`SELECT COUNT(*) as total ${baseQuery}`)
    .get(...params) as any;
  const total = countRow?.total || 0;

  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  const selectQuery = `
    SELECT
      e.id AS enrollment_id,
      e.user_id AS student_id,
      e.status,
      e.created_at AS enrolled_at,
      e.updated_at,
      e.pinned_version_id,
      cv.version_number AS pinned_version_number,
      u.display_name,
      u.email
    ${baseQuery}
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(selectQuery).all(...params, limit, offset) as any[];

  const students: RosterItem[] = rows.map((r) => {
    const requiredStepIds = getRequiredStepIdsForVersion(db, courseId, r.pinned_version_id);
    const totalRequired = requiredStepIds.length;

    let completedRequired = 0;
    if (totalRequired > 0) {
      const placeholders = requiredStepIds.map(() => '?').join(',');
      const compRow = db
        .prepare(
          `SELECT COUNT(*) as count
           FROM step_progress
           WHERE enrollment_id = ? AND step_id IN (${placeholders}) AND (is_completed = 1 OR is_waived = 1)`
        )
        .get(r.enrollment_id, ...requiredStepIds) as any;
      completedRequired = compRow?.count || 0;
    }

    const progressPercent =
      totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;

    // Find last learning activity: MAX of step_progress completed_at (actual completion) and non-infra assessment_attempts created_at
    const actRow = db
      .prepare(
        `SELECT MAX(activity_time) as last_activity
         FROM (
           SELECT MAX(completed_at) as activity_time FROM step_progress WHERE enrollment_id = ? AND is_completed = 1
           UNION ALL
           SELECT MAX(created_at) as activity_time FROM assessment_attempts WHERE enrollment_id = ? AND is_infrastructure_failure = 0
         )`
      )
      .get(r.enrollment_id, r.enrollment_id) as any;

    return {
      enrollmentId: r.enrollment_id,
      studentId: r.student_id,
      displayName: r.display_name,
      maskedEmail: maskEmail(r.email),
      pinnedVersionNumber: r.pinned_version_number,
      status: r.status as EnrollmentStatus,
      enrolledAt: r.enrolled_at,
      lastActivityAt: actRow?.last_activity || null,
      completedStepsCount: completedRequired,
      totalRequiredStepsCount: totalRequired,
      progressPercent,
    };
  });

  return { students, total, limit, offset, versions };
}
