// Cereri de date (ecranul 4): listă, detalii cu cronologie, înregistrare și procesare.
// Ștergerea unui cont cere confirmarea emailului clientului (al doilea pas al confirmării).
import { HttpError, badRequest, notFound } from '../http.js';
import { validate, rules } from '../validate.js';
import { adminHelpers } from '../admin-common.js';

const SUPPORT = { roles: ['admin', 'support'] };
import { createRequest, setRequestStatus, REQUEST_STATUSES } from '../data-requests.js';
import { buildExport } from './data.js';

const requestOut = r => ({
  id: r.id, userId: r.user_id, userEmail: r.user_email, userName: r.user_name, accountDeleted: r.user_id === null,
  type: r.type, status: r.status, source: r.source, note: r.note,
  createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
});

export function registerRequestRoutes(router, app) {
  const { db } = app;
  const { on, audit } = adminHelpers(app);

  const load = ctx => {
    const r = db.prepare('SELECT * FROM data_requests WHERE id = ?').get(Number(ctx.params.id));
    if (!r) throw notFound('Cererea nu există.');
    return r;
  };
  const open = r => r.status === 'pending' || r.status === 'processing';
  const target = r => ({ id: r.user_id, email: r.user_email });

  on('GET', '/api/admin/requests', ctx => {
    const sp = ctx.url.searchParams;
    const type = sp.get('type'), status = sp.get('status');
    const page = Math.max(1, Number.parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = 20;
    const where = [], args = [];
    if (type === 'export' || type === 'delete') { where.push('type = ?'); args.push(type); }
    if (REQUEST_STATUSES.includes(status)) { where.push('status = ?'); args.push(status); }
    const q = (sp.get('q') || '').trim().slice(0, 100);
    if (q) { where.push('(user_email LIKE ? OR user_name LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) n FROM data_requests ${sqlWhere}`).get(...args).n;
    const rows = db.prepare(`SELECT * FROM data_requests ${sqlWhere} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
    const counts = Object.fromEntries(REQUEST_STATUSES.map(s => [s, 0]));
    for (const c of db.prepare('SELECT status, COUNT(*) n FROM data_requests GROUP BY status').all()) counts[c.status] = c.n;
    return { total, page, pageSize, counts, requests: rows.map(requestOut) };
  }, SUPPORT);

  on('GET', '/api/admin/requests/:id', ctx => {
    const r = load(ctx);
    return {
      request: requestOut(r),
      events: db.prepare('SELECT status, message, actor_email, created_at FROM data_request_events WHERE request_id = ? ORDER BY id').all(r.id).map(e => ({ ...e })),
    };
  }, SUPPORT);

  // Cerere primită pe alt canal (email, telefon) — înregistrată de un administrator.
  on('POST', '/api/admin/requests', ctx => {
    const d = validate(ctx.body, { email: rules.email(), type: rules.oneOf(['export', 'delete']), note: rules.str({ min: 5, max: 300 }) });
    const user = db.prepare("SELECT id, email, name FROM users WHERE email = ? AND role = 'user'").get(d.email);
    if (!user) throw badRequest('Nu există un client cu acest email.', { email: 'Nu există un client cu acest email.' });
    const dup = db.prepare("SELECT id FROM data_requests WHERE user_id = ? AND type = ? AND status IN ('pending', 'processing')").get(user.id, d.type);
    if (dup) throw new HttpError(409, 'duplicate', `Există deja o cerere deschisă de acest tip pentru client (#${dup.id}).`);
    const id = createRequest(db, {
      user, type: d.type, source: 'admin', note: d.note, actorEmail: ctx.user.email,
      message: `Cerere de ${d.type === 'export' ? 'export' : 'ștergere'} înregistrată în panou. Notă: ${d.note}`,
    });
    audit(ctx, 'create_data_request', user, { request: id, type: d.type });
    ctx.status = 201;
    return { id };
  }, SUPPORT);

  on('POST', '/api/admin/requests/:id/start', ctx => {
    const r = load(ctx);
    if (r.status !== 'pending') throw badRequest('Doar cererile în așteptare pot fi preluate.');
    setRequestStatus(db, r.id, 'processing', 'Cererea a fost preluată pentru procesare.', ctx.user.email);
    audit(ctx, 'start_data_request', target(r), { request: r.id });
    return { ok: true };
  }, SUPPORT);

  // Exportul: generează fișierul (pentru a fi trimis clientului) și finalizează cererea.
  on('POST', '/api/admin/requests/:id/export', ctx => {
    const r = load(ctx);
    if (r.type !== 'export') throw badRequest('Cererea nu este de export.');
    if (!open(r)) throw badRequest('Cererea este deja închisă.');
    if (!r.user_id) {
      setRequestStatus(db, r.id, 'failed', 'Exportul nu a putut fi generat: contul nu mai există.', ctx.user.email);
      throw badRequest('Contul nu mai există; cererea a fost marcată ca eșuată.');
    }
    const data = buildExport(db, r.user_id);
    setRequestStatus(db, r.id, 'completed', 'Exportul a fost generat în panou, pentru a fi trimis clientului.', ctx.user.email);
    audit(ctx, 'export_user', target(r), { request: r.id });
    ctx.headers['Content-Disposition'] = `attachment; filename="metamorf-export-cerere-${r.id}.json"`;
    return data;
  }, SUPPORT);

  // Ștergerea: al doilea pas al confirmării — emailul clientului, tastat exact.
  on('POST', '/api/admin/requests/:id/delete', ctx => {
    const r = load(ctx);
    if (r.type !== 'delete') throw badRequest('Cererea nu este de ștergere.');
    if (!open(r)) throw badRequest('Cererea este deja închisă.');
    const { confirmEmail } = validate(ctx.body, { confirmEmail: rules.str({ max: 254 }) });
    if (confirmEmail.trim().toLowerCase() !== r.user_email.toLowerCase()) {
      throw badRequest('Emailul de confirmare nu corespunde.', { confirmEmail: 'Scrie exact adresa de email a clientului.' });
    }
    const user = r.user_id ? db.prepare('SELECT id, role FROM users WHERE id = ?').get(r.user_id) : null;
    if (user?.role && user.role !== 'user') throw badRequest('Conturile de administrare nu se șterg prin cereri de date.');
    db.exec('BEGIN');
    try {
      if (user) db.prepare('DELETE FROM users WHERE id = ?').run(user.id); // datele se șterg în cascadă; cererea rămâne (user_id → NULL)
      setRequestStatus(db, r.id, 'completed', user ? 'Contul și toate datele asociate au fost șterse definitiv.' : 'Contul nu mai exista; nu a mai fost nimic de șters.', ctx.user.email);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      setRequestStatus(db, r.id, 'failed', 'Ștergerea a eșuat din cauza unei erori pe server. Nicio dată nu a fost ștearsă.', ctx.user.email);
      throw err;
    }
    audit(ctx, 'delete_user', target(r), { request: r.id });
    return { ok: true };
  });

  on('POST', '/api/admin/requests/:id/fail', ctx => {
    const r = load(ctx);
    if (!open(r)) throw badRequest('Cererea este deja închisă.');
    const { reason } = validate(ctx.body, { reason: rules.str({ min: 5, max: 300 }) });
    setRequestStatus(db, r.id, 'failed', `Marcată ca eșuată: ${reason}`, ctx.user.email);
    audit(ctx, 'fail_data_request', target(r), { request: r.id, reason });
    return { ok: true };
  }, SUPPORT);
}
