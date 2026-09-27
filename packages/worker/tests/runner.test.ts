import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPythonIsolated } from '../src/runner.ts';
import { processExecutionJob } from '../src/worker.ts';
import type { TestCase } from 'zur-shared';

test('Isolated Execution Worker (T020, AC-14)', async (t) => {
  await t.test('Executes simple Python code and captures stdout', async () => {
    const outcome = await runPythonIsolated('print("Hello from ZUR")');
    assert.strictEqual(outcome.verdict, 'PASSED');
    assert.strictEqual(outcome.stdout.trim(), 'Hello from ZUR');
    assert.strictEqual(outcome.exitCode, 0);
  });

  await t.test('Reads standard input correctly', async () => {
    const code = `
import sys
name = sys.stdin.read().strip()
print(f"Welcome, {name}!")
`;
    const outcome = await runPythonIsolated(code, 'Margaret');
    assert.strictEqual(outcome.verdict, 'PASSED');
    assert.strictEqual(outcome.stdout.trim(), 'Welcome, Margaret!');
  });

  await t.test('Detects SyntaxError and IndentationError as SYNTAX_ERROR', async () => {
    const syntaxErrCode = 'def invalid_syntax(:';
    const outcome = await runPythonIsolated(syntaxErrCode);
    assert.strictEqual(outcome.verdict, 'SYNTAX_ERROR');
    assert.notStrictEqual(outcome.exitCode, 0);
    assert.ok(outcome.stderr.includes('SyntaxError'));

    const indentErrCode = 'def foo():\nprint("no indent")';
    const indentOutcome = await runPythonIsolated(indentErrCode);
    assert.strictEqual(indentOutcome.verdict, 'SYNTAX_ERROR');
    assert.ok(indentOutcome.stderr.includes('IndentationError'));
  });

  await t.test('Detects unhandled exceptions as RUNTIME_ERROR', async () => {
    const runtimeErrCode = 'x = 1 / 0';
    const outcome = await runPythonIsolated(runtimeErrCode);
    assert.strictEqual(outcome.verdict, 'RUNTIME_ERROR');
    assert.notStrictEqual(outcome.exitCode, 0);
    assert.ok(outcome.stderr.includes('ZeroDivisionError'));
  });

  await t.test('Enforces wall-clock timeout and sets TIME_LIMIT', async () => {
    const infiniteLoop = 'while True: pass';
    const outcome = await runPythonIsolated(infiniteLoop, '', { wallTimeoutSeconds: 1 });
    assert.strictEqual(outcome.verdict, 'TIME_LIMIT');
    assert.ok(outcome.errorMessage?.includes('timed out'));
  });

  await t.test('Enforces output limits and sets OUTPUT_LIMIT (64 KiB bound)', async () => {
    // Generate output that exceeds budget
    const floodCode = `
while True:
    print("A" * 1000)
`;
    const outcome = await runPythonIsolated(floodCode, '', { maxOutputBytes: 4096, wallTimeoutSeconds: 2 });
    assert.strictEqual(outcome.verdict, 'OUTPUT_LIMIT');
  });

  await t.test('Strips parent process secrets from Python environment', async () => {
    process.env.ZUR_TEST_SECRET_KEY = 'super_secret_db_password_123';
    const checkEnvCode = `
import os
val = os.environ.get("ZUR_TEST_SECRET_KEY", "NOT_FOUND")
print(val)
`;
    const outcome = await runPythonIsolated(checkEnvCode);
    assert.strictEqual(outcome.verdict, 'PASSED');
    assert.strictEqual(outcome.stdout.trim(), 'NOT_FOUND');
    delete process.env.ZUR_TEST_SECRET_KEY;
  });

  await t.test('Cleans up temporary sandbox directory after execution', async () => {
    const before = new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('zur-sandbox-')));
    const outcome = await runPythonIsolated('import os; print(os.getcwd())');
    assert.strictEqual(outcome.stdout.trim(), '/work');
    const after = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('zur-sandbox-'));
    assert.deepStrictEqual(after.filter((name) => !before.has(name)), []);
  });

  await t.test('Denies host files, child processes, and inherited secrets', async () => {
    const code = `import os, subprocess
print(os.path.exists(${JSON.stringify(path.join(process.cwd(), 'tasks.json'))}))
print(os.environ.get('ZUR_TEST_SECRET_KEY', 'absent'))
try:
 subprocess.run(['python3', '-c', 'print(1)'])
except OSError:
 print('child denied')`;
    process.env.ZUR_TEST_SECRET_KEY = 'secret';
    const outcome = await runPythonIsolated(code);
    delete process.env.ZUR_TEST_SECRET_KEY;
    assert.strictEqual(outcome.verdict, 'PASSED');
    assert.deepStrictEqual(outcome.stdout.trim().split('\n'), ['False', 'absent', 'child denied']);
  });

  await t.test('Denies outbound network access', async () => {
    const outcome = await runPythonIsolated(`import socket
s = socket.socket()
try:
 s.connect(('1.1.1.1', 53))
 print('connected')
except OSError:
 print('denied')`);
    assert.strictEqual(outcome.verdict, 'PASSED');
    assert.strictEqual(outcome.stdout.trim(), 'denied');
  });
});

test('Process Execution Jobs (T022, T023)', async (t) => {
  const dummyTestCases: TestCase[] = [
    {
      id: 'tc-1',
      stepId: 'step-1',
      stdin: '2',
      expectedStdout: 'Even',
      isHidden: false,
      position: 0,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'tc-2',
      stepId: 'step-1',
      stdin: '3',
      expectedStdout: 'Odd',
      isHidden: true,
      position: 1,
      createdAt: new Date().toISOString(),
    },
  ];

  await t.test('run_samples runs only public test cases', async () => {
    const code = `
import sys
n = int(sys.stdin.read().strip())
print("Even" if n % 2 == 0 else "Odd")
`;
    const result = await processExecutionJob({
      jobId: 'job-1',
      userId: 'user-1',
      stepId: 'step-1',
      jobType: 'run_samples',
      code,
      testCases: dummyTestCases,
    });

    assert.strictEqual(result.verdict, 'PASSED');
    assert.strictEqual(result.testResults.length, 1);
    assert.strictEqual(result.testResults[0].isHidden, false);
  });

  await t.test('submit runs all tests sequentially and stops on first failure', async () => {
    const buggyCode = `
import sys
n = int(sys.stdin.read().strip())
# Passes 2 (Even), but fails 3 (prints Even instead of Odd)
print("Even")
`;
    const result = await processExecutionJob({
      jobId: 'job-2',
      userId: 'user-1',
      stepId: 'step-1',
      jobType: 'submit',
      code: buggyCode,
      testCases: dummyTestCases,
    });

    assert.strictEqual(result.verdict, 'WRONG_ANSWER');
    assert.strictEqual(result.testResults.length, 2);
    assert.strictEqual(result.testResults[0].passed, true);
    assert.strictEqual(result.testResults[1].passed, false);
  });
});
