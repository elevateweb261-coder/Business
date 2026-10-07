// Teste pentru ecranele 4 (cereri de date) și 5 (rețete) din panoul de administrare.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createMailer } from '../server/mailer.js';
import { codeFor, counterAt } from '../server/totp.js';

let server, base, db;

before(async () => {
  const config = buildConfig({}, { dbPath: ':memory:', scryptCost: 12, appUrl: 'http://localhost:3999', uploadsDir: mkdtempSync(join(tmpdir(), 'metamorf-up-')) });
  db = openDb(':memory:');
  let app;
  ({ server, app } = createApp(config, { db, mailer: createMailer(config, { quiet: true }) }));
  app.limits.signup.limit = 10000;
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(r => server.close(r)));

function client() {
  let jar = '';
  const call = async (method, path, body, raw) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'X-Metamorf': '1', ...(raw ? { 'Content-Type': 'application/octet-stream' } : body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(jar ? { Cookie: jar } : {}) },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    for (const c of res.headers.getSetCookie()) jar = c.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
  };
  return { get: p => call('GET', p), post: (p, b = {}) => call('POST', p, b), put: (p, b) => call('PUT', p, b), del: (p, b) => call('DELETE', p, b), raw: (p, buf) => call('PUT', p, undefined, buf) };
}

let n = 0;
async function account({ admin = false } = {}) {
  const c = client();
  const email = `c${++n}-${Date.now()}@exemplu.ro`;
  const r = await c.post('/api/auth/register', { name: `Client ${n}`, email, password: 'parola-sigura-1', terms: true });
  assert.equal(r.status, 201);
  if (admin) {
    db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email);
    const l = await c.post('/api/admin/auth/login', { email, password: 'parola-sigura-1' });
    const v = await c.post('/api/admin/auth/verify', { challenge: l.data.challenge, code: codeFor(l.data.secret.replace(/\s/g, ''), counterAt()) });
    assert.equal(v.status, 200);
  }
  return { c, email, id: r.data.user.id };
}

// ---------- Ecranul 4: cereri de date ----------

test('cereri: exportul și ștergerea făcute de client din aplicație apar automat, cu cronologie', async () => {
  const { c: admin } = await account({ admin: true });
  const { c: user, email } = await account();
  await user.get('/api/account/export');
  await user.del('/api/account', { password: 'parola-sigura-1' });
  const list = (await admin.get(`/api/admin/requests?q=${encodeURIComponent(email)}`)).data;
  assert.equal(list.total, 2);
  const del = list.requests.find(r => r.type === 'delete');
  assert.equal(del.status, 'completed');
  assert.equal(del.source, 'user');
  assert.equal(del.accountDeleted, true, 'cererea rămâne după ștergerea contului');
  assert.equal(del.userEmail, email);
  const detail = (await admin.get(`/api/admin/requests/${del.id}`)).data;
  assert.deepEqual(detail.events.map(e => e.status), ['pending', 'completed']);
});

test('cereri: înregistrare în panou, preluare, export; fără duplicate; închise nu se mai procesează', async () => {
  const { c: admin } = await account({ admin: true });
  const { email } = await account();
  assert.equal((await admin.post('/api/admin/requests', { email: 'nimeni@exemplu.ro', type: 'export', note: 'Email primit' })).status, 422);
  const created = await admin.post('/api/admin/requests', { email, type: 'export', note: 'Cerere primită pe email pe 7 octombrie' });
  assert.equal(created.status, 201);
  assert.equal((await admin.post('/api/admin/requests', { email, type: 'export', note: 'A doua cerere identică' })).status, 409);
  const id = created.data.id;
  assert.equal((await admin.post(`/api/admin/requests/${id}/start`)).status, 200);
  const exp = await admin.post(`/api/admin/requests/${id}/export`);
  assert.equal(exp.status, 200);
  assert.equal(exp.data.account.email, email);
  assert.match(exp.headers.get('content-disposition'), /attachment/);
  const detail = (await admin.get(`/api/admin/requests/${id}`)).data;
  assert.equal(detail.request.status, 'completed');
  assert.deepEqual(detail.events.map(e => e.status), ['pending', 'processing', 'completed']);
  assert.equal((await admin.post(`/api/admin/requests/${id}/export`)).status, 422, 'cererea închisă nu se reprocesează');
  const filtered = (await admin.get('/api/admin/requests?status=completed&type=export')).data;
  assert.ok(filtered.requests.every(r => r.status === 'completed' && r.type === 'export'));
});

