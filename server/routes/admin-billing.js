// Facturare (ecranul 9): abonamente și evenimente de plată. DOAR CITIRE.
// Starea abonamentelor se schimbă doar prin notificările verificate ale procesatorului de plăți (sau, excepțional,
// prin „Premium acordat manual” din pagina clientului) — de aceea aici nu există butoane de activare.
import { adminHelpers } from '../admin-common.js';

const PLAN_LABEL = { '1_luna': '1 lună', '3_luni': '3 luni', '6_luni': '6 luni' };
export const PLATFORMS = { web: 'Web', ios: 'iOS', android: 'Android', manual: 'Acordat manual' };
const STATES = ['active', 'canceled', 'expired'];

/** Starea afișată: activ / anulat / expirat (cu observații: plată restantă, nu se reînnoiește). */
function subscriptionState(s, nowIso) {
  const valid = !!s.current_period_end && s.current_period_end > nowIso;
  if (s.status === 'canceled') return 'canceled';
  if (['active', 'trialing', 'past_due'].includes(s.status) && valid) return 'active';
  return 'expired';
}

export function registerBillingRoutes(router, app) {
  const { db } = app;
  const { on } = adminHelpers(app);

  on('GET', '/api/admin/subscriptions', ctx => {
    const sp = ctx.url.searchParams;
    const nowIso = new Date().toISOString();
    const page = Math.max(1, Number.parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = 25;
    const all = db.prepare(`SELECT s.*, u.name, u.email FROM subscriptions s JOIN users u ON u.id = s.user_id
      WHERE u.role = 'user' AND s.status != 'none' ORDER BY s.current_period_end DESC`).all()
      .map(s => ({
        userId: s.user_id, name: s.name, email: s.email,
        plan: s.plan, planLabel: PLAN_LABEL[s.plan] || s.plan || '—',
        platform: s.provider === 'manual' ? 'manual' : s.platform || null,
        state: subscriptionState(s, nowIso), pastDue: s.status === 'past_due', cancelAtPeriodEnd: !!s.cancel_at_period_end,
        validUntil: s.current_period_end, updatedAt: s.updated_at,
      }));
    const counts = Object.fromEntries(STATES.map(k => [k, all.filter(s => s.state === k).length]));
    let list = all;
    const state = sp.get('state'), plan = sp.get('plan'), platform = sp.get('platform');
    const q = (sp.get('q') || '').trim().toLowerCase();
    if (STATES.includes(state)) list = list.filter(s => s.state === state);
    if (plan in PLAN_LABEL) list = list.filter(s => s.plan === plan);
    if (platform in PLATFORMS) list = list.filter(s => s.platform === platform);
    if (q) list = list.filter(s => `${s.name} ${s.email}`.toLowerCase().includes(q));
    return {
      total: list.length, page, pageSize, counts, plans: PLAN_LABEL, platforms: PLATFORMS,
      items: list.slice((page - 1) * pageSize, page * pageSize),
    };
  });

  on('GET', '/api/admin/payment-events', ctx => {
    const sp = ctx.url.searchParams;
    const page = Math.max(1, Number.parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = 25;
    const where = [], args = [];
    const status = sp.get('status'), signature = sp.get('signature'), type = sp.get('type');
    if (['processed', 'failed', 'ignored'].includes(status)) { where.push('e.status = ?'); args.push(status); }
    if (signature === 'valid' || signature === 'invalid') { where.push('e.signature_valid = ?'); args.push(signature === 'valid' ? 1 : 0); }
    if (type) { where.push('e.event_type = ?'); args.push(type); }
    const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) n FROM payment_events e ${sql}`).get(...args).n;
    const rows = db.prepare(`SELECT e.*, u.email FROM payment_events e LEFT JOIN users u ON u.id = e.user_id ${sql} ORDER BY e.id DESC LIMIT ? OFFSET ?`)
      .all(...args, pageSize, (page - 1) * pageSize);
    const counts = Object.fromEntries(['processed', 'failed', 'ignored'].map(k => [k, 0]));
    for (const r of db.prepare('SELECT status, COUNT(*) n FROM payment_events GROUP BY status').all()) counts[r.status] = r.n;
    counts.invalidSignature = db.prepare('SELECT COUNT(*) n FROM payment_events WHERE signature_valid = 0').get().n;
    return {
      total, page, pageSize, counts,
      // Nu există încă un procesator de plăți configurat: lista rămâne goală până la integrare.
      processorConfigured: false,
      types: db.prepare('SELECT DISTINCT event_type FROM payment_events ORDER BY event_type').all().map(r => r.event_type),
      events: rows.map(r => {
        let payload;
        try { payload = JSON.parse(r.payload); } catch { payload = r.payload; }
        return {
          id: r.id, provider: r.provider, eventId: r.event_id, type: r.event_type, signatureValid: !!r.signature_valid,
          status: r.status, error: r.error, user: r.user_id ? { id: r.user_id, email: r.email } : null,
          receivedAt: r.received_at, processedAt: r.processed_at, payload,
        };
      }),
    };
  });
}
