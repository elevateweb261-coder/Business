// Administratori și setări (ecranul 11).
//  - Echipa: listă cu rol, 2FA, ultima conectare; invitare (cont nou + link de setare a parolei, valabil 72 de ore),
//    schimbarea rolului, dezactivare / reactivare. Nu îți poți modifica propriul cont și nu poate rămâne niciun
//    administrator activ. Conturile de client NU devin conturi de echipă din panou.
//  - Setări: limite de scanare, funcții opționale, mesaj de mentenanță. Fiecare salvare intră în audit, cu diferențele.
import { HttpError, badRequest, notFound } from '../http.js';
import { validate, rules } from '../validate.js';
import { adminHelpers, STAFF_ROLES, diffValues } from '../admin-common.js';
import { newToken } from '../security.js';
import { tx } from '../db.js';
import { getSettings, publicSettings, validateSettings, saveSettings, SETTINGS_META, DEFAULT_SETTINGS } from '../settings.js';

const INVITE_TTL_MS = 72 * 3600 * 1000;
const now = () => new Date().toISOString();

export function registerStaffRoutes(router, app) {
  const { db, config, mailer } = app;
  const { on, audit } = adminHelpers(app);

  const staffOut = (u, selfId) => ({
    id: u.id, name: u.name, email: u.email, role: u.admin_role || 'admin',
    twoFactor: !!u.totp_enabled_at, lastLoginAt: u.admin_last_login_at,
    disabled: !!u.admin_disabled_at, disabledAt: u.admin_disabled_at,
    pending: !u.totp_enabled_at && !u.admin_last_login_at,
    invitedBy: u.inviter_email || null, createdAt: u.created_at, self: u.id === selfId,
  });
  const loadStaff = ctx => {
    const u = db.prepare("SELECT u.*, i.email AS inviter_email FROM users u LEFT JOIN users i ON i.id = u.admin_invited_by WHERE u.id = ? AND u.role = 'admin'").get(Number(ctx.params.id));
    if (!u) throw notFound('Contul de echipă nu există.');
    return u;
  };
  const activeAdmins = () => db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND COALESCE(admin_role, 'admin') = 'admin' AND admin_disabled_at IS NULL").get().n;
  const notSelf = (ctx, u, what) => { if (u.id === ctx.user.id) throw badRequest(`Nu îți poți ${what} propriul cont. Cere asta altui administrator.`); };
  const keepOneAdmin = u => {
    if ((u.admin_role || 'admin') === 'admin' && !u.admin_disabled_at && activeAdmins() <= 1) {
      throw new HttpError(409, 'last_admin', 'Este singurul administrator activ. Numește întâi alt administrator.');
    }
  };

  async function sendInvite(u, inviter) {
    const { token, hash } = newToken();
    tx(db, () => {
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(u.id);
      db.prepare('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .run(hash, u.id, now(), new Date(Date.now() + INVITE_TTL_MS).toISOString());
    });
    await mailer.send({
      to: u.email,
      subject: 'Invitație în echipa Metamorf',
      text: `Bună, ${u.name}!

${inviter.name} te-a invitat în panoul de administrare Metamorf, cu rolul „${STAFF_ROLES[u.admin_role]}”.

1. Setează-ți parola (linkul este valabil 72 de ore):
${config.appUrl}/#resetare/${token}

2. Apoi intră în panou la ${config.appUrl}/admin.html. La prima conectare vei activa autentificarea în doi pași cu o aplicație de pe telefon (Google Authenticator, Microsoft Authenticator, Authy sau 1Password).

Dacă nu te așteptai la această invitație, ignoră mesajul.`,
    });
  }

  // ---------- Echipa ----------

  on('GET', '/api/admin/staff', ctx => ({
    roles: STAFF_ROLES,
    staff: db.prepare("SELECT u.*, i.email AS inviter_email FROM users u LEFT JOIN users i ON i.id = u.admin_invited_by WHERE u.role = 'admin' ORDER BY u.admin_disabled_at IS NOT NULL, u.name")
      .all().map(u => staffOut(u, ctx.user.id)),
  }));

  on('POST', '/api/admin/staff', async ctx => {
    const d = validate(ctx.body, { name: rules.str({ min: 2, max: 60 }), email: rules.email(), role: rules.oneOf(Object.keys(STAFF_ROLES)) });
    const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(d.email);
    if (existing?.role === 'admin') throw new HttpError(409, 'exists', 'Această persoană are deja un cont de echipă.');
    if (existing) throw new HttpError(409, 'client_account', 'Există un cont de client cu acest email. Conturile de client nu devin conturi de echipă din panou; folosește adresa de serviciu a persoanei.');
    const t = now();
    const id = tx(db, () => {
      // Fără parolă utilizabilă până la acceptarea invitației (valoarea nu este un hash valid, deci nu se poate ghici).
      const { lastInsertRowid } = db.prepare(`INSERT INTO users (email, password_hash, name, timezone, terms_accepted_at, created_at, updated_at, role, admin_role, admin_invited_by)
        VALUES (?, 'invitat', ?, ?, ?, ?, ?, 'admin', ?, ?)`).run(d.email, d.name, config.adminTimezone, t, t, t, d.role, ctx.user.id);
      db.prepare('INSERT INTO profiles (user_id, updated_at) VALUES (?, ?)').run(lastInsertRowid, t);
      db.prepare("INSERT INTO subscriptions (user_id, status, updated_at) VALUES (?, 'none', ?)").run(lastInsertRowid, t);
      return Number(lastInsertRowid);
    });
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    await sendInvite(u, ctx.user);
    audit(ctx, 'invite_staff', u, { role: d.role });
    ctx.status = 201;
    return staffOut(u, ctx.user.id);
  });

  on('POST', '/api/admin/staff/:id/invite', async ctx => {
    const u = loadStaff(ctx);
    if (u.totp_enabled_at || u.admin_last_login_at) throw badRequest('Persoana s-a conectat deja; nu mai are nevoie de invitație. Pentru parolă uitată, folosește resetarea parolei.');
    if (u.admin_disabled_at) throw badRequest('Contul este dezactivat. Reactivează-l înainte de a retrimite invitația.');
    await sendInvite(u, ctx.user);
    audit(ctx, 'resend_staff_invite', u);
    return { ok: true };
  });

  on('POST', '/api/admin/staff/:id/role', ctx => {
    const u = loadStaff(ctx);
    const { role } = validate(ctx.body, { role: rules.oneOf(Object.keys(STAFF_ROLES)) });
    notSelf(ctx, u, 'schimba rolul pentru');
    const old = u.admin_role || 'admin';
    if (old === role) throw badRequest(`Rolul este deja „${STAFF_ROLES[role]}”.`);
    if (old === 'admin') keepOneAdmin(u);
    db.prepare('UPDATE users SET admin_role = ? WHERE id = ?').run(role, u.id);
    audit(ctx, 'change_staff_role', u, { changes: { role: [STAFF_ROLES[old], STAFF_ROLES[role]] } });
    return staffOut(loadStaff(ctx), ctx.user.id);
  });

  on('POST', '/api/admin/staff/:id/disable', ctx => {
    const u = loadStaff(ctx);
    notSelf(ctx, u, 'dezactiva');
    if (u.admin_disabled_at) throw badRequest('Contul este deja dezactivat.');
    keepOneAdmin(u);
    tx(db, () => {
      db.prepare('UPDATE users SET admin_disabled_at = ? WHERE id = ?').run(now(), u.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id); // deconectat imediat de peste tot
      db.prepare('DELETE FROM admin_mfa_challenges WHERE user_id = ?').run(u.id);
    });
    audit(ctx, 'disable_staff', u, { changes: { status: ['Activ', 'Dezactivat'] } });
    return staffOut(loadStaff(ctx), ctx.user.id);
  });

  on('POST', '/api/admin/staff/:id/enable', ctx => {
    const u = loadStaff(ctx);
    if (!u.admin_disabled_at) throw badRequest('Contul este deja activ.');
    db.prepare('UPDATE users SET admin_disabled_at = NULL WHERE id = ?').run(u.id);
    audit(ctx, 'enable_staff', u, { changes: { status: ['Dezactivat', 'Activ'] } });
    return staffOut(loadStaff(ctx), ctx.user.id);
  });

  // ---------- Setări ----------

  const settingsOut = () => {
    const last = db.prepare('SELECT s.updated_at, u.email FROM app_settings s LEFT JOIN users u ON u.id = s.updated_by ORDER BY s.updated_at DESC LIMIT 1').get();
    return { values: getSettings(db), defaults: DEFAULT_SETTINGS, meta: SETTINGS_META, updatedAt: last?.updated_at || null, updatedBy: last?.email || null };
  };

  on('GET', '/api/admin/settings', () => settingsOut());

  on('PUT', '/api/admin/settings', ctx => {
    const current = getSettings(db);
    const { next, fields } = validateSettings(ctx.body.values, current);
    if (Object.keys(fields).length) throw badRequest('Verifică setările.', fields);
    const changes = diffValues(current, next);
    if (!Object.keys(changes).length) throw badRequest('Nu ai modificat nicio setare.');
    saveSettings(db, next, ctx.user.id);
    audit(ctx, 'update_settings', null, { changes });
    return settingsOut();
  });

  // Setările de care are nevoie aplicația (fără autentificare): limite, funcții, mesajul de mentenanță.
  router.on('GET', '/api/settings', () => publicSettings(getSettings(db)), { auth: false });
}
