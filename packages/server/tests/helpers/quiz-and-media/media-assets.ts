import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError, NotFoundError } from 'zur-shared';
import type { QuizMediaFixture } from './fixture.ts';

export async function mediaAssetTests(t: TestContext, f: QuizMediaFixture) {
  const { db, courseService, structureService, mediaService, quizService, authorId, studentId } = f;

  await t.test('Pinned quiz answers stay immutable and draft quiz access requires authorization', () => {
    const pinned = quizService.getStudentQuiz(studentId, 'enr-ada', 'step-3-quiz-single');
    assert.equal(pinned.prompt, 'Which of the following correctly assigns the integer 10 to variable `n` in Python?');
    assert.throws(() => quizService.getStudentQuiz(studentId, null, 'step-3-quiz-single'), NotFoundError);
    assert.throws(() => quizService.getStudentQuiz('user-student-2', 'enr-ada', 'step-3-quiz-single'), NotFoundError);
    const current = quizService.getAuthorQuiz(authorId, 'step-3-quiz-single');
    quizService.updateQuiz(authorId, 'step-3-quiz-single', current.revision, {
      ...current.quiz,
      prompt: 'Unpublished changed question',
      options: current.quiz.options.map(option => ({ ...option, isCorrect: option.id === 'opt-2' })),
    });
    assert.equal(quizService.getStudentQuiz(studentId, 'enr-ada', 'step-3-quiz-single').prompt, pinned.prompt);
    assert.equal(quizService.gradeQuiz(studentId, 'enr-ada', 'step-3-quiz-single', ['opt-1']).isPassed, true);
    assert.equal(quizService.gradeQuiz(studentId, 'enr-ada', 'step-3-quiz-single', ['opt-2']).isPassed, false);
  });

  // Create a course for Charles
  const course = courseService.createCourseDraft(authorId, {
    title: 'Computer Architecture Fundamentals',
  });
  const courseTree = structureService.getCourseTree(authorId, course.id);
  const lessonId = courseTree.modules[0].lessons[0].id;

  await t.test('T033: Media asset upload, validation (size, MIME), and dimensions', () => {
    // 1. Valid PNG upload
    // Complete 1x1 PNG; header-only files must never be marked ready.
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC', 'base64');

    const asset = mediaService.uploadAsset(authorId, course.id, {
      buffer: pngBuffer,
      filename: 'diagram.png',
      mimeType: 'image/png',
      altText: 'Block diagram of arithmetic logic unit',
      caption: 'Figure 1.1: ALU Architecture',
    });

    assert.ok(asset.id);
    assert.equal(asset.mimeType, 'image/png');
    assert.equal(asset.altText, 'Block diagram of arithmetic logic unit');
    assert.equal(asset.isDecorative, false);
    assert.equal(asset.processingStatus, 'ready');
    assert.equal(asset.dimensions?.width, 1);
    assert.equal(asset.dimensions?.height, 1);

    assert.throws(() => mediaService.uploadAsset(authorId, course.id, {
      buffer: pngBuffer.subarray(0, 33), filename: 'truncated.png', mimeType: 'image/png',
    }), ValidationError, 'Header-only PNG must fail a full decode');

    // 2. Reject SVG (PRD §11: Do not allow SVG uploads in P0)
    assert.throws(
      () => {
        mediaService.uploadAsset(authorId, course.id, {
          buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
          filename: 'image.svg',
          mimeType: 'image/svg+xml',
        });
      },
      ValidationError,
      'Must reject SVG upload'
    );

    // 3. Reject file exceeding 10 MB budget (PRD §11)
    assert.throws(
      () => {
        const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB
        mediaService.uploadAsset(authorId, course.id, {
          buffer: largeBuffer,
          filename: 'huge.png',
          mimeType: 'image/png',
        });
      },
      (err: any) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /10 MB limit/);
        return true;
      }
    );

    // 4. Reject spoofed content type / malformed bytes without fallback dimensions
    assert.throws(
      () => {
        mediaService.uploadAsset(authorId, course.id, {
          buffer: Buffer.from('Not a real PNG but claiming to be one'),
          filename: 'fake.png',
          mimeType: 'image/png',
        });
      },
      (err: any) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /Invalid image/);
        return true;
      }
    );

    // 5. Valid JPEG upload with decoded dimensions
    const jpegBuffer = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');
    const jpegAsset = mediaService.uploadAsset(authorId, course.id, {
      buffer: jpegBuffer,
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      altText: 'Sample photo',
    });
    assert.equal(jpegAsset.mimeType, 'image/jpeg');
    assert.equal(jpegAsset.dimensions?.width, 1);
    assert.equal(jpegAsset.dimensions?.height, 1);
    assert.equal(jpegAsset.processingStatus, 'ready');

    // 6. Valid WebP upload with decoded dimensions
    const webpBuffer = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAA=', 'base64');
    const webpAsset = mediaService.uploadAsset(authorId, course.id, {
      buffer: webpBuffer,
      filename: 'diagram.webp',
      mimeType: 'image/webp',
      altText: 'WebP diagram',
    });
    assert.equal(webpAsset.mimeType, 'image/webp');
    assert.equal(webpAsset.dimensions?.width, 1);
    assert.equal(webpAsset.dimensions?.height, 1);
    assert.equal(webpAsset.processingStatus, 'ready');

    // 7. Reject MIME mismatch (JPEG claiming to be PNG)
    assert.throws(
      () => {
        mediaService.uploadAsset(authorId, course.id, {
          buffer: jpegBuffer,
          filename: 'photo.png',
          mimeType: 'image/png',
        });
      },
      ValidationError,
      'Must reject MIME mismatch'
    );

    // 8. Reject decompression limit violation (> 25 megapixels)
    const giantPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x17, 0x70, // width: 6000
      0x00, 0x00, 0x13, 0x88, // height: 5000 (30 megapixels > 25 MP limit)
      0x08, 0x06, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);
    assert.throws(
      () => {
        mediaService.uploadAsset(authorId, course.id, {
          buffer: giantPngBuffer,
          filename: 'giant.png',
          mimeType: 'image/png',
        });
      },
      (err: any) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /25 megapixels/);
        return true;
      }
    );

    // 4. Update asset metadata
    const updated = mediaService.updateAssetMetadata(authorId, asset.id, {
      altText: 'Updated ALU diagram',
      caption: 'Figure 1.1 revised',
    });
    assert.equal(updated.altText, 'Updated ALU diagram');

    const privateExerciseAsset = mediaService.uploadAsset(authorId, course.id, {
      buffer: pngBuffer, filename: 'private-exercise-only.png', mimeType: 'image/png', altText: 'Private exercise fixture',
    });
    const snapshotMetadataAsset = mediaService.uploadAsset(authorId, course.id, {
      buffer: pngBuffer, filename: 'snapshot-metadata-only.png', mimeType: 'image/png', altText: 'Private snapshot metadata fixture',
    });
    const now = new Date().toISOString();
    const mediaVersionId = 'version-media-access';
    const mediaSnapshot = {
      internalMediaMetadata: `zur-asset:${snapshotMetadataAsset.id}`,
      modules: [{ lessons: [{ steps: [{
        id: 'step-media-visible',
        type: 'python',
        content: {
          markdownContent: `![diagram](zur-asset:${asset.id})`,
          referenceSolution: `print('zur-asset:${privateExerciseAsset.id}')`,
          testCases: [{ id: 'hidden-case', isHidden: true, expectedStdout: `zur-asset:${privateExerciseAsset.id}` }],
        },
      }] }] }],
    };
    db.prepare('INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at) VALUES (?, ?, 2, ?, ?)').run(mediaVersionId, course.id, JSON.stringify(mediaSnapshot), now);
    db.prepare("UPDATE courses SET visibility = 'private', publication_status = 'published', current_version_id = ? WHERE id = ?").run(mediaVersionId, course.id);
    db.prepare("INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at) VALUES ('enr-media-active', ?, ?, ?, 'active', ?, ?)").run('user-student-2', course.id, mediaVersionId, now, now);

    assert.equal(mediaService.getAssetFile(asset.id, { userId: authorId, capabilities: ['student', 'author'], isSuspended: false }).mimeType, 'image/png');
    assert.equal(mediaService.getAssetFile(asset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }).mimeType, 'image/png');
    const unreferencedAsset = mediaService.uploadAsset(authorId, course.id, { buffer: pngBuffer, filename: 'private-unused.png', mimeType: 'image/png', altText: 'Private unused image' });
    assert.throws(() => mediaService.getAssetFile(unreferencedAsset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }), NotFoundError, 'enrolled students cannot fetch unrelated private uploads');
    assert.throws(() => mediaService.getAssetFile(privateExerciseAsset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }), NotFoundError, 'hidden Python solution/test data and step metadata do not authorize student media access');
    assert.throws(() => mediaService.getAssetFile(snapshotMetadataAsset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }), NotFoundError, 'snapshot-level metadata does not authorize student media access');
    assert.throws(() => mediaService.getAssetFile(asset.id, { userId: 'user-student-1', capabilities: ['student'], isSuspended: false }), NotFoundError, 'another enrollment cannot authorize access to this course asset');
    assert.throws(() => mediaService.getAssetFile(asset.id, { userId: null, capabilities: ['student'], isSuspended: false }), NotFoundError);

    const currentAsset = mediaService.uploadAsset(authorId, course.id, { buffer: pngBuffer, filename: 'current-version.png', mimeType: 'image/png', altText: 'Current version image' });
    const currentVersionId = 'version-media-current';
    db.prepare('INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at) VALUES (?, ?, 3, ?, ?)').run(currentVersionId, course.id, JSON.stringify({ modules: [{ lessons: [{ steps: [{ content: { markdown: `![diagram](zur-asset:${currentAsset.id})` } }] }] }] }), now);
    db.prepare("UPDATE courses SET visibility = 'public', current_version_id = ? WHERE id = ?").run(currentVersionId, course.id);
    db.prepare("INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at) VALUES ('enr-media-current', 'user-student-3', ?, ?, 'active', ?, ?)").run(course.id, currentVersionId, now, now);
    assert.equal(mediaService.getAssetFile(asset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }).mimeType, 'image/png', 'existing learners use references in their pinned version after publication advances');
    assert.throws(() => mediaService.getAssetFile(asset.id, { userId: 'user-student-3', capabilities: ['student'], isSuspended: false }), NotFoundError, 'new learners cannot use an image referenced only by an older version');
    assert.equal(mediaService.getAssetFile(currentAsset.id, { userId: 'user-student-3', capabilities: ['student'], isSuspended: false }).mimeType, 'image/png');
    assert.throws(() => mediaService.getAssetFile(currentAsset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }), NotFoundError, 'existing learners cannot use an image that only exists in the latest version');
    assert.throws(() => mediaService.getAssetFile(currentAsset.id, { userId: 'user-student-1', capabilities: ['student'], isSuspended: false }), NotFoundError, 'public visibility does not expose course media to non-enrolled visitors');
    assert.throws(() => mediaService.getAssetFile(currentAsset.id, { userId: null, capabilities: ['student'], isSuspended: false }), NotFoundError, 'public visibility does not expose course media to anonymous visitors');

    const processingAsset = mediaService.uploadAsset(authorId, course.id, { buffer: pngBuffer, filename: 'processing.png', mimeType: 'image/png', altText: 'Not ready yet' });
    db.prepare("UPDATE media_assets SET processing_status='processing' WHERE id=?").run(processingAsset.id);
    assert.throws(() => mediaService.getAssetFile(processingAsset.id, { userId: authorId, capabilities: ['author'], isSuspended: false }), NotFoundError, 'course owners cannot fetch a media asset before it is ready');

    const lookalikeVersionId = 'version-media-lookalike';
    db.prepare('INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at) VALUES (?, ?, 4, ?, ?)').run(lookalikeVersionId, course.id, JSON.stringify({ modules: [{ lessons: [{ steps: [{ content: { markdown: `![diagram](zur-asset:${asset.id}abc)` } }] }] }] }), now);
    db.prepare('UPDATE enrollments SET pinned_version_id = ? WHERE id = ?').run(lookalikeVersionId, 'enr-media-current');
    assert.throws(() => mediaService.getAssetFile(asset.id, { userId: 'user-student-3', capabilities: ['student'], isSuspended: false }), NotFoundError, 'a longer lookalike media identifier does not reference the asset');

    db.prepare("UPDATE enrollments SET status = 'revoked', updated_at = ? WHERE id = 'enr-media-active'").run(now);
    assert.throws(() => mediaService.getAssetFile(asset.id, { userId: 'user-student-2', capabilities: ['student'], isSuspended: false }), NotFoundError);
  });

  return { course, lessonId };
}
