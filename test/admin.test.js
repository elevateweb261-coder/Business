// Teste pentru panoul de administrare.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createMailer } from '../server/mailer.js';
import { codeFor, counterAt, base32Decode } from '../server/totp.js';

let server, base, db, mailer;

before(async () => {
  const config = buildConfig({}, { dbPath: ':memory:', scryptCost: 12, appUrl: 'http://localhost:3999' });
  db = openDb(':memory:');
  mailer = createMailer(config, { quiet: true });
  let app;
  ({ server, app } = createApp(config, { db, mailer }));
  // Suita creează multe conturi de pe aceeași adresă; limita de înregistrări e testată separat (api.test.js).
  app.limits.signup.limit = 10000;
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(r => server.close(r)));

function client() {
  let jar = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'X-Metamorf': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(jar ? { Cookie: jar } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) jar = c.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { get: p => call('GET', p), post: (p, b = {}) => call('POST', p, b), del: (p, b) => call('DELETE', p, b), put: (p, b) => call('PUT', p, b) };
}

/** Conectare în panou: parolă, apoi (la prima conectare) configurarea 2FA cu codul calculat din cheie. */
async function adminLogin(c, email, password = 'parola-sigura-1') {
  const l = await c.post('/api/admin/auth/login', { email, password });
  assert.equal(l.status, 200, JSON.stringify(l.data));
  const secret = l.data.secret?.replace(/\s/g, '');
  const v = await c.post('/api/admin/auth/verify', { challenge: l.data.challenge, code: codeFor(secret, counterAt()) });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  return { secret, login: l.data };
}

let n = 0;
async function account({ admin = false, name = 'Test' } = {}) {
  const c = client();
  const email = `adm${++n}-${Date.now()}@exemplu.ro`;
  const r = await c.post('/api/auth/register', { name, email, password: 'parola-sigura-1', terms: true });
  assert.equal(r.status, 201);
  if (admin) {
    // Exact ce face `npm run admin -- grant`: rol; apoi conectare în panou cu parola + codul 2FA.
    db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email);
    await adminLogin(c, email);
  }
  return { c, email, id: r.data.user.id };
}

const ADMIN_ROUTES = [['get', '/api/admin/overview'], ['get', '/api/admin/users'], ['get', '/api/admin/ai'], ['get', '/api/admin/foods'], ['get', '/api/admin/exercises'], ['get', '/api/admin/media'], ['get', '/api/admin/audit'], ['get', '/api/admin/users/1'], ['post', '/api/admin/users/1/logout']];

test('utilizatorii obișnuiți și vizitatorii nu au acces', async () => {
  const { c } = await account();
  for (const [m, p] of ADMIN_ROUTES) assert.equal((await c[m](p)).status, 403, p);
  const guest = client();
  for (const [m, p] of ADMIN_ROUTES) assert.equal((await guest[m](p)).status, 401, p);
  // Rolul nu poate fi setat din aplicație
  await c.put('/api/profile', { role: 'admin' });
  assert.equal((await c.get('/api/admin/overview')).status, 403);
});

test('prezentare generală și listă de utilizatori, cu căutare', async () => {
  const { c: admin } = await account({ admin: true });
  await account({ name: 'Ioana Căutată' });
  const o = await admin.get('/api/admin/overview');
  assert.equal(o.status, 200);
  assert.ok(o.data.users.total >= 2);
  assert.equal(o.data.signups.length, 30);
  assert.ok('costUsd' in o.data.ai30);
  const list = await admin.get('/api/admin/users?q=Căutată');
  assert.equal(list.data.total, 1);
  assert.equal(list.data.users[0].name, 'Ioana Căutată');
  assert.ok(!JSON.stringify(list.data).includes('scrypt$'));
});

