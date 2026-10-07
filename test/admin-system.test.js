// Teste pentru ecranele 9 (abonamente, evenimente de plată), 10 (jurnal de audit) și 11 (echipă, roluri, setări).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createMailer } from '../server/mailer.js';
import { codeFor, counterAt } from '../server/totp.js';

let server, base, db, mailer;

before(async () => {
  const config = buildConfig({}, { dbPath: ':memory:', scryptCost: 12, appUrl: 'http://localhost:3999' });
  db = openDb(':memory:');
  mailer = createMailer(config, { quiet: true });
  let app;
  ({ server, app } = createApp(config, { db, mailer }));
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
  return { get: p => call('GET', p), post: (p, b = {}) => call('POST', p, b), put: (p, b) => call('PUT', p, b), del: (p, b) => call('DELETE', p, b) };
}

/** Conectare în panou (parolă + cod 2FA, cu configurarea codului la prima conectare). */
async function panelLogin(c, email, password = 'parola-sigura-1') {
  const l = await c.post('/api/admin/auth/login', { email, password });
  if (l.status !== 200) return l;
  return c.post('/api/admin/auth/verify', { challenge: l.data.challenge, code: codeFor(l.data.secret.replace(/\s/g, ''), counterAt()) });
}

let n = 0;
async function account({ admin = false } = {}) {
  const c = client();
  const email = `s${++n}-${Date.now()}@exemplu.ro`;
  const r = await c.post('/api/auth/register', { name: `Persoana ${n}`, email, password: 'parola-sigura-1', terms: true });
  assert.equal(r.status, 201);
  if (admin) {
    db.prepare("UPDATE users SET role = 'admin', admin_role = 'admin' WHERE email = ?").run(email);
    assert.equal((await panelLogin(c, email)).status, 200);
  }
  return { c, email, id: r.data.user.id };
}

/** Invitație → setarea parolei din linkul primit pe email → conectare în panou. */
async function invited(admin, role) {
  const email = `echipa${++n}-${Date.now()}@metamorf.ro`;
  const r = await admin.post('/api/admin/staff', { name: `Coleg ${n}`, email, role });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.pending, true);
  const mail = mailer.sent.at(-1);
  assert.equal(mail.to, email);
  const token = /#resetare\/([\w-]+)/.exec(mail.text)[1];
  const c = client();
  assert.equal((await c.post('/api/auth/reset', { token, password: 'parola-noua-sigura-1' })).status, 200);
  assert.equal((await panelLogin(c, email, 'parola-noua-sigura-1')).status, 200);
  return { c, email, id: r.data.id };
}

// ---------- Ecranul 11: echipă și roluri ----------

test('echipă: invitație cu rol; fiecare rol vede doar secțiunile lui', async () => {
  const { c: admin } = await account({ admin: true });
  const editor = await invited(admin, 'editor');
  const support = await invited(admin, 'support');
  assert.equal((await editor.c.get('/api/admin/me')).data.role, 'editor');
  assert.equal((await editor.c.get('/api/admin/recipes')).status, 200);
  assert.equal((await editor.c.get('/api/admin/dashboard')).status, 200);
  for (const p of ['/api/admin/users', '/api/admin/requests', '/api/admin/audit', '/api/admin/settings', '/api/admin/staff', '/api/admin/subscriptions']) {
    assert.equal((await editor.c.get(p)).status, 403, `editor ${p}`);
  }
  assert.equal((await support.c.get('/api/admin/users')).status, 200);
  assert.equal((await support.c.get('/api/admin/requests')).status, 200);
  for (const p of ['/api/admin/recipes', '/api/admin/foods', '/api/admin/audit', '/api/admin/payment-events']) {
    assert.equal((await support.c.get(p)).status, 403, `support ${p}`);
  }
  // Acțiunile sensibile rămân doar pentru administratori.
  const { id: clientId, email: clientEmail } = await account();
  assert.equal((await support.c.post(`/api/admin/users/${clientId}/premium`, { plan: '1_luna', reason: 'Test de permisiuni' })).status, 403);
  assert.equal((await support.c.del(`/api/admin/users/${clientId}`, { confirmEmail: clientEmail })).status, 403);
  const req = await support.c.post('/api/admin/requests', { email: clientEmail, type: 'delete', note: 'Cerere primită pe email' });
  assert.equal(req.status, 201);
  assert.equal((await support.c.post(`/api/admin/requests/${req.data.id}/delete`, { confirmEmail: clientEmail })).status, 403);
  // Dashboardul nu trimite venitul decât rolului admin.
  assert.equal((await support.c.get('/api/admin/dashboard')).data.revenue, undefined);
});

