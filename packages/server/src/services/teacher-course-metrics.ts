import type { DatabaseSync } from 'node:sqlite';
import { ValidationError } from 'zur-shared';
import type { CourseAnalyticsResponse, ExerciseInsightItem, StepType } from 'zur-shared';
import { checkCourseOwnerOrAdmin, getRequiredStepIdsForVersion } from './teacher-roster-access.ts';

export function getCourseMetrics(
  db: DatabaseSync,
  actorId: string,
  courseId: string,
  options: {
    versionNumber?: number;
    timeWindowDays?: number;
  } = {}
): CourseAnalyticsResponse {
  checkCourseOwnerOrAdmin(db, actorId, courseId);

  if (options.versionNumber !== undefined && (!Number.isSafeInteger(options.versionNumber) || options.versionNumber < 1)) throw new ValidationError('Invalid version filter.');
  if (options.timeWindowDays !== undefined && ![7, 14, 30, 90].includes(options.timeWindowDays)) throw new ValidationError('Invalid reporting window.');
  const versionNumber = options.versionNumber || undefined;
  const timeWindowDays = options.timeWindowDays || 7;
  const cutoffDate = new Date(Date.now() - timeWindowDays * 24 * 60 * 60 * 1000).toISOString();

  let enrollmentVersionClause = '';
  const enrollmentParams: any[] = [courseId];
  if (versionNumber) {
    enrollmentVersionClause = ' AND cv.version_number = ?';
    enrollmentParams.push(versionNumber);
  }

  // 1. Active enrollments
  const activeEnrRow = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM enrollments e
       JOIN course_versions cv ON e.pinned_version_id = cv.id
       WHERE e.course_id = ? AND e.status = 'active' ${enrollmentVersionClause}`
    )
    .get(...enrollmentParams) as any;
  const activeEnrollments = activeEnrRow?.count || 0;

  // 2. Learning-active students in time window (active enrollments with activity >= cutoff)
  const learningActiveRow = db
    .prepare(
      `SELECT COUNT(DISTINCT e.user_id) as count
       FROM enrollments e
       JOIN course_versions cv ON e.pinned_version_id = cv.id
       WHERE e.course_id = ? AND e.status = 'active' ${enrollmentVersionClause}
         AND (
           EXISTS (SELECT 1 FROM step_progress sp WHERE sp.enrollment_id = e.id AND sp.is_completed = 1 AND sp.completed_at >= ?)
           OR EXISTS (SELECT 1 FROM assessment_attempts aa WHERE aa.enrollment_id = e.id AND aa.is_infrastructure_failure = 0 AND aa.created_at >= ?)
         )`
    )
    .get(...enrollmentParams, cutoffDate, cutoffDate) as any;
  const learningActiveStudents = learningActiveRow?.count || 0;

  // 3. Completion & Average Progress across active enrollments
  const activeRows = db
    .prepare(
      `SELECT e.id as enrollment_id, e.pinned_version_id
       FROM enrollments e
       JOIN course_versions cv ON e.pinned_version_id = cv.id
       WHERE e.course_id = ? AND e.status = 'active' ${enrollmentVersionClause}`
    )
    .all(...enrollmentParams) as any[];

  let completedCount = 0;
  let totalProgressSum = 0;

  for (const enr of activeRows) {
    const requiredStepIds = getRequiredStepIdsForVersion(db, courseId, enr.pinned_version_id);
    const totalReq = requiredStepIds.length;
    if (totalReq === 0) {
      // If course has no required steps, consider it 0%
      continue;
    }

    const placeholders = requiredStepIds.map(() => '?').join(',');
    const compRow = db
      .prepare(
        `SELECT COUNT(*) as count
         FROM step_progress
         WHERE enrollment_id = ? AND step_id IN (${placeholders}) AND (is_completed = 1 OR is_waived = 1)`
      )
      .get(enr.enrollment_id, ...requiredStepIds) as any;
    const comp = compRow?.count || 0;

    const progress = (comp / totalReq) * 100;
    totalProgressSum += progress;

    if (comp >= totalReq) {
      completedCount++;
    }
  }

  const completionRatePercent =
    activeEnrollments > 0 ? Math.round((completedCount / activeEnrollments) * 1000) / 10 : null;

  const averageProgressPercent =
    activeEnrollments > 0 ? Math.round((totalProgressSum / activeEnrollments) * 10) / 10 : null;

  // An exercise insight is always for one immutable release.
  const selectedVersion = db.prepare(`SELECT id, version_number, snapshot_data FROM course_versions
    WHERE course_id = ? ${versionNumber ? 'AND version_number = ?' : ''}
    ORDER BY version_number DESC LIMIT 1`).get(...(versionNumber ? [courseId, versionNumber] : [courseId])) as any;
  if (versionNumber && !selectedVersion) throw new ValidationError('Unknown course version.');
  const insightVersionNumber: number | null = selectedVersion?.version_number ?? null;
  const exerciseSteps: Array<{ step_id: string; step_title: string; type: string; lesson_title: string; module_title: string }> = [];
  if (selectedVersion) {
    const snapshot = JSON.parse(selectedVersion.snapshot_data);
    for (const module of snapshot.modules || []) {
      for (const lesson of module.lessons || []) {
        for (const step of lesson.steps || []) {
          if (step.type === 'python' || step.type === 'quiz') exerciseSteps.push({
            step_id: step.id, step_title: step.title, type: step.type,
            lesson_title: lesson.title, module_title: module.title,
          });
        }
      }
    }
  }

  const exercises: ExerciseInsightItem[] = exerciseSteps.map((ex) => {
    let attemptFilter = `
      WHERE aa.step_id = ?
        AND aa.is_infrastructure_failure = 0
        AND aa.enrollment_id = e.id
        AND e.course_id = c.id
        AND c.id = ?
        AND aa.user_id = u.id
        AND u.id != c.owner_id
        AND u.capabilities NOT LIKE '%admin%'
    `;
    const attemptParams: any[] = [ex.step_id, courseId];

    attemptFilter += ' AND cv.id = ? AND aa.created_at >= ?';
    attemptParams.push(selectedVersion.id, cutoffDate);

    // Distinct participants: distinct students with at least 1 non-infrastructure submission
    const partRow = db
      .prepare(
        `SELECT COUNT(DISTINCT aa.user_id) as count
         FROM assessment_attempts aa
         JOIN enrollments e ON aa.enrollment_id = e.id
         JOIN courses c ON e.course_id = c.id
         JOIN users u ON aa.user_id = u.id
         JOIN course_versions cv ON aa.course_version_id = cv.id
         ${attemptFilter}`
      )
      .get(...attemptParams) as any;
    const distinctParticipants = partRow?.count || 0;

    // Distinct passing students: distinct students with verdict = 'PASSED'
    const passRow = db
      .prepare(
        `SELECT COUNT(DISTINCT aa.user_id) as count
         FROM assessment_attempts aa
         JOIN enrollments e ON aa.enrollment_id = e.id
         JOIN courses c ON e.course_id = c.id
         JOIN users u ON aa.user_id = u.id
         JOIN course_versions cv ON aa.course_version_id = cv.id
         ${attemptFilter} AND aa.verdict = 'PASSED'`
      )
      .get(...attemptParams) as any;
    const distinctPassingStudents = passRow?.count || 0;

    const passRatePercent =
      distinctParticipants > 0
        ? Math.round((distinctPassingStudents / distinctParticipants) * 1000) / 10
        : null;

    const attemptRows = db.prepare(`
      SELECT aa.user_id, aa.verdict, aa.created_at, aa.id
      FROM assessment_attempts aa
      JOIN enrollments e ON aa.enrollment_id = e.id
      JOIN courses c ON e.course_id = c.id
      JOIN users u ON aa.user_id = u.id
      JOIN course_versions cv ON aa.course_version_id = cv.id
      ${attemptFilter}
      ORDER BY aa.user_id, aa.created_at, aa.id
    `).all(...attemptParams) as any[];
    const countsToFirstPass: number[] = [];
    let currentStudent = '';
    let attemptsBeforePass = 0;
    let alreadyPassed = false;
    for (const attempt of attemptRows) {
      if (attempt.user_id !== currentStudent) {
        currentStudent = attempt.user_id;
        attemptsBeforePass = 0;
        alreadyPassed = false;
      }
      if (alreadyPassed) continue;
      attemptsBeforePass++;
      if (attempt.verdict === 'PASSED') {
        countsToFirstPass.push(attemptsBeforePass);
        alreadyPassed = true;
      }
    }
    countsToFirstPass.sort((a, b) => a - b);
    const middle = Math.floor(countsToFirstPass.length / 2);
    const medianAttemptsToPass = countsToFirstPass.length === 0 ? null
      : countsToFirstPass.length % 2 === 1 ? countsToFirstPass[middle]
      : (countsToFirstPass[middle - 1] + countsToFirstPass[middle]) / 2;

    // Waivers count
    const waiverRow = db.prepare(`SELECT COUNT(*) as count FROM step_progress sp JOIN enrollments e ON sp.enrollment_id = e.id
      WHERE sp.step_id = ? AND e.course_id = ? AND e.pinned_version_id = ? AND sp.is_waived = 1`).get(ex.step_id, courseId, selectedVersion.id) as any;
    const waiverCount = waiverRow?.count || 0;

    // Infrastructure failures count
    const infraRow = db.prepare(`SELECT COUNT(*) as count FROM assessment_attempts
      WHERE step_id = ? AND course_version_id = ? AND is_infrastructure_failure = 1 AND created_at >= ?`).get(ex.step_id, selectedVersion.id, cutoffDate) as any;
    const infrastructureFailureCount = infraRow?.count || 0;

    // Last activity
    const lastAct = db.prepare(`SELECT MAX(created_at) as last_act FROM assessment_attempts
      WHERE step_id = ? AND course_version_id = ? AND created_at >= ?`).get(ex.step_id, selectedVersion.id, cutoffDate) as any;

    return {
      stepId: ex.step_id,
      stepTitle: ex.step_title,
      lessonTitle: ex.lesson_title,
      moduleTitle: ex.module_title,
      type: ex.type as StepType,
      distinctParticipants,
      distinctPassingStudents,
      passRatePercent,
      medianAttemptsToPass,
      lastActivityAt: lastAct?.last_act || null,
      waiverCount,
      infrastructureFailureCount,
    };
  });

  return {
    courseId,
    versions: (db.prepare('SELECT id, version_number FROM course_versions WHERE course_id = ? ORDER BY version_number').all(courseId) as any[])
      .map((row) => ({ id: row.id, versionNumber: row.version_number })),
    versionNumber: insightVersionNumber,
    timeWindowDays,
    activeEnrollments,
    learningActiveStudents,
    completion: {
      completedCount,
      totalActive: activeEnrollments,
      ratePercent: completionRatePercent,
      count: completedCount,
      total: activeEnrollments,
      percentage: completionRatePercent,
    },
    averageProgressPercent,
    exercises,
    exerciseInsights: exercises,
  };
}
