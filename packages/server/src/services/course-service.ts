import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError,
  StaleRevisionError,
} from 'zur-shared';
import type {
  CourseVisibility,
  EnrollmentPolicy,
  PublicationStatus,
  CourseVersionSnapshot,
} from 'zur-shared';

export interface ListOwnedCoursesOptions {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CourseSummary {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  categoryId: string;
  categoryName?: string;
  tags: string[];
  difficulty: string;
  language: string;
  learningOutcomes: string[];
  prerequisites: string;
  estimatedDurationMinutes: number;
  visibility: CourseVisibility;
  enrollmentPolicy: EnrollmentPolicy;
  publicationStatus: PublicationStatus;
  isSuspended: boolean;
  draftRevision: number;
  currentVersionId?: string | null;
  studentCount: number;
  hasUnpublishedChanges: boolean;
  lastEditTime: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourseMetadataInput {
  title?: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  language?: string;
  learningOutcomes?: string[];
  prerequisites?: string;
  estimatedDurationMinutes?: number;
}

export class CourseService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private ensureAuthorCapability(userId: string): void {
    const userRow = this.db.prepare('SELECT capabilities FROM users WHERE id = ?').get(userId) as any;
    if (!userRow) return;

    let capabilities: string[] = [];
    try {
      capabilities = JSON.parse(userRow.capabilities || '[]');
    } catch {
      capabilities = ['student'];
    }

    if (!capabilities.includes('author')) {
      capabilities.push('author');
      this.db
        .prepare("UPDATE users SET capabilities = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
        .run(JSON.stringify(capabilities), userId);
    }
  }

  private getDefaultCategoryId(): string {
    const category = this.db.prepare('SELECT id FROM categories ORDER BY rowid ASC LIMIT 1').get() as any;
    if (category) {
      return category.id;
    }
    const catId = crypto.randomUUID();
    this.db
      .prepare('INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)')
      .run(catId, 'General Programming', 'general-programming');
    return catId;
  }

