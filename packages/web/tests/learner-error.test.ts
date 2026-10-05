import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLearnerError, renderPythonExecutionResults } from '../src/pages/learning/PythonWorkspacePage.ts';
import type { ExecutionResult } from 'zur-shared';

test('R05: formatLearnerError extracts clean exception type and message from Python traceback', () => {
  const stderr = `Traceback (most recent call last):
  File "/work/main.py", line 3, in <module>
    for j in i:
TypeError: 'int' object is not iterable`;

  const formatted = formatLearnerError(stderr);
  assert.equal(formatted.isTraceback, true);
  assert.equal(formatted.exceptionType, 'TypeError');
  assert.equal(formatted.exceptionMessage, "'int' object is not iterable");
  assert.equal(formatted.sourceLineNumber, 3);
  assert.equal(formatted.sourceCodeSnippet, 'for j in i:');
  assert.equal(formatted.cleanSummary, "Line 3 · TypeError: 'int' object is not iterable");
  assert.equal(formatted.rawStderr, stderr.trim());
});

test('R05: formatLearnerError formats SyntaxError with line number and source snippet', () => {
  const stderr = `  File "/work/main.py", line 5
    print("hello"
          ^
SyntaxError: '(' was never closed`;

  const formatted = formatLearnerError(stderr);
  assert.equal(formatted.isTraceback, true);
  assert.equal(formatted.exceptionType, 'SyntaxError');
  assert.equal(formatted.sourceLineNumber, 5);
  assert.equal(formatted.cleanSummary, "Line 5 · SyntaxError: '(' was never closed");
  assert.ok(!formatted.cleanSummary.includes('/work/main.py'), 'Primary summary must not contain internal runner paths');
});

test('R05: formatLearnerError handles ZeroDivisionError and custom exceptions', () => {
  const stderr = `Traceback (most recent call last):
  File "/work/solution.py", line 12, in compute
    return a / b
ZeroDivisionError: division by zero`;

  const formatted = formatLearnerError(stderr);
  assert.equal(formatted.isTraceback, true);
  assert.equal(formatted.exceptionType, 'ZeroDivisionError');
  assert.equal(formatted.sourceLineNumber, 12);
  assert.equal(formatted.cleanSummary, 'Line 12 · ZeroDivisionError: division by zero');
});

test('R05: formatLearnerError strips internal paths from non-standard stderr', () => {
  const stderr = 'warning: check /work/main.py at line 10';
  const formatted = formatLearnerError(stderr);
  assert.equal(formatted.isTraceback, false);
  assert.ok(!formatted.cleanSummary.includes('/work/main.py'));
  assert.ok(formatted.cleanSummary.includes('solution.py'));
});

test('R05: renderPythonExecutionResults renders beginner error with expandable technical details', () => {
  const result: ExecutionResult = {
    jobId: 'job-err-1',
    verdict: 'RUNTIME_ERROR',
    isInfrastructureFailure: false,
    executionTimeMs: 45,
    completedAt: new Date().toISOString(),
    testResults: [
      {
        position: 0,
        passed: false,
        verdict: 'RUNTIME_ERROR',
        input: '5',
        expectedOutput: '10',
        actualOutput: '',
        stderr: `Traceback (most recent call last):
  File "/work/main.py", line 2, in <module>
    val = int(input()) / 0
ZeroDivisionError: division by zero`,
        isHidden: false,
      },
    ],
  };

  const html = renderPythonExecutionResults({ currentResult: result, resultMode: 'samples' });
  assert.ok(html.includes('Verdict: RUNTIME_ERROR'), 'Displays runtime error verdict');
  assert.ok(html.includes('Line 2 · ZeroDivisionError: division by zero'), 'Displays clean headline without runner paths');
  assert.ok(html.includes('<details class="technical-details"'), 'Includes expandable technical details');
  assert.ok(html.includes('Technical details (traceback)'), 'Accessible summary label');
  assert.ok(html.includes('ZeroDivisionError: division by zero'), 'Raw traceback preserved in technical details');
});

