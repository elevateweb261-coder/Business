// Ajutoare comune pentru rutele de administrare: verificarea rolului și a sesiunii 2FA, jurnalul de audit.
import { HttpError } from './http.js';
export { diffValues } from './settings.js';

const now = () => new Date().toISOString();

/** Rolurile echipei. „admin”: tot; „editor”: conținut; „support”: utilizatori și cereri de date. */
export const STAFF_ROLES = { admin: 'Administrator', editor: 'Editor', support: 'Suport' };
export const ALL_STAFF = Object.keys(STAFF_ROLES);

export function adminHelpers(app) {
  const { db, router } = app;

  /** `roles`: rolurile care au acces la rută (implicit doar „admin”). */
  const requireStaff = (ctx, roles = ['admin']) => {
    if (!ctx.user || !roles.includes(ctx.user.role)) throw new HttpError(403, 'forbidden', 'Nu ai acces la această secțiune.');
    if (!ctx.mfa) throw new HttpError(401, 'mfa_required', 'Conectează-te în panou cu emailul, parola și codul din aplicația de autentificare.');
  };

  const on = (method, path, handler, { roles, ...opts } = {}) =>
    router.on(method, path, ctx => { requireStaff(ctx, roles); return handler(ctx); }, opts);

  /** `details.changes` = { câmp: [vechi, nou] } pentru modificări (afișate ca diferență în jurnal). */
  const audit = (ctx, action, target, details) => {
    db.prepare('INSERT INTO admin_audit (admin_id, admin_email, action, target_user_id, target_email, details, created_at, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(ctx.user.id, ctx.user.email, action, target?.id ?? null, target?.email ?? null, details ? JSON.stringify(details) : null, now(), ctx.ip ?? null);
  };

  return { on, audit, requireStaff };
}
