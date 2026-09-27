import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { CourseService } from '../src/services/course-service.ts';
import { CourseStructureService } from '../src/services/course-structure-service.ts';
import { CourseValidationService } from '../src/services/course-validation-service.ts';
import { CoursePublicationService } from '../src/services/course-publication-service.ts';
import { CourseLifecycleService } from '../src/services/course-lifecycle-service.ts';
import {
  ValidationError,
  ConflictError,
  StaleRevisionError,
  AuthorizationError,
} from 'zur-shared';

test('Module S2-M02: Validation, Immutable Publication & Lifecycle (T040–T044)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const courseService = new CourseService(db);
  const structureService = new CourseStructureService(db);
  const validationService = new CourseValidationService(db);
  const publicationService = new CoursePublicationService(db);
  const lifecycleService = new CourseLifecycleService(db);

  const authorId = 'user-author-1'; // Charles Babbage
  const student1Id = 'user-student-1'; // Ada Lovelace
  const student2Id = 'user-student-2'; // Grace Hopper
  const adminId = 'user-admin-1'; // Margaret Hamilton (admin)

  // Create course draft
  const course = courseService.createCourseDraft(authorId, {
    title: 'Python Foundations',
  });
  const courseId = course.id;

  // Setup basic metadata
  courseService.updateCourseMetadata(authorId, courseId, 1, {
    description: 'Learn the core fundamentals of Python programming.',
    difficulty: 'beginner',
    language: 'en',
    learningOutcomes: ['Write simple scripts', 'Understand control flow'],
    estimatedDurationMinutes: 60,
  });

  courseService.updateCourseAccessSettings(authorId, courseId, {
    visibility: 'unlisted',
    enrollmentPolicy: 'open',
  });

  const tree = structureService.getCourseTree(authorId, courseId);
  const lessonId = tree.modules[0].lessons[0].id;

  // --- T040: Validate exact draft and reference solutions ---
  await t.test('T040: Validation rejects incomplete draft and detects failing reference solutions', async () => {
    // Currently only has 1 initial theory step. Add a Python exercise without reference solution
    const pyStep = structureService.addStep(authorId, courseId, lessonId, {
      title: 'Sum of Two Numbers',
      type: 'python',
      isRequired: true,
      estimatedDurationMinutes: 10,
    });

    // Content missing reference solution and tests
    db.prepare(
      `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
       VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    ).run(
      'sc-py-1',
      pyStep.id,
      JSON.stringify({
        kind: 'python',
        problemStatement: 'Read two numbers and print their sum.',
        inputFormat: 'Two space-separated integers.',
        outputFormat: 'Single integer sum.',
        constraints: '1 <= a, b <= 1000',
        starterCode: '# write solution here\n',
        referenceSolution: '', // empty!
        hints: [],
      })
    );

    const check1 = await validationService.validateCourseDraft(authorId, courseId);
    assert.equal(check1.isValid, false);
    assert.ok(
      check1.errors.some((e) => e.field === 'referenceSolution'),
      'Must flag missing reference solution'
    );
    assert.ok(
      check1.errors.some((e) => e.field === 'testCases'),
      'Must flag missing public and hidden tests'
    );

    // Now add a failing reference solution (wrong logic) with tests
    db.prepare(
      `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
       VALUES (?, ?, ?, 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    ).run(
      'sc-py-1',
      pyStep.id,
      JSON.stringify({
        kind: 'python',
        problemStatement: 'Read two numbers and print their sum.',
        inputFormat: 'Two space-separated integers.',
        outputFormat: 'Single integer sum.',
        constraints: '1 <= a, b <= 1000',
        starterCode: '# write solution\n',
        referenceSolution: 'import sys\na, b = map(int, sys.stdin.read().split())\nprint(a - b) # WRONG LOGIC\n',
        hints: ['Use the + operator.'],
      })
    );

    // Add public and hidden tests
    db.prepare(
      `INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position)
       VALUES (?, ?, '3 5\n', '8\n', 0, 0)`
    ).run('tc-pub-1', pyStep.id);

    db.prepare(
      `INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position)
       VALUES (?, ?, '10 20\n', '30\n', 1, 1)`
    ).run('tc-hid-1', pyStep.id);

    const check2 = await validationService.validateCourseDraft(authorId, courseId);
    assert.equal(check2.isValid, false);
    assert.ok(
      check2.errors.some((e) => e.message.includes('Reference solution failed test case')),
      'Must detect failing reference solution against test cases'
    );

    // Now fix reference solution to be correct
    db.prepare(
      `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
       VALUES (?, ?, ?, 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    ).run(
      'sc-py-1',
      pyStep.id,
      JSON.stringify({
        kind: 'python',
        problemStatement: 'Read two numbers and print their sum.',
        inputFormat: 'Two space-separated integers.',
        outputFormat: 'Single integer sum.',
        constraints: '1 <= a, b <= 1000',
        starterCode: '# write solution\n',
        referenceSolution: 'import sys\na, b = map(int, sys.stdin.read().split())\nprint(a + b)\n',
        hints: ['Use the + operator.'],
      })
    );

    // Add a quiz step with correct answer key
    const quizStep = structureService.addStep(authorId, courseId, lessonId, {
      title: 'Python Types Quiz',
      type: 'quiz',
      isRequired: true,
      estimatedDurationMinutes: 5,
    });

    db.prepare(
      `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
       VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    ).run(
      'sc-quiz-1',
      quizStep.id,
      JSON.stringify({
        kind: 'quiz',
        quizType: 'single_choice',
        prompt: 'Which data type is used for text in Python?',
        options: [
          { id: 'opt-1', text: 'str', isCorrect: true },
          { id: 'opt-2', text: 'int', isCorrect: false },
          { id: 'opt-3', text: 'float', isCorrect: false },
        ],
        explanation: 'Strings in Python are represented by the str type.',
      })
    );

    const check3 = await validationService.validateCourseDraft(authorId, courseId);
    assert.equal(check3.isValid, true, 'Valid course draft must have isValid: true');
    assert.equal(check3.errors.length, 0);
  });

  let publishedVersionId = '';
  let publishedRevision = 0;

  // --- T041: Build review and publication transaction (P27) ---
  await t.test('T041: Atomic publication creates immutable version and updates latest pointer', async () => {
    const currentCourse = courseService.getCourse(authorId, courseId);
    publishedRevision = currentCourse.draftRevision;

    // 1. Stale revision rejection
    await assert.rejects(
      async () => {
        await publicationService.publishCourse(authorId, courseId, {
          expectedRevision: publishedRevision - 1, // Stale!
        });
      },
      StaleRevisionError,
      'Must reject stale revision'
    );

    // 2. Successful publication
    const receipt = await publicationService.publishCourse(authorId, courseId, {
      expectedRevision: publishedRevision,
      changeSummary: 'Initial release with Python and Quiz',
      idempotencyKey: 'idemp-12345',
    });

    assert.equal(receipt.versionNumber, 1);
    assert.ok(receipt.versionId);
    assert.equal(receipt.studentCountPinnedToOldVersions, 0);
    publishedVersionId = receipt.versionId;

    // Check course state updated
    const updatedCourse = courseService.getCourse(authorId, courseId);
    assert.equal(updatedCourse.publicationStatus, 'published');
    assert.equal(updatedCourse.currentVersionId, receipt.versionId);
    assert.equal(updatedCourse.draftRevision, publishedRevision + 1);

    // Check course_versions record contains full JSON snapshot
    const versionRow = db
      .prepare('SELECT * FROM course_versions WHERE id = ?')
      .get(receipt.versionId) as any;
    assert.ok(versionRow);
    const snapshot = JSON.parse(versionRow.snapshot_data);
    assert.equal(snapshot.versionNumber, 1);
    assert.equal(snapshot.modules.length, 1);
    assert.equal(snapshot.modules[0].lessons[0].steps.length, 3); // initial theory + pyStep + quizStep

    // 3. Idempotency test: duplicate call with idempotencyKey returns cached receipt
    const duplicateReceipt = await publicationService.publishCourse(authorId, courseId, {
      expectedRevision: publishedRevision,
      changeSummary: 'Initial release with Python and Quiz',
      idempotencyKey: 'idemp-12345',
    });
    assert.equal(duplicateReceipt.versionId, receipt.versionId);
  });

  // --- T042: Pin enrollments and preserve old releases ---
  await t.test('T042: Pins student enrollment to version at join time and preserves immutable content', async () => {
    // Student 1 enrolls in published Version 1
    const enrollment1 = courseService.enrollStudent(student1Id, courseId);
    assert.equal(enrollment1.pinnedVersionId, publishedVersionId);
    assert.equal(enrollment1.status, 'active');

    // Retrieve enrolled step content from pinned snapshot
    const tree = structureService.getCourseTree(authorId, courseId);
    const pyStepId = tree.modules[0].lessons[0].steps.find((s) => s.type === 'python')!.id;

    const stepContentForStudent = courseService.getEnrolledStepContent(student1Id, enrollment1.id, pyStepId);
    assert.equal(stepContentForStudent.pinnedVersionNumber, 1);
    assert.equal(stepContentForStudent.step.id, pyStepId);
    assert.equal(stepContentForStudent.content.referenceSolution, undefined, 'Must redact private reference solution');
    assert.ok(stepContentForStudent.content.testCases.every((tc: any) => !tc.isHidden), 'Must hide hidden tests');

    // Author now modifies the draft: adds a new module and publishes Version 2
    const mod2 = structureService.addModule(authorId, courseId, 'Module 2: Advanced Topics');
    const lesson2 = structureService.addLesson(authorId, courseId, mod2.id, 'Lesson 2.1: Data Structures');
    const stepTheory2 = structureService.addStep(authorId, courseId, lesson2.id, {
      title: 'Lists and Dictionaries',
      type: 'theory',
      isRequired: true,
      estimatedDurationMinutes: 15,
    });
    db.prepare(
      `INSERT OR REPLACE INTO step_contents (id, step_id, content_payload, revision, updated_at)
       VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    ).run('sc-th-2', stepTheory2.id, JSON.stringify({ kind: 'theory', markdown: '# Advanced Topics\nLists and dicts.' }));

    const courseBeforeV2 = courseService.getCourse(authorId, courseId);
    const receiptV2 = await publicationService.publishCourse(authorId, courseId, {
      expectedRevision: courseBeforeV2.draftRevision,
      changeSummary: 'Version 2 with Advanced Topics module',
    });

    assert.equal(receiptV2.versionNumber, 2);
    assert.equal(receiptV2.studentCountPinnedToOldVersions, 1, 'Student 1 is pinned to Version 1');

    // Student 2 enrolls now: should be pinned to Version 2!
    const enrollment2 = courseService.enrollStudent(student2Id, courseId);
    assert.equal(enrollment2.pinnedVersionId, receiptV2.versionId);

    // Verify roster exposes student's pinned_version_number
    const roster = courseService.getCourseRoster(authorId, courseId);
    const student1Row = roster.find((r) => r.userId === student1Id);
    const student2Row = roster.find((r) => r.userId === student2Id);

    assert.equal(student1Row?.pinnedVersionNumber, 1, 'Student 1 roster entry must show Version 1');
    assert.equal(student2Row?.pinnedVersionNumber, 2, 'Student 2 roster entry must show Version 2');

    // Verify Foreign Key ON DELETE RESTRICT: Attempting to delete course_version referenced by enrollment fails
    assert.throws(
      () => {
        db.prepare('DELETE FROM course_versions WHERE id = ?').run(publishedVersionId);
      },
      /FOREIGN KEY constraint failed/i,
      'Foreign key constraint must prevent deleting course version referenced by enrollments'
    );
  });

  // --- T043: Implement archive, restore, delete-draft, and suspension ---
  await t.test('T043: Course archive, restore, delete-draft restrictions, and admin suspension', async () => {
    // 1. Delete draft rejected for published course
    assert.throws(
      () => {
        lifecycleService.deleteCourseDraft(authorId, courseId);
      },
      ConflictError,
      'Must reject deletion of course that has published versions'
    );

    // 2. Archive course
    const archived = lifecycleService.archiveCourse(authorId, courseId);
    assert.equal(archived.publicationStatus, 'archived');

    // Enrolled student continues to have access in archive
    const enrollments = db.prepare('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?').all(student1Id, courseId) as any[];
    const pyStepId = structureService.getCourseTree(authorId, courseId).modules[0].lessons[0].steps[0].id;
    const content = courseService.getEnrolledStepContent(student1Id, enrollments[0].id, pyStepId);
    assert.ok(content);

    // New enrollment blocked on archived course
    const student3Id = 'user-student-3'; // Alan Turing (seeded student)

    assert.throws(
      () => {
        courseService.enrollStudent(student3Id, courseId);
      },
      ValidationError,
      'Must block new enrollments on archived course'
    );

    // 3. Restore course
    const restored = lifecycleService.restoreCourse(authorId, courseId);
    assert.equal(restored.publicationStatus, 'published');

    // 4. Admin suspension
    // Non-admin cannot suspend
    assert.throws(
      () => {
        lifecycleService.setCourseSuspension(authorId, courseId, true, 'Terms violation');
      },
      AuthorizationError,
      'Non-admin cannot suspend course'
    );

    // Admin suspends course
    const suspended = lifecycleService.setCourseSuspension(adminId, courseId, true, 'Terms violation');
    assert.equal(suspended.isSuspended, true);

    // Student access blocked immediately when suspended
    assert.throws(
      () => {
        courseService.getEnrolledStepContent(student1Id, enrollments[0].id, pyStepId);
      },
      AuthorizationError,
      'Must block learning access immediately when course is suspended'
    );

    // Admin unsuspends course
    const unsuspended = lifecycleService.setCourseSuspension(adminId, courseId, false);
    assert.equal(unsuspended.isSuspended, false);

    // 5. Delete draft is permitted for brand new unpublished draft
    const freshDraft = courseService.createCourseDraft(authorId, {
      title: 'Draft Never Published',
    });
    const deleteResult = lifecycleService.deleteCourseDraft(authorId, freshDraft.id);
    assert.equal(deleteResult.success, true);
    assert.throws(
      () => {
        courseService.getCourse(authorId, freshDraft.id);
      },
      /This page isn't available/
    );
  });

  // --- T044: Implement visibility and enrollment policy ---
  await t.test('T044: Visibility catalog filtering and invariant enforcement', async () => {
    // 1. Invariant: Private visibility MUST have invitation_only policy
    assert.throws(
      () => {
        lifecycleService.setCourseAccessPolicy(authorId, courseId, {
          visibility: 'private',
          enrollmentPolicy: 'open',
        });
      },
      ValidationError,
      'Must reject private visibility with open enrollment policy'
    );

    // 2. Set course to public and open enrollment
    lifecycleService.setCourseAccessPolicy(authorId, courseId, {
      visibility: 'public',
      enrollmentPolicy: 'open',
    });

    const catalog = courseService.listPublicCatalog();
    assert.ok(catalog.courses.some((c) => c.id === courseId), 'Public course must be listed in catalog');

    // 3. Set course to unlisted
    lifecycleService.setCourseAccessPolicy(authorId, courseId, {
      visibility: 'unlisted',
      enrollmentPolicy: 'open',
    });

    const catalogAfterUnlist = courseService.listPublicCatalog();
    assert.ok(
      !catalogAfterUnlist.courses.some((c) => c.id === courseId),
      'Unlisted course must NOT be listed in public catalog'
    );

    // 4. Set course to private
    lifecycleService.setCourseAccessPolicy(authorId, courseId, {
      visibility: 'private',
      enrollmentPolicy: 'invitation_only',
    });

    const catalogAfterPrivate = courseService.listPublicCatalog();
    assert.ok(
      !catalogAfterPrivate.courses.some((c) => c.id === courseId),
      'Private course must NOT be listed in public catalog'
    );

    // Existing student enrollments are preserved when visibility changes
    const roster = courseService.getCourseRoster(authorId, courseId);
    assert.equal(roster.length, 2, 'Existing student enrollments must remain intact after policy change');
  });
});
