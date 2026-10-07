// Datele pentru panoul principal de administrare (ecranul 2).
// Statisticile despre utilizatori exclud conturile de administrare (rolul „user” = clienți).
// Venitul este inclus DOAR pentru rolul „admin”. Plățile nu sunt încă integrate, deci venitul este
// raportat ca „indisponibil” — fără cifre inventate.

export const PERIODS = ['week', 'month', 'year'];
const PLAN_KEYS = { '1_luna': '1 lună', '3_luni': '3 luni', '6_luni': '6 luni' };

const dayFmt = tz => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
const addDays = (key, n) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (key, n) => { const [y, m] = key.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const monthLabel = key => new Intl.DateTimeFormat('ro-RO', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-15T12:00:00Z`));
const dayLabel = key => new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));

const isPremium = (s, nowIso) => ['active', 'trialing', 'canceled'].includes(s.status) && !!s.current_period_end && s.current_period_end > nowIso;
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

export function buildDashboard(db, { period = 'month', role, tz = 'Europe/Bucharest', now = new Date() }) {
  const nowIso = now.toISOString();
  const toDay = iso => dayFmt(tz).format(new Date(iso));
  const today = toDay(nowIso);

  // Clienții (fără conturile de administrare), cu ultima activitate cunoscută din orice sursă.
  const users = db.prepare(`SELECT u.id, u.created_at,
      MAX(COALESCE(u.last_seen_at, ''),
          COALESCE((SELECT MAX(created_at) FROM food_entries f WHERE f.user_id = u.id), ''),
          COALESCE((SELECT MAX(created_at) FROM workout_sessions w WHERE w.user_id = u.id), ''),
          COALESCE((SELECT MAX(created_at) FROM weights g WHERE g.user_id = u.id), ''),
          COALESCE((SELECT MAX(updated_at) FROM water_days a WHERE a.user_id = u.id), ''),
          COALESCE((SELECT MAX(done_at) FROM plan_task_done t WHERE t.user_id = u.id), '')) AS last_activity
    FROM users u WHERE u.role = 'user'`).all();

  const createdDays = users.map(u => toDay(u.created_at));
  const countSince = fromKey => createdDays.filter(d => d >= fromKey).length;

  // ---------- Carduri ----------
  const subs = db.prepare("SELECT s.plan, s.status, s.current_period_end FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE u.role = 'user'").all();
  const active = subs.filter(s => isPremium(s, nowIso));
  const cards = {
    usersTotal: users.length,
    newToday: countSince(today),
    new7: countSince(addDays(today, -6)),
    premiumActive: active.length,
  };

  // ---------- Conturi noi: pe zile (săptămână / lună) sau pe luni (an) ----------
  const p = PERIODS.includes(period) ? period : 'month';
  let buckets;
  if (p === 'year') {
    const thisMonth = today.slice(0, 7);
    buckets = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i - 11)).map(key => ({
      key, label: monthLabel(key), count: createdDays.filter(d => d.startsWith(key)).length,
    }));
  } else {
    const n = p === 'week' ? 7 : 30;
    buckets = Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1))).map(key => ({
      key, label: dayLabel(key), count: createdDays.filter(d => d === key).length,
    }));
  }

  // ---------- Distribuția abonamentelor active pe durată ----------
  const plans = Object.fromEntries(Object.keys(PLAN_KEYS).map(k => [k, 0]));
  let otherPlans = 0;
  for (const s of active) { if (s.plan in plans) plans[s.plan]++; else otherPlans++; }

  // ---------- Retenție: dintre cei înscriși de cel puțin N zile, câți au mai fost activi după ziua N ----------
  const retention = days => {
    const cutoff = new Date(now.getTime() - days * 864e5).toISOString();
    const cohort = users.filter(u => u.created_at <= cutoff);
    const retained = cohort.filter(u => u.last_activity && u.last_activity >= new Date(Date.parse(u.created_at) + days * 864e5).toISOString());
    return { days, cohort: cohort.length, retained: retained.length, pct: pct(retained.length, cohort.length) };
  };

  const result = {
    period: p,
    today,
    timezone: tz,
    cards,
    signups: { period: p, granularity: p === 'year' ? 'month' : 'day', buckets, total: buckets.reduce((s, b) => s + b.count, 0) },
    plans: { labels: PLAN_KEYS, counts: plans, other: otherPlans, total: active.length },
    retention: { d7: retention(7), d30: retention(30) },
  };

  // Venitul: doar pentru rolul „admin”. Nu există încă plăți, deci nu există venit de raportat.
  if (role === 'admin') {
    const thisMonth = today.slice(0, 7);
    result.revenue = {
      available: false,
      reason: 'Plățile nu sunt încă integrate. Veniturile vor apărea aici după conectarea procesatorului de plăți.',
      currency: null,
      currentMonth: null,
      months: Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i - 11)).map(key => ({ key, label: monthLabel(key), amount: null })),
    };
  }
  return result;
}