test('cereri: ștergerea cere emailul exact al clientului; eșec cu motiv', async () => {
  const { c: admin } = await account({ admin: true });
  const { c: user, email, id: userId } = await account();
  const id = (await admin.post('/api/admin/requests', { email, type: 'delete', note: 'Cerere de ștergere primită pe email' })).data.id;
  const wrong = await admin.post(`/api/admin/requests/${id}/delete`, { confirmEmail: 'altcineva@exemplu.ro' });
  assert.equal(wrong.status, 422);
  assert.ok(wrong.data.error.fields.confirmEmail);
  assert.equal((await user.get('/api/me')).status, 200, 'contul nu a fost atins');
  assert.equal((await admin.post(`/api/admin/requests/${id}/delete`, { confirmEmail: email.toUpperCase() })).status, 200);
  assert.equal((await user.get('/api/me')).status, 401);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE id = ?').get(userId).n, 0);
  const detail = (await admin.get(`/api/admin/requests/${id}`)).data;
  assert.equal(detail.request.status, 'completed');
  assert.equal(detail.request.accountDeleted, true);

  const { email: e2 } = await account();
  const id2 = (await admin.post('/api/admin/requests', { email: e2, type: 'export', note: 'Cerere de test' })).data.id;
  assert.equal((await admin.post(`/api/admin/requests/${id2}/fail`, { reason: '' })).status, 422);
  assert.equal((await admin.post(`/api/admin/requests/${id2}/fail`, { reason: 'Identitatea solicitantului nu a putut fi confirmată' })).status, 200);
  assert.equal((await admin.get(`/api/admin/requests/${id2}`)).data.request.status, 'failed');
});

test('cereri: ștergerea din pagina clientului apare și ea în listă', async () => {
  const { c: admin } = await account({ admin: true });
  const { id, email } = await account();
  assert.equal((await admin.del(`/api/admin/users/${id}`, { confirmEmail: email })).status, 200);
  const r = (await admin.get(`/api/admin/requests?q=${encodeURIComponent(email)}`)).data.requests[0];
  assert.equal(r.type, 'delete');
  assert.equal(r.source, 'admin');
  assert.equal(r.status, 'completed');
});

// ---------- Ecranul 5: rețete ----------

const FULL = {
  name: 'Iaurt cu granola și căpșuni', description: 'Mic dejun rapid.', mealType: 'mic_dejun', prepMinutes: 5, servings: 2,
  steps: ['Pune iaurtul în boluri.', 'Adaugă granola și căpșunile.'],
  ingredients: [{ foodId: 'iaurt_grecesc', grams: 400 }, { foodId: 'granola', grams: 80 }, { foodId: 'capsuni', grams: 200 }],
};

