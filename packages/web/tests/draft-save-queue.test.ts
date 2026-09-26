import assert from 'node:assert/strict';
import test from 'node:test';
import { DraftSaveQueue } from '../src/services/draft-save-queue.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

test('DraftSaveQueue flushes the latest edit after an earlier save is in flight', async () => {
  const firstSave = deferred<{ code: string; revision: number }>();
  const calls: Array<{ code: string; baseRevision: number }> = [];
  const acknowledgements: Array<{ saved: string; latest: string; revision: number }> = [];
  const queue = new DraftSaveQueue({
    revision: 4,
    delayMs: 60_000,
    save: (code, baseRevision) => {
      calls.push({ code, baseRevision });
      return calls.length === 1 ? firstSave.promise : Promise.resolve({ code, revision: baseRevision + 1 });
    },
    onAcknowledged: (saved, submittedCode, latestCode) => acknowledgements.push({ saved: submittedCode, latest: latestCode, revision: saved.revision }),
    onFailure: (error) => { throw error; },
  });

  queue.update('first edit');
  const flush = queue.flush();
  assert.deepEqual(calls, [{ code: 'first edit', baseRevision: 4 }]);
  queue.update('newer local edit');
  firstSave.resolve({ code: 'first edit', revision: 5 });
  await flush;

  assert.deepEqual(calls, [
    { code: 'first edit', baseRevision: 4 },
    { code: 'newer local edit', baseRevision: 5 },
  ]);
  assert.deepEqual(acknowledgements, [
    { saved: 'first edit', latest: 'newer local edit', revision: 5 },
    { saved: 'newer local edit', latest: 'newer local edit', revision: 6 },
  ]);
  assert.equal(queue.revision, 6);
});

test('DraftSaveQueue records failed saves and preserves the latest recovery text', async () => {
  const errors: Array<{ error: unknown; code: string }> = [];
  const queue = new DraftSaveQueue({
    revision: 2,
    delayMs: 60_000,
    save: async () => { throw Object.assign(new Error('stale'), { code: 'STALE_REVISION' }); },
    onAcknowledged: () => assert.fail('stale save must not be acknowledged'),
    onFailure: (error, latestCode) => errors.push({ error, code: latestCode }),
  });
  queue.update('preserve this latest text');
  await queue.flush();
  assert.equal((queue.lastError as any).code, 'STALE_REVISION');
  assert.equal(errors[0].code, 'preserve this latest text');
});
