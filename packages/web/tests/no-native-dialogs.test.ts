import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { renderDialog } from '../src/components/common/Dialog.ts';

const SRC = join(import.meta.dirname, '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

test('Learner and author code never calls the browser confirm or alert dialogs', () => {
  const offenders = sourceFiles(SRC)
    .map((file) => relative(SRC, file))
    .filter((file) => !file.startsWith('pages/admin/') && !/(^|\/)admin-[^/]*\.ts$/.test(file))
    .filter((file) => /(^|[^\w.])(window\.)?(confirm|alert)\(/.test(readFileSync(join(SRC, file), 'utf8')));
  assert.deepEqual(offenders, []);
});

test('A dialog without a cancel action renders only its confirm button', () => {
  const html = renderDialog({ id: 'notice', title: 'Notice', bodyHtml: '<p>Hi</p>', confirmLabel: 'OK', hideCancel: true });
  assert.ok(!html.includes('data-dialog-action="cancel"'));
  assert.ok(html.includes('data-dialog-action="confirm"'));
  assert.ok(renderDialog({ id: 'c', title: 'T', bodyHtml: '', confirmLabel: 'OK' }).includes('data-dialog-action="cancel"'));
});
