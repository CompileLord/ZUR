import { DatabaseSync } from 'node:sqlite';
import type {
  CourseRosterResponse,
  OwnerStudentDetailResponse,
  CourseAnalyticsResponse,
} from 'zur-shared';
import { listRoster } from './teacher-roster-list.ts';
import { getStudentDetail, listStudentAttempts, getStudentAttempt } from './teacher-student-detail.ts';
import { getCourseMetrics } from './teacher-course-metrics.ts';

export class TeacherRosterService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
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
    return listRoster(this.db, actorId, courseId, options);
  }

  getStudentDetail(
    actorId: string,
    courseId: string,
    enrollmentId: string
  ): OwnerStudentDetailResponse {
    return getStudentDetail(this.db, actorId, courseId, enrollmentId);
  }

  listStudentAttempts(actorId: string, courseId: string, enrollmentId: string, stepId: string, limit = 10, offset = 0) {
    return listStudentAttempts(this.db, actorId, courseId, enrollmentId, stepId, limit, offset);
  }

  getStudentAttempt(actorId: string, courseId: string, enrollmentId: string, stepId: string, attemptId: string) {
    return getStudentAttempt(this.db, actorId, courseId, enrollmentId, stepId, attemptId);
  }

  getCourseMetrics(
    actorId: string,
    courseId: string,
    options: {
      versionNumber?: number;
      timeWindowDays?: number;
    } = {}
  ): CourseAnalyticsResponse {
    return getCourseMetrics(this.db, actorId, courseId, options);
  }
}
