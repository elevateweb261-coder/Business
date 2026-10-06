// Serviciul de planuri: generare (cu validare și o reîncercare), citire cu reguli gratuit/Premium,
// înlocuirea unei mese, înregistrarea porției consumate și bifarea sarcinilor.
import { HttpError, badRequest, notFound } from '../http.js';
import { todayIn } from '../validate.js';
import { planEligibility } from '../options.js';
import { validationContext, validateWeek, validateReplacement, SLOTS, SLOT_LABEL } from './validate.js';
import { resolveProvider, AiError } from './providers.js';

const LIMITS = { week: 3, meal: 10 };   // generări reușite permise pe zi, per utilizator
const MAX_ATTEMPTS = 2;                  // o reîncercare cu feedback dacă validarea eșuează
const now = () => new Date().toISOString();

// ---------- Date calendaristice (șiruri AAAA-LL-ZZ, calculate în UTC ca să nu depindă de fusul serverului) ----------
const toDate = s => new Date(`${s}T00:00:00Z`);
const fromDate = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fromDate(d); };
export const mondayOf = s => addDays(s, -((toDate(s).getUTCDay() + 6) % 7));
const weekDates = monday => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

export function createPlanService({ db, config, provider = resolveProvider(config) }) {
  const running = new Set(); // utilizatori pentru care se generează acum un plan (evită dublul clic)

  const isPremium = userId => {
    const s = db.prepare('SELECT status, current_period_end FROM subscriptions WHERE user_id = ?').get(userId);
    return !!s && ['active', 'trialing', 'canceled'].includes(s.status) && !!s.current_period_end && s.current_period_end > now();
  };

  function context(userId) {
    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
    const t = db.prepare('SELECT * FROM targets WHERE user_id = ?').get(userId);
    const targets = t ? { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, water: t.water_ml } : null;
    return { profile, targets, eligibility: planEligibility(profile) };
  }

  /** Motivul pentru care nu se poate genera un plan (sau null). */
  function blocker(ctx) {
    if (!provider) return ['ai_unavailable', 'Generarea planurilor nu este încă configurată pe server.'];
    if (ctx.eligibility === 'incomplete') return ['profile_incomplete', 'Completează chestionarul înainte de a genera planul.'];
    if (ctx.eligibility === 'minor') return ['not_eligible', 'Pentru persoanele sub 18 ani nu generăm automat un plan individual.'];
    if (ctx.eligibility === 'specialist') return ['not_eligible', 'Pentru că ai indicat alergii sau limitări fizice, nu generăm automat un plan individual. Recomandăm un specialist.'];
    if (!ctx.targets) return ['targets_missing', 'Setează țintele zilnice (calorii, macronutrienți, apă) înainte de a genera planul.'];
    return null;
  }

  /** A câta săptămână din program (1 = prima săptămână cu plan). */
  function weekIndexFor(userId, weekStart) {
    const first = db.prepare('SELECT MIN(week_start) AS w FROM plans WHERE user_id = ?').get(userId)?.w;
    if (!first || weekStart <= first) return 1;
    return Math.round((toDate(weekStart) - toDate(first)) / (7 * 864e5)) + 1;
  }

  function usedToday(userId, kind, tz) {
    return db.prepare('SELECT COUNT(*) AS n FROM ai_requests WHERE user_id = ? AND kind = ? AND day = ? AND ok = 1').get(userId, kind, todayIn(tz)).n;
  }

  function logRequest(userId, kind, tz, { ok, attempts, usage, model, error }) {
    db.prepare(`INSERT INTO ai_requests (user_id, kind, day, provider, model, ok, attempts, input_tokens, output_tokens, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, kind, todayIn(tz), provider.name, model ?? null, ok ? 1 : 0, attempts, usage?.input ?? null, usage?.output ?? null, error ?? null, now());
  }

  /** Rulează generatorul cu validare; la erori de validare, reîncearcă o dată trimițând problemele găsite. */
  async function generateValidated(run, validate) {
    let feedback = null;
    const usage = { input: 0, output: 0 };
    let model = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await run(feedback);
      usage.input += res.usage?.input_tokens || 0;
      usage.output += res.usage?.output_tokens || 0;
      model = res.model || model;
      const checked = validate(res.data);
      if (!checked.errors.length) return { value: checked.value, attempts: attempt, usage, model };
      feedback = { content: res.content, errors: checked.errors };
      if (!res.content) break; // generatorul de test nu poate fi corectat prin feedback
    }
    const err = new AiError('invalid_plan', 'Planul generat nu a trecut verificările de siguranță. Încearcă din nou.', feedback.errors);
    err.usage = usage;
    err.attempts = MAX_ATTEMPTS;
    throw err;
  }

  // ---------- Citire ----------

  function readDays(userId, weekStart) {
    const rows = db.prepare('SELECT day, data_json FROM plan_days WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY day').all(userId, weekStart, addDays(weekStart, 6));
    const done = db.prepare('SELECT day, task_id FROM plan_task_done WHERE user_id = ? AND day BETWEEN ? AND ?').all(userId, weekStart, addDays(weekStart, 6));
    const doneSet = new Set(done.map(d => `${d.day}|${d.task_id}`));
    return rows.map(r => {
      const day = JSON.parse(r.data_json);
      day.tasks.forEach(t => { t.done = doneSet.has(`${r.day}|${t.id}`); });
      return day;
    });
  }

  /**
   * Planul unei săptămâni, cu regulile de acces aplicate pe server:
   * gratuit = săptămâna 1 și primul antrenament; Premium = tot. Conținutul blocat NU este trimis.
   */
  function getWeek(user, weekStart) {
    const plan = db.prepare('SELECT * FROM plans WHERE user_id = ? AND week_start = ?').get(user.id, weekStart);
    const premium = isPremium(user.id);
    const weekIndex = plan ? plan.week_index : weekIndexFor(user.id, weekStart);
    const ctx = context(user.id);
    const base = {
      weekStart, weekIndex, premium,
      provider: provider?.label ?? null,
      blocked: blocker(ctx)?.[1] ?? null,
      blockedCode: blocker(ctx)?.[0] ?? null,
    };
    if (!plan) return { ...base, plan: null, locked: !premium && weekIndex > 1 };
    if (!premium && weekIndex > 1) return { ...base, plan: null, locked: true };
    let days = readDays(user.id, weekStart);
    if (!premium) {
      // Ziua 1 de antrenament e gratuită; următoarele antrenamente sunt Premium.
      let seen = false;
      days = days.map(d => ({
        ...d,
        tasks: d.tasks.map(t => {
          if (t.type !== 'antrenament') return t;
          if (!seen) { seen = true; return t; }
          return { id: t.id, type: t.type, title: 'Antrenament Premium', detail: 'Antrenamentele de după ziua 1 sunt incluse în Premium.', minutes: t.minutes, locked: true, done: t.done };
        }),
      }));
    }
    return {
      ...base,
      locked: false,
      plan: { source: plan.source, model: plan.model, createdAt: plan.created_at, targets: JSON.parse(plan.targets_json), days },
    };
  }

  // ---------- Generare ----------

  async function generateWeek(user, weekStart, { force = false } = {}) {
    const tz = user.timezone;
    const currentMonday = mondayOf(todayIn(tz));
    if (weekStart !== mondayOf(weekStart)) throw badRequest('Săptămâna trebuie să înceapă într-o zi de luni.');
    if (weekStart < currentMonday || weekStart > addDays(currentMonday, 7)) throw badRequest('Poți genera planul doar pentru săptămâna curentă sau pentru următoarea.');
    const ctx = context(user.id);
    const block = blocker(ctx);
    if (block) throw new HttpError(block[0] === 'ai_unavailable' ? 503 : 422, block[0], block[1]);
    const weekIndex = weekIndexFor(user.id, weekStart);
    if (weekIndex > 1 && !isPremium(user.id)) throw new HttpError(402, 'premium_required', 'Planurile pentru săptămânile 2–4 sunt incluse în Premium.');
    const existing = db.prepare('SELECT id FROM plans WHERE user_id = ? AND week_start = ?').get(user.id, weekStart);
    if (existing && !force) return getWeek(user, weekStart);
    if (usedToday(user.id, 'week', tz) >= LIMITS.week) throw new HttpError(429, 'daily_limit', `Poți genera cel mult ${LIMITS.week} planuri pe zi. Încearcă mâine.`);
    if (running.has(user.id)) throw new HttpError(409, 'in_progress', 'Planul se generează deja. Așteaptă câteva momente.');

    running.add(user.id);
    const dates = weekDates(weekStart);
    const vctx = validationContext(ctx.profile, ctx.targets);
    try {
      const result = await generateValidated(
        feedback => provider.week({ profile: ctx.profile, targets: ctx.targets, dates, feedback }),
        data => { const r = validateWeek(data, dates, vctx); return { value: r.days, errors: r.errors }; },
      );
      db.exec('BEGIN');
      try {
        if (existing) {
          db.prepare('DELETE FROM plans WHERE id = ?').run(existing.id);
          db.prepare('DELETE FROM plan_task_done WHERE user_id = ? AND day BETWEEN ? AND ?').run(user.id, dates[0], dates[6]);
        }
        const { lastInsertRowid } = db.prepare('INSERT INTO plans (user_id, week_start, week_index, source, model, targets_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(user.id, weekStart, weekIndex, provider.label, result.model, JSON.stringify(ctx.targets), now());
        const insertDay = db.prepare('INSERT INTO plan_days (plan_id, user_id, day, data_json, updated_at) VALUES (?, ?, ?, ?, ?)');
        for (const day of result.value) insertDay.run(lastInsertRowid, user.id, day.date, JSON.stringify(day), now());
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      logRequest(user.id, 'week', tz, { ok: true, attempts: result.attempts, usage: result.usage, model: result.model });
      return getWeek(user, weekStart);
    } catch (err) {
      if (err instanceof AiError) {
        logRequest(user.id, 'week', tz, { ok: false, attempts: err.attempts || 1, usage: err.usage, error: `${err.code}: ${[].concat(err.details || []).slice(0, 5).join(' | ')}`.slice(0, 1000) });
        throw new HttpError(err.code === 'rate_limited' ? 429 : 502, `ai_${err.code}`, err.message);
      }
      throw err;
    } finally {
      running.delete(user.id);
    }
  }

  // ---------- O zi și o masă din plan, cu verificarea accesului ----------

  function accessibleDay(user, day) {
    const row = db.prepare('SELECT d.data_json, p.week_index FROM plan_days d JOIN plans p ON p.id = d.plan_id WHERE d.user_id = ? AND d.day = ?').get(user.id, day);
    if (!row) throw notFound('Nu există un plan pentru această zi.');
    if (row.week_index > 1 && !isPremium(user.id)) throw new HttpError(402, 'premium_required', 'Această zi face parte din planul Premium.');
    return JSON.parse(row.data_json);
  }

  function findMeal(day, slot) {
    if (!SLOTS.includes(slot)) throw badRequest('Momentul mesei nu este valid.');
    const meal = day.meals.find(m => m.slot === slot);
    if (!meal) throw notFound('Masa nu există în plan.');
    return meal;
  }

  async function replaceMeal(user, dayKey, slot) {
    const tz = user.timezone;
    const day = accessibleDay(user, dayKey);
    const oldMeal = findMeal(day, slot);
    const ctx = context(user.id);
    const block = blocker(ctx);
    if (block) throw new HttpError(block[0] === 'ai_unavailable' ? 503 : 422, block[0], block[1]);
    if (usedToday(user.id, 'meal', tz) >= LIMITS.meal) throw new HttpError(429, 'daily_limit', `Poți înlocui cel mult ${LIMITS.meal} mese pe zi.`);
    const vctx = validationContext(ctx.profile, ctx.targets);
    const otherMeals = day.meals.filter(m => m.slot !== slot).map(m => m.name);
    try {
      const result = await generateValidated(
        feedback => provider.meal({ profile: ctx.profile, targets: ctx.targets, day: dayKey, oldMeal, otherMeals, feedback }),
        data => { const r = validateReplacement(data, slot, oldMeal.nutrition.kcal, vctx); return { value: r.meal, errors: r.errors }; },
      );
      day.meals = day.meals.map(m => (m.slot === slot ? result.value : m));
      day.nutrition = day.meals.reduce((t, m) => ({
        kcal: t.kcal + m.nutrition.kcal, protein: +(t.protein + m.nutrition.protein).toFixed(1),
        carbs: +(t.carbs + m.nutrition.carbs).toFixed(1), fat: +(t.fat + m.nutrition.fat).toFixed(1),
      }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
      db.prepare('UPDATE plan_days SET data_json = ?, updated_at = ? WHERE user_id = ? AND day = ?').run(JSON.stringify(day), now(), user.id, dayKey);
      logRequest(user.id, 'meal', tz, { ok: true, attempts: result.attempts, usage: result.usage, model: result.model });
      return result.value;
    } catch (err) {
      if (err instanceof AiError) {
        logRequest(user.id, 'meal', tz, { ok: false, attempts: err.attempts || 1, usage: err.usage, error: err.code });
        throw new HttpError(err.code === 'rate_limited' ? 429 : 502, `ai_${err.code}`, err.message);
      }
      throw err;
    }
  }

  /** Înregistrează porția efectiv consumată dintr-o masă din plan. O singură dată pe zi și moment. */
  function logMeal(user, dayKey, slot, portion) {
    if (dayKey > todayIn(user.timezone)) throw badRequest('Poți înregistra masa în ziua respectivă.');
    const meal = findMeal(accessibleDay(user, dayKey), slot);
    const k = portion;
    const t = now();
    try {
      const { lastInsertRowid } = db.prepare(`INSERT INTO food_entries
        (user_id, day, logged_at, name, grams, kcal, protein, carbs, fat, source, plan_slot, meal_ref, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'plan', ?, ?, ?, ?)`)
        .run(user.id, dayKey, t, `${SLOT_LABEL[slot]} · ${meal.name}${k !== 1 ? ` (${Math.round(k * 100)}%)` : ''}`,
          Math.round(meal.ingredients.reduce((s, i) => s + i.grams, 0) * k),
          Math.round(meal.nutrition.kcal * k), +(meal.nutrition.protein * k).toFixed(1), +(meal.nutrition.carbs * k).toFixed(1), +(meal.nutrition.fat * k).toFixed(1),
          meal.slotIndex, `plan:${dayKey}:${slot}`, t, t);
      return db.prepare('SELECT * FROM food_entries WHERE id = ?').get(lastInsertRowid);
    } catch (err) {
      if (/UNIQUE constraint failed/.test(err.message)) throw new HttpError(409, 'duplicate', 'Ai înregistrat deja o masă pentru acest moment al zilei.');
      throw err;
    }
  }

  function setTask(user, dayKey, taskId, done) {
    const day = accessibleDay(user, dayKey);
    const task = day.tasks.find(t => t.id === taskId);
    if (!task) throw notFound('Sarcina nu există.');
    if (done) db.prepare('INSERT OR IGNORE INTO plan_task_done (user_id, day, task_id, done_at) VALUES (?, ?, ?, ?)').run(user.id, dayKey, taskId, now());
    else db.prepare('DELETE FROM plan_task_done WHERE user_id = ? AND day = ? AND task_id = ?').run(user.id, dayKey, taskId);
    return { day: dayKey, taskId, done: !!done };
  }

  return { getWeek, generateWeek, replaceMeal, logMeal, setTask, provider };
}
