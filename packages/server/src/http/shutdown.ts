import type http from 'node:http';

export interface ShutdownOptions {
  server: http.Server;
  /** Runs after the server stopped accepting/drained (e.g. closeDatabase). */
  cleanup: () => void;
  forceExitMs?: number;
  exit?: (code: number) => void;
  log?: (entry: Record<string, unknown>) => void;
  proc?: Pick<NodeJS.Process, 'on'>;
}

const defaultLog = (entry: Record<string, unknown>) =>
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');

function describe(err: unknown) {
  return err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : { message: String(err) };
}

export function installShutdownHandlers(opts: ShutdownOptions): { shutdown: (reason: string, code: number) => void } {
  const { server, cleanup } = opts;
  const forceExitMs = opts.forceExitMs ?? 10_000;
  const exit = opts.exit ?? ((c: number) => process.exit(c));
  const log = opts.log ?? defaultLog;
  const proc = opts.proc ?? process;
  let shuttingDown = false;

  function shutdown(reason: string, code: number): void {
    if (shuttingDown) return;
    shuttingDown = true;
    log({ level: 'info', event: 'shutdown.begin', reason });
    const timer = setTimeout(() => {
      log({ level: 'error', event: 'shutdown.forced', afterMs: forceExitMs });
      server.closeAllConnections();
      try { cleanup(); } catch { /* best effort */ }
      exit(code || 1);
    }, forceExitMs);
    timer.unref();
    server.close(() => {
      clearTimeout(timer);
      try { cleanup(); } catch (err) { log({ level: 'error', event: 'shutdown.cleanup_failed', error: describe(err) }); code = code || 1; }
      log({ level: 'info', event: 'shutdown.complete', code });
      exit(code);
    });
    server.closeIdleConnections();
  }

  proc.on('SIGTERM', () => shutdown('SIGTERM', 0));
  proc.on('SIGINT', () => shutdown('SIGINT', 0));
  proc.on('unhandledRejection', (reason) => {
    log({ level: 'error', event: 'process.unhandledRejection', error: describe(reason) });
    shutdown('unhandledRejection', 1);
  });
  proc.on('uncaughtException', (err) => {
    log({ level: 'error', event: 'process.uncaughtException', error: describe(err) });
    shutdown('uncaughtException', 1);
  });
  return { shutdown };
}
