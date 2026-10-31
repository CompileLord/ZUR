import test from 'node:test';
import { setupQuizMediaFixture } from './helpers/quiz-and-media/fixture.ts';
import { mediaAssetTests } from './helpers/quiz-and-media/media-assets.ts';
import { quizAndExerciseTests } from './helpers/quiz-and-media/quizzes-and-exercises.ts';

test('Media Assets, Quizzes & Python Exercises (T033, T036, T037, T039)', async (t) => {
  const f = await setupQuizMediaFixture(t);
  const shared = await mediaAssetTests(t, f);
  await quizAndExerciseTests(t, f, shared);
});
