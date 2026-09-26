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
  currentVersionNumber?: number | null;
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
          (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') as student_count,
          (SELECT version_number FROM course_versions v WHERE v.id = c.current_version_id) as current_version_number
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
          (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') as student_count,
          (SELECT cv.version_number FROM course_versions cv WHERE cv.id = c.current_version_id AND cv.course_id = c.id) as current_version_number
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
      currentVersionNumber: row.current_version_number ?? null,
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

    const content = foundStep.content == null ? null : JSON.parse(JSON.stringify(foundStep.content));
    if (foundStep.type === 'python' && content) {
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

  listPublicCatalog(options: {
    search?: string;
    categoryId?: string;
    level?: string;
    language?: string;
    limit?: number;
    offset?: number;
  } = {}): {
    courses: any[];
    total: number;
    limit: number;
    offset: number;
  } {
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    const offset = Math.max(0, options.offset || 0);

    let whereClause = "WHERE c.publication_status = 'published' AND c.is_suspended = 0 AND c.visibility = 'public'";
    const params: any[] = [];

    if (options.categoryId) {
      whereClause += ' AND c.category_id = ?';
      params.push(options.categoryId);
    }

    if (options.level) {
      whereClause += ' AND c.difficulty = ?';
      params.push(options.level);
    }

    if (options.language) {
      whereClause += ' AND c.language = ?';
      params.push(options.language);
    }

    let orderClause = 'ORDER BY c.updated_at DESC';

    if (options.search) {
      const term = `%${options.search.trim().toLowerCase()}%`;
      whereClause += ' AND (LOWER(c.title) LIKE ? OR LOWER(c.description) LIKE ? OR LOWER(c.tags) LIKE ? OR LOWER(u.display_name) LIKE ?)';
      params.push(term, term, term, term);
      orderClause = 'ORDER BY CASE WHEN LOWER(c.title) LIKE ? THEN 0 ELSE 1 END, c.updated_at DESC';
    }

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM courses c LEFT JOIN users u ON c.owner_id = u.id ${whereClause}`)
      .get(...params) as any;
    const total = countRow ? countRow.cnt : 0;

    const selectParams = [...params];
    if (options.search) {
      selectParams.push(`%${options.search.trim().toLowerCase()}%`);
    }
    selectParams.push(limit, offset);

    const rows = this.db
      .prepare(
        `SELECT
          c.id, c.title, c.description, c.category_id, c.tags, c.difficulty,
          c.language, c.learning_outcomes, c.estimated_duration_minutes,
          c.current_version_id, c.created_at, c.updated_at,
          cat.name as category_name,
          u.display_name as author_name,
          cv.version_number as version_number
        FROM courses c
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN users u ON c.owner_id = u.id
        LEFT JOIN course_versions cv ON c.current_version_id = cv.id
        ${whereClause}
        ${orderClause}
        LIMIT ? OFFSET ?`
      )
      .all(...selectParams) as any[];

    const courses = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description || '',
      categoryId: r.category_id,
      categoryName: r.category_name,
      tags: JSON.parse(r.tags || '[]'),
      difficulty: r.difficulty,
      language: r.language,
      learningOutcomes: JSON.parse(r.learning_outcomes || '[]'),
      estimatedDurationMinutes: r.estimated_duration_minutes,
      currentVersionId: r.current_version_id,
      versionNumber: r.version_number || 1,
      authorName: r.author_name || 'Anonymous',
      updatedAt: r.updated_at,
    }));

    return { courses, total, limit, offset };
  }

  listCategories(): Array<{ id: string; name: string; slug: string }> {
    const rows = this.db.prepare('SELECT id, name, slug FROM categories ORDER BY name ASC').all() as any[];
    return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug }));
  }

  getPublicCourseOverview(courseId: string, currentUserId?: string): {
    course: {
      id: string;
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
      authorName: string;
      currentVersionId?: string;
      versionNumber: number;
      updatedAt: string;
    };
    syllabus: Array<{
      id: string;
      title: string;
      position: number;
      lessons: Array<{
        id: string;
        title: string;
        description: string;
        position: number;
        stepCounts: {
          theory: number;
          video: number;
          quiz: number;
          python: number;
          total: number;
        };
        steps: Array<{
          id: string;
          title: string;
          type: string;
          position: number;
          isRequired: boolean;
          estimatedDurationMinutes: number;
        }>;
      }>;
    }>;
    enrollmentStatus: {
      isEnrolled: boolean;
      enrollmentId?: string;
      status: string | null;
    };
    isEmailVerified: boolean;
  } {
    const row = this.db
      .prepare(
        `SELECT
          c.*,
          cat.name as category_name,
          u.display_name as author_name,
          cv.version_number as version_number
        FROM courses c
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN users u ON c.owner_id = u.id
        LEFT JOIN course_versions cv ON c.current_version_id = cv.id
        WHERE c.id = ?`
      )
      .get(courseId) as any;

    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    // Enforce public/private/unlisted/archived/suspended separation server-side (AC-05)
    if (row.visibility === 'private') {
      let isAuthorized = false;
      if (currentUserId) {
        if (row.owner_id === currentUserId) {
          isAuthorized = true;
        } else {
          const enr = this.db
            .prepare('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ? AND status = ?')
            .get(currentUserId, courseId, 'active') as any;
          if (enr) isAuthorized = true;
        }
      }
      if (!isAuthorized) {
        throw new NotFoundError("This page isn't available.");
      }
    }

    // Draft courses only visible to author
    if (row.publication_status === 'draft') {
      if (!currentUserId || row.owner_id !== currentUserId) {
        throw new NotFoundError("This page isn't available.");
      }
    }

    let enrollmentStatus: { isEnrolled: boolean; enrollmentId?: string; status: string | null } = {
      isEnrolled: false,
      status: null,
    };
    let isEmailVerified = false;

    if (currentUserId) {
      const userRow = this.db
        .prepare('SELECT email_verified FROM users WHERE id = ?')
        .get(currentUserId) as any;
      if (userRow) {
        isEmailVerified = userRow.email_verified === 1;
      }

      const enrRow = this.db
        .prepare('SELECT id, status FROM enrollments WHERE user_id = ? AND course_id = ?')
        .get(currentUserId, courseId) as any;
      if (enrRow) {
        enrollmentStatus = {
          isEnrolled: enrRow.status === 'active',
          enrollmentId: enrRow.id,
          status: enrRow.status,
        };
      }
    }

    const syllabus: any[] = [];
    if (row.current_version_id) {
      const vRow = this.db
        .prepare('SELECT snapshot_data FROM course_versions WHERE id = ?')
        .get(row.current_version_id) as any;
      if (vRow && vRow.snapshot_data) {
        try {
          const snapshot = JSON.parse(vRow.snapshot_data);
          for (const mod of snapshot.modules || []) {
            const lessons = (mod.lessons || []).map((les: any) => {
              const stepCounts = {
                theory: 0,
                video: 0,
                quiz: 0,
                python: 0,
                total: (les.steps || []).length,
              };
              const steps = (les.steps || []).map((st: any) => {
                if (st.type === 'theory') stepCounts.theory++;
                else if (st.type === 'video') stepCounts.video++;
                else if (st.type === 'quiz') stepCounts.quiz++;
                else if (st.type === 'python') stepCounts.python++;
                return {
                  id: st.id,
                  title: st.title,
                  type: st.type,
                  position: st.position,
                  isRequired: Boolean(st.isRequired),
                  estimatedDurationMinutes: st.estimatedDurationMinutes || 0,
                };
              });
              return {
                id: les.id,
                title: les.title,
                description: les.description || '',
                position: les.position,
                stepCounts,
                steps,
              };
            });
            syllabus.push({
              id: mod.id,
              title: mod.title,
              position: mod.position,
              lessons,
            });
          }
        } catch {
          // ignore parsing error
        }
      }
    }

    if (syllabus.length === 0 || syllabus.every((m) => !m.lessons || m.lessons.length === 0)) {
      syllabus.length = 0;
      const modules = this.db
        .prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC')
        .all(courseId) as any[];
      for (const mod of modules) {
        const lessons = this.db
          .prepare('SELECT * FROM lessons WHERE module_id = ? ORDER BY position ASC')
          .all(mod.id) as any[];
        const lessonItems = lessons.map((les) => {
          const steps = this.db
            .prepare(
              'SELECT id, type, title, position, is_required, estimated_duration_minutes FROM steps WHERE lesson_id = ? ORDER BY position ASC'
            )
            .all(les.id) as any[];
          const stepCounts = {
            theory: 0,
            video: 0,
            quiz: 0,
            python: 0,
            total: steps.length,
          };
          const stepList = steps.map((s) => {
            if (s.type === 'theory') stepCounts.theory++;
            else if (s.type === 'video') stepCounts.video++;
            else if (s.type === 'quiz') stepCounts.quiz++;
            else if (s.type === 'python') stepCounts.python++;
            return {
              id: s.id,
              title: s.title,
              type: s.type,
              position: s.position,
              isRequired: Boolean(s.is_required),
              estimatedDurationMinutes: s.estimated_duration_minutes || 0,
            };
          });
          return {
            id: les.id,
            title: les.title,
            description: les.description || '',
            position: les.position,
            stepCounts,
            steps: stepList,
          };
        });
        syllabus.push({
          id: mod.id,
          title: mod.title,
          position: mod.position,
          lessons: lessonItems,
        });
      }
    }

    const course = {
      id: row.id,
      title: row.title,
      description: row.description || '',
      categoryId: row.category_id,
      categoryName: row.category_name,
      tags: JSON.parse(row.tags || '[]'),
      difficulty: row.difficulty,
      language: row.language,
      learningOutcomes: JSON.parse(row.learning_outcomes || '[]'),
      prerequisites: row.prerequisites || '',
      estimatedDurationMinutes: row.estimated_duration_minutes || 0,
      visibility: row.visibility,
      enrollmentPolicy: row.enrollment_policy,
      publicationStatus: row.publication_status,
      isSuspended: Boolean(row.is_suspended),
      authorName: row.author_name || 'Anonymous',
      currentVersionId: row.current_version_id,
      versionNumber: row.version_number || 1,
      updatedAt: row.updated_at,
    };

    return {
      course,
      syllabus,
      enrollmentStatus,
      isEmailVerified,
    };
  }

  createReport(
    reporterId: string,
    data: {
      courseId: string;
      courseVersionId?: string;
      stepId?: string;
      type: string;
      description: string;
      includeCodeConsent?: boolean;
      includeCode?: boolean;
    }
  ): { id: string; reference: string; status: string } {
    if (!data.type || !['broken_exercise', 'inappropriate_content', 'other'].includes(data.type)) {
      throw new ValidationError('Invalid report type. Must be broken_exercise, inappropriate_content, or other.');
    }

    const description = typeof data.description === 'string' ? data.description.trim() : '';
    if (description.length === 0) {
      throw new ValidationError('Report description is required.');
    }
    if (description.length > 5000) {
      throw new ValidationError('Report description must not exceed 5000 characters.');
    }

    if (!data.courseId || typeof data.courseId !== 'string') {
      throw new ValidationError('Course reference is required to submit a report.');
    }

    // 1. Verify Course and Caller Access (Preserve Safe Unknown-Resource Responses)
    const course = this.db.prepare(
      'SELECT id, owner_id, visibility, publication_status, is_suspended, current_version_id FROM courses WHERE id = ?'
    ).get(data.courseId) as any;

    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    // Check reporter capabilities
    const reporterUser = this.db.prepare('SELECT capabilities FROM users WHERE id = ?').get(reporterId) as any;
    const reporterCaps: string[] = reporterUser ? JSON.parse(reporterUser.capabilities || '[]') : [];
    const isAdmin = reporterCaps.includes('admin');
    const isOwner = course.owner_id === reporterId;

    // Check enrollment
    const enrollment = this.db.prepare(
      'SELECT id, pinned_version_id, status FROM enrollments WHERE user_id = ? AND course_id = ?'
    ).get(reporterId, data.courseId) as any;
    const isEnrolled = Boolean(enrollment && enrollment.status === 'active');

    let effectiveVersionId: string | null = null;
    let validatedStepId: string | null = null;
    let authorizedCode: string | null = null;

    if (isEnrolled) {
      // 2A. Enrolled student context:
      // Must use pinned version V; ignore/reject forged versions.
      effectiveVersionId = enrollment.pinned_version_id;
      if (data.courseVersionId && data.courseVersionId !== effectiveVersionId) {
        throw new NotFoundError("This page isn't available.");
      }

      // "Validate step against V's immutable snapshot"
      if (data.stepId) {
        if (typeof data.stepId !== 'string') {
          throw new NotFoundError("This page isn't available.");
        }
        if (!effectiveVersionId) {
          throw new NotFoundError("This page isn't available.");
        }

        const snapshot = this.getCourseVersionSnapshot(effectiveVersionId);
        let stepInSnapshot = false;
        for (const mod of snapshot.modules || []) {
          for (const les of mod.lessons || []) {
            for (const st of les.steps || []) {
              if (st.id === data.stepId) {
                stepInSnapshot = true;
                break;
              }
            }
            if (stepInSnapshot) break;
          }
          if (stepInSnapshot) break;
        }

        if (!stepInSnapshot) {
          throw new NotFoundError("This page isn't available.");
        }
        validatedStepId = data.stepId;
      }

      // "bind any included code to the reporter's enrollment and authorized version."
      const hasCodeConsent = Boolean(data.includeCodeConsent ?? data.includeCode);
      if (hasCodeConsent && validatedStepId) {
        const draftRow = this.db.prepare(
          'SELECT code FROM code_drafts WHERE user_id = ? AND enrollment_id = ? AND step_id = ? ORDER BY id DESC LIMIT 1'
        ).get(reporterId, enrollment.id, validatedStepId) as any;

        if (draftRow?.code) {
          authorizedCode = draftRow.code;
        } else if (effectiveVersionId) {
          const attemptRow = this.db.prepare(
            'SELECT code_snapshot FROM assessment_attempts WHERE user_id = ? AND enrollment_id = ? AND course_version_id = ? AND step_id = ? ORDER BY created_at DESC LIMIT 1'
          ).get(reporterId, enrollment.id, effectiveVersionId, validatedStepId) as any;

          if (attemptRow?.code_snapshot) {
            authorizedCode = attemptRow.code_snapshot;
          }
        }
      }
    } else if (isOwner || isAdmin) {
      // 2B. Course author or administrator
      effectiveVersionId = course.current_version_id || null;
      if (data.courseVersionId) {
        const vRow = this.db.prepare(
          'SELECT id FROM course_versions WHERE id = ? AND course_id = ?'
        ).get(data.courseVersionId, data.courseId) as any;
        if (!vRow) throw new NotFoundError("This page isn't available.");
        effectiveVersionId = vRow.id;
      }

      if (data.stepId) {
        if (typeof data.stepId !== 'string') throw new NotFoundError("This page isn't available.");
        const stepRow = this.db.prepare(`
          SELECT s.id FROM steps s
          JOIN lessons l ON s.lesson_id = l.id
          JOIN modules m ON l.module_id = m.id
          WHERE s.id = ? AND m.course_id = ?
        `).get(data.stepId, data.courseId) as any;

        if (stepRow) {
          validatedStepId = stepRow.id;
        } else if (effectiveVersionId) {
          try {
            const snap = this.getCourseVersionSnapshot(effectiveVersionId);
            for (const mod of snap.modules || []) {
              for (const les of mod.lessons || []) {
                for (const st of les.steps || []) {
                  if (st.id === data.stepId) validatedStepId = st.id;
                }
              }
            }
          } catch {}
        }
        if (!validatedStepId) throw new NotFoundError("This page isn't available.");
      }
    } else {
      // 2C. Public/unlisted visitor who is signed in but not enrolled:
      // "allow only course-level inappropriate-content reports on visible published courses, not step/code reports or arbitrary old-version references. Avoid trusting client-supplied version."
      const isVisible = course.publication_status === 'published' &&
        (course.visibility === 'public' || course.visibility === 'unlisted') &&
        !course.is_suspended;

      if (!isVisible) {
        throw new NotFoundError("This page isn't available.");
      }

      if (data.stepId) {
        throw new NotFoundError("This page isn't available.");
      }

      if (data.courseVersionId && data.courseVersionId !== course.current_version_id) {
        throw new NotFoundError("This page isn't available.");
      }

      if (data.type !== 'inappropriate_content') {
        throw new ValidationError('Non-enrolled users can only submit course-level inappropriate content reports.');
      }

      effectiveVersionId = course.current_version_id || null;
      validatedStepId = null;
      authorizedCode = null;
    }

    const reportId = `rep-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO reports (
          id, reporter_id, course_id, course_version_id, step_id, type, description, submitted_code, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
      )
      .run(
        reportId,
        reporterId,
        data.courseId,
        effectiveVersionId,
        validatedStepId,
        data.type,
        description,
        authorizedCode,
        now,
        now
      );

    return { id: reportId, reference: reportId, status: 'open' };
  }
}