test('rețete: ciornă incompletă; publicarea cere pași și ingrediente; nutriția și alergenii se calculează pe server', async () => {
  const { c: admin } = await account({ admin: true });
  const draft = await admin.post('/api/admin/recipes', { name: 'Rețetă nouă', mealType: 'cina' });
  assert.equal(draft.status, 201);
  assert.equal(draft.data.status, 'draft');
  const bad = await admin.put(`/api/admin/recipes/${draft.data.id}`, { name: 'Rețetă nouă', mealType: 'cina', status: 'published' });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.error.fields.steps && bad.data.error.fields.ingredients && bad.data.error.fields.prepMinutes);
  // Valorile trimise de client sunt ignorate.
  const pub = await admin.post('/api/admin/recipes', { ...FULL, status: 'published', facts: { perServing: { kcal: 1 } }, kcal: 1 });
  assert.equal(pub.status, 201);
  assert.equal(pub.data.status, 'published');
  assert.equal(pub.data.facts.total.kcal, Math.round(73 * 4 + 489 * 0.8 + 32 * 2));
  assert.equal(pub.data.facts.perServing.kcal, Math.round((73 * 4 + 489 * 0.8 + 32 * 2) / 2));
  assert.deepEqual(pub.data.facts.allergens, ['gluten', 'lapte', 'fructe_coaja']);
  assert.deepEqual(pub.data.facts.diets, ['Cu carne', 'Fără porc', 'Vegetarian']);
  assert.equal((await admin.post('/api/admin/recipes', { ...FULL, ingredients: [{ foodId: 'inexistent', grams: 10 }] })).status, 422);
  assert.equal((await admin.post('/api/admin/recipes', { ...FULL, ingredients: [{ foodId: 'capsuni', grams: 10 }, { foodId: 'capsuni', grams: 20 }] })).status, 422);
});

test('rețete: filtre, duplicare (ca ciornă), retragerea publicării, ștergere', async () => {
  const { c: admin } = await account({ admin: true });
  const vegan = (await admin.post('/api/admin/recipes', { ...FULL, name: 'Bol vegan de test', mealType: 'pranz', ingredients: [{ foodId: 'naut_fiert', grams: 200 }, { foodId: 'quinoa_fiarta', grams: 200 }], status: 'published' })).data;
  const list = async p => (await admin.get(`/api/admin/recipes?q=de test&${p}`)).data;
  assert.equal((await list('diet=Vegan')).total, 1);
  assert.equal((await list('meal=pranz&status=published')).total, 1);
  assert.equal((await list('meal=cina')).total, 0);
  assert.equal((await list('photo=without')).total, 1);
  const dup = await admin.post(`/api/admin/recipes/${vegan.id}/duplicate`);
  assert.equal(dup.data.status, 'draft');
  assert.equal(dup.data.name, 'Bol vegan de test (copie)');
  assert.equal(dup.data.facts.total.kcal, vegan.facts.total.kcal);
  const unpub = await admin.put(`/api/admin/recipes/${vegan.id}`, { ...FULL, name: vegan.name, mealType: 'pranz', ingredients: vegan.ingredients, status: 'draft' });
  assert.equal(unpub.data.status, 'draft');
  assert.equal((await admin.del(`/api/admin/recipes/${dup.data.id}`)).status, 200);
  assert.equal((await admin.get(`/api/admin/recipes/${dup.data.id}`)).status, 404);
});

test('rețete: fotografie verificată după conținut; servită doar cu nume valid; acces doar pentru personal', async () => {
  const { c: admin } = await account({ admin: true });
  const r = (await admin.post('/api/admin/recipes', { ...FULL })).data;
  const fake = await admin.raw(`/api/admin/recipes/${r.id}/photo`, Buffer.from('<?php echo 1; ?>'));
  assert.equal(fake.status, 422);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const up = await admin.raw(`/api/admin/recipes/${r.id}/photo`, png);
  assert.equal(up.status, 200);
  const img = await fetch(base + up.data.photoUrl);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(base + '/media/recipes/..%2F..%2Fpackage.json')).status, 404);
  assert.equal((await admin.raw(`/api/admin/recipes/${r.id}/photo`, Buffer.alloc(5 * 1024 * 1024 + 10, 0xff))).status, 413);
  assert.equal((await admin.get('/api/admin/recipes?photo=with')).data.recipes.some(x => x.id === r.id), true);
  const { c: user } = await account();
  assert.equal((await user.get('/api/admin/recipes')).status, 403);
  assert.equal((await user.post('/api/admin/requests', { email: 'x@y.ro', type: 'export', note: 'test test' })).status, 403);
});
