import { DatabaseSync } from 'node:sqlite';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
} from 'zur-shared';
import type {
  CourseRosterResponse,
  RosterItem,
  OwnerStudentDetailResponse,
  OwnerStudentModuleItem,
  OwnerAssessmentAttemptItem,
  CourseAnalyticsResponse,
  ExerciseInsightItem,
  EnrollmentStatus,
  StepType,
  TerminalVerdict,
} from 'zur-shared';

export class TeacherRosterService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private checkCourseOwnerOrAdmin(actorId: string, courseId: string): void {
    const course = this.db
      .prepare('SELECT owner_id FROM courses WHERE id = ?')
      .get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    if (course.owner_id !== actorId) {
      throw new NotFoundError("This page isn't available.");
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const starCount = Math.max(3, Math.min(local.length - 2, 6));
    const maskedLocal =
      local.length > 1
        ? `${local[0]}${'*'.repeat(starCount)}${local[local.length - 1]}`
        : `${'*'.repeat(3)}`;
    return `${maskedLocal}@${domain}`;
  }

  private getRequiredStepIdsForVersion(courseId: string, versionId?: string | null): string[] {
    if (versionId) {
      const vRow = this.db
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

    const rows = this.db
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

  listRoster(
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
    this.checkCourseOwnerOrAdmin(actorId, courseId);
    if (options.status && !['active', 'left', 'revoked'].includes(options.status)) throw new ValidationError('Invalid enrollment status filter.');
    if (options.versionNumber !== undefined && (!Number.isSafeInteger(options.versionNumber) || options.versionNumber < 1)) throw new ValidationError('Invalid course version filter.');
    if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100)) throw new ValidationError('Limit must be between 1 and 100.');
    if (options.offset !== undefined && (!Number.isSafeInteger(options.offset) || options.offset < 0)) throw new ValidationError('Invalid roster offset.');
    if (options.search && options.search.length > 100) throw new ValidationError('Search is too long.');

    const versionRows = this.db
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

    const countRow = this.db
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

    const rows = this.db.prepare(selectQuery).all(...params, limit, offset) as any[];

    const students: RosterItem[] = rows.map((r) => {
      const requiredStepIds = this.getRequiredStepIdsForVersion(courseId, r.pinned_version_id);
      const totalRequired = requiredStepIds.length;

      let completedRequired = 0;
      if (totalRequired > 0) {
        const placeholders = requiredStepIds.map(() => '?').join(',');
        const compRow = this.db
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
      const actRow = this.db
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
        maskedEmail: this.maskEmail(r.email),
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

  getStudentDetail(
    actorId: string,
    courseId: string,
    enrollmentId: string
  ): OwnerStudentDetailResponse {
    this.checkCourseOwnerOrAdmin(actorId, courseId);

    const enrollment = this.db
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

    const progressRows = this.db
      .prepare('SELECT * FROM step_progress WHERE enrollment_id = ?')
      .all(enrollmentId) as any[];
    const progressMap = new Map<string, any>(progressRows.map((p) => [p.step_id, p]));

    const attemptCounts = this.db
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

    const lastActRow = this.db
      .prepare(
        `SELECT MAX(activity_time) as last_activity
         FROM (
           SELECT MAX(completed_at) as activity_time FROM step_progress WHERE enrollment_id = ? AND is_completed = 1
           UNION ALL
           SELECT MAX(created_at) as activity_time FROM assessment_attempts WHERE enrollment_id = ? AND is_infrastructure_failure = 0
         )`
      )
      .get(enrollmentId, enrollmentId) as any;

    const course = this.db.prepare('SELECT title FROM courses WHERE id = ?').get(courseId) as { title: string };
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

  listStudentAttempts(actorId: string, courseId: string, enrollmentId: string, stepId: string, limit = 10, offset = 0) {
    this.checkCourseOwnerOrAdmin(actorId, courseId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0) {
      throw new ValidationError('Invalid attempt pagination.');
    }
    const enrollment = this.db.prepare(`SELECT id, pinned_version_id FROM enrollments WHERE id = ? AND course_id = ?`).get(enrollmentId, courseId) as { id: string; pinned_version_id: string } | undefined;
    if (!enrollment) throw new NotFoundError("This page isn't available.");
    const count = this.db.prepare(`SELECT COUNT(*) as total FROM assessment_attempts WHERE enrollment_id = ? AND step_id = ? AND course_version_id = ?`)
      .get(enrollmentId, stepId, enrollment.pinned_version_id) as { total: number };
    const rows = this.db.prepare(`SELECT id, step_id, attempt_number, type, verdict, selected_options, execution_time_ms,
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

  getStudentAttempt(actorId: string, courseId: string, enrollmentId: string, stepId: string, attemptId: string) {
    this.checkCourseOwnerOrAdmin(actorId, courseId);
    const row = this.db.prepare(`SELECT aa.id, aa.step_id, aa.attempt_number, aa.type, aa.verdict, aa.code_snapshot, aa.selected_options,
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

  getCourseMetrics(
    actorId: string,
    courseId: string,
    options: {
      versionNumber?: number;
      timeWindowDays?: number;
    } = {}
  ): CourseAnalyticsResponse {
    this.checkCourseOwnerOrAdmin(actorId, courseId);

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
    const activeEnrRow = this.db
      .prepare(
        `SELECT COUNT(*) as count
         FROM enrollments e
         JOIN course_versions cv ON e.pinned_version_id = cv.id
         WHERE e.course_id = ? AND e.status = 'active' ${enrollmentVersionClause}`
      )
      .get(...enrollmentParams) as any;
    const activeEnrollments = activeEnrRow?.count || 0;

    // 2. Learning-active students in time window (active enrollments with activity >= cutoff)
    const learningActiveRow = this.db
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
    const activeRows = this.db
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
      const requiredStepIds = this.getRequiredStepIdsForVersion(courseId, enr.pinned_version_id);
      const totalReq = requiredStepIds.length;
      if (totalReq === 0) {
        // If course has no required steps, consider it 0%
        continue;
      }

      const placeholders = requiredStepIds.map(() => '?').join(',');
      const compRow = this.db
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
    const selectedVersion = this.db.prepare(`SELECT id, version_number, snapshot_data FROM course_versions
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
      const partRow = this.db
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
      const passRow = this.db
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

      const attemptRows = this.db.prepare(`
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
      const waiverRow = this.db.prepare(`SELECT COUNT(*) as count FROM step_progress sp JOIN enrollments e ON sp.enrollment_id = e.id
        WHERE sp.step_id = ? AND e.course_id = ? AND e.pinned_version_id = ? AND sp.is_waived = 1`).get(ex.step_id, courseId, selectedVersion.id) as any;
      const waiverCount = waiverRow?.count || 0;

      // Infrastructure failures count
      const infraRow = this.db.prepare(`SELECT COUNT(*) as count FROM assessment_attempts
        WHERE step_id = ? AND course_version_id = ? AND is_infrastructure_failure = 1 AND created_at >= ?`).get(ex.step_id, selectedVersion.id, cutoffDate) as any;
      const infrastructureFailureCount = infraRow?.count || 0;

      // Last activity
      const lastAct = this.db.prepare(`SELECT MAX(created_at) as last_act FROM assessment_attempts
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
      versions: (this.db.prepare('SELECT id, version_number FROM course_versions WHERE course_id = ? ORDER BY version_number').all(courseId) as any[])
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
}