test('detaliile unui cont nu expun date de sănătate sau parole; vizualizarea e auditată', async () => {
  const { c: admin } = await account({ admin: true });
  const { c: user, id } = await account();
  await user.put('/api/profile', { healthConsent: true, allergies: 'arahide', health: 'genunchi' });
  await user.post('/api/food', { day: new Date().toISOString().slice(0, 10), name: 'Masă privată', kcal: 300, protein: 10, carbs: 30, fat: 10, source: 'manual' });
  const d = await admin.get(`/api/admin/users/${id}`);
  assert.equal(d.status, 200);
  const text = JSON.stringify(d.data);
  assert.ok(!text.includes('arahide') && !text.includes('genunchi'), 'fără alergii/limitări');
  assert.ok(!text.includes('scrypt$') && !text.includes('Masă privată'), 'fără parole sau conținutul jurnalului');
  assert.equal(d.data.health.consent, true);
  assert.equal(d.data.health.protected, true);
  assert.equal(d.data.counts.foodEntries, 1);
  const audit = await admin.get('/api/admin/audit');
  assert.equal(audit.data.entries[0].action, 'view_user');
  assert.equal(audit.data.entries[0].target_user_id, id);
});

test('deconectare forțată, link de resetare, export (auditate)', async () => {
  const { c: admin } = await account({ admin: true });
  const { c: user, id, email } = await account();
  assert.equal((await user.get('/api/me')).status, 200);
  const out = await admin.post(`/api/admin/users/${id}/logout`);
  assert.equal(out.data.sessions, 1);
  assert.equal((await user.get('/api/me')).status, 401);
  const before = mailer.sent.length;
  assert.equal((await admin.post(`/api/admin/users/${id}/reset-link`)).status, 200);
  assert.equal(mailer.sent.length, before + 1);
  assert.equal(mailer.sent.at(-1).to, email);
  const exp = await admin.get(`/api/admin/users/${id}/export`);
  assert.equal(exp.data.account.email, email);
  const actions = (await admin.get('/api/admin/audit')).data.entries.map(e => e.action);
  for (const a of ['logout_user', 'send_reset_link', 'export_user']) assert.ok(actions.includes(a), a);
});

test('ștergerea contului: cere emailul exact; nu se pot șterge propriul cont sau alți administratori', async () => {
  const { c: admin, id: adminId } = await account({ admin: true });
  const { id: otherAdmin } = await account({ admin: true });
  const { id, email } = await account();
  assert.equal((await admin.del(`/api/admin/users/${id}`, { confirmEmail: 'gresit@exemplu.ro' })).status, 422);
  assert.equal((await admin.del(`/api/admin/users/${adminId}`, { confirmEmail: 'x' })).status, 422);
  assert.equal((await admin.del(`/api/admin/users/${otherAdmin}`, { confirmEmail: 'x' })).status, 422);
  assert.equal((await admin.del(`/api/admin/users/${id}`, { confirmEmail: email.toUpperCase() })).status, 200);
  assert.equal((await admin.get(`/api/admin/users/${id}`)).status, 404);
  const entry = (await admin.get('/api/admin/audit')).data.entries.find(e => e.action === 'delete_user');
  assert.equal(entry.target_email, email); // istoricul rămâne după ștergere
});


// ---------- Conectarea în doi pași ----------

test('2FA: sesiunea din aplicație nu ajunge pentru panou', async () => {
  const c = client();
  const email = `mfa${Date.now()}@exemplu.ro`;
  await c.post('/api/auth/register', { name: 'A', email, password: 'parola-sigura-1', terms: true });
  db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email);
  const r = await c.get('/api/admin/overview');
  assert.equal(r.status, 401);
  assert.equal(r.data.error.code, 'mfa_required');
});

