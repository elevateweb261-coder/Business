// Aplicația HTTP: sesiuni, protecție CSRF, rutare API și fișiere statice din `public/`.
import { createServer } from 'node:http';
import { Router, HttpError, readJson, readRaw, sendJson, sendError, parseCookies, cookie, securityHeaders, serveStatic, serveUpload } from './http.js';
import { join } from 'node:path';
import { newToken, hashToken, RateLimiter } from './security.js';
import { todayIn } from './validate.js';
import { createMailer } from './mailer.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDataRoutes, profileOut, targetsOut } from './routes/data.js';
import { registerPlanRoutes } from './routes/plan.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAdminAuthRoutes } from './routes/admin-auth.js';
import { registerRequestRoutes } from './routes/admin-requests.js';
import { registerRecipeRoutes } from './routes/admin-recipes.js';
import { registerExerciseRoutes } from './routes/admin-exercises.js';
import { registerFoodRoutes } from './routes/admin-foods.js';
import { registerMediaRoutes } from './routes/admin-media.js';
import { registerBillingRoutes } from './routes/admin-billing.js';
import { registerStaffRoutes } from './routes/admin-staff.js';
import { initCatalogs } from './catalog.js';
import { loadSecretKey } from './secret.js';
import { createPlanService } from './plan/service.js';

const SESSION_COOKIE = 'mm_sid';

