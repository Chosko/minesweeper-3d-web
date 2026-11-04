// The local crash log: uncaught errors from the main process and the page, appended to a text file
// in the user-data directory, outside any save directory, rotated past a size and never uploaded.
// Writing never throws: a log that cannot be written is skipped.
import * as nodeFs from 'node:fs';
import path from 'node:path';

export const CRASH_LOG_FILE = 'crash.log';
export const CRASH_LOG_MAX_BYTES = 256 * 1024;
export const CRASH_LOG_KEEP = 3;

function describe(error) {
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  return String(error);
}

export function formatEntry(date, source, error) {
  return `[${date.toISOString()}] [${source}] ${describe(error)}\n`;
}

/** A crash log in `dir`: crash.log, rotated to crash.1.log … crash.<keep>.log. */
export function createCrashLog(dir, { maxBytes = CRASH_LOG_MAX_BYTES, keep = CRASH_LOG_KEEP, now = () => new Date(), fs = nodeFs } = {}) {
  const file = path.join(dir, CRASH_LOG_FILE);
  const old = (n) => path.join(dir, `crash.${n}.log`);

  function rotate() {
    fs.rmSync(old(keep), { force: true });
    for (let n = keep - 1; n >= 1; n -= 1) if (fs.existsSync(old(n))) fs.renameSync(old(n), old(n + 1));
    fs.renameSync(file, old(1));
  }

  return {
    file,
    write(source, error) {
      try {
        const entry = Buffer.from(formatEntry(now(), source, error)).subarray(0, maxBytes);
        fs.mkdirSync(dir, { recursive: true });
        const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
        if (size > 0 && size + entry.length > maxBytes) rotate();
        fs.appendFileSync(file, entry);
      } catch {
        // nowhere left to report it
      }
    },
  };
}

/** Logs the main process's uncaught exceptions and unhandled rejections. */
export function captureMainErrors(log, proc = process) {
  proc.on('uncaughtException', (error) => log.write('main', error));
  proc.on('unhandledRejection', (reason) => log.write('main', reason));
}

const UNCAUGHT = /^Uncaught\b/;

/**
 * Logs the page's uncaught errors — the console's "Uncaught …" error lines — its renderer going
 * away and a failing preload. Reads the console event in Electron's event-object form and in the
 * older positional form.
 */
export function capturePageErrors(log, webContents) {
  webContents.on('console-message', (event, ...legacy) => {
    const level = event?.level ?? legacy[0];
    const message = event?.message ?? legacy[1];
    const line = event?.lineNumber ?? legacy[2];
    const source = event?.sourceId ?? legacy[3];
    if ((level === 'error' || level === 3) && UNCAUGHT.test(String(message))) {
      log.write('page', source ? `${message} (${source}:${line})` : String(message));
    }
  });
  webContents.on('render-process-gone', (_event, details) => {
    log.write('page', `render process gone: ${details?.reason} (exit code ${details?.exitCode})`);
  });
  webContents.on('preload-error', (_event, preloadPath, error) => {
    log.write('preload', error ?? preloadPath);
  });
}
