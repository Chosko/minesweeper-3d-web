// The window state file: the window's position and whether it is fullscreen, kept in the user-data
// directory, outside any save directory, so it stays per machine. The size is never stored — the
// window takes the size of the page's content. A missing, unreadable or malformed file reads as
// DEFAULT_WINDOW_STATE: windowed, with no position, so the window is centred.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const WINDOW_STATE_FILE = 'window-state.json';
export const WINDOW_STATE_VERSION = 1;
export const DEFAULT_WINDOW_STATE = Object.freeze({ fullscreen: false });

export function parseWindowState(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return DEFAULT_WINDOW_STATE;
  if (data.version !== undefined && data.version !== WINDOW_STATE_VERSION) return DEFAULT_WINDOW_STATE;
  const fullscreen = data.fullscreen ?? false;
  if (typeof fullscreen !== 'boolean') return DEFAULT_WINDOW_STATE;
  const hasX = data.x !== undefined;
  const hasY = data.y !== undefined;
  if (!hasX && !hasY) return { fullscreen };
  if (!Number.isInteger(data.x) || !Number.isInteger(data.y)) return DEFAULT_WINDOW_STATE;
  return { x: data.x, y: data.y, fullscreen };
}

export function readWindowState(file) {
  try {
    return parseWindowState(readFileSync(file, 'utf8'));
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
}

/** Writes the state through a temporary file; false when it could not be written. */
export function writeWindowState(file, state) {
  const data = { version: WINDOW_STATE_VERSION, fullscreen: Boolean(state.fullscreen) };
  if (Number.isInteger(state.x) && Number.isInteger(state.y)) Object.assign(data, { x: state.x, y: state.y });
  const temp = `${file}.tmp`;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(temp, JSON.stringify(data));
    renameSync(temp, file);
    return true;
  } catch {
    return false;
  }
}

/**
 * The state with its position kept only when the window's top-left corner lands inside one of the
 * screens' work areas — a screen unplugged since leaves it with no position, so it is centred.
 */
export function placeOnScreen(state, workAreas, size) {
  if (!Number.isInteger(state.x) || !Number.isInteger(state.y)) return { fullscreen: state.fullscreen };
  const reach = Math.min(size.width, size.height, 64);
  const visible = workAreas.some((a) => state.x >= a.x - reach && state.x <= a.x + a.width - reach
    && state.y >= a.y && state.y <= a.y + a.height - reach);
  return visible ? { x: state.x, y: state.y, fullscreen: state.fullscreen } : { fullscreen: state.fullscreen };
}
