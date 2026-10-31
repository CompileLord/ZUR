import { DatabaseSync } from 'node:sqlite';
import { ValidationError, NotFoundError } from 'zur-shared';
import type { BatchOperation } from '../types.ts';

export function assertModuleInCourse(db: DatabaseSync, moduleId: string, courseId: string): void {
  if (!db.prepare('SELECT 1 FROM modules WHERE id = ? AND course_id = ?').get(moduleId, courseId)) {
    throw new NotFoundError('Module not found in authorized course.');
  }
}
export function assertLessonInCourse(db: DatabaseSync, lessonId: string, courseId: string): void {
  if (!db.prepare('SELECT 1 FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ? AND m.course_id = ?').get(lessonId, courseId)) {
    throw new NotFoundError('Lesson not found in authorized course.');
  }
}
export function assertStepInCourse(db: DatabaseSync, stepId: string, courseId: string): void {
  if (!db.prepare('SELECT 1 FROM steps s JOIN lessons l ON l.id = s.lesson_id JOIN modules m ON m.id = l.module_id WHERE s.id = ? AND m.course_id = ?').get(stepId, courseId)) {
    throw new NotFoundError('Step not found in authorized course.');
  }
}

export function validateBatchOperationsAndHierarchy(
  db: DatabaseSync,
  courseId: string,
  operations: BatchOperation[]
): void {
  const plannedIds = new Map<string, 'module' | 'lesson' | 'step'>();
  const deletedEntities = new Set<string>();
  const lessonStepCounts = new Map<string, number>();

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const type = op.op || (op as any).type;
    const parent = (op as any).parent_temp_id;
    const moduleId = op.module_id || (type === 'create_lesson' ? parent : undefined);
    const lessonId = op.lesson_id || (type === 'create_step' ? parent : undefined);
    const stepId = op.step_id;

    if (!type) {
      throw new ValidationError(`Operation #${i + 1} is missing "op" field.`);
    }

    switch (type) {
      case 'create_module': {
        const title = (op.title || '').trim();
        if (!title) throw new ValidationError(`Operation #${i + 1} (create_module): title is required`);
        if (op.temp_id) {
          if (plannedIds.has(op.temp_id)) {
            throw new ValidationError(`Duplicate temporary ID: ${op.temp_id}`);
          }
          plannedIds.set(op.temp_id, 'module');
        }
        break;
      }

      case 'update_module': {
        if (!moduleId) throw new ValidationError(`Operation #${i + 1} (update_module): module_id is required`);
        if (deletedEntities.has(moduleId)) {
          throw new ValidationError(`Operation #${i + 1} (update_module): cannot update deleted module ${moduleId}`);
        }
        if (plannedIds.get(moduleId) !== 'module') {
          assertModuleInCourse(db, moduleId, courseId);
        }
        if (op.title !== undefined && !(op.title || '').trim()) {
          throw new ValidationError(`Operation #${i + 1} (update_module): title cannot be empty`);
        }
        break;
      }

      case 'delete_module': {
        if (!moduleId) throw new ValidationError(`Operation #${i + 1} (delete_module): module_id is required`);
        if (deletedEntities.has(moduleId)) {
          throw new ValidationError(`Operation #${i + 1} (delete_module): module ${moduleId} already deleted`);
        }
        if (plannedIds.get(moduleId) !== 'module') {
          assertModuleInCourse(db, moduleId, courseId);
        }
        deletedEntities.add(moduleId);
        break;
      }

      case 'create_lesson': {
        if (!moduleId) throw new ValidationError(`Operation #${i + 1} (create_lesson): module_id is required`);
        if (deletedEntities.has(moduleId)) {
          throw new ValidationError(`Operation #${i + 1} (create_lesson): cannot add lesson to deleted module ${moduleId}`);
        }
        if (plannedIds.get(moduleId) !== 'module') {
          assertModuleInCourse(db, moduleId, courseId);
        }
        const title = (op.title || '').trim();
        if (!title) throw new ValidationError(`Operation #${i + 1} (create_lesson): title is required`);
        if (op.temp_id) {
          if (plannedIds.has(op.temp_id)) {
            throw new ValidationError(`Duplicate temporary ID: ${op.temp_id}`);
          }
          plannedIds.set(op.temp_id, 'lesson');
          lessonStepCounts.set(op.temp_id, 0);
        }
        break;
      }

      case 'update_lesson': {
        if (!lessonId) throw new ValidationError(`Operation #${i + 1} (update_lesson): lesson_id is required`);
        if (deletedEntities.has(lessonId)) {
          throw new ValidationError(`Operation #${i + 1} (update_lesson): cannot update deleted lesson ${lessonId}`);
        }
        if (plannedIds.get(lessonId) !== 'lesson') {
          assertLessonInCourse(db, lessonId, courseId);
        }
        if (op.title !== undefined && !(op.title || '').trim()) {
          throw new ValidationError(`Operation #${i + 1} (update_lesson): title cannot be empty`);
        }
        break;
      }

      case 'delete_lesson': {
        if (!lessonId) throw new ValidationError(`Operation #${i + 1} (delete_lesson): lesson_id is required`);
        if (deletedEntities.has(lessonId)) {
          throw new ValidationError(`Operation #${i + 1} (delete_lesson): lesson ${lessonId} already deleted`);
        }
        if (plannedIds.get(lessonId) !== 'lesson') {
          assertLessonInCourse(db, lessonId, courseId);
        }
        deletedEntities.add(lessonId);
        break;
      }

      case 'create_step': {
        if (!lessonId) throw new ValidationError(`Operation #${i + 1} (create_step): lesson_id is required`);
        if (deletedEntities.has(lessonId)) {
          throw new ValidationError(`Operation #${i + 1} (create_step): cannot add step to deleted lesson ${lessonId}`);
        }
        if (plannedIds.get(lessonId) !== 'lesson') {
          assertLessonInCourse(db, lessonId, courseId);
        }

        const title = (op.title || '').trim();
        if (!title) throw new ValidationError(`Operation #${i + 1} (create_step): title is required`);

        const stepType = (op as any).step_type || (op.op ? op.type : undefined) || ((op.type as string) !== 'create_step' ? op.type : 'theory');
        if (!['theory', 'quiz', 'python', 'video'].includes(stepType)) {
          throw new ValidationError(`Operation #${i + 1} (create_step): unsupported step type "${stepType}"`);
        }

        // Validate step count in resulting hierarchy
        let currentCount = lessonStepCounts.get(lessonId);
        if (currentCount === undefined) {
          const row = db.prepare('SELECT COUNT(*) as cnt FROM steps WHERE lesson_id = ?').get(lessonId) as any;
          currentCount = (row ? row.cnt : 0) as number;
        }
        currentCount++;
        if (currentCount > 20) {
          throw new ValidationError(`Operation #${i + 1} (create_step): Lesson already contains or will exceed 20 steps (maximum allowed).`);
        }
        lessonStepCounts.set(lessonId, currentCount);

        // Validate content schema
        if (op.content) {
          validateStepContentSchema(op.content, stepType, i + 1);
        }
        if (op.test_cases) {
          validateStepContentSchema({ test_cases: op.test_cases }, 'python', i + 1);
        }

        if (op.temp_id) {
          if (plannedIds.has(op.temp_id)) {
            throw new ValidationError(`Duplicate temporary ID: ${op.temp_id}`);
          }
          plannedIds.set(op.temp_id, 'step');
        }
        break;
      }

      case 'update_step': {
        if (!stepId) throw new ValidationError(`Operation #${i + 1} (update_step): step_id is required`);
        if (deletedEntities.has(stepId)) {
          throw new ValidationError(`Operation #${i + 1} (update_step): cannot update deleted step ${stepId}`);
        }
        let existingType = 'theory';
        if (plannedIds.get(stepId) !== 'step') {
          assertStepInCourse(db, stepId, courseId);
          const stepRow = db.prepare('SELECT type FROM steps WHERE id = ?').get(stepId) as any;
          if (stepRow?.type) existingType = stepRow.type;
        }
        if (op.title !== undefined && !(op.title || '').trim()) {
          throw new ValidationError(`Operation #${i + 1} (update_step): title cannot be empty`);
        }
        if (op.content) {
          const stepType = (op as any).step_type || existingType;
          validateStepContentSchema(op.content, stepType, i + 1);
        }
        if (op.test_cases) {
          validateStepContentSchema({ test_cases: op.test_cases }, 'python', i + 1);
        }
        break;
      }

      case 'delete_step': {
        if (!stepId) throw new ValidationError(`Operation #${i + 1} (delete_step): step_id is required`);
        if (deletedEntities.has(stepId)) {
          throw new ValidationError(`Operation #${i + 1} (delete_step): step ${stepId} already deleted`);
        }
        if (plannedIds.get(stepId) !== 'step') {
          assertStepInCourse(db, stepId, courseId);
          const stepRow = db.prepare('SELECT lesson_id FROM steps WHERE id = ?').get(stepId) as any;
          if (stepRow?.lesson_id) {
            const lid = stepRow.lesson_id;
            let currentCount = lessonStepCounts.get(lid);
            if (currentCount === undefined) {
              const row = db.prepare('SELECT COUNT(*) as cnt FROM steps WHERE lesson_id = ?').get(lid) as any;
              currentCount = (row ? row.cnt : 0) as number;
            }
            lessonStepCounts.set(lid, Math.max(0, currentCount - 1));
          }
        }
        deletedEntities.add(stepId);
        break;
      }

      default:
        throw new ValidationError(`Unsupported op "${type}" at index ${i}`);
    }
  }
}

