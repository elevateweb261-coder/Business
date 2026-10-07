// Rețete (ecranul 5): listă cu filtre, editor, publicare, duplicare, fotografie.
// Valorile nutriționale, alergenii și dietele compatibile se calculează MEREU din catalog (recipeFacts);
// clientul nu le poate trimite și nici modifica.
import { badRequest, notFound } from '../http.js';
import { MAX_IMAGE, saveMedia, mediaByFilename, mediaUrl } from '../media.js';
import { adminHelpers, diffValues } from '../admin-common.js';
import { FOOD_BY_ID, recipeFacts, ALLERGENS, DIET_NAMES, allergensOf, DIET_LEVEL, DIET_MAX } from '../plan/foods.js';

export const MEAL_TYPES = { mic_dejun: 'Mic dejun', pranz: 'Prânz', cina: 'Cină', gustare: 'Gustare' };
const ROLES = ['admin', 'editor']; // „editor” va exista odată cu rolurile din panou
const now = () => new Date().toISOString();

export function registerRecipeRoutes(router, app) {
  const { db } = app;
  const { on, audit } = adminHelpers(app);
  const photoUrl = name => (name ? mediaUrl(mediaByFilename(db, name)) || `/media/recipes/${name}` : null);

  const ingredientsOf = id => db.prepare('SELECT food_id, grams FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position').all(id)
    .map(i => ({ foodId: i.food_id, grams: i.grams }));

  const out = r => {
    const ingredients = ingredientsOf(r.id);
    return {
      id: r.id, name: r.name, description: r.description, mealType: r.meal_type, mealTypeLabel: MEAL_TYPES[r.meal_type],
      status: r.status, prepMinutes: r.prep_minutes, servings: r.servings,
      photoUrl: photoUrl(r.photo),
      steps: JSON.parse(r.steps_json),
      ingredients: ingredients.map(i => ({ ...i, name: FOOD_BY_ID.get(i.foodId)?.name || i.foodId })),
      facts: recipeFacts(ingredients, r.servings),
      createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at,
    };
  };

  const load = ctx => {
    const r = db.prepare('SELECT * FROM recipes WHERE id = ?').get(Number(ctx.params.id));
    if (!r) throw notFound('Rețeta nu există.');
    return r;
  };

  /** Validează conținutul unei rețete. La publicare, regulile sunt mai stricte. */
  function validateRecipe(body, publish) {
    const fields = {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 3 || name.length > 80) fields.name = 'Numele trebuie să aibă 3–80 de caractere.';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (description.length > 500) fields.description = 'Descrierea poate avea cel mult 500 de caractere.';
    if (!MEAL_TYPES[body.mealType]) fields.mealType = 'Alege tipul mesei.';
    const prep = body.prepMinutes === '' || body.prepMinutes === null || body.prepMinutes === undefined ? null : Number(body.prepMinutes);
    if (prep !== null && (!Number.isInteger(prep) || prep < 1 || prep > 600)) fields.prepMinutes = 'Timpul de preparare trebuie să fie între 1 și 600 de minute.';
    if (publish && prep === null) fields.prepMinutes = 'Completează timpul de preparare.';
    const servings = Number(body.servings ?? 1);
    if (!Number.isInteger(servings) || servings < 1 || servings > 20) fields.servings = 'Numărul de porții trebuie să fie între 1 și 20.';
    const steps = Array.isArray(body.steps) ? body.steps.map(s => String(s ?? '').trim()).filter(Boolean) : [];
    if (steps.length > 20) fields.steps = 'Cel mult 20 de pași.';
    else if (steps.some(s => s.length < 3 || s.length > 500)) fields.steps = 'Fiecare pas trebuie să aibă 3–500 de caractere.';
    else if (publish && !steps.length) fields.steps = 'Adaugă cel puțin un pas de preparare.';
    const raw = Array.isArray(body.ingredients) ? body.ingredients : [];
    const ingredients = raw.map(i => ({ foodId: String(i?.foodId ?? ''), grams: Number(i?.grams) }));
    const seen = new Set();
    if (ingredients.length > 25) fields.ingredients = 'Cel mult 25 de ingrediente.';
    for (const i of ingredients) {
      if (!FOOD_BY_ID.has(i.foodId)) { fields.ingredients = 'Un ingredient nu există în catalogul nutrițional.'; break; }
      if (seen.has(i.foodId)) { fields.ingredients = `„${FOOD_BY_ID.get(i.foodId).name}” apare de două ori.`; break; }
      seen.add(i.foodId);
      if (!Number.isInteger(i.grams) || i.grams < 1 || i.grams > 2000) { fields.ingredients = `Gramajul pentru „${FOOD_BY_ID.get(i.foodId).name}” trebuie să fie între 1 și 2000 g.`; break; }
    }
    if (!fields.ingredients && publish && ingredients.length < 2) fields.ingredients = 'Adaugă cel puțin două ingrediente.';
    if (Object.keys(fields).length) throw badRequest(publish ? 'Rețeta nu poate fi publicată încă.' : 'Verifică datele rețetei.', fields);
    return { name, description: description || null, mealType: body.mealType, prep, servings, steps, ingredients };
  }

  function save(id, d, status, userId) {
    const t = now();
    db.exec('BEGIN');
    try {
      if (id) {
        const prev = db.prepare('SELECT status, published_at FROM recipes WHERE id = ?').get(id);
        db.prepare(`UPDATE recipes SET name = ?, description = ?, meal_type = ?, status = ?, prep_minutes = ?, servings = ?, steps_json = ?,
          updated_by = ?, updated_at = ?, published_at = ? WHERE id = ?`)
          .run(d.name, d.description, d.mealType, status, d.prep, d.servings, JSON.stringify(d.steps), userId, t,
            status === 'published' ? (prev.status === 'published' ? prev.published_at : t) : null, id);
        db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(id);
      } else {
        id = Number(db.prepare(`INSERT INTO recipes (name, description, meal_type, status, prep_minutes, servings, steps_json, created_by, updated_by, created_at, updated_at, published_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(d.name, d.description, d.mealType, status, d.prep, d.servings, JSON.stringify(d.steps), userId, userId, t, t, status === 'published' ? t : null).lastInsertRowid);
      }
      const ins = db.prepare('INSERT INTO recipe_ingredients (recipe_id, position, food_id, grams) VALUES (?, ?, ?, ?)');
      d.ingredients.forEach((i, pos) => ins.run(id, pos, i.foodId, i.grams));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return id;
  }

  // ---------- Listă cu filtre ----------

  on('GET', '/api/admin/recipes', ctx => {
    const sp = ctx.url.searchParams;
    const q = (sp.get('q') || '').trim().toLowerCase();
    const meal = sp.get('meal'), diet = sp.get('diet'), status = sp.get('status'), photo = sp.get('photo');
    const page = Math.max(1, Number.parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = 20;
    let list = db.prepare('SELECT * FROM recipes ORDER BY updated_at DESC').all().map(out);
    if (q) list = list.filter(r => r.name.toLowerCase().includes(q));
    if (MEAL_TYPES[meal]) list = list.filter(r => r.mealType === meal);
    if (DIET_NAMES.includes(diet)) list = list.filter(r => r.facts.diets.includes(diet));
    if (status === 'draft' || status === 'published') list = list.filter(r => r.status === status);
    if (photo === 'with') list = list.filter(r => r.photoUrl);
    if (photo === 'without') list = list.filter(r => !r.photoUrl);
    return {
      total: list.length, page, pageSize, mealTypes: MEAL_TYPES, diets: DIET_NAMES,
      recipes: list.slice((page - 1) * pageSize, page * pageSize).map(({ steps, ingredients, ...r }) => r),
    };
  }, { roles: ROLES });

  on('GET', '/api/admin/recipes/:id', ctx => out(load(ctx)), { roles: ROLES });

  on('POST', '/api/admin/recipes', ctx => {
    const publish = ctx.body.status === 'published';
    const id = save(null, validateRecipe(ctx.body, publish), publish ? 'published' : 'draft', ctx.user.id);
    audit(ctx, publish ? 'publish_recipe' : 'create_recipe', null, { recipe: id });
    ctx.status = 201;
    return out(db.prepare('SELECT * FROM recipes WHERE id = ?').get(id));
  }, { roles: ROLES });

  // Forma comparată în jurnalul de audit (valoare veche → nouă).
  const snapshot = x => ({
    name: x.name, description: x.description, mealType: x.mealTypeLabel, status: x.status, prepMinutes: x.prepMinutes, servings: x.servings,
    steps: x.steps, ingredients: x.ingredients.map(i => `${i.name} · ${i.grams} g`),
  });

  on('PUT', '/api/admin/recipes/:id', ctx => {
    const r = load(ctx);
    const before = snapshot(out(r));
    const publish = ctx.body.status === 'published';
    save(r.id, validateRecipe(ctx.body, publish), publish ? 'published' : 'draft', ctx.user.id);
    const action = publish && r.status !== 'published' ? 'publish_recipe' : !publish && r.status === 'published' ? 'unpublish_recipe' : 'update_recipe';
    const after = out(db.prepare('SELECT * FROM recipes WHERE id = ?').get(r.id));
    audit(ctx, action, null, { recipe: r.id, changes: diffValues(before, snapshot(after)) });
    return after;
  }, { roles: ROLES });

  on('POST', '/api/admin/recipes/:id/duplicate', ctx => {
    const r = load(ctx);
    const copy = { name: `${r.name} (copie)`.slice(0, 80), description: r.description, mealType: r.meal_type, prep: r.prep_minutes, servings: r.servings, steps: JSON.parse(r.steps_json), ingredients: ingredientsOf(r.id) };
    const id = save(null, copy, 'draft', ctx.user.id);
    if (r.photo) db.prepare('UPDATE recipes SET photo = ? WHERE id = ?').run(r.photo, id);
    audit(ctx, 'duplicate_recipe', null, { recipe: r.id, copy: id });
    ctx.status = 201;
    return out(db.prepare('SELECT * FROM recipes WHERE id = ?').get(id));
  }, { roles: ROLES });

  on('DELETE', '/api/admin/recipes/:id', ctx => {
    const r = load(ctx);
    db.prepare('DELETE FROM recipes WHERE id = ?').run(r.id);
    audit(ctx, 'delete_recipe', null, { recipe: r.id, name: r.name });
    return { ok: true };
  }, { roles: ROLES });

  // ---------- Fotografie (corp binar: JPEG, PNG sau WebP, max. 5 MB) — înregistrată și în biblioteca media ----------

  const setPhoto = (ctx, r, name) => {
    db.prepare('UPDATE recipes SET photo = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(name, now(), ctx.user.id, r.id);
    audit(ctx, 'update_recipe', null, { recipe: r.id, photo: true });
    return { photoUrl: photoUrl(name) };
  };

  on('PUT', '/api/admin/recipes/:id/photo', ctx => {
    const r = load(ctx);
    const m = saveMedia(app, ctx.body, { folder: 'recipes', accept: 'image', originalName: ctx.url.searchParams.get('name'), userId: ctx.user.id, prefix: `r${r.id}` });
    return setPhoto(ctx, r, m.filename);
  }, { roles: ROLES, raw: true, maxBytes: MAX_IMAGE });

  // Fotografie aleasă din biblioteca media.
  on('POST', '/api/admin/recipes/:id/photo-media', ctx => {
    const r = load(ctx);
    const m = mediaByFilename(db, String(ctx.body.filename || ''));
    if (!m || m.kind !== 'image') throw badRequest('Alege o imagine din biblioteca media.');
    return setPhoto(ctx, r, m.filename);
  }, { roles: ROLES });

  on('DELETE', '/api/admin/recipes/:id/photo', ctx => {
    const r = load(ctx);
    db.prepare('UPDATE recipes SET photo = NULL, updated_at = ? WHERE id = ?').run(now(), r.id);
    audit(ctx, 'update_recipe', null, { recipe: r.id, photo: false });
    return { ok: true };
  }, { roles: ROLES });

  // Catalogul pentru autocompletare, cu alergenii fiecărui aliment (calculul live din editor folosește aceleași date).
  on('GET', '/api/admin/recipes-catalog', () => ({
    allergens: ALLERGENS,
    diets: DIET_NAMES,
    dietLevel: DIET_LEVEL,
    dietMax: DIET_MAX,
    mealTypes: MEAL_TYPES,
    foods: [...FOOD_BY_ID.values()].map(f => ({ id: f.id, name: f.name, group: f.group, diet: f.diet, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, allergens: allergensOf(f) })),
  }), { roles: ROLES });
}
