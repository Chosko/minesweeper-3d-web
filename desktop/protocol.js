// The game protocol: the window loads the game from app://game/ rather than file URLs, because ES
// modules and module workers do not load from file URLs. Only the game's own files are served —
// the top-level entries in GAME_ENTRIES under the game root; any other request answers 404.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const SCHEME = 'app';
export const HOST = 'game';
export const GAME_ORIGIN = `${SCHEME}://${HOST}`;
export const GAME_URL = `${GAME_ORIGIN}/index.html`;

/** The top-level files and directories of the game root the window may load. */
export const GAME_ENTRIES = Object.freeze(['index.html', 'css', 'js', 'themes', 'assets', 'vendor']);

const MIME = Object.freeze({
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain',
  '.md': 'text/plain',
});

export function mimeType(file) {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** The game file a request URL names, as an absolute path under `root`, or null when it names none. */
export function resolveGamePath(root, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${SCHEME}:` || parsed.host !== HOST) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.includes(':')) return null;
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) parts.push('index.html');
  if (parts.some((p) => p === '.' || p === '..')) return null;
  if (!GAME_ENTRIES.includes(parts[0])) return null;
  if (parts[0] === 'index.html' && parts.length > 1) return null;
  return path.join(root, ...parts);
}

/** Answers one protocol request with the game file it names. */
export async function serveGameFile(root, request, { read = readFile } = {}) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
  const file = resolveGamePath(root, request.url);
  if (!file) return new Response(null, { status: 404 });
  let body;
  try {
    body = await read(file);
  } catch {
    return new Response(null, { status: 404 });
  }
  return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers: { 'content-type': mimeType(file) } });
}

/** Declares the scheme standard and secure, so module workers, fetch and fonts work; before app ready. */
export function registerGameScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
  }]);
}

/** Serves the game files under `root` on the scheme; after app ready. */
export function handleGameProtocol(protocol, root) {
  protocol.handle(SCHEME, (request) => serveGameFile(root, request));
}
