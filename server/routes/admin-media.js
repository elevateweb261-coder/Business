// Media (ecranul 8): grila cu fotografiile și videoclipurile încărcate, detalii, încărcare, sursă / licență,
// ștergere blocată cât timp fișierul este folosit (rețete, exerciții).
import { HttpError, badRequest, notFound } from '../http.js';
import { adminHelpers, diffValues } from '../admin-common.js';
import { MAX_VIDEO, saveMedia, mediaOut, mediaUsage, usedFilenames, removeMediaFile } from '../media.js';
import { reloadExercises } from '../catalog.js';

const ROLES = ['admin', 'editor'];

export function registerMediaRoutes(router, app) {
  const { db } = app;
  const { on, audit } = adminHelpers(app);

  const load = ctx => {
    const m = db.prepare('SELECT m.*, u.email AS uploader_email FROM media m LEFT JOIN users u ON u.id = m.uploaded_by WHERE m.id = ?').get(Number(ctx.params.id));
    if (!m) throw notFound('Fișierul nu există.');
    return m;
  };

  on('GET', '/api/admin/media', ctx => {
    const sp = ctx.url.searchParams;
    const kind = sp.get('kind'), unused = sp.get('unused') === '1';
    const q = (sp.get('q') || '').trim().toLowerCase();
    const page = Math.max(1, Number.parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = 48;
    const used = usedFilenames(db);
    const all = db.prepare('SELECT m.*, u.email AS uploader_email FROM media m LEFT JOIN users u ON u.id = m.uploaded_by ORDER BY m.id DESC').all()
      .map(m => ({ ...mediaOut(m), used: used.has(m.filename) }));
    const counts = { all: all.length, image: all.filter(m => m.kind === 'image').length, video: all.filter(m => m.kind === 'video').length, unused: all.filter(m => !m.used).length };
    let list = all;
    if (kind === 'image' || kind === 'video') list = list.filter(m => m.kind === kind);
    if (unused) list = list.filter(m => !m.used);
    if (q) list = list.filter(m => `${m.originalName || ''} ${m.filename} ${m.source || ''}`.toLowerCase().includes(q));
    return { total: list.length, page, pageSize, counts, items: list.slice((page - 1) * pageSize, page * pageSize) };
  }, { roles: ROLES });

  on('GET', '/api/admin/media/:id', ctx => {
    const m = load(ctx);
    return { item: mediaOut(m), usage: mediaUsage(db, m.filename) };
  }, { roles: ROLES });

  // Încărcare: corp binar; numele original și sursa / licența în parametrii adresei.
  on('PUT', '/api/admin/media', ctx => {
    const sp = ctx.url.searchParams;
    const accept = ['image', 'video'].includes(sp.get('accept')) ? sp.get('accept') : 'any';
    const source = (sp.get('source') || '').trim();
    if (source.length > 300) throw badRequest('Sursa / licența poate avea cel mult 300 de caractere.', { source: 'Cel mult 300 de caractere.' });
    const m = saveMedia(app, ctx.body, { accept, originalName: sp.get('name'), source, userId: ctx.user.id, prefix: 'm' });
    if (m.kind === 'video' && !m.source) {
      removeMediaFile(app, m);
      db.prepare('DELETE FROM media WHERE id = ?').run(m.id);
      throw badRequest('Pentru videoclipuri, sursa / licența este obligatorie.', { source: 'Completează sursa / licența videoclipului.' });
    }
    audit(ctx, 'upload_media', null, { media: m.id, name: m.original_name || m.filename });
    ctx.status = 201;
    return mediaOut(m);
  }, { roles: ROLES, raw: true, maxBytes: MAX_VIDEO });

  on('PUT', '/api/admin/media/:id', ctx => {
    const m = load(ctx);
    const source = typeof ctx.body.source === 'string' ? ctx.body.source.trim() : '';
    if (source.length > 300) throw badRequest('Sursa / licența poate avea cel mult 300 de caractere.', { source: 'Cel mult 300 de caractere.' });
    if (m.kind === 'video' && !source) throw badRequest('Pentru videoclipuri, sursa / licența este obligatorie.', { source: 'Completează sursa / licența videoclipului.' });
    db.prepare('UPDATE media SET source = ? WHERE id = ?').run(source || null, m.id);
    audit(ctx, 'update_media', null, { media: m.id, name: m.original_name || m.filename, changes: diffValues({ source: m.source }, { source: source || null }) });
    reloadExercises(db);
    return mediaOut(load(ctx));
  }, { roles: ROLES });

  on('DELETE', '/api/admin/media/:id', ctx => {
    const m = load(ctx);
    const usage = mediaUsage(db, m.filename);
    if (usage.length) {
      const where = usage.map(u => `${u.type === 'recipe' ? 'rețeta' : 'exercițiul'} „${u.name}”`).join(', ');
      throw new HttpError(409, 'in_use', `Fișierul este folosit (${where}) și nu poate fi șters. Înlocuiește-l mai întâi acolo.`);
    }
    db.prepare('DELETE FROM media WHERE id = ?').run(m.id);
    removeMediaFile(app, m);
    audit(ctx, 'delete_media', null, { media: m.id, name: m.original_name || m.filename });
    return { ok: true };
  }, { roles: ROLES });
}
