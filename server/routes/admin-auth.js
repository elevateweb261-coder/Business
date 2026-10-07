// Conectarea în panoul de administrare: (1) email + parolă, (2) cod de 6 cifre din aplicația de autentificare.
// La prima conectare, pasul 2 include configurarea autentificării în doi pași (cod QR + cheie).
// Nu există înregistrare: conturile de administrator se creează intern (npm run admin).
import QRCode from 'qrcode';
import { HttpError, badRequest } from '../http.js';
import { validate, rules } from '../validate.js';
import { verifyPassword, hashPassword, newToken, hashToken } from '../security.js';
import { generateSecret, verifyCode, otpauthUri } from '../totp.js';
import { encrypt, decrypt } from '../secret.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const now = () => new Date().toISOString();

const minutes = ms => Math.max(1, Math.ceil(ms / 60000));
const locked = ms => new HttpError(429, 'locked', `Prea multe încercări. Din motive de securitate, conectarea este blocată temporar. Încearcă din nou peste ${minutes(ms)} ${minutes(ms) === 1 ? 'minut' : 'minute'}.`);

export function registerAdminAuthRoutes(router, app) {
  const { db, config, limits } = app;
  const dummyHash = hashPassword('parola-fictiva-pentru-timp-constant', config.scryptCost);

  const audit = (user, action, ip = null) => db.prepare('INSERT INTO admin_audit (admin_id, admin_email, action, target_user_id, target_email, created_at, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(user.id, user.email, action, user.id, user.email, now(), ip);

  // ---------- Pasul 1: email + parolă ----------

  router.on('POST', '/api/admin/auth/login', async ctx => {
    const email = typeof ctx.body.email === 'string' ? ctx.body.email.trim().toLowerCase() : '';
    const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
    if (!email || !password) {
      throw badRequest('Completează emailul și parola.', {
        ...(!email ? { email: 'Completează adresa de email.' } : {}),
        ...(!password ? { password: 'Completează parola.' } : {}),
      });
    }
    const wait = Math.max(limits.adminLogin.retryAfter(email), limits.adminLoginIp.retryAfter(ctx.ip));
    if (wait) throw locked(wait);

    const user = db.prepare('SELECT id, email, name, role, password_hash, totp_enabled_at, admin_disabled_at FROM users WHERE email = ?').get(email);
    const ok = user ? await verifyPassword(password, user.password_hash) : (await verifyPassword(password, await dummyHash), false);
    // Același mesaj pentru parolă greșită și pentru conturi fără rol de administrator.
    if (!ok || user.role !== 'admin') {
      limits.adminLogin.hit(email);
      limits.adminLoginIp.hit(ctx.ip);
      const left = limits.adminLogin.limit - limits.adminLogin.hits.get(email).length;
      throw new HttpError(401, 'invalid_credentials', left > 0
        ? `Emailul sau parola nu sunt corecte. ${left === 1 ? 'Mai ai o încercare' : `Mai ai ${left} încercări`} înainte de blocarea temporară.`
        : 'Emailul sau parola nu sunt corecte.');
    }
    if (user.admin_disabled_at) throw new HttpError(403, 'disabled', 'Contul de administrare este dezactivat. Cere reactivarea unui administrator.');

    const { token, hash } = newToken();
    const setup = !user.totp_enabled_at;
    const secret = setup ? generateSecret() : null;
    db.prepare('DELETE FROM admin_mfa_challenges WHERE user_id = ?').run(user.id);
    db.prepare('INSERT INTO admin_mfa_challenges (token_hash, user_id, pending_secret_enc, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(hash, user.id, secret ? encrypt(app.secretKey, secret) : null, now(), new Date(Date.now() + CHALLENGE_TTL_MS).toISOString());

    if (!setup) return { step: 'code', challenge: token };
    const uri = otpauthUri(user.email, secret);
    return {
      step: 'setup',
      challenge: token,
      secret: secret.match(/.{1,4}/g).join(' '),
      qrSvg: await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0c0e0c', light: '#ffffff' } }),
    };
  }, { auth: false });

  // ---------- Pasul 2: codul de 6 cifre ----------

  router.on('POST', '/api/admin/auth/verify', ctx => {
    const { challenge, code } = validate(ctx.body, { challenge: rules.str({ max: 100 }), code: rules.str({ max: 10 }) });
    const row = db.prepare('SELECT * FROM admin_mfa_challenges WHERE token_hash = ?').get(hashToken(challenge));
    if (!row || row.expires_at < now()) {
      throw new HttpError(401, 'challenge_expired', 'Sesiunea de conectare a expirat. Introdu din nou emailul și parola.');
    }
    const user = db.prepare('SELECT id, email, name, role, totp_secret_enc, totp_last_counter, admin_disabled_at FROM users WHERE id = ?').get(row.user_id);
    const wait = limits.adminCode.retryAfter(String(user.id));
    if (wait) throw locked(wait);
    if (user.role !== 'admin') throw new HttpError(401, 'invalid_credentials', 'Emailul sau parola nu sunt corecte.');
    if (user.admin_disabled_at) throw new HttpError(403, 'disabled', 'Contul de administrare este dezactivat. Cere reactivarea unui administrator.');

    const setup = !!row.pending_secret_enc;
    const secret = decrypt(app.secretKey, setup ? row.pending_secret_enc : user.totp_secret_enc);
    const digits = String(code).replace(/\s/g, '');
    const counter = verifyCode(secret, digits, setup ? -1 : user.totp_last_counter ?? -1);
    if (counter === null) {
      limits.adminCode.hit(String(user.id));
      const attempts = row.attempts + 1;
      if (attempts >= MAX_CODE_ATTEMPTS) {
        db.prepare('DELETE FROM admin_mfa_challenges WHERE token_hash = ?').run(row.token_hash);
        throw new HttpError(401, 'challenge_expired', 'Prea multe coduri greșite. Introdu din nou emailul și parola.');
      }
      db.prepare('UPDATE admin_mfa_challenges SET attempts = ? WHERE token_hash = ?').run(attempts, row.token_hash);
      const left = MAX_CODE_ATTEMPTS - attempts;
      throw badRequest('Codul nu este corect sau a expirat.', {
        code: `Codul nu este corect sau a expirat. Verifică ora telefonului și încearcă din nou (${left === 1 ? 'o încercare rămasă' : `${left} încercări rămase`}).`,
      });
    }

    db.exec('BEGIN');
    try {
      if (setup) db.prepare('UPDATE users SET totp_secret_enc = ?, totp_enabled_at = ?, totp_last_counter = ? WHERE id = ?').run(row.pending_secret_enc, now(), counter, user.id);
      else db.prepare('UPDATE users SET totp_last_counter = ? WHERE id = ?').run(counter, user.id);
      db.prepare('UPDATE users SET admin_last_login_at = ? WHERE id = ?').run(now(), user.id);
      db.prepare('DELETE FROM admin_mfa_challenges WHERE user_id = ?').run(user.id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    if (ctx.sessionHash) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(ctx.sessionHash); // sesiune nouă, curată
    app.startSession(ctx, user.id, { mfa: true });
    limits.adminLogin.reset(user.email);
    limits.adminCode.reset(String(user.id));
    if (setup) audit(user, 'enable_2fa', ctx.ip);
    audit(user, 'admin_login', ctx.ip);
    return { ok: true, email: user.email, name: user.name };
  }, { auth: false });
}
