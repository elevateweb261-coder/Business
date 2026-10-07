'use strict';
// Starea aplicației.
//  - `session`: modul curent — 'guest' (neconectat), 'demo' (exemple locale) sau 'account' (cont real, date pe server).
//  - `db`: datele afișate. În demo vin din localStorage; în cont, de pe server (nimic personal nu rămâne în browser).
//  - `ui`: starea temporară a interfeței.
// Toate modificările trec prin funcțiile async de mai jos, care aleg singure demo sau server.

const STORAGE_KEY = 'metamorf-demo-v1';
const MODE_KEY = 'metamorf-mode';
const KEEP_DAYS = 180;

const DEMO_FORM = {
  name: 'Alex', age: 25, gender: 'Femeie', height: 170, weight: 72.8,
  goal: 'Echilibru', activity: 'Moderat', diet: 'Cu carne', likes: '', dislike: '',
  location: 'Acasă', experience: 'Începător', equipment: 'Fără echipament', days: 3, minutes: 30,
  allergies: '', health: '', healthConsent: false, step: 0, done: false, eligibility: 'incomplete',
};

const EMPTY_FORM = Object.fromEntries(Object.keys(DEMO_FORM).map(k => [k, '']));
Object.assign(EMPTY_FORM, { healthConsent: false, step: 0, done: false, eligibility: 'incomplete' });

/** Ținte exemplu pentru modul demo. În cont, țintele sunt goale până când utilizatorul le setează. */
const DEFAULT_TARGETS = { kcal: 1900, protein: 120, carbs: 220, fat: 65, water: 2000 };

const session = { mode: 'guest', user: null, subscription: null, serverAvailable: true, counts: { food: 0, workouts: 0, weights: 0 } };

function demoWeights() {
  const values = [74, 73.7, 73.4, 73.2, 73.1, 72.8];
  return values.map((value, i) => ({ id: uid(), date: dateKey(addDays(new Date(), -37 + i * 7)), time: '08:00', value, demo: true }));
}

function freshDemoDb() {
  return { version: 1, form: { ...DEMO_FORM }, targets: { ...DEFAULT_TARGETS }, days: {}, weights: demoWeights() };
}

let storageOk = true;

function readDemoDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshDemoDb();
    const saved = JSON.parse(raw);
    if (saved?.version !== 1) return freshDemoDb();
    const days = saved.days || {};
    // Compatibilitate cu versiunea anterioară: `workout` (unul pe zi) → `workouts` (listă).
    for (const d of Object.values(days)) {
      if (d.workout && !d.workouts) d.workouts = [{ id: uid(), seconds: d.workout.seconds || 0 }];
      delete d.workout;
      d.workouts ||= [];
    }
    return {
      ...freshDemoDb(), ...saved,
      form: { ...DEMO_FORM, ...saved.form },
      targets: { ...DEFAULT_TARGETS, ...saved.targets },
      days,
      weights: Array.isArray(saved.weights) ? saved.weights.map(w => ({ time: '08:00', ...w })) : [],
    };
  } catch {
    storageOk = false;
    return freshDemoDb();
  }
}

const db = { version: 1, form: { ...EMPTY_FORM }, targets: null, days: {}, weights: [] };

const ui = {
  view: 'acasa',
  selectedDate: dateKey(),
  step: 1,
  authTab: 'login',
  resetToken: '',
  scanMode: 'manual',
  scanResult: null,
  scanImage: null,
  scanFileName: '',
  workoutRunning: false,
  seconds: 0,
  loadError: null,
};

const isDemo = () => session.mode === 'demo';
const isAccount = () => session.mode === 'account';

function save() {
  if (!isDemo()) return;
  const cutoff = dateKey(addDays(new Date(), -KEEP_DAYS));
  for (const key of Object.keys(db.days)) if (key < cutoff) delete db.days[key];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    storageOk = true;
  } catch {
    storageOk = false;
  }
}

function setPreferredMode(mode) {
  try { mode ? localStorage.setItem(MODE_KEY, mode) : localStorage.removeItem(MODE_KEY); } catch { /* indisponibil */ }
}
function preferredMode() {
  try { return localStorage.getItem(MODE_KEY); } catch { return null; }
}

function replaceDb(next) {
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, next);
  ui.selectedDate = dateKey();
  ui.scanResult = null;
}

// ---------- Moduri ----------

function enterDemo() {
  session.mode = 'demo';
  session.user = null;
  session.subscription = null;
  replaceDb(readDemoDb());
  ui.scanMode = 'foto';
  setPreferredMode('demo');
}

