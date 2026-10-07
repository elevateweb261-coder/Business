// Catalog nutrițional (ecranul 7): tabel cu căutare și filtru pe sursă, editare DOAR pentru alimentele introduse
// manual (cele din USDA / CIQUAL / Open Food Facts sunt doar pentru citire), import pe loturi cu rezumat.
import { HttpError, badRequest, notFound } from '../http.js';
import { adminHelpers, diffValues } from '../admin-common.js';
import { ALLERGENS, FOOD_GROUPS, DIET_TYPES, FOOD_SOURCES } from '../plan/foods.js';
import { foodFromRow, reloadFoods, slugify, uniqueId } from '../catalog.js';
import { tx } from '../db.js';

const ROLES = ['admin', 'editor'];
const MAX_IMPORT_BATCH = 200; // ~50 KB de JSON, sub limita de 100 KB a cererilor
const now = () => new Date().toISOString();
const norm = s => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const OPTIONS = { groups: FOOD_GROUPS, diets: DIET_TYPES, sources: FOOD_SOURCES, allergens: ALLERGENS };

/** Număr din text („13,2” sau „13.2”); null dacă lipsește. */
const num = v => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

const SOURCE_ALIASES = { usda: 'usda', 'usda fooddata central': 'usda', ciqual: 'ciqual', off: 'off', 'open food facts': 'off', openfoodfacts: 'off', manual: 'manual' };
const DIET_ALIASES = { vegan: 'vegan', vegetarian: 'vegetarian', fish: 'fish', peste: 'fish', meat: 'meat', carne: 'meat', pork: 'pork', porc: 'pork' };
const GROUP_ALIASES = Object.fromEntries(Object.entries(FOOD_GROUPS).flatMap(([k, v]) => [[k, k], [norm(v), k]]));

/** Alergenii dintr-o listă sau un text („gluten, lapte”); acceptă codurile sau denumirile. */
function parseAllergens(v) {
  const items = Array.isArray(v) ? v : String(v ?? '').split(/[,|;]/);
  const out = [], bad = [];
  for (const raw of items.map(x => String(x).trim()).filter(Boolean)) {
    const n = norm(raw);
    const code = n in ALLERGENS ? n : Object.keys(ALLERGENS).find(k => norm(ALLERGENS[k]).startsWith(n) || norm(ALLERGENS[k]).split(' (')[0] === n);
    if (code) out.push(code); else bad.push(raw);
  }
  return { allergens: [...new Set(out)], bad };
}

/** Valorile nutriționale și descrierea unui aliment; aruncă 422 cu câmpurile greșite. */
function validateFood(body) {
  const fields = {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 80) fields.name = 'Numele trebuie să aibă 2–80 de caractere.';
  const group = GROUP_ALIASES[norm(body.group || 'altele')];
  if (!group) fields.group = 'Alege grupa.';
  const diet = DIET_ALIASES[norm(body.diet)];
  if (!diet) fields.diet = 'Alege tipul (vegan, vegetarian, pește, carne, porc).';
  const v = { kcal: num(body.kcal), protein: num(body.protein), carbs: num(body.carbs), fat: num(body.fat) };
  const label = { kcal: 'Caloriile', protein: 'Proteinele', carbs: 'Carbohidrații', fat: 'Grăsimile' };
  for (const k of Object.keys(v)) {
    const max = k === 'kcal' ? 900 : 100;
    if (v[k] === null || Number.isNaN(v[k]) || v[k] < 0 || v[k] > max) fields[k] = `${label[k]} la 100 g: un număr între 0 și ${max}.`;
  }
  if (!fields.protein && !fields.carbs && !fields.fat && v.protein + v.carbs + v.fat > 100.5) fields.fat = 'Proteinele, carbohidrații și grăsimile depășesc împreună 100 g la 100 g.';
  const { allergens, bad } = parseAllergens(body.allergens);
  if (bad.length) fields.allergens = `Alergeni necunoscuți: ${bad.join(', ')}.`;
  if (Object.keys(fields).length) throw badRequest('Verifică datele alimentului.', fields);
  const round1 = n => Math.round(n * 10) / 10;
  return { name, group, diet, kcal: Math.round(v.kcal), protein: round1(v.protein), carbs: round1(v.carbs), fat: round1(v.fat), allergens };
}

