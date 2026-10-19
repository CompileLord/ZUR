import { runPythonIsolated } from '../packages/worker/src/runner.ts';

async function verifyD01() {
  console.log('Running D01 Host Diagnostic...');
  
  try {
    console.log('\n1. Testing CPU TIME_LIMIT (Infinite loop)');
    const cpuLoop = 'while True: pass';
    const t0 = Date.now();
    const cpuOutcome = await runPythonIsolated(cpuLoop, '', { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 });
    console.log(`TIME_LIMIT Result: ${cpuOutcome.verdict} in ${Date.now() - t0}ms`);
    console.log(`Error Message: ${cpuOutcome.errorMessage || 'none'}`);
    if (cpuOutcome.verdict === 'INTERNAL_ERROR' && (cpuOutcome.errorMessage?.includes('Execution sandbox is unavailable') || cpuOutcome.stderr?.includes('read-only file system'))) {
      console.log('[BLOCKED] Podman rootless isolation is blocked in the current sandbox environment. Codex host execution required.');
      return;
    } else if (cpuOutcome.verdict !== 'TIME_LIMIT') {
      throw new Error(`Expected TIME_LIMIT but got ${cpuOutcome.verdict}`);
    }

    console.log('\n2. Testing delayed MEMORY_LIMIT (512 MiB allocation with sleep)');
    // Allocate heavily and sleep to distinguish from CPU limit
    const memBomb = 'import time\ntime.sleep(2.5)\nx = bytearray(512 * 1024 * 1024)\nprint("Allocated")';
    const t1 = Date.now();
    const memOutcome = await runPythonIsolated(memBomb, '', { cpuTimeoutSeconds: 5, wallTimeoutSeconds: 10, memoryLimitMib: 128 });
    console.log(`MEMORY_LIMIT Result: ${memOutcome.verdict} in ${Date.now() - t1}ms`);
    console.log(`Error Message: ${memOutcome.errorMessage || 'none'}`);
    if (memOutcome.verdict === 'INTERNAL_ERROR' && (memOutcome.errorMessage?.includes('Execution sandbox is unavailable') || memOutcome.stderr?.includes('read-only file system'))) {
      console.log('[BLOCKED] Podman rootless isolation is blocked in the current sandbox environment. Codex host execution required.');
      return;
    } else if (memOutcome.verdict !== 'MEMORY_LIMIT') {
      throw new Error(`Expected MEMORY_LIMIT but got ${memOutcome.verdict}`);
    }

    console.log('\nD01 verify script complete.');
  } catch (err: any) {
    console.error('Diagnostic failed:', err.message);
    process.exit(1);
  }
}

verifyD01();
