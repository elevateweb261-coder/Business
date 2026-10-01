// Datele utilizatorului: profil, ținte, jurnal alimentar, hidratare, antrenamente, greutate, export.
// Regula de bază: fiecare interogare conține `user_id = ctx.user.id` — un utilizator nu poate citi
// sau modifica datele altuia, nici ghicind un id.
import { HttpError, badRequest, notFound } from '../http.js';
import { validate, rules, todayIn, assertNotFuture, isValidTimeZone } from '../validate.js';
import { OPTIONS, ONBOARDING_STEPS, planEligibility } from '../options.js';

const now = () => new Date().toISOString();

// Câmpurile profilului: nume în API → coloană în baza de date.
const PROFILE_COLUMNS = {
  age: 'age', gender: 'sex', height: 'height_cm', weight: 'weight_kg', goal: 'goal', activity: 'activity',
  diet: 'diet', likes: 'likes', dislike: 'dislikes', location: 'location', equipment: 'equipment',
  experience: 'experience', days: 'days_per_week', minutes: 'session_minutes', allergies: 'allergies', health: 'health_notes',
};

const PROFILE_RULES = {
  age: rules.num({ min: 13, max: 100, int: true, optional: true }),
  gender: rules.oneOf(OPTIONS.gender, { optional: true }),
  height: rules.num({ min: 100, max: 230, optional: true, decimals: 0 }),
  weight: rules.num({ min: 30, max: 300, optional: true, decimals: 1 }),
  goal: rules.oneOf(OPTIONS.goal, { optional: true }),
  activity: rules.oneOf(OPTIONS.activity, { optional: true }),
  diet: rules.oneOf(OPTIONS.diet, { optional: true }),
  likes: rules.str({ max: 200, optional: true }),
  dislike: rules.str({ max: 200, optional: true }),
  location: rules.oneOf(OPTIONS.location, { optional: true }),
  equipment: rules.oneOf(OPTIONS.equipment, { optional: true }),
  experience: rules.oneOf(OPTIONS.experience, { optional: true }),
  days: v => rules.oneOf(OPTIONS.days, { optional: true })(v === '' || v == null ? v : Number(v)),
  minutes: v => rules.oneOf(OPTIONS.minutes, { optional: true })(v === '' || v == null ? v : Number(v)),
  allergies: rules.str({ max: 200, optional: true }),
  health: rules.str({ max: 300, optional: true }),
};

const REQUIRED_FOR_DONE = ['age', 'gender', 'height', 'weight', 'goal', 'activity', 'diet', 'location', 'experience', 'equipment', 'days', 'minutes'];

export function profileOut(p) {
  const out = {};
  for (const [api, col] of Object.entries(PROFILE_COLUMNS)) out[api] = p[col] ?? null;
  return {
    ...out,
    healthConsent: !!p.health_consent_at,
    step: p.onboarding_step,
    done: !!p.onboarding_done_at,
    eligibility: planEligibility(p),
  };
}

const foodOut = r => ({
  id: r.id, day: r.day, loggedAt: r.logged_at, name: r.name, grams: r.grams,
  kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, source: r.source, slot: r.plan_slot, mealRef: r.meal_ref,
});
const workoutOut = r => ({ id: r.id, day: r.day, durationS: r.duration_s, planRef: r.plan_ref, createdAt: r.created_at });
const weightOut = r => ({ id: r.id, at: r.measured_at, kg: r.kg });
const targetsOut = t => (t ? { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, water: t.water_ml } : null);

