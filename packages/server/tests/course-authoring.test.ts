import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { CourseService } from '../src/services/course-service.ts';
import { CourseStructureService } from '../src/services/course-structure-service.ts';
import { CourseAutosaveService } from '../src/services/course-autosave-service.ts';
import { CoursePublicationService } from '../src/services/course-publication-service.ts';
import { StaleRevisionError, ValidationError, NotFoundError, ConflictError } from 'zur-shared';
import { createServer } from '../src/server.ts';
import type { AddressInfo } from 'node:net';
import { IdentityService } from '../src/services/identity-service.ts';

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

  await t.test('T039: Draft preview enforces owner-only access and step-to-course membership', async () => {
    const server = createServer(db);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const identityService = new IdentityService(db);
      const adaSession = identityService.signIn({ email: 'ada@zur.internal', password: 'StudentPass123!' });
      const authorSession = identityService.signIn({ email: 'guido@zur.internal', password: 'AuthorPass123!' });

      // Ada's course has modules and steps
      const adaTree = structureService.getCourseTree(adaId, createdCourseId);
      const adaStepId = adaTree.modules[0].lessons[0].steps[0].id;

      // Author Babbage owns another course
      const babbageCourse = courseService.createCourseDraft(authorId, { title: 'Babbage Engine Basics' });
      const babbageMod = structureService.addModule(authorId, babbageCourse.id, 'Intro', 0);
      const babbageLesson = structureService.addLesson(authorId, babbageCourse.id, babbageMod.id, 'Lesson 1', 'Desc', 0);
      const babbageStep = structureService.addStep(authorId, babbageCourse.id, babbageLesson.id, {
        title: 'Babbage Theory Step',
        type: 'theory',
        position: 0,
      });

      // 1. Ada can preview her own step in her course
      const ownRes = await fetch(`${origin}/api/author/courses/${createdCourseId}/preview/${adaStepId}`, {
        headers: { Authorization: `Bearer ${adaSession.token}` },
      });
      assert.equal(ownRes.status, 200);
      const ownData = await ownRes.json() as any;
      assert.equal(ownData.stepId, adaStepId);
      assert.equal(ownData.courseId, createdCourseId);

      // 2. Cross-course denial: Ada requests Babbage's step using Ada's course ID -> must return 404 safeNotFound
      const crossCourseRes = await fetch(`${origin}/api/author/courses/${createdCourseId}/preview/${babbageStep.id}`, {
        headers: { Authorization: `Bearer ${adaSession.token}` },
      });
      assert.equal(crossCourseRes.status, 404, 'Must reject step that belongs to a different course');

      // 3. Non-owner denial: Ada requests Babbage's step using Babbage's course ID -> must return 404 safeNotFound
      const nonOwnerRes = await fetch(`${origin}/api/author/courses/${babbageCourse.id}/preview/${babbageStep.id}`, {
        headers: { Authorization: `Bearer ${adaSession.token}` },
      });
      assert.equal(nonOwnerRes.status, 404, 'Must reject draft preview when caller is not course owner');

      // 4. Babbage can preview his own step in his course
      const babbageRes = await fetch(`${origin}/api/author/courses/${babbageCourse.id}/preview/${babbageStep.id}`, {
        headers: { Authorization: `Bearer ${authorSession.token}` },
      });
      assert.equal(babbageRes.status, 200);
      const babbageData = await babbageRes.json() as any;
      assert.equal(babbageData.stepId, babbageStep.id);
      assert.equal(babbageData.courseId, babbageCourse.id);
    } finally {
      server.close();
    }
  });

  await t.test('T041: Durable publication idempotency persists across instances and rejects key reuse conflicts', async () => {
    // Create and setup a publishable course for Charles Babbage (theory + quiz steps)
    const pubCourse = courseService.createCourseDraft(authorId, { title: 'Idempotency Lifecycle Course' });
    courseService.updateCourseMetadata(authorId, pubCourse.id, 1, {
      description: 'A course for testing publication idempotency',
      difficulty: 'beginner',
      language: 'en',
      learningOutcomes: ['Understand publication idempotency'],
      estimatedDurationMinutes: 15,
    });
    const pubTree = structureService.getCourseTree(authorId, pubCourse.id);
    const pubLessonId = pubTree.modules[0].lessons[0].id;
    const theoryStep = pubTree.modules[0].lessons[0].steps[0];
    db.prepare(
      `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
       VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    ).run('sc-pub-th', theoryStep.id, JSON.stringify({ kind: 'theory', markdown: '# Publication Idempotency' }));

    const quizStep = structureService.addStep(authorId, pubCourse.id, pubLessonId, {
      title: 'Publication Quiz',
      type: 'quiz',
      isRequired: true,
      estimatedDurationMinutes: 5,
    });
    db.prepare(
      `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
       VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    ).run('sc-pub-qz', quizStep.id, JSON.stringify({
      kind: 'quiz',
      quizType: 'single_choice',
      prompt: 'Is idempotency durable in SQLite?',
      options: [
        { id: 'opt-y', text: 'Yes', isCorrect: true },
        { id: 'opt-n', text: 'No', isCorrect: false },
      ],
      explanation: 'Publication idempotency is persisted in publication_idempotency table.',
    }));

    const pubService1 = new CoursePublicationService(db);
    const currentDraft = courseService.getCourse(authorId, pubCourse.id);

    // 1. Initial publication with idempotency key
    const receipt1 = await pubService1.publishCourse(authorId, pubCourse.id, {
      expectedRevision: currentDraft.draftRevision,
      changeSummary: 'First publication',
      idempotencyKey: 'idemp-durable-key-001',
    });
    assert.equal(receipt1.versionNumber, 1);
    assert.ok(receipt1.versionId);

    // Verify persisted in publication_idempotency table
    const storedRow = db.prepare('SELECT * FROM publication_idempotency WHERE idempotency_key = ?')
      .get('idemp-durable-key-001') as any;
    assert.ok(storedRow, 'Must persist idempotency record in SQLite');
    assert.equal(storedRow.owner_id, authorId);
    assert.equal(storedRow.course_id, pubCourse.id);
    const parsedReceipt = JSON.parse(storedRow.response_payload);
    assert.equal(parsedReceipt.versionId, receipt1.versionId);

    // 2. Simulate restart with new service instance: same key returns cached receipt
    const pubService2 = new CoursePublicationService(db);
    const receipt2 = await pubService2.publishCourse(authorId, pubCourse.id, {
      expectedRevision: currentDraft.draftRevision,
      changeSummary: 'First publication',
      idempotencyKey: 'idemp-durable-key-001',
    });
    assert.equal(receipt2.versionId, receipt1.versionId, 'Must return same receipt from durable store');
    assert.equal(receipt2.versionNumber, receipt1.versionNumber);

    // 3. Conflict rejection: same idempotency key used on a different course owned by the same author
    const secondCourse = courseService.createCourseDraft(authorId, { title: 'Second Babbage Course' });
    await assert.rejects(
      async () => {
        await pubService2.publishCourse(authorId, secondCourse.id, {
          expectedRevision: 1,
          changeSummary: 'First publication',
          idempotencyKey: 'idemp-durable-key-001',
        });
      },
      ConflictError,
      'Must reject idempotency key reuse on different course'
    );

    // 4. Conflict rejection: same idempotency key used with different payload (e.g. different revision / summary)
    await assert.rejects(
      async () => {
        await pubService2.publishCourse(authorId, pubCourse.id, {
          expectedRevision: currentDraft.draftRevision + 1,
          changeSummary: 'A different summary',
          idempotencyKey: 'idemp-durable-key-001',
        });
      },
      ConflictError,
      'Must reject idempotency key reuse with different payload parameters'
    );
  });

  await t.test('Security: Cross-course step and lesson ID denial prevents unauthorized mutation', async () => {
    // Author A: Ada Lovelace (owns createdCourseId)
    // Author B: Charles Babbage (authorId) creates a separate course
    const babbageCourse = courseService.createCourseDraft(authorId, { title: 'Babbage Separate Course' });
    const babbageMod = structureService.addModule(authorId, babbageCourse.id, 'Babbage Module');
    const babbageLesson = structureService.addLesson(authorId, babbageCourse.id, babbageMod.id, 'Babbage Lesson');
    const babbageStep = structureService.addStep(authorId, babbageCourse.id, babbageLesson.id, {
      title: 'Protected Babbage Step',
      type: 'theory',
      estimatedDurationMinutes: 15,
      isRequired: true,
    });

    // 1. Ada tries to update Babbage's step through Ada's course ID -> NotFoundError
    assert.throws(
      () => {
        structureService.updateStep(adaId, createdCourseId, babbageStep.id, {
          title: 'Hijacked Step Title',
          estimatedDurationMinutes: 1,
          isRequired: false,
        });
      },
      NotFoundError,
      'updateStep must reject mutating a step from another course'
    );

    // 2. Ada tries to duplicate Babbage's step into Babbage's lesson using Ada's course ID -> NotFoundError
    assert.throws(
      () => {
        structureService.duplicateStep(adaId, createdCourseId, babbageStep.id);
      },
      NotFoundError,
      'duplicateStep must reject duplicating a step from another course'
    );

    // 3. Ada tries to delete Babbage's step through Ada's course ID -> NotFoundError
    assert.throws(
      () => {
        structureService.deleteStep(adaId, createdCourseId, babbageStep.id);
      },
      NotFoundError,
      'deleteStep must reject deleting a step from another course'
    );

    // 4. Ada tries to inject a step into Babbage's lesson through Ada's course ID -> NotFoundError
    assert.throws(
      () => {
        structureService.addStep(adaId, createdCourseId, babbageLesson.id, {
          title: 'Injected Step',
          type: 'theory',
        });
      },
      NotFoundError,
      'addStep must reject adding a step to a lesson from another course'
    );

    // 5. Ada tries to update Babbage's lesson through Ada's course ID -> NotFoundError
    assert.throws(
      () => {
        structureService.updateLesson(adaId, createdCourseId, babbageLesson.id, 'Hijacked Lesson');
      },
      NotFoundError,
      'updateLesson must reject updating a lesson from another course'
    );

    // 6. Ada tries to delete Babbage's lesson through Ada's course ID -> NotFoundError
    assert.throws(
      () => {
        structureService.deleteLesson(adaId, createdCourseId, babbageLesson.id);
      },
      NotFoundError,
      'deleteLesson must reject deleting a lesson from another course'
    );

    // 7. Verify via HTTP API with authenticated server
    const server = createServer(db);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const origin = `http://127.0.0.1:${port}`;

    try {
      // Sign in Ada
      const identityService = new IdentityService(db);
      const adaSession = identityService.signIn({ email: 'ada@zur.internal', password: 'StudentPass123!' });

      const res = await fetch(`${origin}/api/author/courses/${createdCourseId}/steps/${babbageStep.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adaSession.token}`,
        },
        body: JSON.stringify({
          estimatedDurationMinutes: 99,
          isRequired: false,
        }),
      });

      assert.equal(res.status, 404, 'HTTP endpoint must return 404 for cross-course step ID update');

      // Verify Babbage's step remains unchanged in DB
      const stepRow = db.prepare('SELECT title, is_required, estimated_duration_minutes FROM steps WHERE id = ?').get(babbageStep.id) as any;
      assert.equal(stepRow.title, 'Protected Babbage Step');
      assert.equal(stepRow.is_required, 1);
      assert.equal(stepRow.estimated_duration_minutes, 15);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
