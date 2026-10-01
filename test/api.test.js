// Teste API: `npm test`. Fiecare test pornește serverul pe un port liber, cu o bază de date în memorie.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createMailer } from '../server/mailer.js';

let server, base, mailer, db;

before(async () => {
  const config = buildConfig({}, { dbPath: ':memory:', scryptCost: 12, appUrl: 'http://localhost:3999' });
  db = openDb(':memory:');
  mailer = createMailer(config, { quiet: true });
  ({ server } = createApp(config, { db, mailer }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise(r => server.close(r)));

/** Client cu „borcan” de cookie-uri — simulează un browser. */
function client() {
  let cookieJar = '';
  const call = async (method, path, body, { headers = {}, csrf = true } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(csrf ? { 'X-Metamorf': '1' } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookieJar ? { Cookie: cookieJar } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.getSetCookie();
    for (const c of setCookie) {
      const [pair] = c.split(';');
      cookieJar = pair.endsWith('=') ? '' : pair;
    }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, setCookie };
  };
  return {
    get: (p, o) => call('GET', p, undefined, o),
    post: (p, b, o) => call('POST', p, b ?? {}, o),
    put: (p, b, o) => call('PUT', p, b, o),
    patch: (p, b, o) => call('PATCH', p, b, o),
    del: (p, b, o) => call('DELETE', p, b, o),
    get cookie() { return cookieJar; },
  };
}

let counter = 0;
async function registered(name = 'Ana') {
  const c = client();
  const email = `user${++counter}@exemplu.ro`;
  const r = await c.post('/api/auth/register', { name, email, password: 'parola-sigura-1', terms: true, timezone: 'Europe/Bucharest' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { c, email, me: r.data };
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());

// ---------- Autentificare ----------

test('înregistrare: cookie securizat, cont gol, fără date fictive', async () => {
  const { c, me } = await registered();
  assert.equal(me.user.name, 'Ana');
  assert.equal(me.targets, null);
  assert.equal(me.profile.done, false);
  assert.equal(me.subscription.premium, false);
  const state = await c.get(`/api/state?from=${today()}&to=${today()}`);
  assert.deepEqual(state.data.days, {});
  assert.deepEqual(state.data.weights, []);
  assert.match(c.cookie, /^mm_sid=/);
  const r = await client().post('/api/auth/register', { name: 'X', email: `nou${Date.now()}@exemplu.ro`, password: 'parola-sigura-1', terms: true });
  const sc = r.setCookie.join(';');
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Lax/);
});

test('înregistrare: validare și email duplicat', async () => {
  const c = client();
  const bad = await c.post('/api/auth/register', { name: '', email: 'nu-e-email', password: 'scurta', terms: false });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.error.fields.email);
  assert.ok(bad.data.error.fields.password);
  const { email } = await registered();
  const dup = await client().post('/api/auth/register', { name: 'B', email: email.toUpperCase(), password: 'parola-sigura-2', terms: true });
  assert.equal(dup.status, 409);
});

test('parola nu este stocată în clar', async () => {
  const { email } = await registered();
  const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(email);
  assert.match(row.password_hash, /^scrypt\$/);
  assert.ok(!row.password_hash.includes('parola-sigura-1'));
  const s = db.prepare('SELECT token_hash FROM sessions LIMIT 1').get();
  assert.match(s.token_hash, /^[a-f0-9]{64}$/);
});

test('conectare, deconectare, parolă greșită', async () => {
  const { email } = await registered();
  const c = client();
  assert.equal((await c.post('/api/auth/login', { email, password: 'gresita-123456' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email, password: 'parola-sigura-1' })).status, 200);
  assert.equal((await c.get('/api/me')).status, 200);
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  assert.equal((await c.get('/api/me')).status, 401);
});

test('limitarea încercărilor de conectare', async () => {
  const { email } = await registered();
  const c = client();
  let last;
  for (let i = 0; i < 9; i++) last = await c.post('/api/auth/login', { email, password: 'gresita-123456' });
  assert.equal(last.status, 429);
});

test('recuperarea parolei: link unic, valabil o dată, deconectează sesiunile vechi', async () => {
  const { c: old, email } = await registered();
  const anon = client();
  const unknown = await anon.post('/api/auth/forgot', { email: 'nimeni@exemplu.ro' });
  assert.equal(unknown.status, 200); // același răspuns, fără a dezvălui conturile
  const before = mailer.sent.length;
  assert.equal((await anon.post('/api/auth/forgot', { email })).status, 200);
  assert.equal(mailer.sent.length, before + 1);
  const token = mailer.sent.at(-1).text.match(/#resetare\/([\w-]+)/)[1];
  const reset = await anon.post('/api/auth/reset', { token, password: 'parola-noua-123' });
  assert.equal(reset.status, 200);
  assert.equal((await anon.post('/api/auth/reset', { token, password: 'alta-parola-123' })).status, 400);
  assert.equal((await old.get('/api/me')).status, 401);
  assert.equal((await client().post('/api/auth/login', { email, password: 'parola-noua-123' })).status, 200);
});

test('schimbarea parolei cere parola actuală', async () => {
  const { c } = await registered();
  assert.equal((await c.post('/api/account/password', { current: 'gresita', next: 'parola-noua-123' })).status, 422);
  assert.equal((await c.post('/api/account/password', { current: 'parola-sigura-1', next: 'parola-noua-123' })).status, 200);
  assert.equal((await c.get('/api/me')).status, 200); // sesiunea curentă rămâne
});

// ---------- Securitate ----------

test('CSRF: cererile fără antet sau din altă origine sunt respinse', async () => {
  const { c } = await registered();
  assert.equal((await c.put('/api/targets', { kcal: 2000, protein: 100, carbs: 200, fat: 60, water: 2000 }, { csrf: false })).status, 403);
  assert.equal((await c.put('/api/targets', { kcal: 2000, protein: 100, carbs: 200, fat: 60, water: 2000 }, { headers: { Origin: 'https://atacator.example' } })).status, 403);
  assert.equal((await c.put('/api/targets', { kcal: 2000, protein: 100, carbs: 200, fat: 60, water: 2000 })).status, 200);
});

test('fără sesiune, datele nu sunt accesibile', async () => {
  const c = client();
  for (const [m, p] of [['get', '/api/me'], ['get', '/api/state'], ['get', '/api/account/export']]) {
    assert.equal((await c[m](p)).status, 401, p);
  }
  assert.equal((await c.post('/api/food', { day: today(), name: 'x', kcal: 1, protein: 0, carbs: 0, fat: 0, source: 'manual' })).status, 401);
});

test('fișierele serverului nu sunt servite public', async () => {
  for (const p of ['/server/app.js', '/.env', '/../server/app.js', '/%2e%2e/server/app.js', '/data/metamorf.db', '/package.json']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 404, p);
  }
  const index = await fetch(base + '/');
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-security-policy'), /default-src 'self'/);
});

// ---------- Izolarea datelor ----------

test('izolare: un utilizator nu poate citi, modifica sau șterge datele altuia', async () => {
  const a = await registered('A');
  const b = await registered('B');
  const food = await a.c.post('/api/food', { day: today(), name: 'Masa lui A', kcal: 500, protein: 20, carbs: 50, fat: 10, source: 'manual' });
  assert.equal(food.status, 201);
  const weight = await a.c.post('/api/weights', { at: `${today()}T00:00`, kg: 70 });
  assert.equal(weight.status, 201);
  await a.c.put(`/api/water/${today()}`, { ml: 750 });

  const stateB = await b.c.get(`/api/state?from=${today()}&to=${today()}`);
  assert.deepEqual(stateB.data.days, {});
  assert.deepEqual(stateB.data.weights, []);
  assert.equal((await b.c.patch(`/api/food/${food.data.id}`, { kcal: 1 })).status, 404);
  assert.equal((await b.c.del(`/api/food/${food.data.id}`)).status, 404);
  assert.equal((await b.c.del(`/api/weights/${weight.data.id}`)).status, 404);
  const exportB = await b.c.get('/api/account/export');
  assert.equal(exportB.data.food.length, 0);
  assert.equal(exportB.data.account.name, 'B');

  const stateA = await a.c.get(`/api/state?from=${today()}&to=${today()}`);
  assert.equal(stateA.data.days[today()].log[0].kcal, 500);
  assert.equal(stateA.data.days[today()].water, 750);
});

// ---------- Jurnal ----------

test('jurnal: o masă din plan nu se poate dubla în aceeași zi', async () => {
  const { c } = await registered();
  const meal = { day: today(), name: 'Prânz · Bowl', kcal: 520, protein: 35, carbs: 48, fat: 20, source: 'example', slot: 1, mealRef: 'l-somon' };
  assert.equal((await c.post('/api/food', meal)).status, 201);
  const dup = await c.post('/api/food', meal);
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error.code, 'duplicate');
});

test('jurnal: retrimiterea aceleiași cereri (clientId) nu creează duplicat', async () => {
  const { c } = await registered();
  const entry = { day: today(), name: 'Banană', grams: 120, kcal: 107, protein: 1.3, carbs: 27.6, fat: 0.4, source: 'manual', clientId: 'abc123xyz' };
  const r1 = await c.post('/api/food', entry);
  const r2 = await c.post('/api/food', entry);
  assert.equal(r1.data.id, r2.data.id);
  const state = await c.get(`/api/state?from=${today()}&to=${today()}`);
  assert.equal(state.data.days[today()].log.length, 1);
});

test('jurnal: editare, ștergere, validare, fără zile din viitor', async () => {
  const { c } = await registered();
  const r = await c.post('/api/food', { day: today(), name: 'Iaurt', kcal: 120, protein: 9, carbs: 12, fat: 4, source: 'manual' });
  const edited = await c.patch(`/api/food/${r.data.id}`, { kcal: 150, name: 'Iaurt grecesc' });
  assert.equal(edited.data.kcal, 150);
  assert.equal(edited.data.name, 'Iaurt grecesc');
  assert.equal((await c.del(`/api/food/${r.data.id}`)).status, 200);
  assert.equal((await c.del(`/api/food/${r.data.id}`)).status, 404);
  assert.equal((await c.post('/api/food', { day: today(), name: 'X', kcal: -5, protein: 0, carbs: 0, fat: 0, source: 'manual' })).status, 422);
  assert.equal((await c.post('/api/food', { day: '2999-01-01', name: 'X', kcal: 5, protein: 0, carbs: 0, fat: 0, source: 'manual' })).status, 422);
  // Sursele rezervate serverului (plan AI, cod de bare, foto) nu pot fi trimise de client.
  assert.equal((await c.post('/api/food', { day: today(), name: 'X', kcal: 5, protein: 0, carbs: 0, fat: 0, source: 'photo' })).status, 422);
});

test('greutate cu dată și oră; antrenamente; hidratare', async () => {
  const { c } = await registered();
  assert.equal((await c.post('/api/weights', { at: '2999-01-01T08:00', kg: 70 })).status, 422);
  assert.equal((await c.post('/api/weights', { at: `${today()}T00:00`, kg: 10 })).status, 422);
  const w = await c.post('/api/weights', { at: `${today()}T00:00`, kg: 72.45 });
  assert.equal(w.data.kg, 72.5);
  const s = await c.post('/api/workouts', { day: today(), durationS: 1500, clientId: 'workout-1' });
  assert.equal(s.status, 201);
  await c.post('/api/workouts', { day: today(), durationS: 1500, clientId: 'workout-1' });
  assert.equal((await c.put(`/api/water/${today()}`, { ml: 99999 })).status, 422);
  const state = await c.get(`/api/state?from=${today()}&to=${today()}`);
  assert.equal(state.data.days[today()].workouts.length, 1);
  assert.equal(state.data.counts.weights, 1);
});

// ---------- Profil și date de sănătate ----------

test('profil: alergiile nu se salvează fără consimțământ; retragerea îl șterge', async () => {
  const { c } = await registered();
  const noConsent = await c.put('/api/profile', { allergies: 'arahide' });
  assert.equal(noConsent.status, 422);
  assert.ok(noConsent.data.error.fields.allergies);
  const withConsent = await c.put('/api/profile', { healthConsent: true, allergies: 'arahide' });
  assert.equal(withConsent.data.profile.allergies, 'arahide');
  const withdrawn = await c.put('/api/profile', { healthConsent: false });
  assert.equal(withdrawn.data.profile.allergies, null);
  assert.equal(withdrawn.data.profile.healthConsent, false);
});

test('chestionar: progres salvat, finalizare doar cu date complete, eligibilitate', async () => {
  const { c } = await registered();
  const s1 = await c.put('/api/profile', { age: 30, gender: 'Femeie', height: 168, weight: 65, step: 1 });
  assert.equal(s1.data.profile.step, 1);
  assert.equal((await c.put('/api/profile', { done: true })).status, 422);
  const all = { goal: 'Echilibru', activity: 'Moderat', diet: 'Vegan', location: 'Acasă', experience: 'Începător', equipment: 'Gantere', days: 3, minutes: 30 };
  const done = await c.put('/api/profile', { ...all, done: true });
  assert.equal(done.data.profile.done, true);
  assert.equal(done.data.profile.eligibility, 'eligible');
  assert.equal((await c.put('/api/profile', { diet: 'Carnivor' })).status, 422);
  const minor = await c.put('/api/profile', { age: 16 });
  assert.equal(minor.data.profile.eligibility, 'minor');
});

// ---------- Export și ștergere ----------

test('export și ștergerea contului (cu toate datele)', async () => {
  const { c, email } = await registered();
  await c.post('/api/food', { day: today(), name: 'Măr', kcal: 80, protein: 0, carbs: 20, fat: 0, source: 'manual' });
  const exp = await c.get('/api/account/export');
  assert.equal(exp.status, 200);
  assert.equal(exp.data.food.length, 1);
  assert.equal(exp.data.account.email, email);
  assert.ok(!JSON.stringify(exp.data).includes('scrypt$'));
  assert.equal((await c.del('/api/account', { password: 'gresita' })).status, 422);
  assert.equal((await c.del('/api/account', { password: 'parola-sigura-1' })).status, 200);
  assert.equal((await c.get('/api/me')).status, 401);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE email = ?').get(email).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM food_entries WHERE user_id NOT IN (SELECT id FROM users)').get().n, 0);
  assert.equal((await client().post('/api/auth/login', { email, password: 'parola-sigura-1' })).status, 401);
});
