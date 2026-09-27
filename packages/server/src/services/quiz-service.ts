import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  StaleRevisionError,
} from 'zur-shared';
import type {
  QuizContent,
  QuizOption,
  TerminalVerdict,
} from 'zur-shared';

export interface StudentQuizPayload {
  stepId: string;
  title: string;
  prompt: string;
  quizType: 'single_choice' | 'multiple_choice';
  options: Array<{ id: string; text: string }>;
  isCompleted?: boolean;
}

export interface QuizGradeResult {
  verdict: TerminalVerdict;
  isPassed: boolean;
  explanation?: string;
  correctOptionIds?: string[];
}

export class QuizService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private verifyStepOwner(userId: string, stepId: string): { courseId: string } {
    const row = this.db
      .prepare(
        `SELECT c.id as course_id, c.owner_id
         FROM steps s
         JOIN lessons l ON s.lesson_id = l.id
         JOIN modules m ON l.module_id = m.id
         JOIN courses c ON m.course_id = c.id
         WHERE s.id = ?`
      )
      .get(stepId) as any;

    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    if (row.owner_id !== userId) {
      const user = this.db.prepare('SELECT capabilities FROM users WHERE id = ?').get(userId) as any;
      const caps = user ? JSON.parse(user.capabilities || '[]') : [];
      if (!caps.includes('admin')) {
        throw new AuthorizationError('You do not have permission to edit this quiz');
      }
    }

