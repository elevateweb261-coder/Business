// Utilitare HTTP minimale: rutare, citirea JSON, erori, cookie-uri, fișiere statice, antete de securitate.
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code      cod stabil, pentru frontend (ex. 'invalid_credentials')
   * @param {string} message   mesaj în română, afișabil
   * @param {Record<string,string>} [fields] erori pe câmpuri
   */
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message, fields) => new HttpError(422, 'validation', message || 'Verifică datele introduse.', fields);
export const notFound = (message = 'Nu am găsit înregistrarea.') => new HttpError(404, 'not_found', message);

export class Router {
  routes = [];
  /** Pattern ca '/api/food/:id'. `opts.auth` (implicit true) cere utilizator conectat. */
  on(method, pattern, handler, opts = {}) {
    const keys = [];
    const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    // `raw: true` = corpul cererii e binar (de ex. o imagine), citit ca Buffer de cel mult `maxBytes`.
    this.routes.push({ method, regex, keys, handler, auth: opts.auth !== false, raw: !!opts.raw, maxBytes: opts.maxBytes });
    return this;
  }
  match(method, path) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.regex.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return { route: r, params };
    }
    return pathMatched ? 'method' : null;
  }
}

const MAX_BODY = 100 * 1024;

export async function readJson(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const type = req.headers['content-type'] || '';
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'too_large', 'Cererea este prea mare.');
    chunks.push(chunk);
  }
  if (!size) return {};
  if (!type.startsWith('application/json')) throw new HttpError(415, 'unsupported_type', 'Format nesuportat.');
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, 'bad_json', 'Cererea nu este un JSON valid.');
  }
}

/** Corp binar (de ex. o fotografie), cu limită de mărime. */
export async function readRaw(req, maxBytes = 5 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'too_large', `Fișierul depășește ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Servește un fișier încărcat (fotografie sau videoclip). Numele trebuie să fie strict de forma generată de server.
 * Acceptă cereri parțiale (Range), necesare pentru derularea videoclipurilor.
 */
export function serveUpload(req, res, dir, name) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (!/^[a-z0-9-]{8,80}\.(jpg|png|webp|mp4|webm)$/.test(name)) return false;
  const file = join(dir, name);
  let stat;
  try { stat = statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  const headers = { 'Content-Type': TYPES[extname(file)], 'Cache-Control': 'public, max-age=86400', 'Content-Disposition': 'inline', 'Accept-Ranges': 'bytes' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    let end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start < 0) start = 0;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
      return true;
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end(), true;
    createReadStream(file, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end(), true;
  createReadStream(file).pipe(res);
  return true;
}

export function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

export function sendError(res, err) {
  if (err instanceof HttpError) {
    return sendJson(res, err.status, { error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } });
  }
  console.error(err);
  sendJson(res, 500, { error: { code: 'server_error', message: 'A apărut o eroare pe server. Încearcă din nou.' } });
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function cookie(name, value, { maxAge, secure, httpOnly = true, sameSite = 'Lax', path = '/' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  return c;
}

export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

/** Servește un fișier din `publicDir`. Refuză orice cale care iese din director sau fișierele ascunse. */
export function serveStatic(req, res, publicDir, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return false; }
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel.includes('\0') || rel.split('/').some(p => p.startsWith('.'))) return false;
  const file = normalize(join(publicDir, rel));
  if (!file.startsWith(publicDir + sep)) return false;
  let stat;
  try { stat = statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  const type = TYPES[extname(file).toLowerCase()];
  if (!type) return false;
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end(), true;
  createReadStream(file).pipe(res);
  return true;
}
