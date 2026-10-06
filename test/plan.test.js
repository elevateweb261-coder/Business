// Teste pentru planurile personalizate. Folosesc generatorul local de test sau generatori „falși”
// care simulează răspunsuri AI greșite — nu fac apeluri reale la AI.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createMailer } from '../server/mailer.js';
import { testProvider } from '../server/plan/providers.js';
import { FOOD_BY_ID, DIET_LEVEL } from '../server/plan/foods.js';

const servers = [];
after(() => Promise.all(servers.map(s => new Promise(r => s.close(r)))));

async function start(aiProvider) {
  const config = buildConfig({}, { dbPath: ':memory:', scryptCost: 12, appUrl: 'http://localhost:3999' });
  const db = openDb(':memory:');
  const { server } = createApp(config, { db, mailer: createMailer(config, { quiet: true }), aiProvider });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  return { base: `http://127.0.0.1:${server.address().port}`, db };
}

function client(base) {
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
  return { get: p => call('GET', p), post: (p, b = {}) => call('POST', p, b), put: (p, b) => call('PUT', p, b) };
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const monday = () => { const d = new Date(`${today()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const plusDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const TARGETS = { kcal: 1900, protein: 100, carbs: 220, fat: 65, water: 2000 };
const PROFILE = { age: 32, gender: 'Femeie', height: 168, weight: 66, goal: 'Echilibru', activity: 'Moderat', diet: 'Cu carne', location: 'Acasă', experience: 'Începător', equipment: 'Fără echipament', days: 3, minutes: 30 };

let n = 0;
async function user(base, profile = {}, { targets = TARGETS, done = true } = {}) {
  const c = client(base);
  const r = await c.post('/api/auth/register', { name: 'Test', email: `plan${++n}-${Date.now()}@exemplu.ro`, password: 'parola-sigura-1', terms: true, timezone: 'Europe/Bucharest' });
  assert.equal(r.status, 201);
  if (done) {
    const p = await c.put('/api/profile', { ...PROFILE, ...profile, done: true });
    assert.equal(p.status, 200, JSON.stringify(p.data));
  }
  if (targets) assert.equal((await c.put('/api/targets', targets)).status, 200);
  return c;
}

const allFoods = plan => plan.days.flatMap(d => d.meals.flatMap(m => m.ingredients.map(i => FOOD_BY_ID.get(i.foodId))));

test('generarea cere chestionar complet și ținte; minorii și alergiile nu primesc plan automat', async () => {
  const { base } = await start();
  const incomplete = await user(base, {}, { done: false });
  assert.equal((await incomplete.post('/api/plan/generate')).data.error.code, 'profile_incomplete');
  const noTargets = await user(base, {}, { targets: null });
  assert.equal((await noTargets.post('/api/plan/generate')).data.error.code, 'targets_missing');
  const minor = await user(base, { age: 16 });
  assert.equal((await minor.post('/api/plan/generate')).data.error.code, 'not_eligible');
  const allergic = await user(base, { healthConsent: true, allergies: 'arahide' });
  assert.equal((await allergic.post('/api/plan/generate')).data.error.code, 'not_eligible');
});

test('planul: 7 zile, mese din catalog, calorii aproape de țintă, sarcini zilnice', async () => {
  const { base } = await start();
  const c = await user(base);
  const r = await c.post('/api/plan/generate');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const plan = r.data.plan;
  assert.equal(plan.source, 'test');
  assert.equal(plan.days.length, 7);
  assert.equal(plan.days[0].date, monday());
  for (const d of plan.days) {
    assert.ok(Math.abs(d.nutrition.kcal - TARGETS.kcal) / TARGETS.kcal <= 0.1, `${d.date}: ${d.nutrition.kcal} kcal`);
    assert.deepEqual(d.meals.slice(0, 3).map(m => m.slot), ['mic_dejun', 'pranz', 'cina']);
    assert.equal(d.tasks.filter(t => t.type === 'apa').length, 1);
    // Nutriția mesei = suma ingredientelor (calculată pe server)
    for (const m of d.meals) assert.equal(m.nutrition.kcal, Math.round(m.ingredients.reduce((s, i) => s + FOOD_BY_ID.get(i.foodId).kcal * i.grams / 100, 0)));
  }
  assert.equal(plan.days.filter(d => d.tasks.some(t => t.type === 'antrenament')).length, 3);
  // A doua cerere nu regenerează (și nu consumă din limită)
  const again = await c.post('/api/plan/generate');
  assert.equal(again.data.plan.createdAt, plan.createdAt);
});

test('dieta și alimentele evitate sunt respectate', async () => {
  const { base } = await start();
  const c = await user(base, { diet: 'Vegan', dislike: 'tofu, banane' });
  const plan = (await c.post('/api/plan/generate')).data.plan;
  const foods = allFoods(plan);
  assert.ok(foods.every(f => DIET_LEVEL[f.diet] === 0), 'doar alimente vegane');
  assert.ok(!foods.some(f => f.id === 'tofu'), 'fără tofu');
});

test('gratuit: săptămâna 1 și doar primul antrenament; Premium: tot', async () => {
  const { base, db } = await start();
  const c = await user(base);
  const week1 = (await c.post('/api/plan/generate')).data;
  const workouts = week1.plan.days.flatMap(d => d.tasks.filter(t => t.type === 'antrenament'));
  assert.equal(workouts.filter(t => !t.locked).length, 1);
  assert.ok(workouts.filter(t => t.locked).every(t => !t.exercises), 'antrenamentele blocate nu sunt trimise');
  const next = plusDays(monday(), 7);
  const r = await c.post('/api/plan/generate', { week: next });
  assert.equal(r.status, 402);
  // Activăm Premium (în producție: doar prin notificarea verificată a procesatorului de plăți)
  const uid = db.prepare('SELECT id FROM users ORDER BY id DESC LIMIT 1').get().id;
  db.prepare("UPDATE subscriptions SET status = 'active', current_period_end = ? WHERE user_id = ?").run(new Date(Date.now() + 864e5 * 30).toISOString(), uid);
  const premiumWeek1 = (await c.get('/api/plan')).data;
  assert.ok(premiumWeek1.plan.days.flatMap(d => d.tasks).filter(t => t.type === 'antrenament').every(t => !t.locked && t.exercises.length >= 3));
  const week2 = await c.post('/api/plan/generate', { week: next });
  assert.equal(week2.status, 200);
  assert.equal(week2.data.weekIndex, 2);
  // Abonamentul expiră → săptămâna 2 nu mai este trimisă
  db.prepare("UPDATE subscriptions SET status = 'expired' WHERE user_id = ?").run(uid);
  const expired = (await c.get(`/api/plan?week=${next}`)).data;
  assert.equal(expired.plan, null);
  assert.equal(expired.locked, true);
});

test('porția consumată: proporțională, o singură dată pe zi și moment', async () => {
  const { base } = await start();
  const c = await user(base);
  const plan = (await c.post('/api/plan/generate')).data.plan;
  const day = plan.days.find(d => d.date === today());
  const lunch = day.meals.find(m => m.slot === 'pranz');
  const r = await c.post('/api/plan/log', { day: today(), slot: 'pranz', portion: 0.5 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.kcal, Math.round(lunch.nutrition.kcal * 0.5));
  assert.equal(r.data.source, 'plan');
  assert.equal((await c.post('/api/plan/log', { day: today(), slot: 'pranz', portion: 1 })).status, 409);
  assert.equal((await c.post('/api/plan/log', { day: plusDays(today(), 1), slot: 'cina', portion: 1 })).status, 422);
});

test('sarcini bifate și izolarea între utilizatori', async () => {
  const { base } = await start();
  const a = await user(base);
  const b = await user(base);
  const plan = (await a.post('/api/plan/generate')).data.plan;
  const task = plan.days[0].tasks[0];
  assert.equal((await a.put('/api/plan/tasks', { day: plan.days[0].date, taskId: task.id, done: true })).status, 200);
  assert.equal((await a.get('/api/plan')).data.plan.days[0].tasks[0].done, true);
  assert.equal((await b.get('/api/plan')).data.plan, null);
  assert.equal((await b.put('/api/plan/tasks', { day: plan.days[0].date, taskId: task.id, done: true })).status, 404);
  assert.equal((await b.post('/api/plan/log', { day: today(), slot: 'pranz', portion: 1 })).status, 404);
});

test('înlocuirea unei mese: masă diferită, cu calorii apropiate', async () => {
  const { base } = await start();
  const c = await user(base);
  const plan = (await c.post('/api/plan/generate')).data.plan;
  const old = plan.days[0].meals.find(m => m.slot === 'cina');
  const r = await c.post('/api/plan/replace', { day: plan.days[0].date, slot: 'cina' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.notEqual(r.data.meal.name, old.name);
  assert.ok(Math.abs(r.data.meal.nutrition.kcal - old.nutrition.kcal) / old.nutrition.kcal <= 0.2);
  assert.equal((await c.get('/api/plan')).data.plan.days[0].meals.find(m => m.slot === 'cina').name, r.data.meal.name);
});

test('răspuns AI invalid: reîncercare cu feedback; dacă rămâne invalid, nu se salvează nimic', async () => {
  const base = testProvider();
  const calls = [];
  // Simulează un AI care la prima încercare pune carne într-un plan vegan.
  const flaky = {
    name: 'fake', label: 'ai',
    async week(args) {
      calls.push(args.feedback);
      const res = await base.week(args);
      if (!args.feedback) res.data.days[0].meals[1].ingredients.push({ foodId: 'piept_pui', grams: 100 });
      return { ...res, content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 10, output_tokens: 20 }, model: 'fake' };
    },
    meal: base.meal,
  };
  const s1 = await start(flaky);
  const c = await user(s1.base, { diet: 'Vegan' });
  const r = await c.post('/api/plan/generate');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(calls.length, 2);
  assert.ok(calls[1].errors.some(e => e.includes('nu este compatibil')), 'feedback-ul conține eroarea');
  const log = s1.db.prepare('SELECT ok, attempts, input_tokens FROM ai_requests').get();
  assert.deepEqual({ ...log }, { ok: 1, attempts: 2, input_tokens: 20 });

  const broken = { name: 'fake', label: 'ai', async week(args) { const res = await base.week(args); res.data.days.pop(); return { ...res, content: [], usage: null }; }, meal: base.meal };
  const s2 = await start(broken);
  const c2 = await user(s2.base);
  const bad = await c2.post('/api/plan/generate');
  assert.equal(bad.status, 502);
  assert.equal(bad.data.error.code, 'ai_invalid_plan');
  assert.equal((await c2.get('/api/plan')).data.plan, null);
  assert.equal(s2.db.prepare('SELECT COUNT(*) n FROM plans').get().n, 0);
});

test('fără AI configurat: mesaj clar; limita zilnică de generări', async () => {
  const off = await start(null);
  const c = await user(off.base);
  const r = await c.post('/api/plan/generate');
  assert.equal(r.status, 503);
  assert.equal(r.data.error.code, 'ai_unavailable');
  assert.ok((await c.get('/api/plan')).data.blocked);

  const on = await start();
  const u = await user(on.base);
  for (let i = 0; i < 3; i++) assert.equal((await u.post('/api/plan/generate', { force: true })).status, 200);
  assert.equal((await u.post('/api/plan/generate', { force: true })).status, 429);
});
