// Biblioteca media (ecranul 8): fotografii și videoclipuri încărcate din panou.
// Tipul fișierului se stabilește după conținut (primii octeți), nu după nume; numele de pe disc îl generează serverul.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { badRequest } from './http.js';

export const MAX_IMAGE = 5 * 1024 * 1024;
export const MAX_VIDEO = 50 * 1024 * 1024;

const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm' };

/** { ext, kind, mime } după conținut, sau null dacă fișierul nu este JPEG / PNG / WebP / MP4 / WebM. */
export function detectFile(buf) {
  let ext = null;
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ext = 'jpg';
  else if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ext = 'png';
  else if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') ext = 'webp';
  else if (buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp') ext = 'mp4';
  else if (buf.length > 4 && buf.readUInt32BE(0) === 0x1a45dfa3) ext = 'webm';
  if (!ext) return null;
  return { ext, kind: ext === 'mp4' || ext === 'webm' ? 'video' : 'image', mime: MIME[ext] };
}

/** Dimensiunile unei imagini (din antet), sau null dacă nu pot fi citite. */
export function imageSize(buf, ext) {
  try {
    if (ext === 'png') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (ext === 'webp') {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
      if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
      return null;
    }
    if (ext === 'jpg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        // SOF0–SOF15, fără DHT (C4), JPG (C8), DAC (CC)
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
        i += 2 + len;
      }
    }
  } catch { /* antet incomplet */ }
  return null;
}

export const mediaUrl = m => (m ? `/media/${m.folder}/${m.filename}` : null);

export const mediaOut = m => ({
  id: m.id, kind: m.kind, filename: m.filename, url: mediaUrl(m), mime: m.mime, bytes: m.bytes,
  width: m.width, height: m.height, originalName: m.original_name, source: m.source, createdAt: m.created_at,
  uploadedBy: m.uploader_email ?? null,
});

/**
 * Salvează un fișier încărcat și îl înregistrează în bibliotecă. `accept`: 'image', 'video' sau 'any'.
 * Întoarce rândul din tabelul `media`.
 */
export function saveMedia(app, buf, { folder = 'library', accept = 'any', originalName = null, source = null, userId = null, prefix = 'm' }) {
  const type = detectFile(buf);
  const wanted = accept === 'image' ? 'o imagine JPEG, PNG sau WebP' : accept === 'video' ? 'un videoclip MP4 sau WebM' : 'o imagine (JPEG, PNG, WebP) sau un videoclip (MP4, WebM)';
  if (!type || (accept !== 'any' && type.kind !== accept)) throw badRequest(`Fișierul nu este ${wanted}.`, { file: `Alege ${wanted}.` });
  if (type.kind === 'image' && buf.length > MAX_IMAGE) throw badRequest('Imaginea depășește 5 MB.', { file: 'Imaginea depășește 5 MB.' });
  const size = type.kind === 'image' ? imageSize(buf, type.ext) : null;
  const dir = join(app.config.uploadsDir, folder);
  mkdirSync(dir, { recursive: true });
  const filename = `${prefix}-${randomBytes(8).toString('hex')}.${type.ext}`;
  writeFileSync(join(dir, filename), buf);
  const name = originalName ? String(originalName).slice(0, 200) : null;
  const src = source ? String(source).trim().slice(0, 300) || null : null;
  const { lastInsertRowid } = app.db.prepare(`INSERT INTO media (kind, folder, filename, mime, bytes, width, height, original_name, source, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(type.kind, folder, filename, type.mime, buf.length, size?.width ?? null, size?.height ?? null, name, src, userId, new Date().toISOString());
  return app.db.prepare('SELECT * FROM media WHERE id = ?').get(Number(lastInsertRowid));
}

/** Unde este folosit un fișier: rețete (fotografie) și exerciții (imagine, video). */
export function mediaUsage(db, filename) {
  const recipes = db.prepare('SELECT id, name FROM recipes WHERE photo = ?').all(filename)
    .map(r => ({ type: 'recipe', id: r.id, name: r.name, role: 'fotografie' }));
  const exercises = db.prepare('SELECT id, name, image, video FROM exercises WHERE image = ? OR video = ?').all(filename, filename)
    .map(e => ({ type: 'exercise', id: e.id, name: e.name, role: e.image === filename ? 'imagine' : 'video' }));
  return [...recipes, ...exercises];
}

/** Toate fișierele folosite (pentru filtrul „nefolosit”). */
export function usedFilenames(db) {
  const rows = db.prepare(`SELECT photo AS f FROM recipes WHERE photo IS NOT NULL
    UNION SELECT image FROM exercises WHERE image IS NOT NULL UNION SELECT video FROM exercises WHERE video IS NOT NULL`).all();
  return new Set(rows.map(r => r.f));
}

export function removeMediaFile(app, m) {
  rmSync(join(app.config.uploadsDir, m.folder, m.filename), { force: true });
}

export const mediaByFilename = (db, filename) => (filename ? db.prepare('SELECT * FROM media WHERE filename = ?').get(filename) : null);
