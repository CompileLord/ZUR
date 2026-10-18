import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertMarkdownBlock } from '../src/pages/author/TheoryEditorPage.ts';

test('block insert adds blank lines around the block', () => {
  const v = 'Intro line\nNext';
  const r = insertMarkdownBlock(v, 10, 10, '| A | B |');
  assert.equal(r.next, 'Intro line\n\n| A | B |\n\nNext');
});

test('block insert after paragraph without newline', () => {
  const r = insertMarkdownBlock('Para', 4, 4, 'X');
  assert.equal(r.next, 'Para\n\nX\n');
  assert.equal(r.next.slice(r.caretStart, r.caretEnd), 'X');
});

test('block insert in empty doc and between existing blank lines', () => {
  assert.equal(insertMarkdownBlock('', 0, 0, 'X').next, 'X\n');
  assert.equal(insertMarkdownBlock('A\n\nB', 3, 3, 'X').next, 'A\n\nX\n\nB');
});
