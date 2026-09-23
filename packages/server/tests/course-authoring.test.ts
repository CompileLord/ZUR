import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { CourseService } from '../src/services/course-service.ts';
import { CourseStructureService } from '../src/services/course-structure-service.ts';
import { CourseAutosaveService } from '../src/services/course-autosave-service.ts';
import { StaleRevisionError, ValidationError, NotFoundError } from 'zur-shared';

test('Course Authoring, Structure & Autosave (T029-T031, T038)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const courseService = new CourseService(db);
  const structureService = new CourseStructureService(db);
  const autosaveService = new CourseAutosaveService(db);

  // Seeded user: Ada Lovelace
  const adaId = 'user-student-1';
  // Seeded author: Charles Babbage
  const authorId = 'user-author-1';

  let createdCourseId = '';

  await t.test('T029: Creates title-only private draft and ensures author capability', () => {
    // Check Ada's initial capabilities: student only
    const userBefore = db.prepare('SELECT capabilities FROM users WHERE id = ?').get(adaId) as any;
    assert.ok(!userBefore.capabilities.includes('author'), 'Ada starts without author capability');

    // Create course draft with title only
    const draft = courseService.createCourseDraft(adaId, {
      title: 'Algorithmic Thinking in Python',
    });

    assert.ok(draft.id, 'Must return course ID');
    assert.equal(draft.title, 'Algorithmic Thinking in Python');
    assert.equal(draft.visibility, 'private', 'Draft starts private');
    assert.equal(draft.enrollmentPolicy, 'invitation_only');
    assert.equal(draft.publicationStatus, 'draft');
    assert.equal(draft.draftRevision, 1);
    assert.equal(draft.hasUnpublishedChanges, true);

    createdCourseId = draft.id;

    // Verify Ada gained author capability additively
    const userAfter = db.prepare('SELECT capabilities FROM users WHERE id = ?').get(adaId) as any;
    assert.ok(userAfter.capabilities.includes('author'), 'Author capability must be granted additively');
  });

  await t.test('T029: Lists owned courses with status filter and search', () => {
    const listAll = courseService.listOwnedCourses(adaId, { status: 'all' });
    assert.equal(listAll.courses.length, 1);
    assert.equal(listAll.courses[0].id, createdCourseId);

    const listDrafts = courseService.listOwnedCourses(adaId, { status: 'draft' });
    assert.equal(listDrafts.courses.length, 1);

    const listPublished = courseService.listOwnedCourses(adaId, { status: 'published' });
    assert.equal(listPublished.courses.length, 0);

    const searchMatch = courseService.listOwnedCourses(adaId, { search: 'algorithmic' });
    assert.equal(searchMatch.courses.length, 1);

    const searchNoMatch = courseService.listOwnedCourses(adaId, { search: 'nonexistent' });
    assert.equal(searchNoMatch.courses.length, 0);
  });

  await t.test('T030: Updates course metadata with optimistic revision checks', () => {
    // Valid update
    const updated = courseService.updateCourseMetadata(adaId, createdCourseId, 1, {
      description: 'Learn computational problem solving from first principles.',
      difficulty: 'intermediate',
      tags: ['Algorithms', 'Python', 'Logic'],
      learningOutcomes: ['Decompose complex problems', 'Implement search and sorting'],
      estimatedDurationMinutes: 180,
    });

    assert.equal(updated.draftRevision, 2);
    assert.equal(updated.difficulty, 'intermediate');
    assert.equal(updated.tags.length, 3);
    assert.equal(updated.tags[0], 'algorithms'); // normalized lowercase
    assert.equal(updated.learningOutcomes.length, 2);
    assert.equal(updated.estimatedDurationMinutes, 180);

    // Stale revision error
    assert.throws(
      () => {
        courseService.updateCourseMetadata(adaId, createdCourseId, 1, {
          title: 'Stale Title Edit',
        });
      },
      StaleRevisionError,
      'Must reject stale revision with 409'
    );
  });

  await t.test('T030: Access settings enforce private -> invitation_only lock', () => {
    // If visibility is private, enrollment policy must stay invitation_only
    const settings = courseService.updateCourseAccessSettings(adaId, createdCourseId, {
      visibility: 'private',
      enrollmentPolicy: 'open', // Should be forced to invitation_only
    });

    assert.equal(settings.visibility, 'private');
    assert.equal(settings.enrollmentPolicy, 'invitation_only');
  });

  await t.test('T031: Builder tree structure operations (Module, Lesson, Step CRUD)', () => {
    // 1. Get initial tree
    const tree = structureService.getCourseTree(adaId, createdCourseId);
    assert.equal(tree.modules.length, 1, 'Draft has default initial module');
    assert.equal(tree.modules[0].lessons.length, 1, 'Default initial lesson');
    assert.equal(tree.modules[0].lessons[0].steps.length, 1, 'Default initial step');

    const defaultModuleId = tree.modules[0].id;
    const defaultLessonId = tree.modules[0].lessons[0].id;

    // 2. Add second module
    const mod2 = structureService.addModule(adaId, createdCourseId, 'Module 2: Advanced Topics');
    assert.ok(mod2.id);

    // 3. Add lesson to module 2
    const lesson2 = structureService.addLesson(adaId, createdCourseId, mod2.id, 'Lesson 2.1: Recursion');
    assert.ok(lesson2.id);

    // 4. Add steps to lesson 2
    const stepTheory = structureService.addStep(adaId, createdCourseId, lesson2.id, {
      title: 'Recursion Concepts',
      type: 'theory',
      estimatedDurationMinutes: 10,
    });
    assert.equal(stepTheory.type, 'theory');

    const stepQuiz = structureService.addStep(adaId, createdCourseId, lesson2.id, {
      title: 'Recursion Checkpoint',
      type: 'quiz',
    });
    assert.equal(stepQuiz.type, 'quiz');

    const stepPython = structureService.addStep(adaId, createdCourseId, lesson2.id, {
      title: 'Factorial Exercise',
      type: 'python',
    });
    assert.equal(stepPython.type, 'python');

    // 5. Duplicate step
    const duplicated = structureService.duplicateStep(adaId, createdCourseId, stepPython.id);
    assert.equal(duplicated.title, 'Factorial Exercise (Copy)');
    assert.equal(duplicated.type, 'python');

    // 6. Delete duplicated step
    const delResult = structureService.deleteStep(adaId, createdCourseId, duplicated.id);
    assert.equal(delResult.success, true);

    // 7. Verify tree reflects additions
    const updatedTree = structureService.getCourseTree(adaId, createdCourseId);
    assert.equal(updatedTree.modules.length, 2);
    assert.equal(updatedTree.modules[1].lessons[0].steps.length, 3);
  });

  await t.test('T031: Enforces 1-20 steps limit per lesson', () => {
    const tree = structureService.getCourseTree(adaId, createdCourseId);
    const lessonId = tree.modules[0].lessons[0].id;

    // Currently has 1 step. Add 19 more steps to reach 20
    for (let i = 2; i <= 20; i++) {
      structureService.addStep(adaId, createdCourseId, lessonId, {
        title: `Step ${i}`,
        type: 'theory',
      });
    }

    // 21st step should fail
    assert.throws(
      () => {
        structureService.addStep(adaId, createdCourseId, lessonId, {
          title: 'Step 21 (Exceeds limit)',
          type: 'theory',
        });
      },
      ValidationError,
      'Must reject step 21 with limit error'
    );
  });

  await t.test('T038: Autosave step content with revision conflict recovery', () => {
    const tree = structureService.getCourseTree(adaId, createdCourseId);
    const stepId = tree.modules[1].lessons[0].steps[0].id;

    // Initial content
    const initial = autosaveService.getStepContent(adaId, stepId);
    assert.equal(initial.revision, 1);

    // Successful save
    const saved = autosaveService.saveStepContent(adaId, stepId, 1, {
      kind: 'theory',
      markdown: '# Updated Recursion Concepts\n\nA function that calls itself.',
    });

    assert.equal(saved.revision, 2);
    assert.equal((saved.content as any).markdown, '# Updated Recursion Concepts\n\nA function that calls itself.');

    // Stale save from another tab (expectedRevision = 1 while server is at 2)
    assert.throws(
      () => {
        autosaveService.saveStepContent(adaId, stepId, 1, {
          kind: 'theory',
          markdown: '# Conflicting Edit from Tab B',
        });
      },
      (err: any) => {
        assert.ok(err instanceof StaleRevisionError);
        assert.equal(err.details.currentRevision, 2);
        assert.ok(err.details.serverContent.markdown.includes('A function that calls itself.'));
        return true;
      }
    );
  });

  await t.test('Authorization: Non-owner cannot access or modify private course', () => {
    // Another student tries to get Ada's course tree
    assert.throws(
      () => {
        structureService.getCourseTree('user-student-2', createdCourseId);
      },
      NotFoundError,
      'Private course unknown to non-owners'
    );
  });
});