/** Data și ora curente (AAAA-LL-ZZTHH:MM) în fusul orar dat. */
function nowLocalIn(timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

const isUnique = err => /UNIQUE constraint failed/.test(err?.message || '');

export function registerDataRoutes(router, app) {
  const { db } = app;

  // ---------- Profil ----------

  router.on('GET', '/api/me', ctx => app.me(ctx.user.id));

  router.on('PUT', '/api/profile', ctx => {
    const body = ctx.body;
    const data = validate(body, PROFILE_RULES, { partial: true });
    const extra = validate(body, {
      name: rules.str({ max: 30 }),
      step: rules.num({ min: 0, max: ONBOARDING_STEPS, int: true }),
      done: rules.bool(),
      healthConsent: rules.bool(),
    }, { partial: true });
    const current = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(ctx.user.id);
    const sets = {};
    for (const [api, value] of Object.entries(data)) sets[PROFILE_COLUMNS[api]] = value;

    // Consimțământ pentru date de sănătate: fără el, alergiile și limitările nu se salvează.
    let consent = !!current.health_consent_at;
    if ('healthConsent' in extra) {
      consent = extra.healthConsent;
      sets.health_consent_at = consent ? (current.health_consent_at || now()) : null;
      if (!consent) { sets.allergies = null; sets.health_notes = null; }
    }
    if (!consent) {
      const fields = {};
      if (data.allergies) fields.allergies = 'Pentru a salva alergiile, bifează acordul pentru datele de sănătate.';
      if (data.health) fields.health = 'Pentru a salva limitările, bifează acordul pentru datele de sănătate.';
      if (Object.keys(fields).length) throw badRequest('Lipsește acordul pentru datele de sănătate.', fields);
    }
    if ('step' in extra) sets.onboarding_step = Math.max(current.onboarding_step, extra.step);
    if (extra.done) {
      const merged = { ...profileOut(current), ...data };
      const missing = REQUIRED_FOR_DONE.filter(k => merged[k] === null || merged[k] === undefined);
      if (missing.length) {
        throw badRequest('Chestionarul nu este complet.', Object.fromEntries(missing.map(k => [k, 'Completează acest câmp.'])));
      }
      sets.onboarding_done_at = current.onboarding_done_at || now();
      sets.onboarding_step = ONBOARDING_STEPS;
    }
    sets.updated_at = now();
    const cols = Object.keys(sets);
    db.prepare(`UPDATE profiles SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE user_id = ?`).run(...cols.map(c => sets[c]), ctx.user.id);
    if (extra.name) db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?').run(extra.name, now(), ctx.user.id);
    if (isValidTimeZone(body.timezone)) db.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(body.timezone, ctx.user.id);
    return app.me(ctx.user.id);
  });

  // ---------- Ținte zilnice (setate de utilizator) ----------

  router.on('PUT', '/api/targets', ctx => {
    const t = validate(ctx.body, {
      kcal: rules.num({ min: 800, max: 6000, int: true }),
      protein: rules.num({ min: 10, max: 400, int: true }),
      carbs: rules.num({ min: 10, max: 900, int: true }),
      fat: rules.num({ min: 10, max: 300, int: true }),
      water: rules.num({ min: 500, max: 6000, int: true }),
    });
    db.prepare(`INSERT INTO targets (user_id, kcal, protein, carbs, fat, water_ml, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET kcal = excluded.kcal, protein = excluded.protein, carbs = excluded.carbs,
      fat = excluded.fat, water_ml = excluded.water_ml, updated_at = excluded.updated_at`)
      .run(ctx.user.id, t.kcal, t.protein, t.carbs, t.fat, t.water, now());
    return { targets: t };
  });

  router.on('DELETE', '/api/targets', ctx => {
    db.prepare('DELETE FROM targets WHERE user_id = ?').run(ctx.user.id);
    return { targets: null };
  });

  // ---------- Starea pentru un interval de zile ----------

  router.on('GET', '/api/state', ctx => {
    const tz = ctx.user.timezone;
    const today = todayIn(tz);
    const q = validate({ from: ctx.url.searchParams.get('from') || today, to: ctx.url.searchParams.get('to') || today }, { from: rules.day(), to: rules.day() });
    if (q.from > q.to) throw badRequest('Interval invalid.');
    if ((Date.parse(q.to) - Date.parse(q.from)) / 864e5 > 400) throw badRequest('Intervalul poate avea cel mult 400 de zile.');
    const uid = ctx.user.id;
    const days = {};
    const day = d => (days[d] ||= { water: 0, log: [], workouts: [] });
    for (const r of db.prepare('SELECT * FROM food_entries WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY logged_at, id').all(uid, q.from, q.to)) day(r.day).log.push(foodOut(r));
    for (const r of db.prepare('SELECT day, ml FROM water_days WHERE user_id = ? AND day BETWEEN ? AND ?').all(uid, q.from, q.to)) day(r.day).water = r.ml;
    for (const r of db.prepare('SELECT * FROM workout_sessions WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY created_at').all(uid, q.from, q.to)) day(r.day).workouts.push(workoutOut(r));
    const weights = db.prepare('SELECT * FROM weights WHERE user_id = ? ORDER BY measured_at DESC, id DESC LIMIT 1000').all(uid).reverse().map(weightOut);
    const counts = db.prepare(`SELECT
        (SELECT COUNT(*) FROM food_entries WHERE user_id = ?) AS food,
        (SELECT COUNT(*) FROM workout_sessions WHERE user_id = ?) AS workouts,
        (SELECT COUNT(*) FROM weights WHERE user_id = ?) AS weights`).get(uid, uid, uid);
    return { from: q.from, to: q.to, today, days, weights, counts: { ...counts } };
  });

  // ---------- Jurnal alimentar ----------

  const FOOD_RULES = {
    name: rules.str({ max: 120 }),
    grams: rules.num({ min: 0, max: 5000, optional: true, decimals: 0 }),
    kcal: rules.num({ min: 0, max: 10000, decimals: 0 }),
    protein: rules.num({ min: 0, max: 1000, decimals: 1 }),
    carbs: rules.num({ min: 0, max: 1000, decimals: 1 }),
    fat: rules.num({ min: 0, max: 1000, decimals: 1 }),
  };

  router.on('POST', '/api/food', ctx => {
    const d = validate(ctx.body, {
      day: rules.day(),
      ...FOOD_RULES,
      // 'plan', 'barcode', 'photo' vor fi create doar de server, în etapele următoare.
      source: rules.oneOf(['manual', 'example']),
      slot: rules.num({ min: 0, max: 2, int: true, optional: true }),
      mealRef: rules.str({ max: 60, optional: true }),
      clientId: rules.clientId(),
    });
    assertNotFuture(d.day, ctx.user.timezone);
    const uid = ctx.user.id;
    if (d.clientId) {
      const existing = db.prepare('SELECT * FROM food_entries WHERE user_id = ? AND client_id = ?').get(uid, d.clientId);
      if (existing) return foodOut(existing);
    }
    try {
      const t = now();
      const { lastInsertRowid } = db.prepare(`INSERT INTO food_entries
        (user_id, day, logged_at, name, grams, kcal, protein, carbs, fat, source, plan_slot, meal_ref, client_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uid, d.day, t, d.name, d.grams, d.kcal, d.protein, d.carbs, d.fat, d.source, d.slot, d.mealRef, d.clientId, t, t);
      ctx.status = 201;
      return foodOut(db.prepare('SELECT * FROM food_entries WHERE id = ?').get(lastInsertRowid));
    } catch (err) {
      if (isUnique(err)) throw new HttpError(409, 'duplicate', 'Această masă este deja înregistrată pentru ziua respectivă.');
      throw err;
    }
  });

  router.on('PATCH', '/api/food/:id', ctx => {
    const d = validate(ctx.body, FOOD_RULES, { partial: true });
    const cols = Object.keys(d);
    if (!cols.length) throw badRequest('Nu ai trimis nicio modificare.');
    const r = db.prepare(`UPDATE food_entries SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(...cols.map(c => d[c]), now(), Number(ctx.params.id), ctx.user.id);
    if (!r.changes) throw notFound();
    return foodOut(db.prepare('SELECT * FROM food_entries WHERE id = ?').get(Number(ctx.params.id)));
  });

  router.on('DELETE', '/api/food/:id', ctx => {
    const row = db.prepare('SELECT * FROM food_entries WHERE id = ? AND user_id = ?').get(Number(ctx.params.id), ctx.user.id);
    if (!row) throw notFound();
    db.prepare('DELETE FROM food_entries WHERE id = ? AND user_id = ?').run(row.id, ctx.user.id);
    return foodOut(row);
  });

  // ---------- Hidratare ----------

  router.on('PUT', '/api/water/:day', ctx => {
    const { day } = validate(ctx.params, { day: rules.day() });
    const { ml } = validate(ctx.body, { ml: rules.num({ min: 0, max: 10000, int: true }) });
    assertNotFuture(day, ctx.user.timezone);
    db.prepare(`INSERT INTO water_days (user_id, day, ml, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, day) DO UPDATE SET ml = excluded.ml, updated_at = excluded.updated_at`).run(ctx.user.id, day, ml, now());
    return { day, ml };
  });

  // ---------- Antrenamente ----------

  router.on('POST', '/api/workouts', ctx => {
    const d = validate(ctx.body, {
      day: rules.day(),
      durationS: rules.num({ min: 0, max: 86400, int: true }),
      planRef: rules.str({ max: 60, optional: true }),
      clientId: rules.clientId(),
    });
    assertNotFuture(d.day, ctx.user.timezone);
    if (d.clientId) {
      const existing = db.prepare('SELECT * FROM workout_sessions WHERE user_id = ? AND client_id = ?').get(ctx.user.id, d.clientId);
      if (existing) return workoutOut(existing);
    }
    const { lastInsertRowid } = db.prepare('INSERT INTO workout_sessions (user_id, day, duration_s, plan_ref, client_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ctx.user.id, d.day, d.durationS, d.planRef, d.clientId, now());
    ctx.status = 201;
    return workoutOut(db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(lastInsertRowid));
  });

  router.on('DELETE', '/api/workouts/:id', ctx => {
    const r = db.prepare('DELETE FROM workout_sessions WHERE id = ? AND user_id = ?').run(Number(ctx.params.id), ctx.user.id);
    if (!r.changes) throw notFound();
    return { ok: true };
  });

  // ---------- Greutate ----------

  router.on('POST', '/api/weights', ctx => {
    const d = validate(ctx.body, { at: rules.localDateTime(), kg: rules.num({ min: 20, max: 400, decimals: 1 }) });
    if (d.at > nowLocalIn(ctx.user.timezone)) throw badRequest('Data și ora nu pot fi în viitor.', { at: 'Data și ora nu pot fi în viitor.' });
    const { lastInsertRowid } = db.prepare('INSERT INTO weights (user_id, measured_at, kg, created_at) VALUES (?, ?, ?, ?)').run(ctx.user.id, d.at, d.kg, now());
    ctx.status = 201;
    return weightOut(db.prepare('SELECT * FROM weights WHERE id = ?').get(lastInsertRowid));
  });

  router.on('DELETE', '/api/weights/:id', ctx => {
    const row = db.prepare('SELECT * FROM weights WHERE id = ? AND user_id = ?').get(Number(ctx.params.id), ctx.user.id);
    if (!row) throw notFound();
    db.prepare('DELETE FROM weights WHERE id = ? AND user_id = ?').run(row.id, ctx.user.id);
    return weightOut(row);
  });

  // ---------- Export (dreptul de portabilitate) ----------

  router.on('GET', '/api/account/export', ctx => {
    const uid = ctx.user.id;
    const user = db.prepare('SELECT email, name, timezone, terms_accepted_at, created_at FROM users WHERE id = ?').get(uid);
    const all = (sql, map) => db.prepare(sql).all(uid).map(map);
    const data = {
      exportedAt: now(),
      account: user,
      profile: profileOut(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(uid)),
      targets: targetsOut(db.prepare('SELECT * FROM targets WHERE user_id = ?').get(uid)),
      subscription: db.prepare('SELECT plan, status, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = ?').get(uid) || null,
      food: all('SELECT * FROM food_entries WHERE user_id = ? ORDER BY day, logged_at', foodOut),
      water: all('SELECT day, ml FROM water_days WHERE user_id = ? ORDER BY day', r => ({ ...r })),
      workouts: all('SELECT * FROM workout_sessions WHERE user_id = ? ORDER BY day', workoutOut),
      weights: all('SELECT * FROM weights WHERE user_id = ? ORDER BY measured_at', weightOut),
    };
    ctx.headers['Content-Disposition'] = `attachment; filename="metamorf-date-${todayIn(ctx.user.timezone)}.json"`;
    return data;
  });
}

export { targetsOut };