function enterGuest() {
  session.mode = 'guest';
  session.user = null;
  session.subscription = null;
  replaceDb({ version: 1, form: { ...EMPTY_FORM }, targets: null, days: {}, weights: [] });
  setPreferredMode(null);
}

function resetDemo() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* indisponibil */ }
  replaceDb(freshDemoDb());
  ui.step = 1;
}

// ---------- Conversii server → interfață ----------

function applyMe(me) {
  session.user = me.user;
  session.subscription = me.subscription;
  const p = me.profile;
  db.form = { ...EMPTY_FORM, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ''])), name: me.user.name };
  db.targets = me.targets;
}

const foodFromServer = e => ({
  id: e.id, name: e.name, grams: e.grams, kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat,
  source: e.source, slot: e.slot ?? undefined, mealRef: e.mealRef, time: clockTime(new Date(e.loggedAt)),
});
const weightFromServer = w => ({ id: w.id, date: w.at.slice(0, 10), time: w.at.slice(11, 16), value: w.kg });

/** Intrare în cont: profilul + ultimele ~5 săptămâni de date. */
async function enterAccount(me) {
  session.mode = 'account';
  setPreferredMode(null);
  replaceDb({ version: 1, form: { ...EMPTY_FORM }, targets: null, days: {}, weights: [] });
  applyMe(me);
  ui.scanMode = 'manual';
  await loadAccountData();
  await loadPlan();
}

async function loadAccountData() {
  const from = dateKey(addDays(new Date(), -34));
  const state = await API.get(`/api/state?from=${from}&to=${today()}`);
  const days = {};
  for (const [key, d] of Object.entries(state.days)) {
    days[key] = { water: d.water, log: d.log.map(foodFromServer), workouts: d.workouts.map(w => ({ id: w.id, seconds: w.durationS })), scans: 0 };
  }
  db.days = days;
  db.weights = state.weights.map(weightFromServer);
  session.counts = state.counts;
}

// ---------- Zile ----------

const today = () => dateKey();
const isFuture = key => key > today();
const emptyDay = () => ({ water: 0, log: [], scans: 0, workouts: [] });
const getDay = (key = today()) => db.days[key] || emptyDay();

function ensureDay(key = today()) {
  if (!db.days[key]) db.days[key] = emptyDay();
  return db.days[key];
}

