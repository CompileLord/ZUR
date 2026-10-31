import type { DatabaseSync } from 'node:sqlite';
import { NotFoundError, ValidationError } from 'zur-shared';
import type { OwnerStudentDetailResponse, OwnerStudentModuleItem, OwnerAssessmentAttemptItem, EnrollmentStatus, StepType } from 'zur-shared';
import { checkCourseOwnerOrAdmin } from './teacher-roster-access.ts';

export function getStudentDetail(
  db: DatabaseSync,
  actorId: string,
  courseId: string,
  enrollmentId: string
): OwnerStudentDetailResponse {
  checkCourseOwnerOrAdmin(db, actorId, courseId);

  const enrollment = db
    .prepare(
      `SELECT
        e.id AS enrollment_id,
        e.user_id AS student_id,
        e.status,
        e.created_at AS enrolled_at,
        e.updated_at,
        e.pinned_version_id,
        cv.version_number AS pinned_version_number,
        cv.snapshot_data,
        u.display_name
      FROM enrollments e
      JOIN users u ON e.user_id = u.id
      JOIN course_versions cv ON e.pinned_version_id = cv.id
      WHERE e.id = ? AND e.course_id = ?`
    )
    .get(enrollmentId, courseId) as any;

  if (!enrollment) {
    throw new NotFoundError("This page isn't available.");
  }

  // Load curriculum outline from pinned snapshot (or fallback to database)
  const curriculum: OwnerStudentModuleItem[] = [];
  let snapshotModules: any[] = [];
  if (enrollment.snapshot_data) {
    try {
      const snapshot = JSON.parse(enrollment.snapshot_data);
      snapshotModules = snapshot.modules || [];
    } catch {
      snapshotModules = [];
    }
  }

  const progressRows = db
    .prepare('SELECT * FROM step_progress WHERE enrollment_id = ?')
    .all(enrollmentId) as any[];
  const progressMap = new Map<string, any>(progressRows.map((p) => [p.step_id, p]));

  const attemptCounts = db
    .prepare(
      'SELECT step_id, COUNT(*) as count FROM assessment_attempts WHERE enrollment_id = ? GROUP BY step_id'
    )
    .all(enrollmentId) as any[];
  const attemptCountMap = new Map<string, number>(attemptCounts.map((a) => [a.step_id, a.count]));

  let totalRequired = 0;
  let completedRequired = 0;

  if (snapshotModules.length > 0 && snapshotModules.some((m) => m.lessons && m.lessons.length > 0)) {
    for (const mod of snapshotModules) {
      const lessons = (mod.lessons || []).map((les: any) => {
        const steps = (les.steps || []).map((st: any) => {
          const isReq = Boolean(st.isRequired);
          if (isReq) totalRequired++;

          const prog = progressMap.get(st.id);
          const isComp = Boolean(prog?.is_completed);
          const isWaived = Boolean(prog?.is_waived);
          if (isReq && (isComp || isWaived)) completedRequired++;

          return {
            stepId: st.id,
            title: st.title,
            type: st.type as StepType,
            isRequired: isReq,
            position: st.position,
            isCompleted: isComp,
            completedAt: prog?.completed_at || null,
            isWaived,
            waiverReason: prog?.waiver_reason || null,
            attemptsCount: attemptCountMap.get(st.id) || 0,
          };
        });

        return {
          lessonId: les.id,
          title: les.title,
          position: les.position,
          steps,
        };
      });

      curriculum.push({
        moduleId: mod.id,
        title: mod.title,
        position: mod.position,
        lessons,
      });
    }
  } else {
    throw new ValidationError('The published course version could not be read.');
  }

  const progressPercent =
    totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;

  const attempts: OwnerAssessmentAttemptItem[] = [];

  const lastActRow = db
    .prepare(
      `SELECT MAX(activity_time) as last_activity
       FROM (
         SELECT MAX(completed_at) as activity_time FROM step_progress WHERE enrollment_id = ? AND is_completed = 1
         UNION ALL
         SELECT MAX(created_at) as activity_time FROM assessment_attempts WHERE enrollment_id = ? AND is_infrastructure_failure = 0
       )`
    )
    .get(enrollmentId, enrollmentId) as any;

  const course = db.prepare('SELECT title FROM courses WHERE id = ?').get(courseId) as { title: string };
  const byStep: Record<string, OwnerAssessmentAttemptItem[]> = {};
  const stepProgress = Object.fromEntries(progressRows.map((p) => [p.step_id, {
    isCompleted: Boolean(p.is_completed),
    satisfied: Boolean(p.is_completed || p.is_waived),
    completedAt: p.completed_at || null,
    isWaived: Boolean(p.is_waived),
    waiverReason: p.waiver_reason || null,
    waivedAt: p.is_waived ? p.updated_at : null,
    attemptsCount: attemptCountMap.get(p.step_id) || 0,
    submissionCount: attemptCountMap.get(p.step_id) || 0,
  }]));
  const waivers = Object.fromEntries(progressRows.filter((p) => p.is_waived).map((p) => [p.step_id, {
    waivedAt: p.updated_at,
    reason: p.waiver_reason || 'Administrative waiver',
  }]));
  return {
    enrollment: {
      id: enrollment.enrollment_id,
      courseId,
      courseTitle: course.title,
      courseVersionId: enrollment.pinned_version_id,
      versionNumber: enrollment.pinned_version_number,
      status: enrollment.status as EnrollmentStatus,
      enrolledAt: enrollment.enrolled_at,
    },
    student: {
      enrollmentId: enrollment.enrollment_id,
      studentId: enrollment.student_id,
      displayName: enrollment.display_name,
      status: enrollment.status as EnrollmentStatus,
      pinnedVersionNumber: enrollment.pinned_version_number,
      pinnedVersionId: enrollment.pinned_version_id,
      enrolledAt: enrollment.enrolled_at,
      lastActivityAt: lastActRow?.last_activity || null,
      completedRequired,
      totalRequired,
      progressPercent,
    },
    curriculum: curriculum.map((mod) => ({
      ...mod, id: mod.moduleId, ordinal: mod.position + 1,
      lessons: mod.lessons.map((lesson) => ({
        ...lesson, id: lesson.lessonId, ordinal: lesson.position + 1,
        steps: lesson.steps.map((step) => ({
          ...step, id: step.stepId, ordinal: (step.position || 0) + 1,
          satisfied: Boolean(step.isCompleted || step.isWaived),
          submissionCount: step.attemptsCount,
        })),
      })),
    })),
    stepProgress,
    overallProgress: {
      requiredStepsCompleted: completedRequired,
      totalRequiredSteps: totalRequired,
      percentage: progressPercent,
      lastLearningActivityAt: lastActRow?.last_activity || null,
    },
    attempts: byStep,
    attemptList: attempts,
    waivers,
  };
}

