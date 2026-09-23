import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { TerminalVerdict } from 'zur-shared';
import { EXECUTION_BUDGETS } from 'zur-shared';

export interface RunOptions {
  cpuTimeoutSeconds?: number;
  wallTimeoutSeconds?: number;
  memoryLimitMib?: number;
  maxOutputBytes?: number;
}

export interface RunOutcome {
  verdict: TerminalVerdict;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
  errorMessage?: string;
}

export async function runPythonIsolated(
  code: string,
  stdin: string = '',
  options: RunOptions = {}
): Promise<RunOutcome> {
  const wallTimeoutSeconds = options.wallTimeoutSeconds || EXECUTION_BUDGETS.DEFAULT_WALL_TIMEOUT_SECONDS;
  const maxOutputBytes = options.maxOutputBytes || EXECUTION_BUDGETS.MAX_CAPTURED_OUTPUT_BYTES;

  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-sandbox-'));
  const scriptPath = path.join(sandboxDir, 'main.py');

  try {
    fs.writeFileSync(scriptPath, code, 'utf-8');

    const isWindows = process.platform === 'win32';
    const cleanEnv: NodeJS.ProcessEnv = {
      TEMP: sandboxDir,
      TMP: sandboxDir,
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    };

    if (isWindows) {
      cleanEnv.SYSTEMROOT = process.env.SYSTEMROOT || 'C:\\Windows';
      cleanEnv.PATH = process.env.PATH || '';
      cleanEnv.PATHEXT = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD';
    } else {
      cleanEnv.PATH = process.env.PATH || '/usr/local/bin:/usr/bin:/bin';
    }

    const startTime = performance.now();

    return await new Promise<RunOutcome>((resolve) => {
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let stdoutChunks: Buffer[] = [];
      let stderrChunks: Buffer[] = [];
      let killedByOutputLimit = false;
      let killedByTimeout = false;

      const child = spawn(
        'python',
        ['-I', '-s', '-B', '-E', 'main.py'],
        {
          cwd: sandboxDir,
          env: cleanEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        }
      );

      const timeoutTimer = setTimeout(() => {
        killedByTimeout = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // Process may have already exited
        }
      }, wallTimeoutSeconds * 1000);

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes + stderrBytes > maxOutputBytes) {
          killedByOutputLimit = true;
          try {
            child.kill('SIGKILL');
          } catch {
            // Process may have already exited
          }
        } else {
          stdoutChunks.push(chunk);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.length;
        if (stdoutBytes + stderrBytes > maxOutputBytes) {
          killedByOutputLimit = true;
          try {
            child.kill('SIGKILL');
          } catch {
            // Process may have already exited
          }
        } else {
          stderrChunks.push(chunk);
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeoutTimer);
        const executionTimeMs = Math.round(performance.now() - startTime);
        resolve({
          verdict: 'INTERNAL_ERROR',
          stdout: '',
          stderr: err.message,
          exitCode: -1,
          executionTimeMs,
          errorMessage: err.message,
        });
      });

      child.on('close', (code, signal) => {
        clearTimeout(timeoutTimer);
        const executionTimeMs = Math.round(performance.now() - startTime);

        const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');

        if (killedByOutputLimit) {
          return resolve({
            verdict: 'OUTPUT_LIMIT',
            stdout,
            stderr,
            exitCode: code,
            executionTimeMs,
            errorMessage: 'Output limit exceeded (64 KiB maximum)',
          });
        }

        if (killedByTimeout || signal === 'SIGKILL' && !code) {
          return resolve({
            verdict: 'TIME_LIMIT',
            stdout,
            stderr,
            exitCode: code,
            executionTimeMs,
            errorMessage: `Execution timed out after ${wallTimeoutSeconds} seconds`,
          });
        }

        if (code !== 0) {
          if (stderr.includes('SyntaxError:') || stderr.includes('IndentationError:')) {
            return resolve({
              verdict: 'SYNTAX_ERROR',
              stdout,
              stderr,
              exitCode: code,
              executionTimeMs,
            });
          }

          if (stderr.includes('MemoryError')) {
            return resolve({
              verdict: 'MEMORY_LIMIT',
              stdout,
              stderr,
              exitCode: code,
              executionTimeMs,
              errorMessage: 'Memory limit exceeded',
            });
          }

          return resolve({
            verdict: 'RUNTIME_ERROR',
            stdout,
            stderr,
            exitCode: code,
            executionTimeMs,
          });
        }

        resolve({
          verdict: 'PASSED',
          stdout,
          stderr,
          exitCode: 0,
          executionTimeMs,
        });
      });

      if (stdin) {
        child.stdin.write(stdin, 'utf-8');
      }
      child.stdin.end();
    });
  } finally {
    try {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    } catch {
      // Sandbox directory removal should be best-effort
    }
  }
}