function totals(key = today()) {
  return getDay(key).log.reduce((t, e) => ({
    kcal: t.kcal + e.kcal, protein: t.protein + e.protein, carbs: t.carbs + e.carbs, fat: t.fat + e.fat,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

const isActive = key => { const d = getDay(key); return d.log.length > 0 || d.water > 0 || d.workouts.length > 0; };

function weekActivity() {
  const now = today();
  return weekDates().map(date => {
    const key = dateKey(date);
    return { date, key, isToday: key === now, future: key > now, active: isActive(key), kcal: totals(key).kcal };
  });
}

function workoutCount(n = 30) {
  const from = dateKey(addDays(new Date(), -(n - 1)));
  return Object.entries(db.days).filter(([key]) => key >= from).reduce((s, [, d]) => s + d.workouts.length, 0);
}

const scansLeft = () => (appSettings.features.photoScan ? Math.max(0, appSettings.scanLimits.free - getDay().scans) : 0);

/** Pașii de început pentru un cont nou. */
function firstSteps() {
  return [
    { key: 'profile', done: !!db.form.done, title: 'Completează chestionarul', desc: 'Obiectiv, alimentație, antrenament.', action: 'data-view="chestionar"', cta: 'Începe' },
    { key: 'targets', done: !!db.targets, title: 'Setează țintele zilnice', desc: 'Calorii, macronutrienți și apă — valorile tale.', action: 'data-action="targets"', cta: 'Setează' },
    { key: 'meal', done: session.counts.food > 0 || Object.values(db.days).some(d => d.log.length), title: 'Înregistrează prima masă', desc: 'Manual sau din exemplele de mese.', action: 'data-view="scanner"', cta: 'Adaugă' },
    { key: 'weight', done: db.weights.length > 0, title: 'Notează greutatea', desc: 'Punctul de plecare pentru grafice.', action: 'data-action="addWeight"', cta: 'Notează' },
  ];
}

// ---------- Plan alimentar (exemple) ----------

function dislikeTerms() {
  return normalize(db.form.dislike).split(/[,;]+/).map(s => s.trim()).filter(s => s.length >= 3);
}

function conflicts(meal, terms = dislikeTerms()) {
  const text = normalize([meal.name, ...meal.ingredients].join(' '));
  return terms.filter(t => text.includes(t));
}

const FEATURED_MEAL = 'l-somon';

function pickMeal(slotIndex, weekday) {
  const slot = SLOTS[slotIndex];
  const max = DIET_MAX[db.form.diet] ?? 4;
  const compatible = MEALS[slot.key].filter(m => DIET_LEVEL[m.diet] <= max);
  const terms = dislikeTerms();
  const preferred = compatible.filter(m => conflicts(m, terms).length === 0);
  const pool = preferred.length ? preferred : compatible;
  let index = weekday % pool.length;
  // Prânzul de azi este masa din fotografie (bowl cu somon), dacă dieta o permite.
  // Schimbăm locul cu ziua în care ar fi căzut, ca săptămâna să nu o conțină de două ori.
  if (slot.key === 'lunch') {
    const featured = pool.findIndex(m => m.id === FEATURED_MEAL);
    const todayIndex = weekdayIndex(new Date()) % pool.length;
    if (featured >= 0 && featured !== todayIndex) {
      if (index === todayIndex) index = featured;
      else if (index === featured) index = todayIndex;
    }
  }
  const meal = pool[index];
  return { ...meal, type: slot.type, time: slot.time, slotLabel: slot.label, slotIndex, conflicts: conflicts(meal, terms) };
}

const planFor = (key = today()) => SLOTS.map((_, i) => pickMeal(i, weekdayIndex(parseKey(key))));
const slotLogged = (key, slotIndex) => getDay(key).log.some(e => e.slot === slotIndex);

// ---------- Modificări (demo local sau server) ----------

async function addLogEntry(key, entry) {
  if (isAccount()) {
    const saved = await API.post('/api/food', { day: key, ...entry, clientId: uid() });
    ensureDay(key).log.push(foodFromServer(saved));
    session.counts.food++;
    return;
  }
  ensureDay(key).log.push({ id: uid(), time: key === today() ? clockTime() : '', ...entry });
  save();
}

/** Întoarce 'ok', 'future' sau 'duplicate'. */
async function addPlanMeal(key, slotIndex) {
  if (isFuture(key)) return 'future';
  if (slotLogged(key, slotIndex)) return 'duplicate';
  const m = planFor(key)[slotIndex];
  try {
    await addLogEntry(key, {
      name: `${m.slotLabel} · ${m.name}`, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat,
      source: isAccount() ? 'example' : 'plan', slot: slotIndex, mealRef: m.id,
    });
  } catch (err) {
    if (err.code === 'duplicate') { await loadAccountData(); return 'duplicate'; }
    throw err;
  }
  return 'ok';
}

const findEntry = (id, key = today()) => getDay(key).log.find(e => String(e.id) === String(id));

async function updateEntry(id, patch, key = today()) {
  const entry = findEntry(id, key);
  if (!entry) return;
  if (isAccount()) Object.assign(entry, foodFromServer(await API.patch(`/api/food/${id}`, patch)));
  else { Object.assign(entry, patch); save(); }
}

async function removeEntry(id, key = today()) {
  const log = ensureDay(key).log;
  const index = log.findIndex(e => String(e.id) === String(id));
  if (index < 0) return null;
  if (isAccount()) await API.del(`/api/food/${id}`);
  const [entry] = log.splice(index, 1);
  save();
  return { entry, index, key };
}

async function restoreEntry({ entry, index, key }) {
  if (isAccount()) {
    const { name, grams, kcal, protein, carbs, fat, source, slot, mealRef } = entry;
    const saved = await API.post('/api/food', { day: key, name, grams, kcal, protein, carbs, fat, source, slot, mealRef, clientId: uid() });
    ensureDay(key).log.splice(index, 0, foodFromServer(saved));
    return;
  }
  ensureDay(key).log.splice(index, 0, entry);
  save();
}

async function changeWater(delta) {
  const d = ensureDay();
  const ml = Math.min(6000, Math.max(0, d.water + delta));
  if (isAccount()) await API.put(`/api/water/${today()}`, { ml });
  d.water = ml;
  save();
}

async function addWorkout(seconds) {
  if (isAccount()) {
    const w = await API.post('/api/workouts', { day: today(), durationS: seconds, planRef: 'exemplu-tot-corpul', clientId: uid() });
    ensureDay().workouts.push({ id: w.id, seconds: w.durationS });
    return;
  }
  ensureDay().workouts.push({ id: uid(), seconds });
  save();
}

const sortWeights = () => db.weights.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

async function addWeight(date, time, value) {
  if (isAccount()) db.weights.push(weightFromServer(await API.post('/api/weights', { at: `${date}T${time}`, kg: value })));
  else { db.weights.push({ id: uid(), date, time, value, demo: false }); save(); }
  sortWeights();
}

async function removeWeight(id) {
  const index = db.weights.findIndex(w => String(w.id) === String(id));
  if (index < 0) return null;
  if (isAccount()) await API.del(`/api/weights/${id}`);
  const [w] = db.weights.splice(index, 1);
  save();
  return w;
}

async function restoreWeight(w) {
  if (isAccount()) await addWeight(w.date, w.time, w.value);
  else { db.weights.push(w); sortWeights(); save(); }
}

function clearDemoWeights() {
  db.weights = db.weights.filter(w => !w.demo);
  save();
}

async function saveTargets(t) {
  if (isAccount()) {
    db.targets = t ? (await API.put('/api/targets', t)).targets : (await API.del('/api/targets')).targets;
    await loadPlan(); // țintele pot debloca generarea planului
  }
  else { db.targets = t || { ...DEFAULT_TARGETS }; save(); }
}

/** Salvează câmpuri din profil (și progresul chestionarului). */
async function saveProfile(fields) {
  if (isAccount()) {
    applyMe(await API.put('/api/profile', { ...fields, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    if (fields.done || fields.healthConsent !== undefined) await loadPlan(); // eligibilitatea se poate schimba
    return;
  }
  const next = { ...db.form, ...fields };
  if (fields.healthConsent === false) { next.allergies = ''; next.health = ''; }
  if (fields.step !== undefined) next.step = Math.max(Number(db.form.step) || 0, fields.step);
  if (fields.done) {
    next.done = true;
    next.eligibility = Number(next.age) < 18 ? 'minor' : (next.allergies || next.health) ? 'specialist' : 'eligible';
  }
  db.form = next;
  save();
}

/**
 * Activitatea pe zile pentru un an întreg: { 'AAAA-LL-ZZ': { kcal, water, workouts, meals } }.
 * În cont, datele vin de pe server (doar zilele cu înregistrări); în demo, din browser.
 */
async function yearActivity(year) {
  const summary = d => ({ kcal: d.log.reduce((s, e) => s + e.kcal, 0), meals: d.log.length, water: d.water, workouts: d.workouts.length });
  const out = {};
  if (isAccount()) {
    const state = await API.get(`/api/state?from=${year}-01-01&to=${year}-12-31`);
    for (const [key, d] of Object.entries(state.days)) out[key] = summary(d);
    return out;
  }
  for (const [key, d] of Object.entries(db.days)) if (key.startsWith(`${year}-`)) out[key] = summary(d);
  return out;
}

// ---------- Plan personalizat (doar în cont) ----------

const currentMonday = () => dateKey(weekDates()[0]);

/** Planul săptămânii curente, cu regulile gratuit/Premium aplicate pe server. Eșecul nu blochează aplicația. */
async function loadPlan() {
  if (!isAccount()) { db.plan = null; return; }
  try {
    db.plan = await API.get(`/api/plan?week=${currentMonday()}`);
    ui.planError = null;
  } catch (err) {
    db.plan = null;
    ui.planError = err.message;
  }
}

const planDay = (key = today()) => db.plan?.plan?.days.find(d => d.date === key) || null;
const planMeal = (key, slot) => planDay(key)?.meals.find(m => m.slot === slot) || null;

async function generatePlan(force = false) {
  db.plan = await API.post('/api/plan/generate', { week: currentMonday(), force });
}

async function replacePlanMeal(key, slot) {
  const { meal } = await API.post('/api/plan/replace', { day: key, slot });
  const day = planDay(key);
  day.meals = day.meals.map(m => (m.slot === slot ? meal : m));
  day.nutrition = day.meals.reduce((t, m) => ({
    kcal: t.kcal + m.nutrition.kcal, protein: t.protein + m.nutrition.protein, carbs: t.carbs + m.nutrition.carbs, fat: t.fat + m.nutrition.fat,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return meal;
}

/** Înregistrează porția consumată dintr-o masă din plan (calculată pe server). */
async function logPlanPortion(key, slot, portion) {
  const entry = await API.post('/api/plan/log', { day: key, slot, portion });
  ensureDay(key).log.push(foodFromServer(entry));
  session.counts.food++;
}

async function setPlanTask(key, taskId, done) {
  await API.put('/api/plan/tasks', { day: key, taskId, done });
  const task = planDay(key)?.tasks.find(t => t.id === taskId);
  if (task) task.done = done;
}

const sortedWeights = () => [...db.weights].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
const hasDemoWeights = () => db.weights.some(w => w.demo);