export function listStudentAttempts(db: DatabaseSync, actorId: string, courseId: string, enrollmentId: string, stepId: string, limit = 10, offset = 0) {
  checkCourseOwnerOrAdmin(db, actorId, courseId);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new ValidationError('Invalid attempt pagination.');
  }
  const enrollment = db.prepare(`SELECT id, pinned_version_id FROM enrollments WHERE id = ? AND course_id = ?`).get(enrollmentId, courseId) as { id: string; pinned_version_id: string } | undefined;
  if (!enrollment) throw new NotFoundError("This page isn't available.");
  const count = db.prepare(`SELECT COUNT(*) as total FROM assessment_attempts WHERE enrollment_id = ? AND step_id = ? AND course_version_id = ?`)
    .get(enrollmentId, stepId, enrollment.pinned_version_id) as { total: number };
  const rows = db.prepare(`SELECT id, step_id, attempt_number, type, verdict, selected_options, execution_time_ms,
    is_infrastructure_failure, created_at FROM assessment_attempts
    WHERE enrollment_id = ? AND step_id = ? AND course_version_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(enrollmentId, stepId, enrollment.pinned_version_id, limit, offset) as any[];
  return { items: rows.map((a) => ({
    id: a.id, attemptId: a.id, stepId: a.step_id, attemptNumber: a.attempt_number, type: a.type,
    verdict: a.verdict, selectedOptionIds: a.selected_options ? JSON.parse(a.selected_options) : null,
    executionTimeMs: a.execution_time_ms ?? null, isInfrastructureFailure: Boolean(a.is_infrastructure_failure),
    createdAt: a.created_at, submittedAt: a.created_at,
  })), total: count.total, limit, offset };
}

export function getStudentAttempt(db: DatabaseSync, actorId: string, courseId: string, enrollmentId: string, stepId: string, attemptId: string) {
  checkCourseOwnerOrAdmin(db, actorId, courseId);
  const row = db.prepare(`SELECT aa.id, aa.step_id, aa.attempt_number, aa.type, aa.verdict, aa.code_snapshot, aa.selected_options,
    aa.execution_time_ms, aa.is_infrastructure_failure, aa.created_at FROM assessment_attempts aa
    JOIN enrollments e ON e.id = aa.enrollment_id AND e.pinned_version_id = aa.course_version_id
    WHERE aa.id = ? AND aa.enrollment_id = ? AND aa.step_id = ? AND e.id = ? AND e.course_id = ?`)
    .get(attemptId, enrollmentId, stepId, enrollmentId, courseId) as any;
  if (!row) throw new NotFoundError("This page isn't available.");
  return { id: row.id, attemptId: row.id, stepId: row.step_id, attemptNumber: row.attempt_number,
    type: row.type, verdict: row.verdict, submittedCode: row.code_snapshot ?? null,
    selectedOptionIds: row.selected_options ? JSON.parse(row.selected_options) : null,
    executionTimeMs: row.execution_time_ms ?? null, isInfrastructureFailure: Boolean(row.is_infrastructure_failure),
    submittedAt: row.created_at };
}
