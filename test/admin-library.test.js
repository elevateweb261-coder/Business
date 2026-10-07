// Teste pentru ecranele 6 (exerciții), 7 (catalog nutrițional) și 8 (media) din panoul de administrare.
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
import { EXERCISE_BY_ID, SEED_EXERCISES, exercisesFor } from '../server/plan/exercises.js';
import { FOOD_BY_ID, SEED_FOODS } from '../server/plan/foods.js';

let server, base, db;

before(async () => {
  const config = buildConfig({}, { dbPath: ':memory:', scryptCost: 12, appUrl: 'http://localhost:3999', uploadsDir: mkdtempSync(join(tmpdir(), 'metamorf-lib-')) });
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
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { get: p => call('GET', p), post: (p, b = {}) => call('POST', p, b), put: (p, b) => call('PUT', p, b), del: p => call('DELETE', p), raw: (p, buf) => call('PUT', p, undefined, buf) };
}

let n = 0;
async function account({ admin = false } = {}) {
  const c = client();
  const email = `l${++n}-${Date.now()}@exemplu.ro`;
  assert.equal((await c.post('/api/auth/register', { name: `Cont ${n}`, email, password: 'parola-sigura-1', terms: true })).status, 201);
  if (admin) {
    db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email);
    const l = await c.post('/api/admin/auth/login', { email, password: 'parola-sigura-1' });
    assert.equal((await c.post('/api/admin/auth/verify', { challenge: l.data.challenge, code: codeFor(l.data.secret.replace(/\s/g, ''), counterAt()) })).status, 200);
  }
  return c;
}

/** PNG minimal, cu dimensiunile dorite în antet. */
function png(width, height) {
  const buf = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf);
  buf.writeUInt32BE(13, 8); buf.write('IHDR', 12, 'ascii'); buf.writeUInt32BE(width, 16); buf.writeUInt32BE(height, 20);
  return buf;
}
const mp4 = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'ascii'), Buffer.alloc(200)]);

const EXERCISE = {
  name: 'Genuflexiuni cu săritură', mode: 'reps', muscles: ['picioare', 'fesieri'], places: ['acasa', 'sala'], equipment: ['none'],
  level: 'intermediar', sets: 3, reps: 10, restSec: 60,
  steps: ['Coboară în genuflexiune.', 'Sari exploziv în sus.', 'Aterizează ușor pe vârfuri.'], mistakes: ['Genunchii cad spre interior.'],
};

// ---------- Catalogul inițial ----------

test('catalog inițial: exercițiile și alimentele din cod sunt copiate în baza de date și folosite de planuri', async () => {
  const admin = await account({ admin: true });
  const ex = (await admin.get('/api/admin/exercises?q=genuflexiuni')).data;
  assert.ok(ex.items.some(e => e.id === 'genuflexiuni' && e.status === 'published' && e.steps.length >= 1));
  assert.equal(EXERCISE_BY_ID.size, SEED_EXERCISES.length);
  const foods = (await admin.get('/api/admin/foods')).data;
  assert.equal(foods.counts.all, SEED_FOODS.length);
  assert.equal(foods.counts.usda, SEED_FOODS.length);
  assert.ok(foods.items.every(f => f.editable === false));
  assert.equal(FOOD_BY_ID.get('granola').allergens.includes('gluten'), true);
});

// ---------- Ecranul 6: exerciții ----------

