// Panoul de administrare. Rutele cer un cont de echipă conectat cu 2FA și rolul potrivit (admin / editor / support).
// Principii:
//  - minimizarea datelor: administratorul NU vede alergii, limitări fizice, parole sau conținutul jurnalului;
//  - fiecare acțiune (inclusiv deschiderea detaliilor unui cont și exportul) se înregistrează în admin_audit;
//  - starea abonamentelor nu se modifică manual: ea vine doar din notificările verificate ale procesatorului de plăți.
import { HttpError, badRequest, notFound } from '../http.js';
import { validate, rules } from '../validate.js';
import { planEligibility } from '../options.js';
import { buildExport } from './data.js';
import { sendResetLink } from './auth.js';
import { buildDashboard } from '../admin-dashboard.js';
import { recordCompletedRequest } from '../data-requests.js';
import { adminHelpers, ALL_STAFF } from '../admin-common.js';
import { getSettings } from '../settings.js';

const STAFF = { roles: ALL_STAFF };
const SUPPORT = { roles: ['admin', 'support'] };

/** Începutul zilei `day` (AAAA-LL-ZZ) în fusul orar dat, ca ISO UTC. */
function zonedDayStart(day, tz) {
  const utc = Date.parse(`${day}T00:00:00Z`);
  const v = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(utc)).map(x => [x.type, x.value]));
  const offset = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - utc;
  return new Date(utc - offset).toISOString();
}
const nextDay = day => new Date(Date.parse(`${day}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);

const now = () => new Date().toISOString();
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();

// Prețuri pe milion de tokeni (USD), pentru estimarea costului AI. Nu include reducerile din cache.
const AI_PRICES = { 'claude-opus-5-5': { input: 4, output: 20 } };
const estimateCost = (model, input, output) => {
  const p = AI_PRICES[model];
  return p ? Math.round(((input || 0) * p.input + (output || 0) * p.output) / 1e4) / 100 : null;
};

export function registerAdminRoutes(router, app) {
  const { db } = app;

  // Verificarea rolului și a sesiunii 2FA + jurnalul de audit (cu IP), comune tuturor rutelor de administrare.
  const { on, audit } = adminHelpers(app);

  const targetUser = ctx => {
    const u = db.prepare('SELECT id, email, name, role, timezone, created_at, last_seen_at FROM users WHERE id = ?').get(Number(ctx.params.id));
    if (!u) throw notFound('Contul nu există.');
    return u;
  };

  const subscriptionOf = s => {
    const premium = !!s && ['active', 'trialing', 'canceled'].includes(s.status) && !!s.current_period_end && s.current_period_end > now();
    return { status: s?.status || 'none', plan: s?.plan || null, currentPeriodEnd: s?.current_period_end || null, premium };
  };

  // ---------- Identitate ----------

  on('GET', '/api/admin/me', ctx => ({ email: ctx.user.email, name: ctx.user.name, role: ctx.user.role }), STAFF);

  // ---------- Prezentare generală ----------

  // Panoul principal (ecranul 2). Venitul este inclus doar pentru rolul „admin” (decis în buildDashboard).
  on('GET', '/api/admin/dashboard', ctx => buildDashboard(db, {
    period: ctx.url.searchParams.get('period') || 'month',
    role: ctx.user.role,
    tz: app.config.adminTimezone,
  }), STAFF);

  on('GET', '/api/admin/overview', () => {
    const one = (sql, ...args) => db.prepare(sql).get(...args).n;
    const users = one('SELECT COUNT(*) n FROM users');
    const onboarded = one('SELECT COUNT(*) n FROM profiles WHERE onboarding_done_at IS NOT NULL');
    const eligibility = { eligible: 0, minor: 0, specialist: 0, incomplete: 0 };
    for (const p of db.prepare('SELECT age, allergies, health_notes, onboarding_done_at FROM profiles').all()) eligibility[planEligibility(p)]++;
    const premium = db.prepare('SELECT status, current_period_end FROM subscriptions').all().filter(s => subscriptionOf(s).premium).length;

    // Înregistrări noi pe zi, ultimele 30 de zile (UTC)
    const signups = Object.fromEntries(db.prepare(`SELECT substr(created_at, 1, 10) d, COUNT(*) n FROM users
      WHERE created_at >= ? GROUP BY d`).all(daysAgo(30)).map(r => [r.d, r.n]));
    const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10));

    const ai = db.prepare(`SELECT kind, ok, model, COALESCE(SUM(input_tokens), 0) i, COALESCE(SUM(output_tokens), 0) o, COUNT(*) n
      FROM ai_requests WHERE created_at >= ? GROUP BY kind, ok, model`).all(daysAgo(30));
    const aiTotals = ai.reduce((t, r) => ({
      requests: t.requests + r.n,
      failed: t.failed + (r.ok ? 0 : r.n),
      weekPlans: t.weekPlans + (r.ok && r.kind === 'week' ? r.n : 0),
      inputTokens: t.inputTokens + r.i,
      outputTokens: t.outputTokens + r.o,
      costUsd: t.costUsd + (estimateCost(r.model, r.i, r.o) || 0),
    }), { requests: 0, failed: 0, weekPlans: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    aiTotals.costUsd = Math.round(aiTotals.costUsd * 100) / 100;

    return {
      users: {
        total: users,
        new7: one('SELECT COUNT(*) n FROM users WHERE created_at >= ?', daysAgo(7)),
        new30: one('SELECT COUNT(*) n FROM users WHERE created_at >= ?', daysAgo(30)),
        active7: one('SELECT COUNT(*) n FROM users WHERE last_seen_at >= ?', daysAgo(7)),
        onboarded,
        admins: one("SELECT COUNT(*) n FROM users WHERE role = 'admin'"),
      },
      eligibility,
      premium,
      activity7: {
        foodEntries: one('SELECT COUNT(*) n FROM food_entries WHERE created_at >= ?', daysAgo(7)),
        workouts: one('SELECT COUNT(*) n FROM workout_sessions WHERE created_at >= ?', daysAgo(7)),
        weights: one('SELECT COUNT(*) n FROM weights WHERE created_at >= ?', daysAgo(7)),
        plans: one('SELECT COUNT(*) n FROM plans WHERE created_at >= ?', daysAgo(7)),
      },
      ai30: aiTotals,
      aiProvider: app.plans.provider?.label ?? null,
      signups: days.map(d => ({ day: d, count: signups[d] || 0 })),
    };
  }, STAFF);

  // ---------- Utilizatori (ecranul 3) ----------

  const PLAN_LABELS = { '1_luna': '1 lună', '3_luni': '3 luni', '6_luni': '6 luni' };
  const PLAN_MONTHS = { '1_luna': 1, '3_luni': 3, '6_luni': 6 };

  // Ultima activitate: cea mai recentă dintre conectare, jurnal, antrenamente, greutate, apă, sarcini.
  const LAST_ACTIVITY = `MAX(COALESCE(u.last_seen_at, ''),
      COALESCE((SELECT MAX(created_at) FROM food_entries f WHERE f.user_id = u.id), ''),
      COALESCE((SELECT MAX(created_at) FROM workout_sessions w WHERE w.user_id = u.id), ''),
      COALESCE((SELECT MAX(created_at) FROM weights g WHERE g.user_id = u.id), ''),
      COALESCE((SELECT MAX(updated_at) FROM water_days a WHERE a.user_id = u.id), ''),
      COALESCE((SELECT MAX(done_at) FROM plan_task_done t WHERE t.user_id = u.id), ''))`;

  /** Începutul unei zile (AAAA-LL-ZZ) în fusul orar al administrării, ca moment UTC. */
  const dayStartIso = (day, tz = app.config.adminTimezone) => {
    const guess = Date.parse(`${day}T00:00:00Z`);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess)).map(x => [x.type, x.value]));
    const asTz = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
    return new Date(guess - (asTz - guess)).toISOString();
  };
  const nextDay = day => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

  on('GET', '/api/admin/users', ctx => {
    const sp = ctx.url.searchParams;
    const q = (sp.get('q') || '').trim().slice(0, 100);
    const plan = sp.get('plan') || 'all';            // all | free | premium
    const elig = sp.get('elig') || 'all';            // all | eligible | separate | incomplete
    const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('from') || '') ? sp.get('from') : null;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('to') || '') ? sp.get('to') : null;
    const page = Math.max(1, Number.parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = 20;
    const nowIso = now();
    const premiumSql = "(s.status IN ('active', 'trialing', 'canceled') AND s.current_period_end > ?)";
    const where = ["u.role = 'user'"]; // lista de clienți; administratorii au secțiunea lor
    const args = [];
    if (q) { where.push('(u.email LIKE ? OR u.name LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
    if (plan === 'premium') { where.push(premiumSql); args.push(nowIso); }
    if (plan === 'free') { where.push(`NOT COALESCE(${premiumSql}, 0)`); args.push(nowIso); }
    if (elig === 'incomplete') where.push('p.onboarding_done_at IS NULL');
    if (elig === 'separate') where.push('p.onboarding_done_at IS NOT NULL AND (p.age < 18 OR p.allergies IS NOT NULL OR p.health_notes IS NOT NULL)');
    if (elig === 'eligible') where.push('p.onboarding_done_at IS NOT NULL AND NOT (p.age < 18) AND p.allergies IS NULL AND p.health_notes IS NULL');
    if (from) { where.push('u.created_at >= ?'); args.push(dayStartIso(from)); }
    if (to) { where.push('u.created_at < ?'); args.push(dayStartIso(nextDay(to))); }
    const sqlWhere = `WHERE ${where.join(' AND ')}`;
    const fromSql = 'FROM users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN subscriptions s ON s.user_id = u.id';
    const total = db.prepare(`SELECT COUNT(*) n ${fromSql} ${sqlWhere}`).get(...args).n;
    const rows = db.prepare(`SELECT u.id, u.email, u.name, u.created_at, ${LAST_ACTIVITY} AS last_activity,
        p.age, p.allergies, p.health_notes, p.onboarding_done_at, s.status, s.plan, s.current_period_end, s.provider
      ${fromSql} ${sqlWhere} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
    return {
      total, page, pageSize,
      users: rows.map(r => ({
        id: r.id, email: r.email, name: r.name, createdAt: r.created_at, lastActivityAt: r.last_activity || null,
        // Doar categoria de eligibilitate (fără detaliile de sănătate care au dus la ea).
        eligibility: planEligibility(r),
        subscription: { ...subscriptionOf(r), planLabel: PLAN_LABELS[r.plan] || null, manual: r.provider === 'manual' },
      })),
    };
  }, SUPPORT);

  on('GET', '/api/admin/users/:id', ctx => {
    const u = targetUser(ctx);
    const full = db.prepare(`SELECT u.email_verified_at, ${LAST_ACTIVITY} AS last_activity FROM users u WHERE u.id = ?`).get(u.id);
    const p = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(u.id);
    const s = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(u.id);
    const sub = subscriptionOf(s);
    const count = table => db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE user_id = ?`).get(u.id).n;
    const userToday = new Intl.DateTimeFormat('en-CA', { timeZone: u.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const scans = db.prepare('SELECT count FROM scan_usage WHERE user_id = ? AND day = ?').get(u.id, userToday)?.count || 0;
    const settings = getSettings(db);
    audit(ctx, 'view_user', u);
    return {
      account: {
        id: u.id, email: u.email, name: u.name, role: u.role, timezone: u.timezone, createdAt: u.created_at,
        lastActivityAt: full.last_activity || null, emailVerified: !!full.email_verified_at, emailVerifiedAt: full.email_verified_at,
      },
      // Fără date de sănătate: nici alergii, nici limitări, nici greutate/înălțime/vârstă. Doar categoria și existența acordului.
      profile: {
        onboardingDone: !!p?.onboarding_done_at,
        step: p?.onboarding_step ?? 0,
        goal: p?.goal ?? null, diet: p?.diet ?? null, location: p?.location ?? null, experience: p?.experience ?? null,
        eligibility: planEligibility(p),
      },
      health: { protected: true, consent: !!p?.health_consent_at, canRequestAccess: ctx.user.role === 'admin' },
      targetsSet: !!db.prepare('SELECT 1 FROM targets WHERE user_id = ?').get(u.id),
      subscription: { ...sub, planLabel: PLAN_LABELS[s?.plan] || null, provider: s?.provider || null, cancelAtPeriodEnd: !!s?.cancel_at_period_end },
      subscriptionHistory: db.prepare('SELECT type, source, plan, status, period_end, reason, actor_email, created_at FROM subscription_events WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(u.id)
        .map(e => ({ ...e, planLabel: PLAN_LABELS[e.plan] || e.plan })),
      scansToday: { used: scans, limit: sub.premium ? settings.scanLimitPremium : settings.scanLimitFree, day: userToday },
      counts: {
        foodEntries: count('food_entries'), workouts: count('workout_sessions'), weights: count('weights'),
        plans: count('plans'), sessions: db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND expires_at > ?').get(u.id, now()).n,
      },
      plans: db.prepare('SELECT week_start, week_index, source, model, created_at FROM plans WHERE user_id = ? ORDER BY week_start DESC LIMIT 8').all(u.id).map(r => ({ ...r })),
      aiRequests: db.prepare('SELECT kind, provider, model, ok, attempts, input_tokens, output_tokens, error, created_at FROM ai_requests WHERE user_id = ? ORDER BY id DESC LIMIT 10').all(u.id)
        .map(r => ({ ...r, error: r.error ? r.error.split(':')[0] : null })),
    };
  }, SUPPORT);

  // Premium acordat manual (de ex. compensație sau parteneriat). Motiv obligatoriu; apare în istoric și în audit.
  // Se adaugă la perioada deja plătită, dacă există. Nu creează plăți și nu modifică facturarea.
  on('POST', '/api/admin/users/:id/premium', ctx => {
    const u = targetUser(ctx);
    if (u.role !== 'user') throw badRequest('Premium se acordă doar conturilor de clienți.');
    const d = validate(ctx.body, {
      plan: rules.oneOf(Object.keys(PLAN_MONTHS)),
      reason: rules.str({ min: 10, max: 300 }),
    });
    const s = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(u.id);
    const base = s && subscriptionOf(s).premium ? new Date(s.current_period_end) : new Date();
    const end = new Date(base);
    end.setUTCMonth(end.getUTCMonth() + PLAN_MONTHS[d.plan]);
    const endIso = end.toISOString();
    db.exec('BEGIN');
    try {
      db.prepare(`INSERT INTO subscriptions (user_id, plan, status, current_period_end, cancel_at_period_end, provider, updated_at)
        VALUES (?, ?, 'active', ?, 0, 'manual', ?)
        ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = 'active', current_period_end = excluded.current_period_end,
          cancel_at_period_end = 0, provider = 'manual', updated_at = excluded.updated_at`).run(u.id, d.plan, endIso, now());
      db.prepare(`INSERT INTO subscription_events (user_id, type, source, plan, status, period_end, reason, actor_id, actor_email, created_at)
        VALUES (?, 'manual_grant', 'admin', ?, 'active', ?, ?, ?, ?, ?)`).run(u.id, d.plan, endIso, d.reason, ctx.user.id, ctx.user.email, now());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    audit(ctx, 'grant_premium', u, { plan: d.plan, until: endIso, reason: d.reason });
    return { ok: true, until: endIso };
  });

  // Acces la datele de sănătate: doar rolul „admin”, doar cu motiv, întotdeauna înregistrat în audit.
  on('POST', '/api/admin/users/:id/health-access', ctx => {
    if (ctx.user.role !== 'admin') throw new HttpError(403, 'forbidden', 'Doar administratorii pot solicita accesul la datele de sănătate.');
    const u = targetUser(ctx);
    const { reason } = validate(ctx.body, { reason: rules.str({ min: 15, max: 300 }) });
    const p = db.prepare('SELECT age, sex, height_cm, weight_kg, allergies, health_notes, health_consent_at FROM profiles WHERE user_id = ?').get(u.id);
    const lastWeight = db.prepare('SELECT measured_at, kg FROM weights WHERE user_id = ? ORDER BY measured_at DESC LIMIT 1').get(u.id);
    audit(ctx, 'health_access', u, { reason });
    return {
      consent: !!p?.health_consent_at,
      consentAt: p?.health_consent_at || null,
      allergies: p?.allergies || null,
      limitations: p?.health_notes || null,
      age: p?.age ?? null,
      heightCm: p?.height_cm ?? null,
      weightKg: p?.weight_kg ?? null,
      lastWeight: lastWeight ? { at: lastWeight.measured_at, kg: lastWeight.kg } : null,
    };
  });

  on('GET', '/api/admin/users/:id/export', ctx => {
    const u = targetUser(ctx);
    audit(ctx, 'export_user', u);
    ctx.headers['Content-Disposition'] = `attachment; filename="metamorf-export-${u.id}.json"`;
    return buildExport(db, u.id);
  }, SUPPORT);

  on('POST', '/api/admin/users/:id/logout', ctx => {
    const u = targetUser(ctx);
    const { changes } = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    audit(ctx, 'logout_user', u, { sessions: Number(changes) });
    return { ok: true, sessions: Number(changes) };
  }, SUPPORT);

  on('POST', '/api/admin/users/:id/reset-link', async ctx => {
    const u = targetUser(ctx);
    await sendResetLink(app, u);
    audit(ctx, 'send_reset_link', u);
    return { ok: true, message: `Am trimis un link de resetare la ${u.email}.` };
  }, SUPPORT);

  on('DELETE', '/api/admin/users/:id', ctx => {
    const u = targetUser(ctx);
    const { confirmEmail } = validate(ctx.body, { confirmEmail: rules.str({ max: 254 }) });
    if (u.id === ctx.user.id) throw badRequest('Nu îți poți șterge propriul cont din panou. Folosește setările contului.');
    if (u.role === 'admin') throw badRequest('Conturile de administrator nu pot fi șterse din panou. Retrage întâi rolul (npm run admin).');
    if (confirmEmail.toLowerCase() !== u.email.toLowerCase()) throw badRequest('Emailul de confirmare nu corespunde.', { confirmEmail: 'Scrie exact adresa de email a contului.' });
    db.exec('BEGIN');
    try {
      recordCompletedRequest(db, {
        user: u, type: 'delete', source: 'admin', actorEmail: ctx.user.email,
        requestedMessage: 'Ștergere inițiată din pagina clientului, în panou (confirmată cu emailul clientului).',
        completedMessage: 'Contul și toate datele asociate au fost șterse definitiv.',
      });
      db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    audit(ctx, 'delete_user', u);
    return { ok: true };
  });

  // ---------- AI ----------

  on('GET', '/api/admin/ai', () => {
    const rows = db.prepare(`SELECT a.id, a.kind, a.provider, a.model, a.ok, a.attempts, a.input_tokens, a.output_tokens, a.error, a.created_at, u.email
      FROM ai_requests a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 100`).all();
    const daily = db.prepare(`SELECT substr(created_at, 1, 10) day, model, COUNT(*) n, SUM(ok) ok,
        COALESCE(SUM(input_tokens), 0) i, COALESCE(SUM(output_tokens), 0) o
      FROM ai_requests WHERE created_at >= ? GROUP BY day, model ORDER BY day DESC`).all(daysAgo(30));
    return {
      prices: AI_PRICES,
      requests: rows.map(r => ({
        id: r.id, createdAt: r.created_at, email: r.email, kind: r.kind, provider: r.provider, model: r.model,
        ok: !!r.ok, attempts: r.attempts, inputTokens: r.input_tokens, outputTokens: r.output_tokens,
        costUsd: estimateCost(r.model, r.input_tokens, r.output_tokens), error: r.error ? r.error.split(':')[0] : null,
      })),
      daily: daily.map(d => ({ day: d.day, model: d.model, requests: d.n, ok: d.ok, inputTokens: d.i, outputTokens: d.o, costUsd: estimateCost(d.model, d.i, d.o) })),
    };
  });

  // ---------- Jurnal de audit ----------

  on('GET', '/api/admin/audit', ctx => {
    const sp = ctx.url.searchParams;
    const page = Math.max(1, Number.parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = 50;
    const where = [], args = [];
    const admin = (sp.get('admin') || '').trim();
    if (admin) { where.push('admin_email = ?'); args.push(admin); }
    const action = (sp.get('action') || '').trim();
    if (action) { where.push('action = ?'); args.push(action); }
    const tz = app.config.adminTimezone;
    const day = /^\d{4}-\d{2}-\d{2}$/;
    const from = sp.get('from'), to = sp.get('to');
    if (day.test(from || '')) { where.push('created_at >= ?'); args.push(zonedDayStart(from, tz)); }
    if (day.test(to || '')) { where.push('created_at < ?'); args.push(zonedDayStart(nextDay(to), tz)); }
    const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) n FROM admin_audit ${sql}`).get(...args).n;
    const rows = db.prepare(`SELECT * FROM admin_audit ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
    return {
      total, page, pageSize, timezone: tz,
      admins: db.prepare('SELECT DISTINCT admin_email FROM admin_audit ORDER BY admin_email').all().map(r => r.admin_email),
      actions: db.prepare('SELECT DISTINCT action FROM admin_audit ORDER BY action').all().map(r => r.action),
      entries: rows.map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : null })),
    };
  });
}
