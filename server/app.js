// Aplicația HTTP: sesiuni, protecție CSRF, rutare API și fișiere statice din `public/`.
import { createServer } from 'node:http';
import { Router, HttpError, readJson, sendJson, sendError, parseCookies, cookie, securityHeaders, serveStatic } from './http.js';
import { newToken, hashToken, RateLimiter } from './security.js';
import { todayIn } from './validate.js';
import { createMailer } from './mailer.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDataRoutes, profileOut, targetsOut } from './routes/data.js';

const SESSION_COOKIE = 'mm_sid';

export function createApp(config, { db, mailer = createMailer(config) }) {
  const router = new Router();
  const app = {
    db, config, mailer, router,
    limits: {
      login: new RateLimiter(8, 15 * 60 * 1000),     // per IP + email
      loginIp: new RateLimiter(50, 15 * 60 * 1000),  // per IP
      signup: new RateLimiter(20, 60 * 60 * 1000),
      forgot: new RateLimiter(10, 60 * 60 * 1000),
    },

    startSession(ctx, userId) {
      const { token, hash } = newToken();
      const maxAge = config.sessionDays * 86400;
      db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)')
        .run(hash, userId, new Date().toISOString(), new Date(Date.now() + maxAge * 1000).toISOString(), String(ctx.req.headers['user-agent'] || '').slice(0, 200));
      ctx.cookies.push(cookie(SESSION_COOKIE, token, { maxAge, secure: config.cookieSecure }));
      ctx.sessionHash = hash;
    },

    clearSessionCookie(ctx) {
      ctx.cookies.push(cookie(SESSION_COOKIE, '', { maxAge: 0, secure: config.cookieSecure }));
    },

    /** Tot ce are nevoie frontendul despre utilizatorul conectat. */
    me(userId) {
      const u = db.prepare('SELECT id, email, name, timezone, created_at FROM users WHERE id = ?').get(userId);
      const s = db.prepare('SELECT plan, status, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = ?').get(userId);
      return {
        user: { id: u.id, email: u.email, name: u.name, timezone: u.timezone, createdAt: u.created_at },
        profile: profileOut(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId)),
        targets: targetsOut(db.prepare('SELECT * FROM targets WHERE user_id = ?').get(userId)),
        subscription: subscriptionOut(s),
        today: todayIn(u.timezone),
      };
    },
  };

  registerAuthRoutes(router, app);
  registerDataRoutes(router, app);

  function currentSession(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const hash = hashToken(token);
    const row = db.prepare(`SELECT s.token_hash, s.expires_at, u.id, u.email, u.name, u.timezone
      FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(hash);
    if (!row) return null;
    if (row.expires_at < new Date().toISOString()) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
      return null;
    }
    return { hash, user: { id: row.id, email: row.email, name: row.name, timezone: row.timezone } };
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
      if (found.route.auth && !ctx.user) throw new HttpError(401, 'unauthenticated', 'Trebuie să fii conectat. Conectează-te din nou.');
      ctx.params = found.params;
      ctx.body = await readJson(req);
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
    if (serveStatic(req, res, config.publicDir, url.pathname)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Pagina nu există.');
  });

  // Curățare periodică a sesiunilor și linkurilor de resetare expirate.
  const cleanup = () => {
    const t = new Date().toISOString();
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(t);
    db.prepare('DELETE FROM password_resets WHERE expires_at < ? OR used_at IS NOT NULL').run(t);
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