export function createApp(config, { db, mailer = createMailer(config), aiProvider }) {
  const router = new Router();
  const app = {
    db, config, mailer, router,
    limits: {
      login: new RateLimiter(8, 15 * 60 * 1000),     // per IP + email
      loginIp: new RateLimiter(50, 15 * 60 * 1000),  // per IP
      signup: new RateLimiter(20, 60 * 60 * 1000),
      forgot: new RateLimiter(10, 60 * 60 * 1000),
      adminLogin: new RateLimiter(5, 15 * 60 * 1000),   // per email: parola greșită
      adminLoginIp: new RateLimiter(20, 15 * 60 * 1000),
      adminCode: new RateLimiter(10, 15 * 60 * 1000),   // per cont: coduri 2FA greșite
    },

    /** `mfa: true` = sesiune care a trecut de autentificarea în doi pași (necesară pentru panoul de administrare). */
    startSession(ctx, userId, { mfa = false } = {}) {
      const { token, hash } = newToken();
      // Sesiunile de administrare expiră mai repede (12 ore).
      const maxAge = mfa ? 12 * 3600 : config.sessionDays * 86400;
      db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent, mfa_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(hash, userId, new Date().toISOString(), new Date(Date.now() + maxAge * 1000).toISOString(), String(ctx.req.headers['user-agent'] || '').slice(0, 200), mfa ? new Date().toISOString() : null);
      ctx.cookies.push(cookie(SESSION_COOKIE, token, { maxAge, secure: config.cookieSecure }));
      ctx.sessionHash = hash;
    },

    clearSessionCookie(ctx) {
      ctx.cookies.push(cookie(SESSION_COOKIE, '', { maxAge: 0, secure: config.cookieSecure }));
    },

    /** Tot ce are nevoie frontendul despre utilizatorul conectat. */
    me(userId) {
      const u = db.prepare('SELECT id, email, name, timezone, created_at, role FROM users WHERE id = ?').get(userId);
      const s = db.prepare('SELECT plan, status, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = ?').get(userId);
      return {
        user: { id: u.id, email: u.email, name: u.name, timezone: u.timezone, createdAt: u.created_at, role: u.role },
        profile: profileOut(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId)),
        targets: targetsOut(db.prepare('SELECT * FROM targets WHERE user_id = ?').get(userId)),
        subscription: subscriptionOut(s),
        today: todayIn(u.timezone),
      };
    },
  };

  app.secretKey = loadSecretKey(config);
  initCatalogs(db, config); // exercițiile și alimentele din baza de date → catalogul activ al planurilor
  app.plans = createPlanService({ db, config, ...(aiProvider !== undefined ? { provider: aiProvider } : {}) });

  registerAuthRoutes(router, app);
  registerDataRoutes(router, app);
  registerPlanRoutes(router, app);
  registerAdminAuthRoutes(router, app);
  registerAdminRoutes(router, app);
  registerRequestRoutes(router, app);
  registerRecipeRoutes(router, app);
  registerExerciseRoutes(router, app);
  registerFoodRoutes(router, app);
  registerMediaRoutes(router, app);
  registerBillingRoutes(router, app);
  registerStaffRoutes(router, app);

  function currentSession(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const hash = hashToken(token);
    const row = db.prepare(`SELECT s.token_hash, s.expires_at, s.mfa_at, u.id, u.email, u.name, u.timezone, u.role, u.admin_role, u.admin_disabled_at, u.last_seen_at
      FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(hash);
    if (!row) return null;
    const nowIso = new Date().toISOString();
    if (row.expires_at < nowIso) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
      return null;
    }
    // Ultima activitate: actualizată cel mult o dată pe oră (pentru statisticile de administrare).
    if (!row.last_seen_at || Date.parse(nowIso) - Date.parse(row.last_seen_at) > 3600e3) {
      db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(nowIso, row.id);
    }
    // Conturile de echipă primesc rolul din panou (admin / editor / support); cele dezactivate nu au niciun rol.
    const role = row.role !== 'admin' ? row.role : row.admin_disabled_at ? null : (row.admin_role || 'admin');
    return { hash, mfa: !!row.mfa_at, user: { id: row.id, email: row.email, name: row.name, timezone: row.timezone, role } };
  }

  /** Protecție CSRF: cererile care modifică date trebuie să vină din aplicație (antet propriu + Origin corect). */
  function checkCsrf(req) {
    if (req.method === 'GET' || req.method === 'HEAD') return;
    if (req.headers['x-metamorf'] !== '1') throw new HttpError(403, 'csrf', 'Cerere respinsă din motive de securitate.');
    const origin = req.headers.origin;
    if (origin && origin !== config.appUrl && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
      throw new HttpError(403, 'csrf', 'Cerere respinsă din motive de securitate.');
    }
  }

  async function handleApi(req, res, url) {
    const ctx = { req, res, url, cookies: [], headers: {}, status: 200, ip: clientIp(req, config) };
    try {
      const found = router.match(req.method, url.pathname);
      if (!found) throw new HttpError(404, 'not_found', 'Adresă API inexistentă.');
      if (found === 'method') throw new HttpError(405, 'method_not_allowed', 'Metodă nepermisă.');
      checkCsrf(req);
      const session = currentSession(req);
      ctx.sessionHash = session?.hash;
      ctx.user = session?.user;
      ctx.mfa = !!session?.mfa;
      if (found.route.auth && !ctx.user) throw new HttpError(401, 'unauthenticated', 'Trebuie să fii conectat. Conectează-te din nou.');
      ctx.params = found.params;
      ctx.body = found.route.raw ? await readRaw(req, found.route.maxBytes) : await readJson(req);
      const result = await found.route.handler(ctx);
      if (ctx.cookies.length) ctx.headers['Set-Cookie'] = ctx.cookies;
      sendJson(res, ctx.status, result, ctx.headers);
    } catch (err) {
      if (ctx.cookies.length) res.setHeader('Set-Cookie', ctx.cookies);
      sendError(res, err);
    }
  }

  const server = createServer(async (req, res) => {
    securityHeaders(res);
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400).end(); return; }
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    for (const folder of ['recipes', 'library']) {
      const prefix = `/media/${folder}/`;
      if (url.pathname.startsWith(prefix) && serveUpload(req, res, join(config.uploadsDir, folder), url.pathname.slice(prefix.length))) return;
    }
    if (serveStatic(req, res, config.publicDir, url.pathname)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Pagina nu există.');
  });

  // Curățare periodică a sesiunilor și linkurilor de resetare expirate.
  const cleanup = () => {
    const t = new Date().toISOString();
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(t);
    db.prepare('DELETE FROM password_resets WHERE expires_at < ? OR used_at IS NOT NULL').run(t);
    db.prepare('DELETE FROM admin_mfa_challenges WHERE expires_at < ?').run(t);
  };
  cleanup();
  const timer = setInterval(cleanup, 60 * 60 * 1000);
  timer.unref();
  server.on('close', () => clearInterval(timer));

  return { server, app };
}

function subscriptionOut(s) {
  const end = s?.current_period_end;
  const inPeriod = !!end && end > new Date().toISOString();
  // Premium doar cu abonament activ și perioadă plătită neexpirată. Un abonament anulat rămâne activ până la final.
  const premium = !!s && ['active', 'trialing', 'canceled'].includes(s.status) && inPeriod;
  return { status: s?.status || 'none', plan: s?.plan || null, currentPeriodEnd: end || null, cancelAtPeriodEnd: !!s?.cancel_at_period_end, premium };
}

function clientIp(req, config) {
  if (config.trustProxy) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || 'unknown';
}
