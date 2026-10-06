// Validarea planurilor primite de la AI și calculul nutrițional pe server.
// Un plan este acceptat doar dacă: respectă schema, folosește doar alimente/exerciții din cataloage,
// respectă dieta și alimentele evitate, iar caloriile zilei sunt aproape de țintă (după ajustarea porțiilor).
import { FOOD_BY_ID, DIET_LEVEL, DIET_MAX } from './foods.js';
import { EXERCISE_BY_ID, availableEquipment } from './exercises.js';

export const SLOTS = ['mic_dejun', 'pranz', 'cina', 'gustare'];
export const SLOT_LABEL = { mic_dejun: 'Mic dejun', pranz: 'Prânz', cina: 'Cină', gustare: 'Gustare' };
export const TASK_TYPES = ['apa', 'antrenament', 'miscare', 'obicei', 'cantarire'];

const KCAL_TOLERANCE = 0.10;       // abatere maximă a caloriilor zilei după ajustarea porțiilor
const SCALE_RANGE = [0.7, 1.4];    // cât putem ajusta automat porțiile

export const normalize = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Termeni (fără diacritice) din „alimente evitate” și „alergii”. */
export function avoidTerms(profile) {
  return [profile.dislikes, profile.allergies]
    .filter(Boolean)
    .flatMap(s => normalize(s).split(/[,;\n]+/))
    .map(s => s.trim())
    .filter(s => s.length >= 3);
}

function foodConflicts(food, terms) {
  const text = normalize([food.name, ...food.tags].join(' '));
  return terms.filter(t => text.includes(t));
}

const round1 = n => Math.round(n * 10) / 10;

