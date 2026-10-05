import assert from 'node:assert/strict';
import test from 'node:test';
import { AppearanceSaveQueue } from '../src/services/appearance-save-queue.ts';
import type { UserPreferences } from 'zur-shared';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test('AppearanceSaveQueue serializes writes and never sends concurrent save requests', async () => {
  const firstSave = deferred<UserPreferences>();
  const calls: Array<Partial<UserPreferences>> = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const queue = new AppearanceSaveQueue({
    delayMs: 10,
    save: async (prefs) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      calls.push(prefs);
      try {
        if (calls.length === 1) {
          return await firstSave.promise;
        }
        return {
          userId: 'u1',
          theme: prefs.theme || 'system',
          editorFontSize: prefs.editorFontSize || 14,
          indentationSpaces: prefs.indentationSpaces || 4,
          updatedAt: new Date().toISOString(),
        };
      } finally {
        inFlight--;
      }
    },
  });

  // Edit 1: change to dark
  queue.update({ theme: 'dark', editorFontSize: 14, indentationSpaces: 4 });
  // Flush edit 1 so save is in flight
  const flush1 = queue.flush();

  // Rapid edits while edit 1 is still in flight
  queue.update({ theme: 'light', editorFontSize: 16, indentationSpaces: 4 });
  queue.update({ theme: 'system', editorFontSize: 18, indentationSpaces: 2 });

  // Verify only 1 call dispatched so far
  assert.equal(calls.length, 1);
  assert.equal(calls[0].theme, 'dark');

  // Resolve first save
  firstSave.resolve({
    userId: 'u1',
    theme: 'dark',
    editorFontSize: 14,
    indentationSpaces: 4,
    updatedAt: new Date().toISOString(),
  });

  await flush1;

  // After first save finished, the queued edits coalesced into exactly one trailing save with the latest preferences
  assert.equal(calls.length, 2);
  assert.equal(calls[1].theme, 'system');
  assert.equal(calls[1].editorFontSize, 18);
  assert.equal(calls[1].indentationSpaces, 2);
  assert.equal(maxInFlight, 1, 'Max concurrent network writes must never exceed 1');
});

test('AppearanceSaveQueue flush on leaving settings persists pending debounced changes immediately', async () => {
  const calls: Array<Partial<UserPreferences>> = [];
  const queue = new AppearanceSaveQueue({
    delayMs: 60_000, // Large debounce to prove flush cancels debounce
    save: async (prefs) => {
      calls.push(prefs);
      return {
        userId: 'u1',
        theme: prefs.theme || 'system',
        editorFontSize: prefs.editorFontSize || 14,
        indentationSpaces: prefs.indentationSpaces || 4,
        updatedAt: new Date().toISOString(),
      };
    },
  });

  queue.update({ theme: 'dark', editorFontSize: 16, indentationSpaces: 2 });
  assert.equal(calls.length, 0, 'No call before flush or debounce');
  assert.equal(queue.isPending, true);

  // User leaves settings page: flush is triggered immediately
  await queue.flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].theme, 'dark');
  assert.equal(calls[0].editorFontSize, 16);
  assert.equal(queue.isPending, false);
});

test('AppearanceSaveQueue retains failed changes as retryable so subsequent flush() re-attempts save without edits', async () => {
  let shouldFail = true;
  const errors: unknown[] = [];
  const successes: Array<{ saved: UserPreferences; isLatest: boolean }> = [];
  const calls: Array<Partial<UserPreferences>> = [];

  const queue = new AppearanceSaveQueue({
    delayMs: 10,
    save: async (prefs) => {
      calls.push(prefs);
      if (shouldFail) {
        throw new Error('Database temporarily unavailable');
      }
      return {
        userId: 'u1',
        theme: prefs.theme || 'system',
        editorFontSize: prefs.editorFontSize || 14,
        indentationSpaces: prefs.indentationSpaces || 4,
        updatedAt: new Date().toISOString(),
      };
    },
    onError: (err) => errors.push(err),
    onSuccess: (saved, isLatest) => successes.push({ saved, isLatest }),
  });

  queue.update({ theme: 'dark', editorFontSize: 16, indentationSpaces: 2 });
  await queue.flush();

  // First attempt failed
  assert.equal(calls.length, 1);
  assert.equal(errors.length, 1);
  assert.equal(queue.hasUnsavedChanges, true);
  assert.equal(queue.isPending, true);
  assert.equal(queue.lastError?.message, 'Database temporarily unavailable');
  assert.equal(successes.length, 0);

  // Now, without calling queue.update(), simulate user clicking "Save preferences" (form submit calling flush())
  shouldFail = false;
  await queue.flush();

  // Retry was executed with the retained preferences
  assert.equal(calls.length, 2, 'Second save call must occur on retry');
  assert.equal(calls[1].theme, 'dark');
  assert.equal(calls[1].editorFontSize, 16);
  assert.equal(calls[1].indentationSpaces, 2);
  assert.equal(queue.hasUnsavedChanges, false, 'Unsaved changes must clear on success');
  assert.equal(queue.lastError, null, 'Last error must clear on success');
  assert.equal(successes.length, 1);
  assert.equal(successes[0].saved.theme, 'dark');
  assert.equal(successes[0].isLatest, true);
});

test('AppearanceSaveQueue does not enter uncontrolled loops on persistent error', async () => {
  let callCount = 0;
  const errors: unknown[] = [];

  const queue = new AppearanceSaveQueue({
    delayMs: 10,
    save: async () => {
      callCount++;
      throw new Error('Persistent failure');
    },
    onError: (err) => errors.push(err),
  });

  queue.update({ theme: 'light' });
  await queue.flush();

  // Should fail once and not spin
  assert.equal(callCount, 1);
  assert.equal(errors.length, 1);
  assert.equal(queue.hasUnsavedChanges, true);

  // Small delay to ensure no background timer or runaway while-loop is running
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(callCount, 1, 'Must not make further calls without explicit user action or update');

  // Explicit user retry triggers exactly one more attempt
  await queue.flush();
  assert.equal(callCount, 2);
  assert.equal(errors.length, 2);
});

test('AppearanceSaveQueue concurrent flush during failed active save does not trigger repeated retries', async () => {
  const activeSave = deferred<UserPreferences>();
  let saveCalls = 0;
  const errors: unknown[] = [];

  const queue = new AppearanceSaveQueue({
    delayMs: 60_000,
    save: async () => {
      saveCalls++;
      return await activeSave.promise;
    },
    onError: (err) => errors.push(err),
  });

  queue.update({ theme: 'dark' });

  // Start first flush (save is now in flight)
  const flush1 = queue.flush();
  assert.equal(saveCalls, 1);

  // Second caller joins active flush while save is in flight
  const flush2 = queue.flush();
  assert.equal(saveCalls, 1, 'Second flush must join active save, not initiate new call');

  // Active save fails
  activeSave.reject(new Error('Network error in-flight'));

  const [res1, res2] = await Promise.all([flush1, flush2]);

  assert.equal(res1, false, 'Flush 1 must report false on failure');
  assert.equal(res2, false, 'Flush 2 must report false on failure');
  assert.equal(saveCalls, 1, 'Must NOT trigger repeated retries when a second flush joined active');
  assert.equal(queue.hasUnsavedChanges, true, 'Unsaved changes must be preserved');
  assert.equal(errors.length, 1);
});

