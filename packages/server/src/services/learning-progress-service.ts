import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from 'zur-shared';
import type { CourseVersionSnapshot } from 'zur-shared';

export interface ProgressStepItem {
  id: string;
  title: string;
  type: string;
  estimatedDurationMinutes: number;
  isRequired: boolean;
  isCompleted: boolean;
  isWaived: boolean;
  waiverReason?: string | null;
  completedAt?: string | null;
  lessonId: string;
  lessonTitle: string;
  moduleId: string;
  moduleTitle: string;
}

export interface CourseProgressSummary {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  description: string;
  difficulty: string;
  estimatedDurationMinutes: number;
  pinnedVersionId: string;
  pinnedVersionNumber: number;
  totalSteps: number;
  totalRequired: number;
  completedSteps: number;
  completedRequired: number;
  waivedRequired: number;
  percentage: number;
  isCompleted: boolean;
  lastVisitedStepId: string | null;
  nextIncompleteStepId: string | null;
  steps: ProgressStepItem[];
}

export class LearningProgressService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private getPinnedSnapshotStep(pinnedVersionId: string, stepId: string): any {
    const versionRow = this.db
      .prepare('SELECT id, version_number, snapshot_data FROM course_versions WHERE id = ?')
      .get(pinnedVersionId) as any;

    if (!versionRow) {
      throw new NotFoundError("This page isn't available.");
    }

    let snapshot: CourseVersionSnapshot;
    try {
      snapshot = JSON.parse(versionRow.snapshot_data);
    } catch {
      throw new Error('Corrupt course version snapshot data.');
    }

    for (const mod of snapshot.modules || []) {
      for (const les of mod.lessons || []) {
        for (const stp of les.steps || []) {
          if (stp.id === stepId) {
            return stp;
          }
        }
      }
    }