test('echipă: conturile de client nu devin conturi de echipă; propriul cont nu se modifică', async () => {
  const { c: admin, id: adminId } = await account({ admin: true });
  const { email: clientEmail } = await account();
  assert.equal((await admin.post('/api/admin/staff', { name: 'Client', email: clientEmail, role: 'editor' })).status, 409);
  assert.equal((await admin.post(`/api/admin/staff/${adminId}/role`, { role: 'editor' })).status, 422);
  assert.equal((await admin.post(`/api/admin/staff/${adminId}/disable`)).status, 422);
  const list = (await admin.get('/api/admin/staff')).data.staff;
  assert.equal(list.find(s => s.id === adminId).self, true);
  assert.equal(list.find(s => s.id === adminId).twoFactor, true);
  assert.ok(list.find(s => s.id === adminId).lastLoginAt);
});

test('echipă: schimbarea rolului și dezactivarea intră în audit cu diferența; contul dezactivat nu mai intră', async () => {
  const { c: admin } = await account({ admin: true });
  const ed = await invited(admin, 'editor');
  const r = await admin.post(`/api/admin/staff/${ed.id}/role`, { role: 'support' });
  assert.equal(r.data.role, 'support');
  assert.equal((await ed.c.get('/api/admin/users')).status, 200, 'rolul nou se aplică imediat');
  assert.equal((await admin.post(`/api/admin/staff/${ed.id}/disable`)).data.disabled, true);
  assert.equal((await ed.c.get('/api/admin/me')).status, 401, 'sesiunile au fost închise');
  const again = await client().post('/api/admin/auth/login', { email: ed.email, password: 'parola-noua-sigura-1' });
  assert.equal(again.status, 403);
  assert.match(again.data.error.message, /dezactivat/);
  assert.equal((await admin.post(`/api/admin/staff/${ed.id}/enable`)).data.disabled, false);
  const audit = (await admin.get(`/api/admin/audit?action=change_staff_role`)).data;
  const entry = audit.entries.find(e => e.target_email === ed.email);
  assert.deepEqual(entry.details.changes.role, ['Editor', 'Suport']);
  assert.ok(entry.ip);
});

// ---------- Ecranul 11: setări ----------

test('setări: validare, confirmare prin diferențe în audit, efect în aplicație', async () => {
  const { c: admin } = await account({ admin: true });
  let r = await admin.put('/api/admin/settings', { values: { scanLimitFree: 5, scanLimitPremium: 2 } });
  assert.ok(r.data.error.fields.scanLimitPremium);
  r = await admin.put('/api/admin/settings', { values: { maintenanceEnabled: true, maintenanceMessage: 'scurt' } });
  assert.ok(r.data.error.fields.maintenanceMessage);
  assert.equal((await admin.put('/api/admin/settings', { values: {} })).status, 422, 'fără modificări');
  r = await admin.put('/api/admin/settings', { values: { scanLimitFree: 2, featureAiPlans: false, maintenanceEnabled: true, maintenanceMessage: 'Mentenanță programată duminică, 02:00–03:00.' } });
  assert.equal(r.status, 200);
  const pub = (await client().get('/api/settings')).data;
  assert.deepEqual(pub.scanLimits, { free: 2, premium: 3 });
  assert.equal(pub.features.aiPlans, false);
  assert.match(pub.maintenance.message, /duminică/);
  const changes = (await admin.get('/api/admin/audit?action=update_settings')).data.entries[0].details.changes;
  assert.deepEqual(changes.scanLimitFree, [1, 2]);
  assert.deepEqual(changes.featureAiPlans, [true, false]);
  // Generarea planurilor oprită din setări.
  const { c: user } = await account();
  const gen = await user.post('/api/plan/generate', {});
  assert.equal(gen.status, 503);
  assert.equal(gen.data.error.code, 'feature_disabled');
  await admin.put('/api/admin/settings', { values: { featureAiPlans: true, maintenanceEnabled: false, scanLimitFree: 1 } });
  assert.equal((await client().get('/api/settings')).data.maintenance, null);
});