function validateStepContentSchema(content: any, stepType: string, opIndex: number): void {
  if (typeof content !== 'object' || content === null) {
    throw new ValidationError(`Operation #${opIndex}: content must be an object`);
  }
  const text = content.markdown || content.instructionsMarkdown || content.prompt || '';
  if (typeof text === 'string' && text) {
    if (/<script/i.test(text) || /javascript:/i.test(text) || /<\/?(iframe|object|embed)/i.test(text)) {
      throw new ValidationError(`Operation #${opIndex}: Unsafe Markdown containing dangerous script or HTML tags is rejected.`);
    }
    if (/!\[.*?\]\((https?:\/\/[^)]+)\)/i.test(text)) {
      throw new ValidationError(`Operation #${opIndex}: External image URLs in Markdown are rejected. Use zur-asset references.`);
    }
  }
  if (stepType === 'theory') {
    if (content.markdown !== undefined && typeof content.markdown !== 'string') {
      throw new ValidationError(`Operation #${opIndex} (theory): content.markdown must be a string`);
    }
  } else if (stepType === 'quiz') {
    if (content.options !== undefined) {
      if (!Array.isArray(content.options) || content.options.length < 2 || content.options.length > 6) {
        throw new ValidationError(`Operation #${opIndex} (quiz): content.options must contain between 2 and 6 options`);
      }
      let hasCorrect = false;
      for (const opt of content.options) {
        if (!opt || typeof opt !== 'object' || typeof opt.text !== 'string' || !opt.text.trim()) {
          throw new ValidationError(`Operation #${opIndex} (quiz): each option must have non-empty text`);
        }
        if (opt.isCorrect) hasCorrect = true;
      }
      if (!hasCorrect) {
        throw new ValidationError(`Operation #${opIndex} (quiz): at least one option must have isCorrect set to true`);
      }
    }
  } else if (stepType === 'python') {
    if (content.test_cases !== undefined) {
      if (!Array.isArray(content.test_cases)) {
        throw new ValidationError(`Operation #${opIndex} (python): test_cases must be an array`);
      }
      for (const tc of content.test_cases) {
        if (!tc || typeof tc !== 'object' || typeof tc.stdin !== 'string' || typeof tc.expected_stdout !== 'string') {
          throw new ValidationError(`Operation #${opIndex} (python): each test case must have string stdin and expected_stdout`);
        }
      }
    }
  } else if (stepType === 'video') {
    if (content.videoUrl !== undefined && typeof content.videoUrl !== 'string') {
      throw new ValidationError(`Operation #${opIndex} (video): content.videoUrl must be a string`);
    }
  }
}
