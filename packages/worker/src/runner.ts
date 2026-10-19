import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { TerminalVerdict } from 'zur-shared';
import { EXECUTION_BUDGETS } from 'zur-shared';

export const PINNED_PYTHON_IMAGE = 'docker.io/library/python@sha256:51dafde81dbdb6ebde285137a295cf18a47ca95234fe388a343719cb97305b3d';

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

interface ActiveRun { cidFile: string; sandboxDir: string; kill: () => void }
const activeRuns = new Set<ActiveRun>();

/** Number of sandbox runs currently in flight (tests / shutdown diagnostics). */
export function activeRunCount(): number { return activeRuns.size; }

/**
 * Kills every in-flight container (via its cidfile) and removes its temp dir. Used on worker shutdown.
 * Synchronous and best-effort: never throws.
 */
export function killAllActiveRuns(): number {
  let killed = 0;
  for (const run of [...activeRuns]) {
    try { run.kill(); } catch (error) { logRunnerError('child kill failed', error); }
    try {
      spawnSync('podman', ['kill', `--cidfile=${run.cidFile}`], { env: { PATH: '/usr/bin:/bin' }, stdio: 'ignore', timeout: 10_000 });
    } catch (error) { logRunnerError('podman kill failed', error); }
    try { fs.rmSync(run.sandboxDir, { recursive: true, force: true }); }
    catch (error) { logRunnerError('sandbox dir removal failed', error); }
    killed += 1;
  }
  return killed;
}

function logRunnerError(what: string, error: unknown): void {
  console.error(`[runner] ${what}: ${error instanceof Error ? error.message : String(error)}`);
}