    return { courseId: row.course_id };
  }

  getAuthorQuiz(userId: string, stepId: string): { quiz: QuizContent; revision: number; title: string } {
    this.verifyStepOwner(userId, stepId);

    const step = this.db.prepare('SELECT title FROM steps WHERE id = ?').get(stepId) as any;
    const contentRow = this.db
      .prepare('SELECT content_payload, revision FROM step_contents WHERE step_id = ?')
      .get(stepId) as any;

    if (!contentRow) {
      throw new NotFoundError('Quiz content not found');
    }

    const payload = JSON.parse(contentRow.content_payload);
    return {
      quiz: payload,
      revision: contentRow.revision,
      title: step.title,
    };
  }

  validateQuizPayload(quiz: QuizContent): void {
    if (!quiz.prompt || !quiz.prompt.trim()) {
      throw new ValidationError('Quiz prompt cannot be empty');
    }

    if (!['single_choice', 'multiple_choice'].includes(quiz.quizType)) {
      throw new ValidationError('Quiz type must be either single_choice or multiple_choice');
    }

    if (!Array.isArray(quiz.options) || quiz.options.length < 2 || quiz.options.length > 8) {
      throw new ValidationError('A quiz must have between 2 and 8 options (PRD §11.2)');
    }

    for (const opt of quiz.options) {
      if (!opt.text || !opt.text.trim()) {
        throw new ValidationError('Every option must have non-empty text');
      }
    }

    const correctCount = quiz.options.filter((o) => Boolean(o.isCorrect)).length;

    if (quiz.quizType === 'single_choice') {
      if (correctCount !== 1) {
        throw new ValidationError('Single choice quizzes must have exactly one correct option');
      }
    } else {
      if (correctCount < 1) {
        throw new ValidationError('Multiple choice quizzes must have at least one correct option');
      }
      if (correctCount === quiz.options.length) {
        throw new ValidationError('Multiple choice quizzes must have at least one incorrect option (PRD §11.2)');
      }
    }
  }

  updateQuiz(
    userId: string,
    stepId: string,
    expectedRevision: number,
    quiz: QuizContent
  ): { quiz: QuizContent; revision: number } {
    const { courseId } = this.verifyStepOwner(userId, stepId);
    this.validateQuizPayload(quiz);

    const contentRow = this.db
      .prepare('SELECT revision FROM step_contents WHERE step_id = ?')
      .get(stepId) as any;

    if (!contentRow) {
      throw new NotFoundError('Step content not found');
    }

    if (contentRow.revision !== expectedRevision) {
      throw new StaleRevisionError(
        'Quiz content was modified in another session.',
        contentRow.revision,
        { stepId }
      );
    }

    const newRevision = contentRow.revision + 1;
    const now = new Date().toISOString();

    const normalizedPayload: QuizContent = {
      kind: 'quiz',
      quizType: quiz.quizType,
      prompt: quiz.prompt.trim(),
      options: quiz.options.map((o) => ({
        id: o.id || crypto.randomUUID(),
        text: o.text.trim(),
        isCorrect: Boolean(o.isCorrect),
      })),
      explanation: (quiz.explanation || '').trim(),
    };

    this.db
      .prepare(
        'UPDATE step_contents SET content_payload = ?, revision = ?, updated_at = ? WHERE step_id = ?'
      )
      .run(JSON.stringify(normalizedPayload), newRevision, now, stepId);

    // Touch course revision
    this.db
      .prepare(
        "UPDATE courses SET draft_revision = draft_revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .run(courseId);

    return { quiz: normalizedPayload, revision: newRevision };
  }

  private authorizedQuiz(userId: string, enrollmentId: string | null, stepId: string, isPreview: boolean): { title: string; quiz: QuizContent } {
    if (isPreview) {
      const row = this.db.prepare(`SELECT s.title, c.owner_id, sc.content_payload FROM steps s
        JOIN lessons l ON s.lesson_id = l.id JOIN modules m ON l.module_id = m.id
        JOIN courses c ON m.course_id = c.id JOIN step_contents sc ON sc.step_id = s.id
        WHERE s.id = ? AND s.type = 'quiz'`).get(stepId) as any;
      if (!row || row.owner_id !== userId) throw new NotFoundError("This page isn't available.");
      return { title: row.title, quiz: JSON.parse(row.content_payload) };
    }
    const enrollment = this.db.prepare(`SELECT e.user_id, e.status, c.is_suspended, cv.snapshot_data FROM enrollments e
      JOIN courses c ON c.id = e.course_id JOIN course_versions cv ON e.pinned_version_id = cv.id
      WHERE e.id = ?`).get(enrollmentId) as any;
    if (!enrollment || enrollment.user_id !== userId || enrollment.status !== 'active' || enrollment.is_suspended) {
      throw new NotFoundError("This page isn't available.");
    }
    const snapshot = JSON.parse(enrollment.snapshot_data);
    for (const module of snapshot.modules || []) for (const lesson of module.lessons || []) for (const step of lesson.steps || []) {
      if (step.id === stepId && step.type === 'quiz' && step.content?.kind === 'quiz') {
        return { title: step.title, quiz: step.content as QuizContent };
      }
    }
    throw new NotFoundError("This page isn't available.");
  }

  getStudentQuiz(userId: string, enrollmentId: string | null, stepId: string, isPreview = false): StudentQuizPayload {
    const { title, quiz: payload } = this.authorizedQuiz(userId, enrollmentId, stepId, isPreview);

    // Strip isCorrect from options before sending to student! (PRD §11.2)
    const sanitizedOptions = (payload.options || []).map((o) => ({
      id: o.id,
      text: o.text,
    }));

    return {
      stepId,
      title,
      prompt: payload.prompt,
      quizType: payload.quizType,
      options: sanitizedOptions,
    };
  }

  gradeQuiz(
    userId: string,
    enrollmentId: string | null,
    stepId: string,
    selectedOptionIds: string[],
    isPreview: boolean = false
  ): QuizGradeResult {
    const { quiz } = this.authorizedQuiz(userId, enrollmentId, stepId, isPreview);
    const correctIds = (quiz.options || []).filter((o) => o.isCorrect).map((o) => o.id);

    // Exact set equality
    const selectedSet = new Set(selectedOptionIds);
    const correctSet = new Set(correctIds);

    const isPassed =
      selectedSet.size === correctSet.size &&
      [...selectedSet].every((id) => correctSet.has(id));

    const verdict: TerminalVerdict = isPassed ? 'PASSED' : 'WRONG_ANSWER';

    // Disclose explanation & correct options ONLY after passing (PRD §11.2)
    const result: QuizGradeResult = {
      verdict,
      isPassed,
      explanation: isPassed ? quiz.explanation : undefined,
      correctOptionIds: isPassed ? correctIds : undefined,
    };

    if (!isPreview && enrollmentId) {
      const now = new Date().toISOString();

      // Find course version id if enrollment exists
      const enr = this.db.prepare('SELECT pinned_version_id FROM enrollments WHERE id = ?').get(enrollmentId) as any;
      const courseVersionId = enr?.pinned_version_id || '';

      this.db.exec('BEGIN IMMEDIATE');
      try {
        // Record attempt
        const attemptId = crypto.randomUUID();
        this.db
          .prepare(
            `INSERT INTO assessment_attempts (
              id, user_id, enrollment_id, step_id, course_version_id,
              attempt_number, type, verdict, selected_options,
              is_infrastructure_failure, created_at
            ) VALUES (
              ?, ?, ?, ?, ?,
              (SELECT COALESCE(MAX(attempt_number), 0) + 1 FROM assessment_attempts WHERE enrollment_id = ? AND step_id = ?),
              'quiz', ?, ?,
              0, ?
            )`
          )
          .run(
            attemptId,
            userId,
            enrollmentId,
            stepId,
            courseVersionId,
            enrollmentId,
            stepId,
            verdict,
            JSON.stringify(selectedOptionIds),
            now
          );

        // If passed and enrollmentId provided, update progress
        if (isPassed) {
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
            .run(crypto.randomUUID(), userId, enrollmentId, stepId, now, now, now);
        }
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    }

    return result;
  }
}