/** Nutriția unei liste de ingrediente, calculată din catalog. */
export function nutritionOf(ingredients) {
  return ingredients.reduce((t, i) => {
    const f = FOOD_BY_ID.get(i.foodId);
    const k = i.grams / 100;
    return { kcal: t.kcal + f.kcal * k, protein: t.protein + f.protein * k, carbs: t.carbs + f.carbs * k, fat: t.fat + f.fat * k };
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

const roundNutrition = n => ({ kcal: Math.round(n.kcal), protein: round1(n.protein), carbs: round1(n.carbs), fat: round1(n.fat) });

/** Ingredientele îmbogățite cu numele și nutriția fiecăruia (pentru afișare). */
function enrichIngredients(ingredients) {
  return ingredients.map(i => {
    const f = FOOD_BY_ID.get(i.foodId);
    return { foodId: i.foodId, name: f.name, grams: i.grams, ...roundNutrition(nutritionOf([i])) };
  });
}

const scaleGrams = (g, factor) => Math.max(5, Math.round((g * factor) / 5) * 5);

const isStr = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/** Verifică o masă. Întoarce lista de erori (goală dacă e în regulă). */
function checkMeal(meal, where, ctx) {
  const errors = [];
  if (!SLOTS.includes(meal?.slot)) errors.push(`${where}: momentul mesei nu este valid.`);
  if (!isStr(meal?.name, 3, 80)) errors.push(`${where}: numele mesei trebuie să aibă 3–80 de caractere.`);
  if (!isInt(meal?.minutes, 1, 120)) errors.push(`${where}: timpul de preparare trebuie să fie între 1 și 120 de minute.`);
  if (!Array.isArray(meal?.ingredients) || meal.ingredients.length < 2 || meal.ingredients.length > 10) {
    errors.push(`${where}: masa trebuie să aibă 2–10 ingrediente.`);
  } else {
    const seen = new Set();
    for (const ing of meal.ingredients) {
      const food = FOOD_BY_ID.get(ing?.foodId);
      if (!food) { errors.push(`${where}: alimentul „${ing?.foodId}” nu există în catalog.`); continue; }
      if (seen.has(food.id)) errors.push(`${where}: alimentul „${food.name}” apare de două ori.`);
      seen.add(food.id);
      if (!isInt(ing.grams, 5, 500)) errors.push(`${where}: gramajul pentru „${food.name}” trebuie să fie un număr întreg între 5 și 500.`);
      if (DIET_LEVEL[food.diet] > ctx.dietMax) errors.push(`${where}: „${food.name}” nu este compatibil cu alimentația ${ctx.profile.diet}.`);
      const hits = foodConflicts(food, ctx.avoid);
      if (hits.length) errors.push(`${where}: „${food.name}” conține un aliment evitat (${hits.join(', ')}).`);
    }
  }
  if (!Array.isArray(meal?.steps) || meal.steps.length < 1 || meal.steps.length > 8 || !meal.steps.every(s => isStr(s, 3, 300))) {
    errors.push(`${where}: prepararea trebuie să aibă 1–8 pași, fiecare de 3–300 de caractere.`);
  }
  return errors;
}

function checkTask(task, where, ctx) {
  const errors = [];
  if (!TASK_TYPES.includes(task?.type)) errors.push(`${where}: tipul sarcinii nu este valid.`);
  if (!isStr(task?.title, 3, 80)) errors.push(`${where}: titlul trebuie să aibă 3–80 de caractere.`);
  if (typeof task?.detail !== 'string' || task.detail.length > 300) errors.push(`${where}: detaliul poate avea cel mult 300 de caractere.`);
  if (task?.type === 'apa' && !isInt(task.waterMl, 1000, 5000)) errors.push(`${where}: ținta de apă trebuie să fie între 1000 și 5000 ml.`);
  if (task?.type === 'antrenament') {
    if (!isInt(task.minutes, 10, ctx.maxMinutes)) errors.push(`${where}: durata antrenamentului trebuie să fie între 10 și ${ctx.maxMinutes} de minute.`);
    if (!Array.isArray(task.exercises) || task.exercises.length < 3 || task.exercises.length > 10) {
      errors.push(`${where}: antrenamentul trebuie să aibă 3–10 exerciții.`);
    } else {
      for (const ex of task.exercises) {
        const e = EXERCISE_BY_ID.get(ex?.exerciseId);
        if (!e) { errors.push(`${where}: exercițiul „${ex?.exerciseId}” nu există în catalog.`); continue; }
        if (!ctx.equipment.has(e.equipment)) errors.push(`${where}: „${e.name}” necesită echipament pe care utilizatorul nu îl are.`);
        if (!isInt(ex.sets, 1, 6)) errors.push(`${where}: „${e.name}” trebuie să aibă 1–6 serii.`);
        if (e.mode === 'reps' && !isInt(ex.reps, 4, 25)) errors.push(`${where}: „${e.name}” trebuie să aibă 4–25 de repetări.`);
        if (e.mode === 'time' && !isInt(ex.seconds, 15, 120)) errors.push(`${where}: „${e.name}” trebuie să dureze 15–120 de secunde.`);
        if (!isInt(ex.restSec, 15, 180)) errors.push(`${where}: pauza pentru „${e.name}” trebuie să fie între 15 și 180 de secunde.`);
      }
    }
  } else if ((task?.type === 'miscare') && !isInt(task.minutes, 5, 90)) {
    errors.push(`${where}: durata mișcării trebuie să fie între 5 și 90 de minute.`);
  }
  return errors;
}

/** Context comun pentru validare. */
export function validationContext(profile, targets) {
  return {
    profile,
    targets,
    dietMax: DIET_MAX[profile.diet] ?? 4,
    avoid: avoidTerms(profile),
    equipment: availableEquipment(profile),
    maxMinutes: Math.max(20, (profile.session_minutes || 30) + 10),
  };
}

/** Transformă o masă validată în forma salvată: ingrediente îmbogățite + nutriție calculată. */
function buildMeal(meal, factor = 1) {
  const ingredients = meal.ingredients.map(i => ({ foodId: i.foodId, grams: factor === 1 ? i.grams : scaleGrams(i.grams, factor) }));
  return {
    slot: meal.slot,
    slotIndex: SLOTS.indexOf(meal.slot),
    label: SLOT_LABEL[meal.slot],
    name: meal.name.trim(),
    minutes: meal.minutes,
    ingredients: enrichIngredients(ingredients),
    steps: meal.steps.map(s => s.trim()),
    nutrition: roundNutrition(nutritionOf(ingredients)),
  };
}

function buildTask(task, i) {
  const out = { id: `t${i + 1}`, type: task.type, title: task.title.trim(), detail: (task.detail || '').trim() };
  if (task.type === 'apa') out.waterMl = task.waterMl;
  if (task.type === 'antrenament' || task.type === 'miscare') out.minutes = task.minutes;
  if (task.type === 'antrenament') {
    out.exercises = task.exercises.map(ex => {
      const e = EXERCISE_BY_ID.get(ex.exerciseId);
      return {
        exerciseId: e.id, name: e.name, group: e.group, mode: e.mode, instructions: e.instructions,
        sets: ex.sets, restSec: ex.restSec, ...(e.mode === 'reps' ? { reps: ex.reps } : { seconds: ex.seconds }),
      };
    });
  }
  return out;
}

/**
 * Validează o zi și o transformă în forma salvată. Ajustează porțiile ca să se apropie de ținta de calorii.
 * Întoarce { day, errors }.
 */
export function validateDay(raw, date, ctx) {
  const where = `Ziua ${date}`;
  const errors = [];
  if (raw?.date !== date) errors.push(`${where}: data zilei trebuie să fie ${date}.`);
  const meals = Array.isArray(raw?.meals) ? raw.meals : [];
  for (const slot of ['mic_dejun', 'pranz', 'cina']) {
    const n = meals.filter(m => m?.slot === slot).length;
    if (n !== 1) errors.push(`${where}: trebuie să existe exact o masă „${SLOT_LABEL[slot]}”.`);
  }
  if (meals.filter(m => m?.slot === 'gustare').length > 1) errors.push(`${where}: cel mult o gustare pe zi.`);
  meals.forEach((m, i) => errors.push(...checkMeal(m, `${where}, masa ${i + 1}`, ctx)));
  const tasks = Array.isArray(raw?.tasks) ? raw.tasks : [];
  if (tasks.length < 2 || tasks.length > 6) errors.push(`${where}: trebuie să existe 2–6 sarcini.`);
  if (tasks.filter(t => t?.type === 'apa').length !== 1) errors.push(`${where}: trebuie să existe exact o sarcină de hidratare.`);
  if (tasks.filter(t => t?.type === 'antrenament').length > 1) errors.push(`${where}: cel mult un antrenament pe zi.`);
  tasks.forEach((t, i) => errors.push(...checkTask(t, `${where}, sarcina ${i + 1}`, ctx)));
  if (typeof raw?.note !== 'string' || raw.note.length > 300) errors.push(`${where}: nota zilei poate avea cel mult 300 de caractere.`);
  if (errors.length) return { day: null, errors };

  // Ajustarea porțiilor spre ținta de calorii (serverul calculează, nu modelul).
  const ordered = [...meals].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  const raw_kcal = ordered.reduce((s, m) => s + nutritionOf(m.ingredients).kcal, 0);
  let factor = 1;
  const target = ctx.targets?.kcal;
  if (target && raw_kcal > 0) {
    const ideal = target / raw_kcal;
    if (Math.abs(ideal - 1) > 0.03) factor = Math.min(SCALE_RANGE[1], Math.max(SCALE_RANGE[0], ideal));
  }
  const builtMeals = ordered.map(m => buildMeal(m, factor));
  const nutrition = roundNutrition(builtMeals.reduce((t, m) => ({
    kcal: t.kcal + m.nutrition.kcal, protein: t.protein + m.nutrition.protein, carbs: t.carbs + m.nutrition.carbs, fat: t.fat + m.nutrition.fat,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 }));
  if (target && Math.abs(nutrition.kcal - target) / target > KCAL_TOLERANCE) {
    return { day: null, errors: [`${where}: mesele au împreună ${nutrition.kcal} kcal după ajustare; ținta este ${target} kcal. Alege cantități care se apropie de țintă.`] };
  }
  if (ctx.targets?.protein && nutrition.protein < ctx.targets.protein * 0.75) {
    return { day: null, errors: [`${where}: proteinele (${nutrition.protein} g) sunt mult sub ținta de ${ctx.targets.protein} g. Adaugă surse de proteine.`] };
  }
  return {
    day: { date, note: raw.note.trim(), meals: builtMeals, tasks: tasks.map(buildTask), nutrition, portionFactor: round1(factor) },
    errors: [],
  };
}

/** Validează o săptămână întreagă (7 zile, în ordinea datelor). */
export function validateWeek(raw, dates, ctx) {
  const errors = [];
  const days = [];
  const list = Array.isArray(raw?.days) ? raw.days : [];
  if (list.length !== dates.length) errors.push(`Planul trebuie să aibă exact ${dates.length} zile (are ${list.length}).`);
  dates.forEach((date, i) => {
    const r = validateDay(list.find(d => d?.date === date) ?? list[i], date, ctx);
    if (r.errors.length) errors.push(...r.errors); else days.push(r.day);
  });
  const workoutDays = days.filter(d => d.tasks.some(t => t.type === 'antrenament')).length;
  const wanted = Number(ctx.profile.days_per_week) || 3;
  if (days.length === dates.length && Math.abs(workoutDays - wanted) > 1) {
    errors.push(`Planul are ${workoutDays} zile de antrenament; utilizatorul are ${wanted} zile disponibile pe săptămână.`);
  }
  return { days: errors.length ? null : days, errors };
}

/** Validează o singură masă (pentru „Înlocuiește masa”), scalată la caloriile mesei vechi. */
export function validateReplacement(raw, slot, targetKcal, ctx) {
  const errors = checkMeal(raw, 'Masa nouă', ctx);
  if (raw?.slot !== slot) errors.push(`Masa nouă trebuie să fie pentru „${SLOT_LABEL[slot]}”.`);
  if (errors.length) return { meal: null, errors };
  const kcal = nutritionOf(raw.ingredients).kcal;
  const factor = kcal > 0 ? Math.min(SCALE_RANGE[1], Math.max(SCALE_RANGE[0], targetKcal / kcal)) : 1;
  const meal = buildMeal(raw, factor);
  if (Math.abs(meal.nutrition.kcal - targetKcal) / targetKcal > 0.2) {
    return { meal: null, errors: [`Masa nouă are ${meal.nutrition.kcal} kcal; ar trebui să aibă aproximativ ${targetKcal} kcal.`] };
  }
  return { meal, errors: [] };
}