    return null;
  }

  markStepComplete(
    userId: string,
    enrollmentId: string,
    stepId: string
  ): CourseProgressSummary {
    const enrollment = this.db
      .prepare('SELECT * FROM enrollments WHERE id = ?')
      .get(enrollmentId) as any;

    if (!enrollment || enrollment.user_id !== userId) {
      throw new NotFoundError("This page isn't available.");
    }

    if (enrollment.status !== 'active') {
      throw new AuthorizationError('Cannot update progress on inactive enrollment.');
    }

    const step = this.getPinnedSnapshotStep(enrollment.pinned_version_id, stepId);
    if (!step) {
      throw new NotFoundError("This page isn't available.");
    }

    if (step.type !== 'theory' && step.type !== 'video') {
      throw new ValidationError(
        `Assessments (${step.type}) cannot be manually marked complete; completion requires authoritative passing submission.`
      );
    }

    const now = new Date().toISOString();
    const progressId = `prog-${crypto.randomUUID()}`;

    // Upsert step_progress: preserve completed_at and ensure idempotent completion
    this.db
      .prepare(
        `INSERT INTO step_progress (
          id, user_id, enrollment_id, step_id, is_completed, completed_at, is_waived, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, 1, ?, 0, ?, ?
        ) ON CONFLICT(enrollment_id, step_id) DO UPDATE SET
          is_completed = 1,
          completed_at = COALESCE(step_progress.completed_at, excluded.completed_at),
          updated_at = excluded.updated_at`
      )
      .run(progressId, userId, enrollmentId, stepId, now, now, now);

    // Update last visited step
    this.db
      .prepare('UPDATE enrollments SET last_visited_step_id = ?, updated_at = ? WHERE id = ?')
      .run(stepId, now, enrollmentId);

    return this.getCourseProgress(userId, enrollmentId);
  }

  recordStepVisit(
    userId: string,
    enrollmentId: string,
    stepId: string
  ): { success: boolean; lastVisitedStepId: string } {
    const enrollment = this.db
      .prepare('SELECT * FROM enrollments WHERE id = ?')
      .get(enrollmentId) as any;

    if (!enrollment || enrollment.user_id !== userId) {
      throw new NotFoundError("This page isn't available.");
    }

    if (enrollment.status !== 'active') {
      throw new AuthorizationError('Cannot update progress on inactive enrollment.');
    }

    const step = this.getPinnedSnapshotStep(enrollment.pinned_version_id, stepId);
    if (!step) {
      throw new NotFoundError("This page isn't available.");
    }

    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE enrollments SET last_visited_step_id = ?, updated_at = ? WHERE id = ?')
      .run(stepId, now, enrollmentId);

    return { success: true, lastVisitedStepId: stepId };
  }

  getCourseProgress(userId: string, enrollmentId: string): CourseProgressSummary {
    const enrollment = this.db
      .prepare(
        `SELECT
          e.id, e.user_id, e.course_id, e.pinned_version_id, e.status, e.last_visited_step_id,
          c.title AS course_title
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        WHERE e.id = ?`
      )
      .get(enrollmentId) as any;

    if (!enrollment || enrollment.user_id !== userId) {
      throw new NotFoundError("This page isn't available.");
    }

    const versionRow = this.db
      .prepare('SELECT id, version_number, snapshot_data FROM course_versions WHERE id = ?')
      .get(enrollment.pinned_version_id) as any;

    if (!versionRow) {
      throw new NotFoundError('Pinned course version snapshot not found.');
    }

    let snapshot: CourseVersionSnapshot;
    try {
      snapshot = JSON.parse(versionRow.snapshot_data);
    } catch {
      throw new Error('Corrupt course version snapshot data.');
    }

    // Retrieve all step progress records for this enrollment
    const progressRows = this.db
      .prepare(
        'SELECT step_id, is_completed, completed_at, is_waived, waiver_reason FROM step_progress WHERE enrollment_id = ?'
      )
      .all(enrollmentId) as any[];

    const progressMap = new Map<
      string,
      { isCompleted: boolean; completedAt: string | null; isWaived: boolean; waiverReason: string | null }
    >();
    for (const p of progressRows) {
      progressMap.set(p.step_id, {
        isCompleted: Boolean(p.is_completed),
        completedAt: p.completed_at ?? null,
        isWaived: Boolean(p.is_waived),
        waiverReason: p.waiver_reason ?? null,
      });
    }

    // Traverse pinned snapshot modules -> lessons -> steps
    const steps: ProgressStepItem[] = [];
    let totalRequired = 0;
    let completedRequired = 0;
    let waivedRequired = 0;
    let completedSteps = 0;

    for (const mod of snapshot.modules || []) {
      for (const les of mod.lessons || []) {
        for (const stp of les.steps || []) {
          const isReq = Boolean(stp.isRequired ?? (stp as any).is_required ?? true);
          const prog = progressMap.get(stp.id);

          const isCompleted = Boolean(prog?.isCompleted);
          const isWaived = Boolean(prog?.isWaived);
          const isSatisfied = isCompleted || isWaived;

          if (isReq) {
            totalRequired += 1;
            if (isSatisfied) {
              completedRequired += 1;
            }
            if (isWaived) {
              waivedRequired += 1;
            }
          }

          if (isSatisfied) {
            completedSteps += 1;
          }

          steps.push({
            id: stp.id,
            title: stp.title,
            type: stp.type,
            estimatedDurationMinutes: Number(stp.estimatedDurationMinutes) || 0,
            isRequired: isReq,
            isCompleted,
            isWaived,
            waiverReason: prog?.waiverReason,
            completedAt: prog?.completedAt,
            lessonId: les.id,
            lessonTitle: les.title,
            moduleId: mod.id,
            moduleTitle: mod.title,
          });
        }
      }
    }

    const totalSteps = steps.length;
    // Floor calculation
    const percentage =
      totalRequired > 0
        ? Math.floor((completedRequired / totalRequired) * 100)
        : totalSteps > 0
        ? 100
        : 0;

    const isCourseCompleted =
      totalRequired > 0
        ? completedRequired >= totalRequired
        : totalSteps > 0 && completedSteps >= totalSteps;

    // Find next incomplete step
    // Priority: first required step that is not satisfied. If all required satisfied, first incomplete optional step.
    let nextIncompleteStepId: string | null = null;
    const firstIncompleteRequired = steps.find((s) => s.isRequired && !s.isCompleted && !s.isWaived);
    if (firstIncompleteRequired) {
      nextIncompleteStepId = firstIncompleteRequired.id;
    } else {
      const firstIncompleteOptional = steps.find((s) => !s.isCompleted && !s.isWaived);
      if (firstIncompleteOptional) {
        nextIncompleteStepId = firstIncompleteOptional.id;
      }
    }

    const lastVisitedStepId =
      enrollment.last_visited_step_id || nextIncompleteStepId || (steps[0]?.id ?? null);

    return {
      enrollmentId,
      courseId: enrollment.course_id,
      courseTitle: enrollment.course_title,
      description: snapshot.description || '',
      difficulty: snapshot.difficulty || 'beginner',
      estimatedDurationMinutes: Number(snapshot.estimatedDurationMinutes) || 0,
      pinnedVersionId: enrollment.pinned_version_id,
      pinnedVersionNumber: versionRow.version_number,
      totalSteps,
      totalRequired,
      completedSteps,
      completedRequired,
      waivedRequired,
      percentage,
      isCompleted: isCourseCompleted,
      lastVisitedStepId,
      nextIncompleteStepId,
      steps,
    };
  }
}
