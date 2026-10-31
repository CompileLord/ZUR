import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore -- plain ESM tool outside the package
import { MAX_BYTES, isChecked, findViolations, findStaleBaseline } from '../../../tools/check-file-size.mjs';

test('code files over 20 KiB are rejected unless they are legacy files that did not grow', () => {
  assert.equal(MAX_BYTES, 20 * 1024);
  const big = MAX_BYTES + 1;
  assert.equal(findViolations([{ path: 'packages/web/src/new.ts', bytes: big }], {}).length, 1);
  assert.equal(findViolations([{ path: 'packages/web/src/ok.ts', bytes: MAX_BYTES }], {}).length, 0);
  assert.equal(findViolations([{ path: 'packages/web/src/legacy.ts', bytes: big }], { 'packages/web/src/legacy.ts': big }).length, 0);
  assert.match(findViolations([{ path: 'packages/web/src/legacy.ts', bytes: big + 1 }], { 'packages/web/src/legacy.ts': big })[0], /may only shrink/);
});

test('only code outside docs/screenshots is checked', () => {
  assert.equal(isChecked('packages/web/src/styles/components.css'), true);
  assert.equal(isChecked('docs/audits/report.html'), false);
  assert.equal(isChecked('package-lock.json'), false);
});

test('baseline entries for files that were split must be removed', () => {
  const baseline = { 'a.ts': 30_000, 'b.ts': 30_000 };
  const stale = findStaleBaseline([{ path: 'a.ts', bytes: 30_000 }, { path: 'b.ts', bytes: 1_000 }], baseline);
  assert.deepEqual(stale.map((s: string) => s.split(':')[0]), ['b.ts']);
});
