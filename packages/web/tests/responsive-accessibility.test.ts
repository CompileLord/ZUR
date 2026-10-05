import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderPythonWorkspacePage } from '../src/pages/learning/PythonWorkspacePage.ts';

const root = process.cwd();

test('compact Python widths retain editing and execution controls', () => {
  const html = renderPythonWorkspacePage({
    courseTitle:'Python foundations', courseOverviewUrl:'/learn/one', lessonTitle:'Conditions',
    stepTitle:'Classify a number', stepOrdinalText:'Lesson 2 · Step 1 of 3', enrollmentId:'one', stepId:'two',
    problemStatement:'Classify an integer.', inputFormat:'One integer.', outputFormat:'One word.', constraints:'n is an integer.',
    starterCode:'n = int(input())', currentCode:'n = int(input())', saveStatus:'unsaved',
  });
  assert.doesNotMatch(html,/Open this exercise on a computer/);
  assert.match(html,/Run code/);
  assert.doesNotMatch(html, /readonly/);
  assert.match(html,/python-execution-actions/);
  assert.doesNotMatch(html,/Run and Submit are available on a computer/);
  assert.match(html,/aria-label="Python Code Editor"/);
  assert.match(html,/aria-label="Execution Results"/);
  const cssPath = new URL('../src/styles/shells.css', import.meta.url);
  const css = readFileSync(cssPath, 'utf8');
  assert.doesNotMatch(css,/python-execution-actions \{ display: none/);
  assert.match(css,/@media \(max-width: 767px\)[\s\S]*?learning-task-footer[\s\S]*?flex-wrap: wrap/);
  assert.match(css,/@media \(max-width: 767px\)[\s\S]*?admin-nav-list \{ display: grid; grid-template-columns: repeat\(2/);
});
