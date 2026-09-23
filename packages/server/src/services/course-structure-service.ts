import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from 'zur-shared';
import type { StepType } from 'zur-shared';

export interface StepTreeSummary {
  id: string;
  lessonId: string;
  type: StepType;
  title: string;
  position: number;
  isRequired: boolean;
  estimatedDurationMinutes: number;
}

export interface LessonTreeSummary {
  id: string;
  moduleId: string;
  title: string;
  description?: string;
  position: number;
  steps: StepTreeSummary[];
}

export interface ModuleTreeSummary {
  id: string;
  courseId: string;
  title: string;
  position: number;
  lessons: LessonTreeSummary[];
}

export interface CourseTree {
  courseId: string;
  courseTitle: string;
  modules: ModuleTreeSummary[];
  totalSteps: number;
}

export class CourseStructureService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private verifyCourseOwner(userId: string, courseId: string): void {
    const course = this.db.prepare('SELECT owner_id FROM courses WHERE id = ?').get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }
    if (course.owner_id !== userId) {
      const user = this.db.prepare('SELECT capabilities FROM users WHERE id = ?').get(userId) as any;
      const caps = user ? JSON.parse(user.capabilities || '[]') : [];
      if (!caps.includes('admin')) {
        throw new NotFoundError("This page isn't available.");
      }
    }
  }

  private bumpCourseRevision(courseId: string): void {
    this.db
      .prepare(
        "UPDATE courses SET draft_revision = draft_revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .run(courseId);
  }

  getCourseTree(userId: string, courseId: string): CourseTree {
    this.verifyCourseOwner(userId, courseId);

    const course = this.db.prepare('SELECT id, title FROM courses WHERE id = ?').get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    const modules = this.db
      .prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC, created_at ASC')
      .all(courseId) as any[];

    let totalSteps = 0;

    const moduleSummaries: ModuleTreeSummary[] = modules.map((m) => {
      const lessons = this.db
        .prepare('SELECT * FROM lessons WHERE module_id = ? ORDER BY position ASC, created_at ASC')
        .all(m.id) as any[];

      const lessonSummaries: LessonTreeSummary[] = lessons.map((l) => {
        const steps = this.db
          .prepare('SELECT * FROM steps WHERE lesson_id = ? ORDER BY position ASC, created_at ASC')
          .all(l.id) as any[];

        totalSteps += steps.length;

        const stepSummaries: StepTreeSummary[] = steps.map((s) => ({
          id: s.id,
          lessonId: s.lesson_id,
          type: s.type as StepType,
          title: s.title,
          position: s.position,
          isRequired: Boolean(s.is_required),
          estimatedDurationMinutes: s.estimated_duration_minutes || 5,
        }));

        return {
          id: l.id,
          moduleId: l.module_id,
          title: l.title,
          description: l.description || undefined,
          position: l.position,
          steps: stepSummaries,
        };
      });

      return {
        id: m.id,
        courseId: m.course_id,
        title: m.title,
        position: m.position,
        lessons: lessonSummaries,
      };
    });

    return {
      courseId: course.id,
      courseTitle: course.title,
      modules: moduleSummaries,
      totalSteps,
    };
  }

  // --- Module Operations ---

  addModule(userId: string, courseId: string, title: string, position?: number): { id: string; title: string; position: number } {
    this.verifyCourseOwner(userId, courseId);
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) {
      throw new ValidationError('Module title cannot be empty');
    }

    let pos = position;
    if (pos === undefined) {
      const maxPos = (
        this.db.prepare('SELECT MAX(position) as mp FROM modules WHERE course_id = ?').get(courseId) as any
      )?.mp;
      pos = maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0;
    }

    const moduleId = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare('INSERT INTO modules (id, course_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(moduleId, courseId, cleanTitle, pos, now, now);

    this.bumpCourseRevision(courseId);

    return { id: moduleId, title: cleanTitle, position: pos };
  }

  updateModule(userId: string, courseId: string, moduleId: string, title: string): { id: string; title: string } {
    this.verifyCourseOwner(userId, courseId);
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) {
      throw new ValidationError('Module title cannot be empty');
    }

    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE modules SET title = ?, updated_at = ? WHERE id = ? AND course_id = ?')
      .run(cleanTitle, now, moduleId, courseId);

    this.bumpCourseRevision(courseId);

    return { id: moduleId, title: cleanTitle };
  }

  reorderModules(userId: string, courseId: string, moduleIds: string[]): void {
    this.verifyCourseOwner(userId, courseId);
    const now = new Date().toISOString();

    for (let i = 0; i < moduleIds.length; i++) {
      this.db
        .prepare('UPDATE modules SET position = ?, updated_at = ? WHERE id = ? AND course_id = ?')
        .run(i, now, moduleIds[i], courseId);
    }

    this.bumpCourseRevision(courseId);
  }

  deleteModule(userId: string, courseId: string, moduleId: string): { success: boolean; deletedModuleId: string } {
    this.verifyCourseOwner(userId, courseId);

    this.db.prepare('DELETE FROM modules WHERE id = ? AND course_id = ?').run(moduleId, courseId);
    this.bumpCourseRevision(courseId);

    return { success: true, deletedModuleId: moduleId };
  }

  // --- Lesson Operations ---

  addLesson(
    userId: string,
    courseId: string,
    moduleId: string,
    title: string,
    description?: string,
    position?: number
  ): { id: string; moduleId: string; title: string; position: number } {
    this.verifyCourseOwner(userId, courseId);
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) {
      throw new ValidationError('Lesson title cannot be empty');
    }

    const mod = this.db.prepare('SELECT id FROM modules WHERE id = ? AND course_id = ?').get(moduleId, courseId);
    if (!mod) {
      throw new NotFoundError('Module not found in this course');
    }

    let pos = position;
    if (pos === undefined) {
      const maxPos = (
        this.db.prepare('SELECT MAX(position) as mp FROM lessons WHERE module_id = ?').get(moduleId) as any
      )?.mp;
      pos = maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0;
    }

    const lessonId = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        'INSERT INTO lessons (id, module_id, title, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(lessonId, moduleId, cleanTitle, description || '', pos, now, now);

    this.bumpCourseRevision(courseId);

    return { id: lessonId, moduleId, title: cleanTitle, position: pos };
  }

  updateLesson(
    userId: string,
    courseId: string,
    lessonId: string,
    title: string,
    description?: string
  ): { id: string; title: string; description?: string } {
    this.verifyCourseOwner(userId, courseId);
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) {
      throw new ValidationError('Lesson title cannot be empty');
    }

    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE lessons SET title = ?, description = ?, updated_at = ? WHERE id = ?')
      .run(cleanTitle, description !== undefined ? description : '', now, lessonId);

    this.bumpCourseRevision(courseId);

    return { id: lessonId, title: cleanTitle, description };
  }

  reorderLessons(userId: string, courseId: string, moduleId: string, lessonIds: string[]): void {
    this.verifyCourseOwner(userId, courseId);
    const now = new Date().toISOString();

    for (let i = 0; i < lessonIds.length; i++) {
      this.db
        .prepare('UPDATE lessons SET position = ?, updated_at = ? WHERE id = ? AND module_id = ?')
        .run(i, now, lessonIds[i], moduleId);
    }

    this.bumpCourseRevision(courseId);
  }

  deleteLesson(userId: string, courseId: string, lessonId: string): { success: boolean; deletedLessonId: string } {
    this.verifyCourseOwner(userId, courseId);

    this.db.prepare('DELETE FROM lessons WHERE id = ?').run(lessonId);
    this.bumpCourseRevision(courseId);

    return { success: true, deletedLessonId: lessonId };
  }

  // --- Step Operations ---

  addStep(
    userId: string,
    courseId: string,
    lessonId: string,
    stepData: {
      title: string;
      type: StepType;
      position?: number;
      isRequired?: boolean;
      estimatedDurationMinutes?: number;
    }
  ): StepTreeSummary {
    this.verifyCourseOwner(userId, courseId);

    const validTypes: StepType[] = ['theory', 'video', 'quiz', 'python'];
    if (!validTypes.includes(stepData.type)) {
      throw new ValidationError(`Invalid step type: ${stepData.type}`);
    }

    const cleanTitle = (stepData.title || '').trim();
    if (!cleanTitle) {
      throw new ValidationError('Step title cannot be empty');
    }

    // Limit check: 1 to 20 steps per lesson (PRD §8.3, §17, tasks.json T031)
    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM steps WHERE lesson_id = ?')
      .get(lessonId) as any;
    const currentSteps = countRow ? countRow.cnt : 0;
    if (currentSteps >= 20) {
      throw new ValidationError('A lesson cannot contain more than 20 steps.');
    }

    let pos = stepData.position;
    if (pos === undefined) {
      const maxPos = (
        this.db.prepare('SELECT MAX(position) as mp FROM steps WHERE lesson_id = ?').get(lessonId) as any
      )?.mp;
      pos = maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0;
    }

    const stepId = crypto.randomUUID();
    const now = new Date().toISOString();
    const isRequired = stepData.isRequired !== undefined ? (stepData.isRequired ? 1 : 0) : 1;
    const duration = stepData.estimatedDurationMinutes || 5;

    this.db
      .prepare(
        `INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(stepId, lessonId, stepData.type, cleanTitle, pos, isRequired, duration, now, now);

    // Initialize content payload based on step type
    let defaultPayload = '';
    if (stepData.type === 'theory') {
      defaultPayload = JSON.stringify({
        kind: 'theory',
        markdown: `# ${cleanTitle}\n\nEnter your theory lesson here.`,
      });
    } else if (stepData.type === 'video') {
      defaultPayload = JSON.stringify({
        kind: 'video',
        videoUrl: '',
        provider: 'youtube',
        transcript: '',
        captionVerified: false,
      });
    } else if (stepData.type === 'quiz') {
      defaultPayload = JSON.stringify({
        kind: 'quiz',
        quizType: 'single_choice',
        prompt: cleanTitle,
        options: [
          { id: crypto.randomUUID(), text: 'Option 1', isCorrect: true },
          { id: crypto.randomUUID(), text: 'Option 2', isCorrect: false },
        ],
        explanation: '',
      });
    } else if (stepData.type === 'python') {
      defaultPayload = JSON.stringify({
        kind: 'python',
        problemStatement: cleanTitle,
        inputFormat: 'Standard input format',
        outputFormat: 'Standard output format',
        constraints: 'Time limit: 5 seconds, Memory limit: 128 MiB',
        starterCode: '# Write your solution here\n',
        referenceSolution: '# Reference solution\n',
        hints: [],
        solutionExplanation: '',
        runtimeLimits: {
          cpuTimeoutSeconds: 5,
          wallTimeoutSeconds: 10,
          memoryLimitMib: 128,
        },
      });

      // Also create a sample public test case
      const testCaseId = crypto.randomUUID();
      this.db
        .prepare(
          `INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
           VALUES (?, ?, '', '', 0, 0, ?)`
        )
        .run(testCaseId, stepId, now);
    }

    this.db
      .prepare(
        `INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at)
         VALUES (?, ?, ?, 1, ?)`
      )
      .run(crypto.randomUUID(), stepId, defaultPayload, now);

    this.bumpCourseRevision(courseId);

    return {
      id: stepId,
      lessonId,
      type: stepData.type,
      title: cleanTitle,
      position: pos,
      isRequired: Boolean(isRequired),
      estimatedDurationMinutes: duration,
    };
  }

  updateStep(
    userId: string,
    courseId: string,
    stepId: string,
    stepData: {
      title?: string;
      isRequired?: boolean;
      estimatedDurationMinutes?: number;
    }
  ): StepTreeSummary {
    this.verifyCourseOwner(userId, courseId);

    const step = this.db.prepare('SELECT * FROM steps WHERE id = ?').get(stepId) as any;
    if (!step) {
      throw new NotFoundError('Step not found');
    }

    const title = stepData.title !== undefined ? stepData.title.trim() : step.title;
    if (!title) {
      throw new ValidationError('Step title cannot be empty');
    }

    const isRequired =
      stepData.isRequired !== undefined ? (stepData.isRequired ? 1 : 0) : step.is_required;
    const duration =
      stepData.estimatedDurationMinutes !== undefined
        ? Math.max(1, stepData.estimatedDurationMinutes)
        : step.estimated_duration_minutes;

    const now = new Date().toISOString();

    this.db
      .prepare(
        'UPDATE steps SET title = ?, is_required = ?, estimated_duration_minutes = ?, updated_at = ? WHERE id = ?'
      )
      .run(title, isRequired, duration, now, stepId);

    this.bumpCourseRevision(courseId);

    return {
      id: stepId,
      lessonId: step.lesson_id,
      type: step.type as StepType,
      title,
      position: step.position,
      isRequired: Boolean(isRequired),
      estimatedDurationMinutes: duration,
    };
  }

  reorderSteps(userId: string, courseId: string, lessonId: string, stepIds: string[]): void {
    this.verifyCourseOwner(userId, courseId);
    const now = new Date().toISOString();

    for (let i = 0; i < stepIds.length; i++) {
      this.db
        .prepare('UPDATE steps SET position = ?, updated_at = ? WHERE id = ? AND lesson_id = ?')
        .run(i, now, stepIds[i], lessonId);
    }

    this.bumpCourseRevision(courseId);
  }

  duplicateStep(userId: string, courseId: string, stepId: string): StepTreeSummary {
    this.verifyCourseOwner(userId, courseId);

    const step = this.db.prepare('SELECT * FROM steps WHERE id = ?').get(stepId) as any;
    if (!step) {
      throw new NotFoundError('Step to duplicate not found');
    }

    // Limit check: 1 to 20 steps per lesson
    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM steps WHERE lesson_id = ?')
      .get(step.lesson_id) as any;
    if (countRow && countRow.cnt >= 20) {
      throw new ValidationError('A lesson cannot contain more than 20 steps.');
    }

    const newStepId = crypto.randomUUID();
    const newTitle = `${step.title} (Copy)`;
    const newPosition = step.position + 1;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newStepId,
        step.lesson_id,
        step.type,
        newTitle,
        newPosition,
        step.is_required,
        step.estimated_duration_minutes,
        now,
        now
      );

    // Duplicate content payload
    const content = this.db.prepare('SELECT content_payload FROM step_contents WHERE step_id = ?').get(stepId) as any;
    if (content) {
      this.db
        .prepare(
          `INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at)
           VALUES (?, ?, ?, 1, ?)`
        )
        .run(crypto.randomUUID(), newStepId, content.content_payload, now);
    }

    // Duplicate test cases if python step
    if (step.type === 'python') {
      const tests = this.db.prepare('SELECT * FROM test_cases WHERE step_id = ?').all(stepId) as any[];
      for (const t of tests) {
        this.db
          .prepare(
            `INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(crypto.randomUUID(), newStepId, t.stdin, t.expected_stdout, t.is_hidden, t.position, now);
      }
    }

    this.bumpCourseRevision(courseId);

    return {
      id: newStepId,
      lessonId: step.lesson_id,
      type: step.type as StepType,
      title: newTitle,
      position: newPosition,
      isRequired: Boolean(step.is_required),
      estimatedDurationMinutes: step.estimated_duration_minutes,
    };
  }

  deleteStep(userId: string, courseId: string, stepId: string): { success: boolean; deletedStepId: string } {
    this.verifyCourseOwner(userId, courseId);

    this.db.prepare('DELETE FROM steps WHERE id = ?').run(stepId);
    this.bumpCourseRevision(courseId);

    return { success: true, deletedStepId: stepId };
  }
}
