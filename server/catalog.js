// Cataloagele din baza de date (exerciții, alimente) și legătura lor cu planurile.
// La pornire: dacă tabelele sunt goale, se copiază catalogul inițial din cod; apoi exercițiile publicate și toate
// alimentele se încarcă în catalogul activ folosit de generatorul de planuri, de validare și de rețete.
// Orice modificare din panou apelează `reloadExercises` / `reloadFoods`.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_EXERCISES, setExercises } from './plan/exercises.js';
import { SEED_FOODS, setFoods, allergensOf } from './plan/foods.js';
import { detectFile, imageSize, mediaUrl } from './media.js';
import { tx } from './db.js';

const now = () => new Date().toISOString();
const json = (s, fallback = []) => { try { return JSON.parse(s); } catch { return fallback; } };

/** Identificator stabil din nume: „Fandări alternative” → „fandari_alternative”. */
export function slugify(name) {
  return String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'element';
}

/** Un identificator nefolosit în tabelul dat, pornind de la nume. */
export function uniqueId(db, table, name) {
  const base = slugify(name);
  let id = base;
  for (let i = 2; db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id); i++) id = `${base.slice(0, 36)}_${i}`;
  return id;
}

// ---------- Exerciții ----------

/** Rândul din baza de date → obiectul folosit de planuri și de panou. */
export function exerciseFromRow(r, mediaOf = () => null) {
  const steps = json(r.steps_json);
  const muscles = json(r.muscles_json);
  const image = mediaOf(r.image), video = mediaOf(r.video);
  return {
    id: r.id, name: r.name, status: r.status,
    group: muscles[0] || 'tot_corpul', muscles, places: json(r.places_json), equipment: json(r.equipment_json, ['none']),
    level: r.level, mode: r.mode, sets: r.sets, reps: r.reps, seconds: r.seconds, restSec: r.rest_sec,
    steps, mistakes: json(r.mistakes_json), instructions: steps.join(' '),
    image: r.image, imageUrl: image ? mediaUrl(image) : null,
    video: r.video, videoFileUrl: video ? mediaUrl(video) : null, videoUrl: r.video_url, videoSource: r.video_source,
    createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at,
  };
}

export function mediaLookup(db) {
  const rows = db.prepare('SELECT * FROM media').all();
  const byName = new Map(rows.map(m => [m.filename, m]));
  return name => (name ? byName.get(name) || null : null);
}

export function reloadExercises(db) {
  const mediaOf = mediaLookup(db);
  setExercises(db.prepare("SELECT * FROM exercises WHERE status = 'published' ORDER BY rowid").all().map(r => exerciseFromRow(r, mediaOf)));
}

/** Instrucțiunile din catalogul inițial, împărțite în pași (câte o propoziție). */
const toSteps = text => text.split(/(?<=[.;])\s+/).map(s => s.replace(/;$/, '.').trim()).filter(Boolean)
  .map(s => s.charAt(0).toUpperCase() + s.slice(1));

const SEED_EQUIPMENT = { none: ['none'], gantere: ['gantere'], benzi: ['benzi'], sala: ['aparate'] };

function seedExercises(db) {
  const t = now();
  const ins = db.prepare(`INSERT INTO exercises (id, name, status, muscles_json, places_json, equipment_json, level, mode, steps_json, created_at, updated_at, published_at)
    VALUES (?, ?, 'published', ?, ?, ?, NULL, ?, ?, ?, ?, ?)`);
  for (const e of SEED_EXERCISES) {
    ins.run(e.id, e.name, JSON.stringify([e.group]), JSON.stringify(e.equipment === 'sala' ? ['sala'] : ['acasa', 'sala']),
      JSON.stringify(SEED_EQUIPMENT[e.equipment]), e.mode, JSON.stringify(toSteps(e.instructions)), t, t, t);
  }
}

// ---------- Alimente ----------

export function foodFromRow(r) {
  return {
    id: r.id, name: r.name, group: r.food_group, diet: r.diet,
    kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat,
    allergens: json(r.allergens_json), tags: json(r.tags_json), source: r.source, sourceRef: r.source_ref,
    updatedAt: r.updated_at,
  };
}

export function reloadFoods(db) {
  setFoods(db.prepare('SELECT * FROM foods ORDER BY rowid').all().map(foodFromRow));
}

// Valorile inițiale sunt valori de referință USDA FoodData Central (de verificat rând cu rând înainte de lansare).
function seedFoods(db) {
  const t = now();
  const ins = db.prepare(`INSERT INTO foods (id, name, food_group, diet, kcal, protein, carbs, fat, allergens_json, tags_json, source, source_ref, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'usda', NULL, ?, ?)`);
  for (const f of SEED_FOODS) {
    ins.run(f.id, f.name, f.group, f.diet, f.kcal, f.protein, f.carbs, f.fat, JSON.stringify(allergensOf(f)), JSON.stringify(f.tags), t, t);
  }
}

// ---------- Media: fotografiile rețetelor încărcate înainte de biblioteca media ----------

function backfillRecipePhotos(db, uploadsDir) {
  const missing = db.prepare('SELECT DISTINCT photo FROM recipes WHERE photo IS NOT NULL AND photo NOT IN (SELECT filename FROM media)').all();
  for (const { photo } of missing) {
    const file = join(uploadsDir, 'recipes', photo);
    let buf, st;
    try { st = statSync(file); buf = readFileSync(file); } catch { continue; }
    const type = detectFile(buf);
    if (!type) continue;
    const size = imageSize(buf, type.ext);
    db.prepare(`INSERT INTO media (kind, folder, filename, mime, bytes, width, height, original_name, source, uploaded_by, created_at)
      VALUES (?, 'recipes', ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`).run(type.kind, photo, type.mime, st.size, size?.width ?? null, size?.height ?? null, st.mtime.toISOString());
  }
}

/** Pregătește cataloagele la pornirea aplicației. */
export function initCatalogs(db, config) {
  tx(db, () => {
    if (!db.prepare('SELECT 1 FROM exercises LIMIT 1').get()) seedExercises(db);
    if (!db.prepare('SELECT 1 FROM foods LIMIT 1').get()) seedFoods(db);
    backfillRecipePhotos(db, config.uploadsDir);
  });
  reloadExercises(db);
  reloadFoods(db);
}