  listOwnedCourses(userId: string, opts: ListOwnedCoursesOptions = {}): { courses: CourseSummary[]; total: number } {
    const statusFilter = opts.status && opts.status !== 'all' ? opts.status.toLowerCase() : null;
    const searchFilter = opts.search ? `%${opts.search.trim().toLowerCase()}%` : null;
    const limit = Math.max(1, Math.min(100, opts.limit || 20));
    const offset = Math.max(0, opts.offset || 0);

    let whereClause = 'WHERE c.owner_id = ?';
    const params: any[] = [userId];

    if (statusFilter) {
      whereClause += ' AND c.publication_status = ?';
      params.push(statusFilter);
    }

    if (searchFilter) {
      whereClause += ' AND LOWER(c.title) LIKE ?';
      params.push(searchFilter);
    }

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM courses c ${whereClause}`)
      .get(...params) as any;
    const total = countRow ? countRow.cnt : 0;

    const rows = this.db
      .prepare(
        `SELECT c.*, cat.name as category_name,
          (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') as student_count
        FROM courses c
        LEFT JOIN categories cat ON c.category_id = cat.id
        ${whereClause}
        ORDER BY c.updated_at DESC
        LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as any[];

    const courses: CourseSummary[] = rows.map((r) => {
      let tags: string[] = [];
      let outcomes: string[] = [];
      try {
        tags = JSON.parse(r.tags || '[]');
      } catch {
        tags = [];
      }
      try {
        outcomes = JSON.parse(r.learning_outcomes || '[]');
      } catch {
        outcomes = [];
      }

      const hasUnpublishedChanges =
        r.publication_status === 'draft' ||
        (r.publication_status === 'published' && r.draft_revision > 1);

      return {
        id: r.id,
        ownerId: r.owner_id,
        title: r.title,
        description: r.description || '',
        categoryId: r.category_id,
        categoryName: r.category_name,
        tags,
        difficulty: r.difficulty,
        language: r.language,
        learningOutcomes: outcomes,
        prerequisites: r.prerequisites || '',
        estimatedDurationMinutes: r.estimated_duration_minutes || 0,
        visibility: r.visibility,
        enrollmentPolicy: r.enrollment_policy,
        publicationStatus: r.publication_status,
        isSuspended: Boolean(r.is_suspended),
        draftRevision: r.draft_revision,
        currentVersionId: r.current_version_id,
        studentCount: r.student_count || 0,
        hasUnpublishedChanges,
        lastEditTime: r.updated_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    return { courses, total };
  }

  createCourseDraft(userId: string, data: { title: string }): CourseSummary {
    const title = (data.title || '').trim();
    if (!title) {
      throw new ValidationError('Course title is required');
    }
    if (title.length > 200) {
      throw new ValidationError('Course title must be 200 characters or less');
    }

    this.ensureAuthorCapability(userId);

    const courseId = crypto.randomUUID();
    const categoryId = this.getDefaultCategoryId();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO courses (
          id, owner_id, title, description, category_id, tags, difficulty,
          language, learning_outcomes, prerequisites, estimated_duration_minutes,
          visibility, enrollment_policy, publication_status, is_suspended,
          draft_revision, current_version_id, created_at, updated_at
        ) VALUES (
          ?, ?, ?, '', ?, '[]', 'beginner',
          'en', '[]', '', 0,
          'private', 'invitation_only', 'draft', 0,
          1, NULL, ?, ?
        )`
      )
      .run(courseId, userId, title, categoryId, now, now);

    // Create default initial module and lesson
    const moduleId = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO modules (id, course_id, title, position, created_at, updated_at)
         VALUES (?, ?, 'Module 1: Introduction', 0, ?, ?)`
      )
      .run(moduleId, courseId, now, now);

    const lessonId = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO lessons (id, module_id, title, description, position, created_at, updated_at)
         VALUES (?, ?, 'Lesson 1: Overview', 'Welcome and overview of the course', 0, ?, ?)`
      )
      .run(lessonId, moduleId, now, now);

    const stepId = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at)
         VALUES (?, ?, 'theory', 'Course Introduction', 0, 1, 5, ?, ?)`
      )
      .run(stepId, lessonId, now, now);

    const initialContent = JSON.stringify({
      kind: 'theory',
      markdown: `# Welcome to ${title}\n\nStart writing your lesson content here.`,
    });

    this.db
      .prepare(
        `INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at)
         VALUES (?, ?, ?, 1, ?)`
      )
      .run(crypto.randomUUID(), stepId, initialContent, now);

    return this.getCourse(userId, courseId);
  }

  getCourse(userId: string, courseId: string): CourseSummary {
    const row = this.db
      .prepare(
        `SELECT c.*, cat.name as category_name,
          (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') as student_count
        FROM courses c
        LEFT JOIN categories cat ON c.category_id = cat.id
        WHERE c.id = ?`
      )
      .get(courseId) as any;

    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    if (row.owner_id !== userId) {
      // Check admin
      const user = this.db.prepare('SELECT capabilities FROM users WHERE id = ?').get(userId) as any;
      const caps = user ? JSON.parse(user.capabilities || '[]') : [];
      if (!caps.includes('admin')) {
        throw new NotFoundError("This page isn't available.");
      }
    }

    let tags: string[] = [];
    let outcomes: string[] = [];
    try {
      tags = JSON.parse(row.tags || '[]');
    } catch {
      tags = [];
    }
    try {
      outcomes = JSON.parse(row.learning_outcomes || '[]');
    } catch {
      outcomes = [];
    }

    const hasUnpublishedChanges =
      row.publication_status === 'draft' ||
      (row.publication_status === 'published' && row.draft_revision > 1);

    return {
      id: row.id,
      ownerId: row.owner_id,
      title: row.title,
      description: row.description || '',
      categoryId: row.category_id,
      categoryName: row.category_name,
      tags,
      difficulty: row.difficulty,
      language: row.language,
      learningOutcomes: outcomes,
      prerequisites: row.prerequisites || '',
      estimatedDurationMinutes: row.estimated_duration_minutes || 0,
      visibility: row.visibility,
      enrollmentPolicy: row.enrollment_policy,
      publicationStatus: row.publication_status,
      isSuspended: Boolean(row.is_suspended),
      draftRevision: row.draft_revision,
      currentVersionId: row.current_version_id,
      studentCount: row.student_count || 0,
      hasUnpublishedChanges,
      lastEditTime: row.updated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  updateCourseMetadata(
    userId: string,
    courseId: string,
    expectedRevision: number,
    metadata: CourseMetadataInput
  ): CourseSummary {
    const course = this.getCourse(userId, courseId);

    if (course.draftRevision !== expectedRevision) {
      throw new StaleRevisionError(
        'The course metadata has been modified elsewhere.',
        course.draftRevision,
        { courseId }
      );
    }

    const newRevision = course.draftRevision + 1;
    const now = new Date().toISOString();

    const title = metadata.title !== undefined ? metadata.title.trim() : course.title;
    if (!title) {
      throw new ValidationError('Course title cannot be empty');
    }

    const description = metadata.description !== undefined ? metadata.description : course.description;

    let categoryId = course.categoryId;
    if (metadata.categoryId) {
      const cat = this.db.prepare('SELECT id FROM categories WHERE id = ?').get(metadata.categoryId);
      if (!cat) {
        throw new ValidationError('Invalid category ID');
      }
      categoryId = metadata.categoryId;
    }

    let tags = course.tags;
    if (metadata.tags !== undefined) {
      const normalized = metadata.tags
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);
      const unique = Array.from(new Set(normalized));
      if (unique.length > 5) {
        throw new ValidationError('A course cannot have more than 5 tags');
      }
      tags = unique;
    }

    let difficulty = course.difficulty;
    if (metadata.difficulty !== undefined) {
      if (!['beginner', 'intermediate', 'advanced'].includes(metadata.difficulty)) {
        throw new ValidationError('Difficulty must be beginner, intermediate, or advanced');
      }
      difficulty = metadata.difficulty;
    }

    const language = metadata.language !== undefined ? metadata.language.trim() : course.language;
    const outcomes = metadata.learningOutcomes !== undefined ? metadata.learningOutcomes : course.learningOutcomes;
    const prerequisites = metadata.prerequisites !== undefined ? metadata.prerequisites : course.prerequisites;
    const duration =
      metadata.estimatedDurationMinutes !== undefined
        ? Math.max(0, metadata.estimatedDurationMinutes)
        : course.estimatedDurationMinutes;

    this.db
      .prepare(
        `UPDATE courses SET
          title = ?,
          description = ?,
          category_id = ?,
          tags = ?,
          difficulty = ?,
          language = ?,
          learning_outcomes = ?,
          prerequisites = ?,
          estimated_duration_minutes = ?,
          draft_revision = ?,
          updated_at = ?
        WHERE id = ?`
      )
      .run(
        title,
        description,
        categoryId,
        JSON.stringify(tags),
        difficulty,
        language,
        JSON.stringify(outcomes),
        prerequisites,
        duration,
        newRevision,
        now,
        courseId
      );

    return this.getCourse(userId, courseId);
  }

  updateCourseAccessSettings(
    userId: string,
    courseId: string,
    settings: { visibility?: CourseVisibility; enrollmentPolicy?: EnrollmentPolicy; strict?: boolean }
  ): CourseSummary {
    const course = this.getCourse(userId, courseId);

    const targetVisibility = settings.visibility || course.visibility;
    const targetPolicy = settings.enrollmentPolicy || course.enrollmentPolicy;

    // If strict mode requested, reject invalid private + open combination
    if (settings.strict && targetVisibility === 'private' && targetPolicy === 'open') {
      throw new ValidationError('Private courses must use invitation_only enrollment policy');
    }

    const visibility = targetVisibility;
    let enrollmentPolicy = targetPolicy;
    if (visibility === 'private') {
      enrollmentPolicy = 'invitation_only';
    }

    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE courses SET
          visibility = ?,
          enrollment_policy = ?,
          updated_at = ?
        WHERE id = ?`
      )
      .run(visibility, enrollmentPolicy, now, courseId);

    return this.getCourse(userId, courseId);
  }

  archiveCourse(userId: string, courseId: string): CourseSummary {
    this.getCourse(userId, courseId);
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE courses SET publication_status = 'archived', updated_at = ? WHERE id = ?")
      .run(now, courseId);
    return this.getCourse(userId, courseId);
  }

  restoreCourse(userId: string, courseId: string): CourseSummary {
    const course = this.getCourse(userId, courseId);
    const nextStatus = course.currentVersionId ? 'published' : 'draft';
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE courses SET publication_status = ?, updated_at = ? WHERE id = ?')
      .run(nextStatus, now, courseId);
    return this.getCourse(userId, courseId);
  }

  deleteDraft(userId: string, courseId: string): { success: boolean } {
    const course = this.getCourse(userId, courseId);

    const versionsCount = (
      this.db.prepare('SELECT COUNT(*) as cnt FROM course_versions WHERE course_id = ?').get(courseId) as any
    )?.cnt;

    if (versionsCount > 0 || course.currentVersionId || course.publicationStatus !== 'draft') {
      throw new ConflictError('Cannot delete a published course. Use archive instead.');
    }

    this.db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);
    return { success: true };
  }

  getCourseVersionSnapshot(versionId: string): CourseVersionSnapshot {
    const row = this.db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(versionId) as any;
    if (!row || !row.snapshot_data) {
      throw new NotFoundError("This page isn't available.");
    }
    return JSON.parse(row.snapshot_data) as CourseVersionSnapshot;
  }

  enrollStudent(userId: string, courseId: string, invitationToken?: string): any {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      throw new NotFoundError("This page isn't available.");
    }
    if (!user.email_verified) {
      throw new ValidationError('Email verification is required before enrolling in courses');
    }

    const course = this.db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    if (course.is_suspended) {
      throw new AuthorizationError('Course access is suspended.');
    }

    if (course.publication_status !== 'published' || !course.current_version_id) {
      throw new ValidationError('This course is not available for enrollment.');
    }

    if (course.enrollment_policy === 'invitation_only') {
      if (!invitationToken) {
        throw new AuthorizationError('This course requires an invitation to enroll.');
      }
      const tokenHash = crypto.createHash('sha256').update(invitationToken).digest('hex');
      const invite = this.db
        .prepare('SELECT * FROM invitations WHERE (token_hash = ? OR id = ?) AND course_id = ? AND is_revoked = 0')
        .get(tokenHash, invitationToken, courseId) as any;
      if (!invite) {
        throw new AuthorizationError('Invalid or expired invitation token.');
      }
      if (new Date(invite.expires_at) < new Date()) {
        throw new AuthorizationError('This invitation has expired.');
      }
      if (invite.max_uses && invite.uses_count >= invite.max_uses) {
        throw new AuthorizationError('This invitation has reached its usage limit.');
      }
      this.db
        .prepare('UPDATE invitations SET uses_count = uses_count + 1 WHERE id = ?')
        .run(invite.id);
    }

    const existing = this.db
      .prepare('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?')
      .get(userId, courseId) as any;

    const now = new Date().toISOString();

    if (existing) {
      if (existing.status === 'active') {
        return existing;
      }
      if (existing.status === 'revoked') {
        throw new AuthorizationError('Your access to this course was revoked. Please contact the course author.');
      }
      if (existing.status === 'left') {
        this.db
          .prepare("UPDATE enrollments SET status = 'active', updated_at = ? WHERE id = ?")
          .run(now, existing.id);
        return {
          ...existing,
          status: 'active',
          updated_at: now,
        };
      }
    }

    const enrollmentId = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(enrollmentId, userId, courseId, course.current_version_id, now, now);

    return {
      id: enrollmentId,
      userId,
      courseId,
      pinnedVersionId: course.current_version_id,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  }

  getEnrolledStepContent(userId: string, enrollmentId: string, stepId: string): any {
    const enrollment = this.db
      .prepare('SELECT * FROM enrollments WHERE id = ?')
      .get(enrollmentId) as any;

    if (!enrollment || enrollment.user_id !== userId || enrollment.status !== 'active') {
      throw new NotFoundError("This page isn't available.");
    }

    const course = this.db
      .prepare('SELECT is_suspended FROM courses WHERE id = ?')
      .get(enrollment.course_id) as any;

    if (!course || course.is_suspended) {
      throw new AuthorizationError('Course access is suspended.');
    }

    const snapshot = this.getCourseVersionSnapshot(enrollment.pinned_version_id);

    let foundStep: any = null;
    let foundLesson: any = null;
    let foundModule: any = null;

    for (const mod of snapshot.modules || []) {
      for (const les of mod.lessons || []) {
        for (const st of les.steps || []) {
          if (st.id === stepId) {
            foundStep = st;
            foundLesson = les;
            foundModule = mod;
            break;
          }
        }
        if (foundStep) break;
      }
      if (foundStep) break;
    }

    if (!foundStep) {
      throw new NotFoundError("This page isn't available.");
    }

    const content = JSON.parse(JSON.stringify(foundStep.content));
    if (foundStep.type === 'python') {
      delete content.referenceSolution;
      if (Array.isArray(content.testCases)) {
        content.testCases = content.testCases
          .filter((tc: any) => !tc.isHidden)
          .map((tc: any) => ({
            id: tc.id,
            stdin: tc.stdin,
            expectedStdout: tc.expectedStdout,
            position: tc.position,
          }));
      }
    }

    return {
      courseId: snapshot.courseId,
      courseTitle: snapshot.title,
      pinnedVersionNumber: snapshot.versionNumber,
      moduleId: foundModule.id,
      lessonId: foundLesson.id,
      step: {
        id: foundStep.id,
        type: foundStep.type,
        title: foundStep.title,
        position: foundStep.position,
        isRequired: foundStep.isRequired,
        estimatedDurationMinutes: foundStep.estimatedDurationMinutes,
      },
      content,
    };
  }

  getCourseRoster(userId: string, courseId: string): any[] {
    this.getCourse(userId, courseId);

    const rows = this.db
      .prepare(
        `SELECT
          e.id as enrollment_id,
          e.user_id,
          u.display_name,
          u.email,
          e.pinned_version_id,
          cv.version_number as pinned_version_number,
          e.status,
          e.created_at,
          e.updated_at
        FROM enrollments e
        JOIN users u ON e.user_id = u.id
        JOIN course_versions cv ON e.pinned_version_id = cv.id
        WHERE e.course_id = ?
        ORDER BY e.created_at DESC`
      )
      .all(courseId) as any[];

    return rows.map((r) => ({
      enrollmentId: r.enrollment_id,
      userId: r.user_id,
      displayName: r.display_name,
      email: r.email,
      pinnedVersionId: r.pinned_version_id,
      pinnedVersionNumber: r.pinned_version_number,
      status: r.status,
      enrolledAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  listPublicCatalog(options: { search?: string; categoryId?: string; limit?: number; offset?: number } = {}): {
    courses: any[];
    total: number;
  } {
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    const offset = Math.max(0, options.offset || 0);

    let whereClause = "WHERE c.publication_status = 'published' AND c.is_suspended = 0 AND c.visibility = 'public'";
    const params: any[] = [];

    if (options.categoryId) {
      whereClause += ' AND c.category_id = ?';
      params.push(options.categoryId);
    }

    if (options.search) {
      whereClause += ' AND (LOWER(c.title) LIKE ? OR LOWER(c.description) LIKE ?)';
      const term = `%${options.search.trim().toLowerCase()}%`;
      params.push(term, term);
    }

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM courses c ${whereClause}`)
      .get(...params) as any;
    const total = countRow ? countRow.cnt : 0;

    const rows = this.db
      .prepare(
        `SELECT
          c.id, c.title, c.description, c.category_id, c.difficulty,
          c.language, c.learning_outcomes, c.estimated_duration_minutes,
          c.current_version_id, c.created_at, c.updated_at,
          cat.name as category_name,
          cv.version_number as version_number
        FROM courses c
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN course_versions cv ON c.current_version_id = cv.id
        ${whereClause}
        ORDER BY c.updated_at DESC
        LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as any[];

    const courses = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description || '',
      categoryId: r.category_id,
      categoryName: r.category_name,
      difficulty: r.difficulty,
      language: r.language,
      learningOutcomes: JSON.parse(r.learning_outcomes || '[]'),
      estimatedDurationMinutes: r.estimated_duration_minutes,
      currentVersionId: r.current_version_id,
      versionNumber: r.version_number || 1,
      updatedAt: r.updated_at,
    }));

    return { courses, total };
  }
}