export function registerFoodRoutes(router, app) {
  const { db } = app;
  const { on, audit } = adminHelpers(app);

  const recipeCounts = () => new Map(db.prepare('SELECT food_id, COUNT(DISTINCT recipe_id) n FROM recipe_ingredients GROUP BY food_id').all().map(r => [r.food_id, r.n]));
  const out = (r, counts = recipeCounts()) => ({ ...foodFromRow(r), editable: r.source === 'manual', recipes: counts.get(r.id) || 0 });
  const load = ctx => {
    const r = db.prepare('SELECT * FROM foods WHERE id = ?').get(String(ctx.params.id));
    if (!r) throw notFound('Alimentul nu există.');
    return r;
  };

  const insert = (id, d, source, sourceRef, userId) => {
    const t = now();
    db.prepare(`INSERT INTO foods (id, name, food_group, diet, kcal, protein, carbs, fat, allergens_json, tags_json, source, source_ref, created_at, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)`)
      .run(id, d.name, d.group, d.diet, d.kcal, d.protein, d.carbs, d.fat, JSON.stringify(d.allergens), source, sourceRef, t, t, userId);
  };
  const update = (id, d, source, sourceRef, userId) => {
    db.prepare(`UPDATE foods SET name = ?, food_group = ?, diet = ?, kcal = ?, protein = ?, carbs = ?, fat = ?, allergens_json = ?,
      source = ?, source_ref = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
      .run(d.name, d.group, d.diet, d.kcal, d.protein, d.carbs, d.fat, JSON.stringify(d.allergens), source, sourceRef, now(), userId, id);
  };

  on('GET', '/api/admin/foods', ctx => {
    const sp = ctx.url.searchParams;
    const q = norm(sp.get('q') || '');
    const source = sp.get('source');
    const page = Math.max(1, Number.parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = 50;
    const counts = recipeCounts();
    const all = db.prepare('SELECT * FROM foods ORDER BY name').all();
    const bySource = Object.fromEntries(Object.keys(FOOD_SOURCES).map(s => [s, 0]));
    for (const r of all) bySource[r.source]++;
    let list = all;
    if (source in FOOD_SOURCES) list = list.filter(r => r.source === source);
    if (q) list = list.filter(r => norm(`${r.name} ${r.id} ${r.source_ref || ''}`).includes(q));
    return {
      total: list.length, page, pageSize, counts: { all: all.length, ...bySource }, options: OPTIONS,
      items: list.slice((page - 1) * pageSize, page * pageSize).map(r => out(r, counts)),
    };
  }, { roles: ROLES });

  on('GET', '/api/admin/foods/:id', ctx => {
    const r = load(ctx);
    const recipes = db.prepare('SELECT DISTINCT r.id, r.name FROM recipe_ingredients i JOIN recipes r ON r.id = i.recipe_id WHERE i.food_id = ? ORDER BY r.name').all(r.id).map(x => ({ ...x }));
    return { food: out(r), usedIn: recipes, options: OPTIONS };
  }, { roles: ROLES });

  // Aliment introdus manual (de ex. un produs local fără corespondent în sursele verificate).
  on('POST', '/api/admin/foods', ctx => {
    const d = validateFood(ctx.body);
    const id = uniqueId(db, 'foods', d.name);
    insert(id, d, 'manual', null, ctx.user.id);
    reloadFoods(db);
    audit(ctx, 'create_food', null, { food: id, name: d.name });
    ctx.status = 201;
    return out(db.prepare('SELECT * FROM foods WHERE id = ?').get(id));
  }, { roles: ROLES });

  on('PUT', '/api/admin/foods/:id', ctx => {
    const r = load(ctx);
    if (r.source !== 'manual') throw new HttpError(403, 'read_only', `Valorile din ${FOOD_SOURCES[r.source]} sunt verificate și nu se editează manual. Se actualizează doar prin import.`);
    const d = validateFood(ctx.body);
    const before = foodFromRow(r);
    update(r.id, d, 'manual', null, ctx.user.id);
    reloadFoods(db);
    audit(ctx, 'update_food', null, { food: r.id, name: d.name, changes: diffValues(before, d, ['name', 'group', 'diet', 'kcal', 'protein', 'carbs', 'fat', 'allergens']) });
    return out(db.prepare('SELECT * FROM foods WHERE id = ?').get(r.id));
  }, { roles: ROLES });

  // Import pe loturi: { file, rows: [{ line, id?, name, source, sourceRef?, group, diet, kcal, protein, carbs, fat, allergens }] }.
  // Fiecare rând este validat separat; rândurile greșite sunt raportate cu numărul liniei și nu opresc restul.
  on('POST', '/api/admin/foods/import', ctx => {
    const rows = Array.isArray(ctx.body.rows) ? ctx.body.rows : null;
    if (!rows || !rows.length) throw badRequest('Fișierul nu conține rânduri de importat.');
    if (rows.length > MAX_IMPORT_BATCH) throw badRequest(`Cel mult ${MAX_IMPORT_BATCH} de rânduri pe lot.`);
    const result = { added: 0, updated: 0, unchanged: 0, errors: [] };
    tx(db, () => {
      for (const [i, row] of rows.entries()) {
        const line = Number.isInteger(row?.line) ? row.line : i + 1;
        try {
          const source = SOURCE_ALIASES[norm(row?.source)];
          if (!source) throw badRequest('Sursa trebuie să fie USDA, CIQUAL, Open Food Facts sau manual.');
          const sourceRef = row.sourceRef ? String(row.sourceRef).trim().slice(0, 60) : null;
          if (source !== 'manual' && !sourceRef) throw badRequest(`Pentru ${FOOD_SOURCES[source]} este necesar codul din sursă (referinta_sursa).`);
          const d = validateFood(row);
          const wantedId = row.id ? slugify(row.id) : null;
          const existing = (wantedId && db.prepare('SELECT * FROM foods WHERE id = ?').get(wantedId))
            || (sourceRef && db.prepare('SELECT * FROM foods WHERE source = ? AND source_ref = ?').get(source, sourceRef))
            || (!wantedId && !sourceRef && db.prepare('SELECT * FROM foods WHERE id = ?').get(slugify(d.name)));
          if (existing) {
            if (existing.source !== 'manual' && source === 'manual') throw badRequest(`„${existing.name}” provine din ${FOOD_SOURCES[existing.source]}; valorile verificate nu se înlocuiesc cu valori manuale.`);
            const same = existing.name === d.name && existing.food_group === d.group && existing.diet === d.diet && existing.kcal === d.kcal
              && existing.protein === d.protein && existing.carbs === d.carbs && existing.fat === d.fat && existing.allergens_json === JSON.stringify(d.allergens)
              && existing.source === source && (existing.source_ref || null) === sourceRef;
            if (same) { result.unchanged++; continue; }
            update(existing.id, d, source, sourceRef, ctx.user.id);
            result.updated++;
          } else {
            insert(wantedId || uniqueId(db, 'foods', d.name), d, source, sourceRef, ctx.user.id);
            result.added++;
          }
        } catch (err) {
          if (!(err instanceof HttpError)) throw err;
          const detail = err.fields ? Object.values(err.fields).join(' ') : err.message;
          result.errors.push({ line, name: String(row?.name ?? '').slice(0, 80), message: detail });
        }
      }
    });
    reloadFoods(db);
    audit(ctx, 'import_foods', null, { file: String(ctx.body.file || '').slice(0, 120) || null, added: result.added, updated: result.updated, errors: result.errors.length });
    return result;
  }, { roles: ROLES });
}
