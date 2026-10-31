import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { CoursePublicationService } from '../../../src/services/course-publication-service.ts';
import { NotFoundError, ConflictError } from 'zur-shared';
import { createServer } from '../../../src/server.ts';
import type { AddressInfo } from 'node:net';
import { IdentityService } from '../../../src/services/identity-service.ts';
import type { AuthoringFixture } from './fixture.ts';
import { writeStarterStep } from '../starter-step.ts';

export async function previewPublicationSecurityTests(t: TestContext, f: AuthoringFixture): Promise<void> {
  const { db, courseService, structureService, adaId, authorId, state } = f;

  await t.test('T039: Draft preview enforces owner-only access and step-to-course membership', async () => {
    const server = createServer(db);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const identityService = new IdentityService(db);
      const adaSession = identityService.signIn({ email: 'ada@zur.internal', password: 'StudentPass123!' });
      const authorSession = identityService.signIn({ email: 'guido@zur.internal', password: 'AuthorPass123!' });

      // Ada's course has modules and steps
      const adaTree = structureService.getCourseTree(adaId, state.createdCourseId);
      const adaStepId = adaTree.modules[0].lessons[0].steps[0].id;

      // Author Babbage owns another course
      const babbageCourse = courseService.createCourseDraft(authorId, { title: 'Babbage Engine Basics' });
      writeStarterStep(db, babbageCourse.id);
      const babbageMod = structureService.addModule(authorId, babbageCourse.id, 'Intro', 0);
      const babbageLesson = structureService.addLesson(authorId, babbageCourse.id, babbageMod.id, 'Lesson 1', 'Desc', 0);
      const babbageStep = structureService.addStep(authorId, babbageCourse.id, babbageLesson.id, {
        title: 'Babbage Theory Step',
        type: 'theory',
        position: 0,
      });

      // 1. Ada can preview her own step in her course
      const ownRes = await fetch(`${origin}/api/author/courses/${state.createdCourseId}/preview/${adaStepId}`, {
        headers: { Authorization: `Bearer ${adaSession.token}` },
      });
      assert.equal(ownRes.status, 200);
      const ownData = await ownRes.json() as any;
      assert.equal(ownData.stepId, adaStepId);
      assert.equal(ownData.courseId, state.createdCourseId);

      // 2. Cross-course denial: Ada requests Babbage's step using Ada's course ID -> must return 404 safeNotFound
      const crossCourseRes = await fetch(`${origin}/api/author/courses/${state.createdCourseId}/preview/${babbageStep.id}`, {
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
    writeStarterStep(db, pubCourse.id);
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
    writeStarterStep(db, secondCourse.id);
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
    // Author A: Ada Lovelace (owns state.createdCourseId)
    // Author B: Charles Babbage (authorId) creates a separate course
    const babbageCourse = courseService.createCourseDraft(authorId, { title: 'Babbage Separate Course' });
    writeStarterStep(db, babbageCourse.id);
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
        structureService.updateStep(adaId, state.createdCourseId, babbageStep.id, {
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
        structureService.duplicateStep(adaId, state.createdCourseId, babbageStep.id);
      },
      NotFoundError,
      'duplicateStep must reject duplicating a step from another course'
    );

    // 3. Ada tries to delete Babbage's step through Ada's course ID -> NotFoundError
    assert.throws(
      () => {
        structureService.deleteStep(adaId, state.createdCourseId, babbageStep.id);
      },
      NotFoundError,
      'deleteStep must reject deleting a step from another course'
    );

    // 4. Ada tries to inject a step into Babbage's lesson through Ada's course ID -> NotFoundError
    assert.throws(
      () => {
        structureService.addStep(adaId, state.createdCourseId, babbageLesson.id, {
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
        structureService.updateLesson(adaId, state.createdCourseId, babbageLesson.id, 'Hijacked Lesson');
      },
      NotFoundError,
      'updateLesson must reject updating a lesson from another course'
    );

    // 6. Ada tries to delete Babbage's lesson through Ada's course ID -> NotFoundError
    assert.throws(
      () => {
        structureService.deleteLesson(adaId, state.createdCourseId, babbageLesson.id);
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

      const res = await fetch(`${origin}/api/author/courses/${state.createdCourseId}/steps/${babbageStep.id}`, {
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
}