export async function runPythonIsolated(
  code: string,
  stdin: string = '',
  options: RunOptions = {}
): Promise<RunOutcome> {
  const wallTimeoutSeconds = Math.min(options.wallTimeoutSeconds ?? EXECUTION_BUDGETS.DEFAULT_WALL_TIMEOUT_SECONDS, EXECUTION_BUDGETS.DEFAULT_WALL_TIMEOUT_SECONDS);
  const cpuTimeoutSeconds = Math.min(options.cpuTimeoutSeconds ?? EXECUTION_BUDGETS.DEFAULT_CPU_TIMEOUT_SECONDS, EXECUTION_BUDGETS.MAX_ADMIN_CPU_TIMEOUT_SECONDS);
  const memoryLimitMib = Math.min(options.memoryLimitMib ?? EXECUTION_BUDGETS.DEFAULT_MEMORY_LIMIT_MIB, EXECUTION_BUDGETS.MAX_ADMIN_MEMORY_LIMIT_MIB);
  const maxOutputBytes = Math.min(options.maxOutputBytes ?? EXECUTION_BUDGETS.MAX_CAPTURED_OUTPUT_BYTES, EXECUTION_BUDGETS.MAX_CAPTURED_OUTPUT_BYTES);

  if (Buffer.byteLength(code, 'utf-8') > EXECUTION_BUDGETS.MAX_SOURCE_CODE_BYTES) {
    return {
      verdict: 'INTERNAL_ERROR',
      stdout: '',
      stderr: 'Source code exceeds 64 KiB maximum limit.',
      exitCode: -1,
      executionTimeMs: 0,
      errorMessage: 'Source code exceeds 64 KiB maximum limit.',
    };
  }
  if (Buffer.byteLength(stdin, 'utf-8') > EXECUTION_BUDGETS.MAX_STDIN_BYTES) {
    return {
      verdict: 'INTERNAL_ERROR',
      stdout: '',
      stderr: 'Standard input exceeds 64 KiB maximum limit.',
      exitCode: -1,
      executionTimeMs: 0,
      errorMessage: 'Standard input exceeds 64 KiB maximum limit.',
    };
  }

  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-sandbox-'));
  const scriptPath = path.join(sandboxDir, 'main.py');
  const cidFile = path.join(sandboxDir, 'container.id');

  try {
    fs.writeFileSync(scriptPath, code, 'utf-8');
    fs.chmodSync(scriptPath, 0o644);

    const cleanEnv: NodeJS.ProcessEnv = {
      PATH: '/usr/bin:/bin',
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    };

    const startTime = performance.now();

    return await new Promise<RunOutcome>((resolve) => {
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let stdoutChunks: Buffer[] = [];
      let stderrChunks: Buffer[] = [];
      let killedByOutputLimit = false;
      let killedByTimeout = false;
      let cleanupPromise: Promise<void> | null = null;

      const child = spawn(
        'podman',
        [
          'run', '--rm', '--interactive', '--init', `--cidfile=${cidFile}`, '--pull=never', '--network=none', '--read-only',
          '--cap-drop=all', '--security-opt=no-new-privileges',
          '--pids-limit=16', `--memory=${memoryLimitMib}m`, '--cpus=1',
          `--tmpfs=/tmp:rw,size=${EXECUTION_BUDGETS.MAX_TEMP_DISK_MIB}m`,
          '--user=65534:65534', '--volume', `${scriptPath}:/work/main.py:ro,Z`,
          '--workdir=/work', PINNED_PYTHON_IMAGE,
          'prlimit', `--cpu=${cpuTimeoutSeconds}:${cpuTimeoutSeconds + 1}`, `--as=${memoryLimitMib * 1024 * 1024}`,
          `--fsize=${EXECUTION_BUDGETS.MAX_TEMP_DISK_MIB * 1024 * 1024}`, '--nproc=1', '--',
          'python3', '-I', '-s', '-B', '-E', 'main.py',
        ],
        {
          cwd: '/',
          env: cleanEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        }
      );

      const activeRun: ActiveRun = { cidFile, sandboxDir, kill: () => { child.kill('SIGKILL'); } };
      activeRuns.add(activeRun);

      const terminateSandbox = () => {
        if (!cleanupPromise) cleanupPromise = new Promise<void>((done) => {
          const cleanup = spawn('podman', ['kill', `--cidfile=${cidFile}`], {
            env: cleanEnv, stdio: 'ignore', windowsHide: true,
          });
          cleanup.once('close', () => done());
          cleanup.once('error', (error) => { logRunnerError('podman kill spawn failed', error); done(); });
        });
        child.kill('SIGKILL');
      };

      const timeoutTimer = setTimeout(() => {
        killedByTimeout = true;
        terminateSandbox();
      }, wallTimeoutSeconds * 1000);

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes + stderrBytes > maxOutputBytes) {
          killedByOutputLimit = true;
          terminateSandbox();
        } else {
          stdoutChunks.push(chunk);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.length;
        if (stdoutBytes + stderrBytes > maxOutputBytes) {
          killedByOutputLimit = true;
          terminateSandbox();
        } else {
          stderrChunks.push(chunk);
        }
      });

      // The container may exit before consuming stdin (EPIPE / ECONNRESET). That must never become an
      // uncaught exception: the exit status of the run decides the verdict.
      child.stdin.on('error', () => { /* expected when the process exits early */ });

      child.on('error', (err) => {
        clearTimeout(timeoutTimer);
        activeRuns.delete(activeRun);
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

      child.on('close', async (code, signal) => {
        clearTimeout(timeoutTimer);
        activeRuns.delete(activeRun);
        if (cleanupPromise) await cleanupPromise;
        const executionTimeMs = Math.round(performance.now() - startTime);

        const stdoutBuffer = Buffer.concat(stdoutChunks);
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');
        if (killedByOutputLimit) {
          return resolve({ verdict: 'OUTPUT_LIMIT', stdout: stdoutBuffer.toString('utf-8'), stderr,
            exitCode: code, executionTimeMs, errorMessage: 'Output limit exceeded (64 KiB maximum)' });
        }
        let stdout: string;
        try { stdout = new TextDecoder('utf-8', { fatal: true }).decode(stdoutBuffer); }
        catch {
          return resolve({ verdict: 'WRONG_ANSWER', stdout: '', stderr: '', exitCode: code,
            executionTimeMs, errorMessage: 'Program output is not valid UTF-8.' });
        }

        if (killedByTimeout) {
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
          if (code === 152 || signal === 'SIGXCPU') {
            return resolve({ verdict: 'TIME_LIMIT', stdout, stderr: '', exitCode: code,
              executionTimeMs, errorMessage: 'CPU time limit exceeded.' });
          }
          if (code === 153 || signal === 'SIGXFSZ') {
            return resolve({ verdict: 'OUTPUT_LIMIT', stdout, stderr: '', exitCode: code,
              executionTimeMs, errorMessage: 'Disk output limit exceeded.' });
          }
          if (code === 125 || code === 126 || code === 127 || stderr.startsWith('Error:') || stderr.includes('time="') || stderr.includes('container engine failure') || stderr.includes('read-only file system') || stderr.includes('Failed to obtain podman')) {
            return resolve({ verdict: 'INTERNAL_ERROR', stdout: '', stderr: '', exitCode: code,
              executionTimeMs, errorMessage: 'Execution sandbox is unavailable.' });
          }
          if (code === 137 || signal === 'SIGKILL') {
            return resolve({
              verdict: 'MEMORY_LIMIT',
              stdout,
              stderr,
              exitCode: code,
              executionTimeMs,
              errorMessage: 'Memory limit exceeded',
            });
          }
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

      try {
        if (stdin) child.stdin.write(stdin, 'utf-8');
        child.stdin.end();
      } catch (error) {
        logRunnerError('stdin write failed', error);
      }
    });
  } finally {
    try {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    } catch (error) {
      // Sandbox directory removal is best-effort, but failures must be visible.
      logRunnerError('sandbox dir removal failed', error);
    }
  }
}