test('R05: renderPythonExecutionResults preserves hidden test redaction', () => {
  const result: ExecutionResult = {
    jobId: 'job-hidden-err',
    verdict: 'WRONG_ANSWER',
    isInfrastructureFailure: false,
    executionTimeMs: 50,
    completedAt: new Date().toISOString(),
    guidance: 'Your solution did not pass a hidden test. Review input limits.',
    testResults: [], // Hidden test results are redacted by backend
  };

  const html = renderPythonExecutionResults({ currentResult: result, resultMode: 'submit' });
  assert.ok(html.includes('Your solution did not pass a hidden test'), 'Preserves guidance');
  assert.ok(!html.includes('secret'), 'Never exposes secret content');
  assert.ok(!html.includes('test-card-compact'), 'No test card for redacted tests');
});

test('R05: formatLearnerError attributes learner frame when exception is raised inside standard library', () => {
  const stderr = `Traceback (most recent call last):
  File "/work/main.py", line 4, in <module>
    json.loads("invalid")
  File "/usr/lib/python3.14/json/__init__.py", line 346, in loads
    return _default_decoder.decode(s)
  File "/usr/lib/python3.14/json/decoder.py", line 337, in decode
    obj, end = self.raw_decode(s, idx=_w(s, 0).end())
json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)`;

  const formatted = formatLearnerError(stderr);
  assert.equal(formatted.isTraceback, true);
  assert.equal(formatted.exceptionType, 'JSONDecodeError');
  assert.equal(formatted.sourceLineNumber, 4, 'Must attribute to learner main.py line, not library line 337');
  assert.equal(formatted.sourceCodeSnippet, 'json.loads("invalid")');
  assert.ok(formatted.cleanSummary.includes('Line 4'));
});

test('R05: formatLearnerError sanitizes internal runner paths in exception messages', () => {
  const stderr = `Traceback (most recent call last):
  File "/work/main.py", line 2, in <module>
    open("/work/main.py")
FileNotFoundError: [Errno 2] No such file or directory: '/work/main.py'`;

  const formatted = formatLearnerError(stderr);
  assert.equal(formatted.isTraceback, true);
  assert.equal(formatted.exceptionType, 'FileNotFoundError');
  assert.ok(!formatted.exceptionMessage?.includes('/work/main.py'));
  assert.ok(formatted.exceptionMessage?.includes('solution.py'));
  assert.ok(!formatted.cleanSummary.includes('/work/main.py'));
});
test('R05: formatLearnerError excludes /usr/local/lib standard library frames from learner attribution', () => {
  const stderr = `Traceback (most recent call last):
  File "/work/main.py", line 7, in <module>
    run_custom()
  File "/usr/local/lib/python3.11/dist-packages/custom_pkg/core.py", line 42, in run_custom
    raise ValueError("bad parameter")
ValueError: bad parameter`;

  const formatted = formatLearnerError(stderr);
  assert.equal(formatted.isTraceback, true);
  assert.equal(formatted.exceptionType, 'ValueError');
  assert.equal(formatted.sourceLineNumber, 7, 'Must attribute to learner main.py line 7, not /usr/local/lib line 42');
  assert.equal(formatted.sourceCodeSnippet, 'run_custom()');
  assert.ok(formatted.cleanSummary.includes('Line 7'));
});

test('R05: formatLearnerError sanitizes nested internal paths in primary summary', () => {
  const stderr = `Traceback (most recent call last):
  File "/work/nested/solution.py", line 10, in <module>
    raise RuntimeError("failed at /work/nested/cache/data.bin")
RuntimeError: failed at /work/nested/cache/data.bin`;

  const formatted = formatLearnerError(stderr);
  assert.equal(formatted.isTraceback, true);
  assert.ok(!formatted.cleanSummary.includes('/work/nested/'));
  assert.ok(!formatted.exceptionMessage?.includes('/work/nested/'));
  assert.equal(formatted.rawStderr, stderr.trim(), 'Raw stderr preserves full details');
});
