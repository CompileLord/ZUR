import test from 'node:test';
import assert from 'node:assert';
import { compareOutput, normalizeOutput } from '../src/comparator.ts';

test('PRD §12.2 Output Comparator rules', async (t) => {
  await t.test('Normalizes CRLF and CR to LF', () => {
    assert.strictEqual(normalizeOutput('a\r\nb\rc'), 'a\nb\nc');
  });

  await t.test('Removes trailing ASCII spaces and tabs from lines', () => {
    assert.strictEqual(normalizeOutput('hello   \nworld\t\t'), 'hello\nworld');
  });

  await t.test('Removes empty lines at the end of the output', () => {
    assert.strictEqual(normalizeOutput('output\n\n\n'), 'output');
    assert.strictEqual(normalizeOutput('line1\n\nline2\n\n'), 'line1\n\nline2');
  });

  await t.test('5 and 5\\n match', () => {
    const res = compareOutput('5\n', '5');
    assert.strictEqual(res.passed, true);
  });

  await t.test('Hello and hello do NOT match (case sensitivity)', () => {
    const res = compareOutput('Hello', 'hello');
    assert.strictEqual(res.passed, false);
  });

  await t.test('1  2 and 1 2 do NOT match (internal spacing sensitivity)', () => {
    const res = compareOutput('1  2', '1 2');
    assert.strictEqual(res.passed, false);
  });

  await t.test('Leading whitespace is preserved', () => {
    const res = compareOutput('  leading', 'leading');
    assert.strictEqual(res.passed, false);
  });
});