test('exerciții: ciornă, publicare cu câmpuri obligatorii, intră în planuri doar după publicare', async () => {
  const admin = await account({ admin: true });
  const draft = await admin.post('/api/admin/exercises', { name: 'Exercițiu nou', mode: 'reps' });
  assert.equal(draft.status, 201);
  assert.equal(draft.data.status, 'draft');
  assert.equal(EXERCISE_BY_ID.has(draft.data.id), false);
  const bad = await admin.put(`/api/admin/exercises/${draft.data.id}`, { name: 'Exercițiu nou', mode: 'reps', status: 'published' });
  assert.equal(bad.status, 422);
  for (const f of ['steps', 'muscles', 'places', 'level', 'sets', 'reps', 'restSec']) assert.ok(bad.data.error.fields[f], f);

  const pub = await admin.post('/api/admin/exercises', { ...EXERCISE, status: 'published' });
  assert.equal(pub.status, 201);
  assert.equal(pub.data.id, 'genuflexiuni_cu_saritura');
  assert.deepEqual(pub.data.equipment, ['none']);
  assert.equal(EXERCISE_BY_ID.get(pub.data.id).group, 'picioare');
  // Nivelul contează: un începător nu primește un exercițiu intermediar.
  const home = { location: 'Acasă', equipment: 'Fără echipament', experience: 'Începător' };
  assert.equal(exercisesFor(home).some(e => e.id === pub.data.id), false);
  assert.equal(exercisesFor({ ...home, experience: 'Intermediar' }).some(e => e.id === pub.data.id), true);

  const unpub = await admin.put(`/api/admin/exercises/${pub.data.id}`, { ...EXERCISE, status: 'draft' });
  assert.equal(unpub.data.status, 'draft');
  assert.equal(EXERCISE_BY_ID.has(pub.data.id), false);
  assert.equal((await admin.get(`/api/admin/exercises?level=intermediar&status=draft&q=saritura`)).data.total, 1);
  assert.equal((await admin.del(`/api/admin/exercises/${pub.data.id}`)).status, 200);
});

test('exerciții: echipamentul și locația limitează cui i se recomandă exercițiul', async () => {
  const admin = await account({ admin: true });
  const r = await admin.post('/api/admin/exercises', { ...EXERCISE, name: 'Ramat la aparat de test', places: ['sala'], equipment: ['aparate', 'none'], status: 'published' });
  assert.deepEqual(r.data.equipment, ['aparate'], '„fără echipament” nu se combină cu alt echipament');
  const id = r.data.id;
  assert.equal(exercisesFor({ location: 'Acasă', equipment: 'Gantere', experience: 'Avansat' }).some(e => e.id === id), false);
  assert.equal(exercisesFor({ location: 'La sală', equipment: 'Echipament de sală', experience: 'Avansat' }).some(e => e.id === id), true);
});

test('exerciții: video cu sursă / licență obligatorie; fișier sau link, nu amândouă', async () => {
  const admin = await account({ admin: true });
  const link = 'https://exemplu.ro/video/genuflexiuni';
  let r = await admin.post('/api/admin/exercises', { ...EXERCISE, name: 'Video fără sursă', videoUrl: link });
  assert.ok(r.data.error.fields.videoSource);
  r = await admin.post('/api/admin/exercises', { ...EXERCISE, name: 'Video http', videoUrl: 'http://exemplu.ro/v', videoSource: 'Licență CC BY 4.0' });
  assert.ok(r.data.error.fields.videoUrl);
  const vid = await admin.raw(`/api/admin/media?name=demo.mp4&source=${encodeURIComponent('Filmare proprie Metamorf')}`, mp4());
  assert.equal(vid.status, 201);
  r = await admin.post('/api/admin/exercises', { ...EXERCISE, name: 'Video dublu', video: vid.data.filename, videoUrl: link, videoSource: 'Proprie' });
  assert.ok(r.data.error.fields.videoUrl);
  r = await admin.post('/api/admin/exercises', { ...EXERCISE, name: 'Video bun', video: vid.data.filename, videoSource: 'Filmare proprie Metamorf', status: 'published' });
  assert.equal(r.status, 201);
  assert.equal(r.data.videoFileUrl, vid.data.url);
  assert.equal(EXERCISE_BY_ID.get(r.data.id).videoSource, 'Filmare proprie Metamorf');
  // Fișierul folosit nu se poate șterge.
  const media = (await admin.get(`/api/admin/media/${vid.data.id}`)).data;
  assert.deepEqual(media.usage.map(u => [u.type, u.id, u.role]), [['exercise', r.data.id, 'video']]);
  const del = await admin.del(`/api/admin/media/${vid.data.id}`);
  assert.equal(del.status, 409);
  assert.match(del.data.error.message, /Video bun/);
});

