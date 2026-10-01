// Conturi: înregistrare, conectare, deconectare, recuperarea și schimbarea parolei.
import { HttpError, badRequest } from '../http.js';
import { validate, rules, isValidTimeZone } from '../validate.js';
import { hashPassword, verifyPassword, newToken, hashToken } from '../security.js';
import { tx } from '../db.js';

const now = () => new Date().toISOString();
const RESET_TTL_MS = 60 * 60 * 1000;

export function registerAuthRoutes(router, app) {
  const { db, config, mailer, limits } = app;
  // Hash fictiv, calculat o singură dată: conectarea cu un email inexistent durează la fel de mult.
  const dummyHash = hashPassword('parola-fictiva-pentru-timp-constant', config.scryptCost);

  router.on('POST', '/api/auth/register', async ctx => {
    if (limits.signup.blocked(ctx.ip)) throw tooMany();
    const data = validate(ctx.body, {
      name: rules.str({ max: 30 }),
      email: rules.email(),
      password: rules.password(),
      terms: rules.bool(),
    });
    if (!data.terms) throw badRequest('Trebuie să accepți termenii pentru a continua.', { terms: 'Bifează pentru a continua.' });
    const timezone = isValidTimeZone(ctx.body.timezone) ? ctx.body.timezone : 'Europe/Bucharest';
    limits.signup.hit(ctx.ip);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(data.email)) {
      throw new HttpError(409, 'email_taken', 'Există deja un cont cu acest email.', { email: 'Există deja un cont cu acest email. Conectează-te sau recuperează parola.' });
    }
    const hash = await hashPassword(data.password, config.scryptCost);
    const userId = tx(db, () => {
      const t = now();
      const { lastInsertRowid } = db.prepare('INSERT INTO users (email, password_hash, name, timezone, terms_accepted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(data.email, hash, data.name, timezone, t, t, t);
      db.prepare('INSERT INTO profiles (user_id, updated_at) VALUES (?, ?)').run(lastInsertRowid, t);
      db.prepare("INSERT INTO subscriptions (user_id, status, updated_at) VALUES (?, 'none', ?)").run(lastInsertRowid, t);
      return Number(lastInsertRowid);
    });
    app.startSession(ctx, userId);
    ctx.status = 201;
    return app.me(userId);
  }, { auth: false });

  router.on('POST', '/api/auth/login', async ctx => {
    const email = typeof ctx.body.email === 'string' ? ctx.body.email.trim().toLowerCase() : '';
    const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
    const key = `${ctx.ip}|${email}`;
    if (limits.login.blocked(key) || limits.loginIp.blocked(ctx.ip)) throw tooMany();
    if (!email || !password) throw badRequest('Completează emailul și parola.', {
      ...(!email ? { email: 'Completează adresa de email.' } : {}),
      ...(!password ? { password: 'Completează parola.' } : {}),
    });
    const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
    const ok = user ? await verifyPassword(password, user.password_hash) : (await verifyPassword(password, await dummyHash), false);
    if (!ok) {
      limits.login.hit(key);
      limits.loginIp.hit(ctx.ip);
      throw new HttpError(401, 'invalid_credentials', 'Emailul sau parola nu sunt corecte.');
    }
    limits.login.reset(key);
    app.startSession(ctx, user.id);
    return app.me(user.id);
  }, { auth: false });

  router.on('POST', '/api/auth/logout', ctx => {
    if (ctx.sessionHash) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(ctx.sessionHash);
    app.clearSessionCookie(ctx);
    return { ok: true };
  }, { auth: false });

  router.on('POST', '/api/auth/forgot', async ctx => {
    if (limits.forgot.blocked(ctx.ip)) throw tooMany();
    const { email } = validate(ctx.body, { email: rules.email() });
    limits.forgot.hit(ctx.ip);
    const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
    if (user) {
      const { token, hash } = newToken();
      tx(db, () => {
        db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id); // doar ultimul link rămâne valabil
        db.prepare('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
          .run(hash, user.id, now(), new Date(Date.now() + RESET_TTL_MS).toISOString());
      });
      await mailer.send({
        to: email,
        subject: 'Resetarea parolei Metamorf',
        text: `Bună, ${user.name}!\n\nAm primit o cerere de resetare a parolei. Deschide linkul de mai jos în cel mult o oră:\n\n${config.appUrl}/#resetare/${token}\n\nDacă nu ai cerut resetarea, ignoră acest mesaj; parola rămâne neschimbată.`,
      });
    }
    // Același răspuns indiferent dacă emailul există, ca să nu dezvăluim conturile.
    return { ok: true, message: 'Dacă există un cont cu acest email, am trimis un link de resetare valabil o oră.' };
  }, { auth: false });

  router.on('POST', '/api/auth/reset', async ctx => {
    const { token, password } = validate(ctx.body, { token: rules.str({ max: 100 }), password: rules.password() });
    const row = db.prepare('SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?').get(hashToken(token));
    if (!row || row.used_at || row.expires_at < now()) {
      throw new HttpError(400, 'invalid_token', 'Linkul de resetare nu mai este valabil. Cere unul nou.');
    }
    const hash = await hashPassword(password, config.scryptCost);
    tx(db, () => {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, now(), row.user_id);
      db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(now(), hashToken(token));
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id); // deconectează toate dispozitivele
    });
    app.startSession(ctx, row.user_id);
    return app.me(row.user_id);
  }, { auth: false });

  router.on('POST', '/api/account/password', async ctx => {
    const data = validate(ctx.body, { current: rules.str({ max: 200 }), next: rules.password() });
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(ctx.user.id);
    if (!(await verifyPassword(data.current, user.password_hash))) {
      throw badRequest('Parola actuală nu este corectă.', { current: 'Parola actuală nu este corectă.' });
    }
    const hash = await hashPassword(data.next, config.scryptCost);
    tx(db, () => {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, now(), ctx.user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(ctx.user.id, ctx.sessionHash);
    });
    return { ok: true };
  });

  router.on('DELETE', '/api/account', async ctx => {
    const { password } = validate(ctx.body, { password: rules.str({ max: 200 }) });
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(ctx.user.id);
    if (!(await verifyPassword(password, user.password_hash))) {
      throw badRequest('Parola nu este corectă.', { password: 'Parola nu este corectă.' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(ctx.user.id); // restul datelor se șterg în cascadă
    app.clearSessionCookie(ctx);
    return { ok: true };
  });
}

const tooMany = () => new HttpError(429, 'rate_limited', 'Prea multe încercări. Așteaptă câteva minute și încearcă din nou.');