// ---------- Ecranul 9: abonamente și evenimente de plată ----------

test('abonamente: doar citire; stare, perioadă, platformă și filtre', async () => {
  const { c: admin } = await account({ admin: true });
  const a = await account(), b = await account();
  await admin.post(`/api/admin/users/${a.id}/premium`, { plan: '3_luni', reason: 'Compensație pentru întrerupere' });
  db.prepare("UPDATE subscriptions SET plan = '1_luna', status = 'active', current_period_end = '2020-01-01T00:00:00.000Z', provider = 'stripe', platform = 'web' WHERE user_id = ?").run(b.id);
  const list = (await admin.get('/api/admin/subscriptions')).data;
  const sa = list.items.find(s => s.userId === a.id), sb = list.items.find(s => s.userId === b.id);
  assert.deepEqual([sa.state, sa.planLabel, sa.platform], ['active', '3 luni', 'manual']);
  assert.deepEqual([sb.state, sb.planLabel, sb.platform], ['expired', '1 lună', 'web']);
  assert.ok((await admin.get('/api/admin/subscriptions?state=expired')).data.items.every(s => s.state === 'expired'));
  assert.equal((await admin.get(`/api/admin/subscriptions?platform=web&q=${encodeURIComponent(b.email)}`)).data.total, 1);
});

test('evenimente de plată: listă cu semnătură, stare, filtre și JSON-ul primit', async () => {
  const { c: admin } = await account({ admin: true });
  const empty = (await admin.get('/api/admin/payment-events')).data;
  assert.equal(empty.processorConfigured, false);
  const ins = db.prepare('INSERT INTO payment_events (provider, event_id, event_type, signature_valid, status, error, payload, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  ins.run('exemplu', 'evt_1', 'invoice.paid', 1, 'processed', null, JSON.stringify({ id: 'evt_1', amount: 'exemplu' }), new Date().toISOString());
  ins.run('exemplu', 'evt_2', 'invoice.paid', 0, 'failed', 'Semnătură invalidă', '{"id":"evt_2"}', new Date().toISOString());
  const all = (await admin.get('/api/admin/payment-events')).data;
  assert.equal(all.total, 2);
  assert.equal(all.counts.invalidSignature, 1);
  assert.deepEqual(all.events.find(e => e.eventId === 'evt_1').payload, { id: 'evt_1', amount: 'exemplu' });
  const bad = (await admin.get('/api/admin/payment-events?signature=invalid&status=failed')).data;
  assert.deepEqual(bad.events.map(e => e.eventId), ['evt_2']);
});

// ---------- Ecranul 10: jurnal de audit ----------

test('audit: filtre pe administrator, acțiune și perioadă; diferențe la modificări', async () => {
  const { c: admin, email } = await account({ admin: true });
  const r = (await admin.post('/api/admin/recipes', { name: 'Supă de test', mealType: 'pranz', servings: 2 })).data;
  await admin.put(`/api/admin/recipes/${r.id}`, { name: 'Supă cremă de test', mealType: 'cina', servings: 2, status: 'draft' });
  const mine = (await admin.get(`/api/admin/audit?admin=${encodeURIComponent(email)}`)).data;
  assert.ok(mine.entries.every(e => e.admin_email === email));
  assert.ok(mine.admins.includes(email) && mine.actions.includes('update_recipe'));
  const upd = mine.entries.find(e => e.action === 'update_recipe');
  assert.deepEqual(upd.details.changes.name, ['Supă de test', 'Supă cremă de test']);
  assert.deepEqual(upd.details.changes.mealType, ['Prânz', 'Cină']);
  assert.equal(upd.details.changes.servings, undefined, 'valorile neschimbate nu apar');
  const today = new Date().toISOString().slice(0, 10);
  assert.ok((await admin.get(`/api/admin/audit?from=${today}&to=${today}&admin=${encodeURIComponent(email)}`)).data.total >= 2);
  assert.equal((await admin.get(`/api/admin/audit?to=2020-01-01&admin=${encodeURIComponent(email)}`)).data.total, 0);
});