// ---------- Ecranul 7: catalog nutrițional ----------

test('catalog nutrițional: doar alimentele manuale se editează; numărul de rețete pentru fiecare aliment', async () => {
  const admin = await account({ admin: true });
  const ro = await admin.put('/api/admin/foods/granola', { name: 'Granola', group: 'cereale', diet: 'vegan', kcal: 1, protein: 1, carbs: 1, fat: 1 });
  assert.equal(ro.status, 403);
  assert.equal(FOOD_BY_ID.get('granola').kcal, 489);
  const bad = await admin.post('/api/admin/foods', { name: 'Zacuscă', group: 'legume', diet: 'vegan', kcal: 95, protein: 60, carbs: 30, fat: 20, allergens: 'gluten, nisip' });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.error.fields.fat && bad.data.error.fields.allergens);
  const z = await admin.post('/api/admin/foods', { name: 'Zacuscă de casă', group: 'legume', diet: 'vegan', kcal: '95', protein: '1,6', carbs: '7,4', fat: '6,5', allergens: [] });
  assert.equal(z.status, 201);
  assert.equal(z.data.source, 'manual');
  assert.equal(z.data.protein, 1.6);
  assert.equal(FOOD_BY_ID.get(z.data.id).name, 'Zacuscă de casă');
  const ed = await admin.put(`/api/admin/foods/${z.data.id}`, { ...z.data, kcal: 100 });
  assert.equal(ed.data.kcal, 100);
  await admin.post('/api/admin/recipes', { name: 'Tartine cu zacuscă', mealType: 'gustare', ingredients: [{ foodId: z.data.id, grams: 50 }, { foodId: 'paine_integrala', grams: 60 }] });
  const row = (await admin.get(`/api/admin/foods?q=${encodeURIComponent('zacusca')}`)).data.items[0];
  assert.equal(row.recipes, 1);
  assert.equal((await admin.get(`/api/admin/foods/${z.data.id}`)).data.usedIn[0].name, 'Tartine cu zacuscă');
  assert.equal((await admin.get('/api/admin/foods?source=manual')).data.items.every(f => f.source === 'manual'), true);
});

test('catalog nutrițional: importul raportează adăugate, actualizate, neschimbate și erori pe linii', async () => {
  const admin = await account({ admin: true });
  const row = { source: 'CIQUAL', sourceRef: '20047', name: 'Ardei gras roșu, crud', group: 'legume', diet: 'vegan', kcal: '31', protein: '1', carbs: '6', fat: '0,3', allergens: '' };
  const r1 = await admin.post('/api/admin/foods/import', {
    file: 'ciqual.csv',
    rows: [
      { line: 2, ...row },
      { line: 3, ...row, sourceRef: '', name: 'Fără cod' },
      { line: 4, ...row, source: 'altceva', sourceRef: '1', name: 'Sursă greșită' },
      { line: 5, ...row, sourceRef: '2', name: 'Valori greșite', kcal: 'mult' },
      { line: 6, source: 'manual', id: 'granola', name: 'Granola', group: 'cereale', diet: 'vegan', kcal: 1, protein: 1, carbs: 1, fat: 1 },
    ],
  });
  assert.equal(r1.status, 200);
  assert.equal(r1.data.added, 1);
  assert.deepEqual(r1.data.errors.map(e => e.line), [3, 4, 5, 6]);
  assert.match(r1.data.errors.find(e => e.line === 6).message, /USDA/);
  const id = [...FOOD_BY_ID.values()].find(f => f.sourceRef === '20047').id;
  const r2 = await admin.post('/api/admin/foods/import', { rows: [{ line: 2, ...row }, { line: 3, ...row, kcal: '32' }] });
  assert.deepEqual([r2.data.added, r2.data.updated, r2.data.unchanged], [0, 1, 1]);
  assert.equal(FOOD_BY_ID.get(id).kcal, 32);
  assert.equal(FOOD_BY_ID.get(id).source, 'ciqual');
  assert.equal((await admin.post('/api/admin/foods/import', { rows: [] })).status, 422);
});