test('2FA: prima conectare configurează codul; apoi se cere doar codul; codurile nu se refolosesc', async () => {
  const c = client();
  const email = `setup${Date.now()}@exemplu.ro`;
  await c.post('/api/auth/register', { name: 'Admin', email, password: 'parola-sigura-1', terms: true });
  db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email);
  const first = await c.post('/api/admin/auth/login', { email, password: 'parola-sigura-1' });
  assert.equal(first.data.step, 'setup');
  assert.match(first.data.qrSvg, /^<svg/);
  const secret = first.data.secret.replace(/\s/g, '');
  assert.equal(base32Decode(secret).length, 20);
  // Cheia e salvată criptat, abia după confirmarea primului cod.
  assert.equal(db.prepare('SELECT totp_enabled_at FROM users WHERE email = ?').get(email).totp_enabled_at, null);
  const code = codeFor(secret, counterAt());
  assert.equal((await c.post('/api/admin/auth/verify', { challenge: first.data.challenge, code })).status, 200);
  const row = db.prepare('SELECT totp_secret_enc, totp_enabled_at FROM users WHERE email = ?').get(email);
  assert.ok(row.totp_enabled_at);
  assert.ok(!row.totp_secret_enc.includes(secret), 'cheia nu e stocată în clar');
  assert.equal((await c.get('/api/admin/overview')).status, 200);

  const c2 = client();
  const second = await c2.post('/api/admin/auth/login', { email, password: 'parola-sigura-1' });
  assert.equal(second.data.step, 'code');
  assert.equal(second.data.secret, undefined);
  const reuse = await c2.post('/api/admin/auth/verify', { challenge: second.data.challenge, code });
  assert.equal(reuse.status, 422, 'același cod nu poate fi folosit de două ori');
  const actions = db.prepare('SELECT action FROM admin_audit WHERE admin_email = ?').all(email).map(r => r.action);
  assert.ok(actions.includes('enable_2fa') && actions.includes('admin_login'));
});

test('2FA: aceeași eroare pentru parolă greșită și cont fără rol; blocare după 5 încercări', async () => {
  const user = client();
  const email = `block${Date.now()}@exemplu.ro`;
  await user.post('/api/auth/register', { name: 'U', email, password: 'parola-sigura-1', terms: true });
  const notAdmin = await client().post('/api/admin/auth/login', { email, password: 'parola-sigura-1' });
  assert.equal(notAdmin.status, 401);
  assert.equal(notAdmin.data.error.code, 'invalid_credentials');
  let last;
  // Încercarea de mai sus (cont fără rol) s-a numărat deja: încă 4 eșecuri ating limita de 5.
  for (let i = 0; i < 4; i++) last = await client().post('/api/admin/auth/login', { email, password: 'gresita-123456' });
  assert.equal(last.status, 401);
  const blocked = await client().post('/api/admin/auth/login', { email, password: 'parola-sigura-1' });
  assert.equal(blocked.status, 429);
  assert.match(blocked.data.error.message, /peste \d+ minut/);
});

test('2FA: prea multe coduri greșite anulează pasul; trebuie reluată parola', async () => {
  const c = client();
  const email = `codes${Date.now()}@exemplu.ro`;
  await c.post('/api/auth/register', { name: 'A', email, password: 'parola-sigura-1', terms: true });
  db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email);
  const l = await c.post('/api/admin/auth/login', { email, password: 'parola-sigura-1' });
  let r;
  for (let i = 0; i < 5; i++) r = await c.post('/api/admin/auth/verify', { challenge: l.data.challenge, code: '000000' });
  assert.equal(r.status, 401);
  assert.equal(r.data.error.code, 'challenge_expired');
  const secret = l.data.secret.replace(/\s/g, '');
  const late = await c.post('/api/admin/auth/verify', { challenge: l.data.challenge, code: codeFor(secret, counterAt()) });
  assert.equal(late.status, 401);
});

// ---------- Panoul principal (ecranul 2) ----------

