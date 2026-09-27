import { DatabaseSync } from 'node:sqlite';
import {
  NotFoundError,
  AuthorizationError,
  compareOutput,
  deriveEmbedUrl,
} from 'zur-shared';
import type {
  CourseValidationResult,
  ValidationErrorItem,
  ValidationWarningItem,
  QuizContent,
  PythonExerciseContent,
  VideoContent,
  TheoryContent,
} from 'zur-shared';
import { runPythonIsolated } from 'zur-worker';
import { AuthorValidationQuota } from './author-validation-quota.ts';

export class CourseValidationService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private verifyCourseAccess(userId: string, courseId: string): any {
    const course = this.db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as any;
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

    return course;
  }

  async validateCourseDraft(userId: string, courseId: string): Promise<CourseValidationResult> {
    const course = this.verifyCourseAccess(userId, courseId);
    const releaseValidation = new AuthorValidationQuota(this.db).acquire(userId);
    try {

    const errors: ValidationErrorItem[] = [];
    const warnings: ValidationWarningItem[] = [];

    // 1. Metadata checks
    if (!course.title || !course.title.trim()) {
      errors.push({
        field: 'title',
        message: 'Course title cannot be empty',
        blocking: true,
      });
    }

    if (!course.description || !course.description.trim()) {
      errors.push({
        field: 'description',
        message: 'Course description is required for publication',
        blocking: true,
      });
    }

    const category = this.db.prepare('SELECT id FROM categories WHERE id = ?').get(course.category_id);
    if (!category) {
      errors.push({
        field: 'categoryId',
        message: 'Course category is invalid or missing',
        blocking: true,
      });
    }

    if (!course.language || !course.language.trim()) {
      errors.push({
        field: 'language',
        message: 'Course language is required',
        blocking: true,
      });
    }

    if (!['beginner', 'intermediate', 'advanced'].includes(course.difficulty)) {
      errors.push({
        field: 'difficulty',
        message: 'Course difficulty must be beginner, intermediate, or advanced',
        blocking: true,
      });
    }

    let learningOutcomes: string[] = [];
    try {
      learningOutcomes = JSON.parse(course.learning_outcomes || '[]');
    } catch {
      learningOutcomes = [];
    }
    if (!Array.isArray(learningOutcomes) || learningOutcomes.length === 0) {
      errors.push({
        field: 'learningOutcomes',
        message: 'Course must specify at least one learning outcome',
        blocking: true,
      });
    }

    // 2. Media checks for course assets
    const mediaAssets = this.db
      .prepare('SELECT * FROM media_assets WHERE course_id = ?')
      .all(courseId) as any[];

    for (const asset of mediaAssets) {
      if (asset.processing_status === 'quarantined') {
        errors.push({
          field: 'media',
          message: `Media asset "${asset.file_path || asset.id}" is quarantined`,
          blocking: true,
        });
      } else if (asset.processing_status === 'failed') {
        errors.push({
          field: 'media',
          message: `Media asset "${asset.file_path || asset.id}" failed processing`,
          blocking: true,
        });
      }

      if (!asset.is_decorative && (!asset.alt_text || !asset.alt_text.trim())) {
        errors.push({
          field: 'media',
          message: `Image asset "${asset.file_path || asset.id}" is missing alternative text and is not marked as decorative`,
          blocking: true,
        });
      }
    }

    // 3. Hierarchy and Step checks
    const modules = this.db
      .prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC, created_at ASC')
      .all(courseId) as any[];

    if (modules.length === 0) {
      errors.push({
        field: 'modules',
        message: 'Course must contain at least one module',
        blocking: true,
      });
    }

    let totalRequiredSteps = 0;

    for (const mod of modules) {
      const lessons = this.db
        .prepare('SELECT * FROM lessons WHERE module_id = ? ORDER BY position ASC, created_at ASC')
        .all(mod.id) as any[];

      if (lessons.length === 0) {
        errors.push({
          moduleId: mod.id,
          field: 'lessons',
          message: `Module "${mod.title}" must contain at least one lesson`,
          blocking: true,
        });
        continue;
      }

      for (const lesson of lessons) {
        if (!lesson.description || !lesson.description.trim()) {
          warnings.push({
            moduleId: mod.id,
            lessonId: lesson.id,
            field: 'description',
            message: `Lesson "${lesson.title}" has no description`,
          });
        }

        const steps = this.db
          .prepare('SELECT * FROM steps WHERE lesson_id = ? ORDER BY position ASC, created_at ASC')
          .all(lesson.id) as any[];

        if (steps.length === 0) {
          errors.push({
            moduleId: mod.id,
            lessonId: lesson.id,
            field: 'steps',
            message: `Lesson "${lesson.title}" must contain at least one step`,
            blocking: true,
          });
          continue;
        }

        if (steps.length > 20) {
          errors.push({
            moduleId: mod.id,
            lessonId: lesson.id,
            field: 'steps',
            message: `Lesson "${lesson.title}" exceeds maximum of 20 steps (currently has ${steps.length})`,
            blocking: true,
          });
        }

        for (const step of steps) {
          if (step.is_required) {
            totalRequiredSteps++;
          }

          const contentRow = this.db
            .prepare('SELECT content_payload FROM step_contents WHERE step_id = ?')
            .get(step.id) as any;

          if (!contentRow || !contentRow.content_payload) {
            errors.push({
              moduleId: mod.id,
              lessonId: lesson.id,
              stepId: step.id,
              field: 'content',
              message: `Step "${step.title}" is missing content payload`,
              blocking: true,
            });
            continue;
          }

          let payload: any = null;
          try {
            payload = JSON.parse(contentRow.content_payload);
          } catch {
            errors.push({
              moduleId: mod.id,
              lessonId: lesson.id,
              stepId: step.id,
              field: 'content',
              message: `Step "${step.title}" has invalid content payload format`,
              blocking: true,
            });
            continue;
          }

          if (step.type === 'theory') {
            const theory = payload as TheoryContent;
            if (!theory.markdown || !theory.markdown.trim()) {
              errors.push({
                moduleId: mod.id,
                lessonId: lesson.id,
                stepId: step.id,
                field: 'markdown',
                message: `Theory step "${step.title}" cannot have empty content`,
                blocking: true,
              });
            }
          } else if (step.type === 'video') {
            const video = payload as VideoContent;
            const embed = deriveEmbedUrl(video.videoUrl || '');
            if (!embed.embedUrl || !embed.provider) {
              errors.push({
                moduleId: mod.id,
                lessonId: lesson.id,
                stepId: step.id,
                field: 'videoUrl',
                message: `Video step "${step.title}" must have a valid URL from an approved provider (YouTube, Vimeo, or Loom)`,
                blocking: true,
              });
            }

            if (!video.captionVerified && (!video.transcript || !video.transcript.trim())) {
              errors.push({
                moduleId: mod.id,
                lessonId: lesson.id,
                stepId: step.id,
                field: 'transcript',
                message: `Video step "${step.title}" must include a transcript or have captions verified`,
                blocking: true,
              });
            }
          } else if (step.type === 'quiz') {
            const quiz = payload as QuizContent;
            if (!quiz.prompt || !quiz.prompt.trim()) {
              errors.push({
                moduleId: mod.id,
                lessonId: lesson.id,
                stepId: step.id,
                field: 'prompt',
                message: `Quiz step "${step.title}" question prompt cannot be empty`,
                blocking: true,
              });
            }

            if (!Array.isArray(quiz.options) || quiz.options.length < 2 || quiz.options.length > 8) {
              errors.push({
                moduleId: mod.id,
                lessonId: lesson.id,
                stepId: step.id,
                field: 'options',
                message: `Quiz step "${step.title}" must have between 2 and 8 options`,
                blocking: true,
              });
            } else {
              for (let i = 0; i < quiz.options.length; i++) {
                const opt = quiz.options[i];
                if (!opt.text || !opt.text.trim()) {
                  errors.push({
                    moduleId: mod.id,
                    lessonId: lesson.id,
                    stepId: step.id,
                    field: 'options',
                    message: `Quiz step "${step.title}" option #${i + 1} cannot have empty text`,
                    blocking: true,
                  });
                }
              }

              const correctCount = quiz.options.filter((o) => Boolean(o.isCorrect)).length;
              const incorrectCount = quiz.options.length - correctCount;

              if (quiz.quizType === 'single_choice') {
                if (correctCount !== 1) {
                  errors.push({
                    moduleId: mod.id,
                    lessonId: lesson.id,
                    stepId: step.id,
                    field: 'options',
                    message: `Single-choice quiz "${step.title}" must have exactly 1 correct answer (found ${correctCount})`,
                    blocking: true,
                  });
                }
              } else if (quiz.quizType === 'multiple_choice') {
                if (correctCount < 1 || incorrectCount < 1) {
                  errors.push({
                    moduleId: mod.id,
                    lessonId: lesson.id,
                    stepId: step.id,
                    field: 'options',
                    message: `Multiple-choice quiz "${step.title}" must have at least 1 correct and at least 1 incorrect answer`,
                    blocking: true,
                  });
                }
              } else {
                errors.push({
                  moduleId: mod.id,
                  lessonId: lesson.id,
                  stepId: step.id,
                  field: 'quizType',
                  message: `Quiz step "${step.title}" must specify quizType as single_choice or multiple_choice`,
                  blocking: true,
                });
              }
            }
          } else if (step.type === 'python') {
            const exercise = payload as PythonExerciseContent;
            if (typeof exercise.starterCode !== 'string') {
              errors.push({
                moduleId: mod.id,
                lessonId: lesson.id,
                stepId: step.id,
                field: 'starterCode',
                message: `Python exercise "${step.title}" must specify starter code`,
                blocking: true,
              });
            }

            if (!exercise.referenceSolution || !exercise.referenceSolution.trim()) {
              errors.push({
                moduleId: mod.id,
                lessonId: lesson.id,
                stepId: step.id,
                field: 'referenceSolution',
                message: `Python exercise "${step.title}" is missing a reference solution`,
                blocking: true,
              });
            }

            const testCases = this.db
              .prepare('SELECT * FROM test_cases WHERE step_id = ? ORDER BY is_hidden ASC, position ASC')
              .all(step.id) as any[];

            const publicTests = testCases.filter((tc) => tc.is_hidden === 0);
            const hiddenTests = testCases.filter((tc) => tc.is_hidden === 1);

            if (publicTests.length < 1) {
              errors.push({
                moduleId: mod.id,
                lessonId: lesson.id,
                stepId: step.id,
                field: 'testCases',
                message: `Python exercise "${step.title}" must have at least one public test case`,
                blocking: true,
              });
            }

            if (hiddenTests.length < 1) {
              errors.push({
                moduleId: mod.id,
                lessonId: lesson.id,
                stepId: step.id,
                field: 'testCases',
                message: `Python exercise "${step.title}" must have at least one hidden test case`,
                blocking: true,
              });
            }

            if (testCases.length > 50) {
              errors.push({
                moduleId: mod.id,
                lessonId: lesson.id,
                stepId: step.id,
                field: 'testCases',
                message: `Python exercise "${step.title}" exceeds maximum of 50 test cases`,
                blocking: true,
              });
            }

            if (!exercise.hints || exercise.hints.length === 0) {
              warnings.push({
                moduleId: mod.id,
                lessonId: lesson.id,
                stepId: step.id,
                field: 'hints',
                message: `Python exercise "${step.title}" has no hints for learners`,
              });
            }

            // Check for duplicate test case inputs
            const seenInputs = new Set<string>();
            for (const tc of testCases) {
              if (seenInputs.has(tc.stdin)) {
                warnings.push({
                  moduleId: mod.id,
                  lessonId: lesson.id,
                  stepId: step.id,
                  field: 'testCases',
                  message: `Python exercise "${step.title}" has duplicate test case inputs`,
                });
                break;
              }
              seenInputs.add(tc.stdin);
            }

            // Reference solution execution against ALL test cases
            if (exercise.referenceSolution && exercise.referenceSolution.trim() && testCases.length > 0) {
              const runOptions = {
                wallTimeoutSeconds: exercise.runtimeLimits?.wallTimeoutSeconds || 10,
                cpuTimeoutSeconds: exercise.runtimeLimits?.cpuTimeoutSeconds || 5,
                memoryLimitMib: exercise.runtimeLimits?.memoryLimitMib || 128,
              };

              for (let i = 0; i < testCases.length; i++) {
                const tc = testCases[i];
                const outcome = await runPythonIsolated(exercise.referenceSolution, tc.stdin || '', runOptions);

                if (outcome.verdict !== 'PASSED') {
                  errors.push({
                    moduleId: mod.id,
                    lessonId: lesson.id,
                    stepId: step.id,
                    field: 'referenceSolution',
                    message: `Reference solution failed test case #${i + 1}: ${outcome.verdict}`,
                    blocking: true,
                  });
                } else {
                  const cmp = compareOutput(outcome.stdout, tc.expected_stdout || '');
                  if (!cmp.passed) {
                    errors.push({
                      moduleId: mod.id,
                      lessonId: lesson.id,
                      stepId: step.id,
                      field: 'referenceSolution',
                      message: `Reference solution failed test case #${i + 1}: WRONG_ANSWER`,
                      blocking: true,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    if (modules.length > 0 && totalRequiredSteps === 0) {
      errors.push({
        field: 'steps',
        message: 'Course must contain at least one required step',
        blocking: true,
      });
    }

    return {
      isValid: errors.length === 0,
      draftRevision: course.draft_revision,
      errors,
      warnings,
    };
    } finally { releaseValidation(); }
  }
}