// ---------- Ecranul 8: media ----------

test('media: încărcare cu tip verificat după conținut, dimensiuni, filtru „nefolosit”, sursă, ștergere', async () => {
  const admin = await account({ admin: true });
  assert.equal((await admin.raw('/api/admin/media?name=x.png', Buffer.from('nu este imagine'))).status, 422);
  const noSource = await admin.raw('/api/admin/media?name=v.mp4', mp4());
  assert.equal(noSource.status, 422);
  assert.ok(noSource.data.error.fields.source);
  const img = await admin.raw(`/api/admin/media?name=${encodeURIComponent('fotografie.png')}`, png(1200, 800));
  assert.equal(img.status, 201);
  assert.deepEqual([img.data.kind, img.data.width, img.data.height, img.data.originalName], ['image', 1200, 800, 'fotografie.png']);
  const list = (await admin.get('/api/admin/media?unused=1&kind=image')).data;
  assert.ok(list.items.some(m => m.id === img.data.id && m.used === false));
  const upd = await admin.put(`/api/admin/media/${img.data.id}`, { source: 'Fotografie proprie Metamorf' });
  assert.equal(upd.data.source, 'Fotografie proprie Metamorf');
  // Folosită ca fotografie de rețetă → nu mai apare la „nefolosit” și nu se poate șterge.
  const recipe = (await admin.post('/api/admin/recipes', { name: 'Rețetă cu foto', mealType: 'cina' })).data;
  assert.equal((await admin.post(`/api/admin/recipes/${recipe.id}/photo-media`, { filename: img.data.filename })).status, 200);
  assert.equal((await admin.get('/api/admin/media?unused=1')).data.items.some(m => m.id === img.data.id), false);
  assert.equal((await admin.del(`/api/admin/media/${img.data.id}`)).status, 409);
  await admin.del(`/api/admin/recipes/${recipe.id}/photo`);
  assert.equal((await admin.del(`/api/admin/media/${img.data.id}`)).status, 200);
  assert.equal((await fetch(base + img.data.url)).status, 404);
});

test('media: videoclipurile se servesc pe bucăți (Range); fotografiile rețetelor apar în bibliotecă', async () => {
  const admin = await account({ admin: true });
  const v = (await admin.raw(`/api/admin/media?name=a.mp4&source=${encodeURIComponent('Proprie')}`, mp4())).data;
  const part = await fetch(base + v.url, { headers: { Range: 'bytes=0-9' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 0-9/212');
  assert.equal((await part.arrayBuffer()).byteLength, 10);
  const recipe = (await admin.post('/api/admin/recipes', { name: 'Rețetă foto direct', mealType: 'cina' })).data;
  const up = await admin.raw(`/api/admin/recipes/${recipe.id}/photo?name=bol.png`, png(640, 480));
  assert.equal(up.status, 200);
  const lib = (await admin.get('/api/admin/media?kind=image')).data.items.find(m => m.url === up.data.photoUrl);
  assert.ok(lib && lib.used && lib.width === 640);
});

test('acces: conturile obișnuite nu ajung la exerciții, catalog sau media', async () => {
  const user = await account();
  for (const p of ['/api/admin/exercises', '/api/admin/foods', '/api/admin/media', '/api/admin/exercises-options']) assert.equal((await user.get(p)).status, 403, p);
  assert.equal((await user.post('/api/admin/foods/import', { rows: [{}] })).status, 403);
});