test('panou: perioade, venit doar pentru admin, fără cifre inventate', async () => {
  const { c: admin } = await account({ admin: true });
  for (const [period, n] of [['week', 7], ['month', 30], ['year', 12], ['oricare', 30]]) {
    const r = await admin.get(`/api/admin/dashboard?period=${period}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.signups.buckets.length, n, period);
  }
  const r = await admin.get('/api/admin/dashboard');
  assert.equal(r.data.revenue.available, false);
  assert.equal(r.data.revenue.months.length, 12);
  assert.ok(r.data.revenue.months.every(m => m.amount === null), 'fără venituri inventate');
  const { c: user } = await account();
  assert.equal((await user.get('/api/admin/dashboard')).status, 403);
});

test('panou: statistici calculate corect (fără administratori), retenție, abonamente', async () => {
  const { buildDashboard } = await import('../server/admin-dashboard.js');
  const mem = openDb(':memory:');
  const nowD = new Date('2026-10-07T09:00:00Z');
  const iso = daysBack => new Date(nowD.getTime() - daysBack * 864e5).toISOString();
  const add = (email, role, created, lastSeen) => mem.prepare(`INSERT INTO users (email, password_hash, name, role, timezone, terms_accepted_at, created_at, updated_at, last_seen_at)
    VALUES (?, 'x', 'N', ?, 'Europe/Bucharest', ?, ?, ?, ?)`).run(email, role, created, created, created, lastSeen).lastInsertRowid;
  const a = add('a@x.ro', 'user', iso(10), iso(1));        // înscris acum 10 zile, activ ieri → reținut la 7 zile
  add('b@x.ro', 'user', iso(10), null);                     // înscris acum 10 zile, inactiv → nereținut
  add('c@x.ro', 'user', iso(40), iso(35));                  // activ doar în prima săptămână
  add('d@x.ro', 'user', '2026-10-06T22:30:00Z', null);      // 01:30 ora României → „azi”
  add('boss@x.ro', 'admin', iso(0), iso(0));                // exclus
  mem.prepare("INSERT INTO subscriptions (user_id, plan, status, current_period_end, updated_at) VALUES (?, '3_luni', 'active', ?, ?)").run(a, iso(-30), iso(0));
  const d = buildDashboard(mem, { period: 'week', role: 'admin', now: nowD });
  assert.equal(d.cards.usersTotal, 4);
  assert.equal(d.cards.newToday, 1);
  assert.equal(d.cards.premiumActive, 1);
  assert.equal(d.plans.counts['3_luni'], 1);
  assert.deepEqual({ ...d.retention.d7 }, { days: 7, cohort: 3, retained: 1, pct: 33.3 });
  assert.equal(d.retention.d30.cohort, 1);
  assert.equal(d.retention.d30.retained, 0);
  // Alte roluri nu primesc venitul
  assert.equal('revenue' in buildDashboard(mem, { role: 'support', now: nowD }), false);
});

// ---------- Utilizatori: listă, detalii, Premium manual, acces la date de sănătate (ecranul 3) ----------

test('utilizatori: filtre după plan, eligibilitate și data înregistrării; fără administratori în listă', async () => {
  const { c: admin, email: adminEmail } = await account({ admin: true });
  const tag = `f${Date.now()}`;
  const mk = async (suffix, profile) => {
    const c = client();
    const email = `${tag}-${suffix}@exemplu.ro`;
    await c.post('/api/auth/register', { name: `${tag} ${suffix}`, email, password: 'parola-sigura-1', terms: true });
    if (profile) await c.put('/api/profile', { age: 30, gender: 'Femeie', height: 168, weight: 65, goal: 'Echilibru', activity: 'Moderat', diet: 'Cu carne', location: 'Acasă', experience: 'Începător', equipment: 'Gantere', days: 3, minutes: 30, done: true, ...profile });
    return db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  };
  const eligible = await mk('eligibil', {});
  await mk('minor', { age: 16 });
  await mk('alergii', { healthConsent: true, allergies: 'arahide' });
  await mk('nou', null);
  db.prepare("UPDATE subscriptions SET status = 'active', plan = '1_luna', current_period_end = ? WHERE user_id = ?").run(new Date(Date.now() + 864e5).toISOString(), eligible);
  db.prepare('UPDATE users SET created_at = ? WHERE id = ?').run('2026-01-15T10:00:00Z', eligible);
  const list = async params => (await admin.get(`/api/admin/users?q=${tag}&${params}`)).data;
  assert.equal((await list('')).total, 4);
  assert.equal((await list('elig=eligible')).total, 1);
  assert.equal((await list('elig=separate')).total, 2);
  assert.equal((await list('elig=incomplete')).total, 1);
  assert.equal((await list('plan=premium')).users[0].id, eligible);
  assert.equal((await list('plan=free')).total, 3);
  assert.equal((await list('from=2026-01-01&to=2026-01-31')).total, 1);
  assert.equal((await list('to=2026-01-14')).total, 0);
  assert.equal((await admin.get(`/api/admin/users?q=${encodeURIComponent(adminEmail)}`)).data.total, 0, 'administratorii nu apar în listă');
  const text = JSON.stringify(await list(''));
  assert.ok(!text.includes('arahide'));
});

test('detalii: email neconfirmat, scanări azi, fără greutate/vârstă; Premium manual cu motiv obligatoriu', async () => {
  const { c: admin } = await account({ admin: true });
  const { c: user, id } = await account();
  await user.put('/api/profile', { age: 41, weight: 88.5 });
  await user.post('/api/weights', { at: '2026-01-01T08:00', kg: 87.3 });
  const d = (await admin.get(`/api/admin/users/${id}`)).data;
  assert.equal(d.account.emailVerified, false);
  assert.deepEqual({ ...d.scansToday, day: undefined }, { used: 0, limit: 1, day: undefined });
  const text = JSON.stringify(d);
  assert.ok(!text.includes('88.5') && !text.includes('87.3') && !text.includes('"age"'), 'fără date de sănătate');
  assert.equal(d.subscriptionHistory.length, 0);

  assert.equal((await admin.post(`/api/admin/users/${id}/premium`, { plan: '3_luni', reason: '' })).status, 422);
  assert.equal((await admin.post(`/api/admin/users/${id}/premium`, { plan: '12_luni', reason: 'Compensație pentru o problemă tehnică' })).status, 422);
  const g = await admin.post(`/api/admin/users/${id}/premium`, { plan: '3_luni', reason: 'Compensație pentru o problemă tehnică' });
  assert.equal(g.status, 200);
  const g2 = await admin.post(`/api/admin/users/${id}/premium`, { plan: '1_luna', reason: 'Prelungire acordată de proprietară' });
  assert.ok(g2.data.until > g.data.until, 'se adaugă la perioada existentă');
  const after = (await admin.get(`/api/admin/users/${id}`)).data;
  assert.equal(after.subscription.premium, true);
  assert.equal(after.subscription.provider, 'manual');
  assert.equal(after.scansToday.limit, 3);
  assert.equal(after.subscriptionHistory.length, 2);
  assert.equal(after.subscriptionHistory[1].reason, 'Compensație pentru o problemă tehnică');
  assert.equal((await user.get('/api/me')).data.subscription.premium, true, 'clientul vede Premium');
  const audit = (await admin.get('/api/admin/audit')).data.entries.find(e => e.action === 'grant_premium');
  assert.equal(audit.details.reason, 'Prelungire acordată de proprietară');
});

test('date de sănătate: acces doar cu motiv, înregistrat în audit', async () => {
  const { c: admin } = await account({ admin: true });
  const { c: user, id } = await account();
  await user.put('/api/profile', { healthConsent: true, allergies: 'lactoză', health: 'genunchi', weight: 70 });
  assert.equal((await admin.post(`/api/admin/users/${id}/health-access`, { reason: 'scurt' })).status, 422);
  const r = await admin.post(`/api/admin/users/${id}/health-access`, { reason: 'Clienta a cerut verificarea planului (tichet #42)' });
  assert.equal(r.status, 200);
  assert.equal(r.data.allergies, 'lactoză');
  assert.equal(r.data.limitations, 'genunchi');
  assert.equal(r.data.weightKg, 70);
  const entry = (await admin.get('/api/admin/audit')).data.entries.find(e => e.action === 'health_access');
  assert.equal(entry.details.reason, 'Clienta a cerut verificarea planului (tichet #42)');
  assert.equal(entry.target_user_id, id);
  // Utilizatorii obișnuiți nu pot apela ruta
  assert.equal((await user.post(`/api/admin/users/${id}/health-access`, { reason: 'Clienta a cerut verificarea planului' })).status, 403);
});
