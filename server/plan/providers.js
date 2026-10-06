// Generatorii de planuri.
//  - `anthropic`: Claude, prin SDK-ul oficial (@anthropic-ai/sdk). Cheia API e citită doar pe server, din .env.
//  - `test`: generator local, determinist, fără AI — doar pentru dezvoltare. Planurile lui sunt marcate „de test”.
// Ambii întorc aceeași structură brută (vezi `weekSchema`), validată apoi de `validate.js`.
import { FOODS, FOOD_SOURCE, foodsForDiet, FOOD_BY_ID } from './foods.js';
import { EXERCISES, exercisesFor } from './exercises.js';
import { avoidTerms, normalize, nutritionOf, SLOTS, TASK_TYPES } from './validate.js';

export class AiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const WEEKDAYS = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];

/** Alimentele pe care le poate alege modelul: compatibile cu dieta și fără alimentele evitate. */
export function allowedFoods(profile) {
  const avoid = avoidTerms(profile);
  return foodsForDiet(profile.diet).filter(f => !avoid.some(t => normalize([f.name, ...f.tags].join(' ')).includes(t)));
}

// ---------- Schema răspunsului (structured outputs) ----------

function mealSchema(foodIds) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['slot', 'name', 'minutes', 'ingredients', 'steps'],
    properties: {
      slot: { type: 'string', enum: SLOTS },
      name: { type: 'string', description: 'Numele mesei, în română.' },
      minutes: { type: 'integer', description: 'Timpul de preparare, în minute.' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['foodId', 'grams'],
          properties: { foodId: { type: 'string', enum: foodIds }, grams: { type: 'integer' } },
        },
      },
      steps: { type: 'array', items: { type: 'string' }, description: 'Pașii de preparare, în română.' },
    },
  };
}

function taskSchema(exerciseIds) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'title', 'detail', 'waterMl', 'minutes', 'exercises'],
    properties: {
      type: { type: 'string', enum: TASK_TYPES },
      title: { type: 'string' },
      detail: { type: 'string' },
      waterMl: { type: 'integer', description: 'Doar pentru tipul „apa”; altfel 0.' },
      minutes: { type: 'integer', description: 'Pentru „antrenament” și „miscare”; altfel 0.' },
      exercises: {
        type: 'array',
        description: 'Doar pentru „antrenament”; altfel listă goală.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['exerciseId', 'sets', 'reps', 'seconds', 'restSec'],
          properties: {
            exerciseId: { type: 'string', enum: exerciseIds },
            sets: { type: 'integer' },
            reps: { type: 'integer', description: 'Pentru exercițiile cu repetări; altfel 0.' },
            seconds: { type: 'integer', description: 'Pentru exercițiile pe timp; altfel 0.' },
            restSec: { type: 'integer' },
          },
        },
      },
    },
  };
}

function daySchema(foodIds, exerciseIds) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['date', 'note', 'meals', 'tasks'],
    properties: {
      date: { type: 'string', format: 'date' },
      note: { type: 'string', description: 'O frază scurtă, încurajatoare, pentru ziua respectivă.' },
      meals: { type: 'array', items: mealSchema(foodIds) },
      tasks: { type: 'array', items: taskSchema(exerciseIds) },
    },
  };
}

export function weekSchema(profile) {
  const foodIds = allowedFoods(profile).map(f => f.id);
  const exerciseIds = exercisesFor(profile).map(e => e.id);
  return {
    type: 'object',
    additionalProperties: false,
    required: ['days'],
    properties: { days: { type: 'array', items: daySchema(foodIds, exerciseIds) } },
  };
}

export function mealOnlySchema(profile) {
  return mealSchema(allowedFoods(profile).map(f => f.id));
}

// ---------- Prompt ----------

// Partea stabilă (cache-uită): rolul, regulile și cataloagele complete. Nu conține date ale utilizatorului.
const SYSTEM_PROMPT = `Ești planificatorul de nutriție și mișcare al aplicației Metamorf. Creezi planuri practice, gustoase și realiste pentru adulți sănătoși din România, în limba română, cu diacritice.

Reguli pentru mese:
- Fiecare zi are exact un mic dejun, un prânz și o cină; o gustare doar dacă ajută la atingerea țintelor.
- Folosește NUMAI alimente din catalogul de mai jos, prin id, cu gramaje realiste (în grame, alimente gătite unde e cazul).
- Nu scrie calorii sau macronutrienți: serverul le calculează din catalog. Alege însă cantități care, adunate, se apropie de țintele zilnice primite.
- Variază mesele de la o zi la alta; poți repeta o masă cel mult de două ori pe săptămână (de exemplu, gătită pentru două zile).
- Rețete simple, cu ingrediente ușor de găsit în România; pașii de preparare sunt scurți și clari.
- Respectă tipul de alimentație, alimentele preferate (folosește-le când se potrivesc) și alimentele evitate (nu le folosi niciodată).

Reguli pentru sarcinile zilnice:
- Fiecare zi are exact o sarcină „apa”, cu waterMl egal cu ținta de apă primită.
- Antrenamente („antrenament”) doar în numărul de zile disponibile, distribuite cu pauze între ele, cu durata cel mult egală cu minutele disponibile. Folosește NUMAI exerciții din catalog, potrivite echipamentului și experienței. Începe cu o încălzire ușoară (mobilitate sau cardio ușor). Pentru începători: volume moderate, mișcări simple.
- În zilele fără antrenament: o sarcină „miscare” ușoară (de exemplu, plimbare) sau mobilitate.
- O sarcină „cantarire” lunea dimineața.
- 1–2 sarcini „obicei”: mici obiceiuri sănătoase, concrete și realizabile (somn, pregătirea meselor, legume în plus, pauze de la ecrane).
- Pentru câmpurile care nu se aplică unui tip de sarcină, folosește 0 sau listă goală.

Siguranță: nu oferi sfaturi medicale, nu promite rezultate, nu folosi un limbaj care culpabilizează.

Catalogul de alimente (id: nume — kcal / proteine / carbohidrați / grăsimi la 100 g; sursa: ${FOOD_SOURCE}):
${FOODS.map(f => `${f.id}: ${f.name} — ${f.kcal} / ${f.protein} / ${f.carbs} / ${f.fat}`).join('\n')}

Catalogul de exerciții (id: nume — grupă, echipament, mod):
${EXERCISES.map(e => `${e.id}: ${e.name} — ${e.group}, ${e.equipment}, ${e.mode === 'reps' ? 'repetări' : 'secunde'}`).join('\n')}`;

function profileForPrompt(p, targets) {
  return {
    varsta: p.age, sex: p.sex, inaltime_cm: p.height_cm, greutate_kg: p.weight_kg,
    obiectiv: p.goal, activitate: p.activity, alimentatie: p.diet,
    alimente_preferate: p.likes || '—', alimente_evitate: p.dislikes || '—',
    locatie: p.location, echipament: p.equipment, experienta: p.experience,
    zile_antrenament_pe_saptamana: p.days_per_week, minute_pe_sesiune: p.session_minutes,
    tinte_zilnice: { kcal: targets.kcal, proteine_g: targets.protein, carbohidrati_g: targets.carbs, grasimi_g: targets.fat, apa_ml: targets.water },
  };
}

function weekPrompt(profile, targets, dates) {
  return `Creează planul pentru săptămâna ${dates[0]} – ${dates.at(-1)}.

Zilele (în această ordine): ${dates.map((d, i) => `${d} (${WEEKDAYS[i]})`).join(', ')}.

Profilul utilizatorului:
${JSON.stringify(profileForPrompt(profile, targets), null, 2)}

Alimente permise pentru acest utilizator: ${allowedFoods(profile).map(f => f.id).join(', ')}.
Exerciții permise pentru acest utilizator: ${exercisesFor(profile).map(e => e.id).join(', ')}.`;
}

function mealPrompt(profile, targets, day, oldMeal, otherMeals) {
  return `Propune o alternativă pentru ${oldMeal.label.toLowerCase()} din ${day}, în locul mesei „${oldMeal.name}”.
Masa nouă trebuie să fie diferită de aceasta și de celelalte mese ale zilei (${otherMeals.join(', ') || '—'}), să aibă aproximativ ${oldMeal.nutrition.kcal} kcal și să fie pentru momentul „${oldMeal.slot}”.

Profilul utilizatorului:
${JSON.stringify(profileForPrompt(profile, targets), null, 2)}

Alimente permise: ${allowedFoods(profile).map(f => f.id).join(', ')}.`;
}

// ---------- Generatorul Claude ----------

export function anthropicProvider(config) {
  let clientPromise;
  const client = () => (clientPromise ||= import('@anthropic-ai/sdk')
    .then(({ default: Anthropic }) => new Anthropic({ apiKey: config.anthropicKey }))
    .catch(() => { clientPromise = null; throw new AiError('sdk_missing', 'Biblioteca @anthropic-ai/sdk nu este instalată. Rulează „npm install”.'); }));

  /** Un apel: întoarce { data, content, usage, model }. `messages` e istoricul (pentru reîncercări). */
  async function call(messages, schema, maxTokens) {
    const anthropic = await client();
    let message;
    try {
      // Streaming: răspunsurile lungi nu ating limitele de timp ale cererilor HTTP.
      const stream = anthropic.beta.messages.stream({
        model: config.aiModel,
        max_tokens: maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // dacă modelul refuză cererea, serverul Anthropic o reia pe modelul de rezervă recomandat
        output_config: { effort: config.aiEffort, format: { type: 'json_schema', schema } },
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages,
      });
      message = await stream.finalMessage();
    } catch (err) {
      const status = err?.status;
      if (status === 401 || status === 403) throw new AiError('auth', 'Cheia API Anthropic nu este validă.');
      if (status === 429) throw new AiError('rate_limited', 'Serviciul AI este momentan aglomerat. Încearcă din nou în câteva minute.');
      throw new AiError('api_error', 'Serviciul AI nu a răspuns. Încearcă din nou.', String(err?.message || err));
    }
    if (message.stop_reason === 'refusal') throw new AiError('refusal', 'Serviciul AI nu a putut genera acest plan.', message.stop_details?.category);
    if (message.stop_reason === 'max_tokens') throw new AiError('truncated', 'Răspunsul AI a fost incomplet.');
    const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
    let data;
    try { data = JSON.parse(text); } catch { throw new AiError('bad_json', 'Răspunsul AI nu a putut fi citit.'); }
    return { data, content: message.content, usage: message.usage, model: message.model };
  }

  return {
    name: 'anthropic',
    label: 'ai',
    async week({ profile, targets, dates, feedback }) {
      const messages = [{ role: 'user', content: weekPrompt(profile, targets, dates) }];
      // La reîncercare: păstrăm răspunsul anterior neschimbat și adăugăm problemele găsite de server.
      if (feedback) messages.push({ role: 'assistant', content: feedback.content }, { role: 'user', content: `Serverul a respins planul din cauza următoarelor probleme:\n- ${feedback.errors.slice(0, 30).join('\n- ')}\n\nTrimite din nou planul complet pentru toate cele 7 zile, corectat.` });
      return call(messages, weekSchema(profile), 48000);
    },
    async meal({ profile, targets, day, oldMeal, otherMeals, feedback }) {
      const messages = [{ role: 'user', content: mealPrompt(profile, targets, day, oldMeal, otherMeals) }];
      if (feedback) messages.push({ role: 'assistant', content: feedback.content }, { role: 'user', content: `Serverul a respins masa:\n- ${feedback.errors.join('\n- ')}\n\nPropune din nou masa, corectată.` });
      return call(messages, mealOnlySchema(profile), 8000);
    },
  };
}

// ---------- Generatorul local de test (fără AI) ----------

const T = (slot, name, minutes, ingredients, steps) => ({ slot, name, minutes, ingredients: ingredients.map(([foodId, grams]) => ({ foodId, grams })), steps });

const TEST_MEALS = [
  T('mic_dejun', 'Ovăz cu băutură de soia și banană', 10, [['fulgi_ovaz', 60], ['bautura_soia', 250], ['banana', 100], ['seminte_chia', 10]], ['Fierbe ovăzul în băutura de soia 5 minute.', 'Adaugă banana feliată și semințele de chia.']),
  T('mic_dejun', 'Tartine cu avocado și roșii', 8, [['paine_integrala', 80], ['avocado', 70], ['rosii', 100], ['seminte_dovleac', 10]], ['Prăjește pâinea.', 'Întinde avocado zdrobit și adaugă roșiile și semințele.']),
  T('mic_dejun', 'Tofu scramble cu spanac', 12, [['tofu', 150], ['spanac', 60], ['rosii', 80], ['paine_integrala', 60], ['ulei_masline', 5]], ['Sfărâmă tofu și călește-l în ulei 5 minute.', 'Adaugă spanacul și roșiile, apoi servește cu pâine.']),
  T('mic_dejun', 'Iaurt grecesc cu granola și căpșuni', 5, [['iaurt_grecesc', 200], ['granola', 40], ['capsuni', 100], ['miere', 10]], ['Pune iaurtul într-un bol.', 'Adaugă granola, căpșunile și mierea.']),
  T('mic_dejun', 'Omletă cu legume', 12, [['oua', 120], ['ardei_gras', 80], ['spanac', 50], ['paine_integrala', 60], ['ulei_masline', 5]], ['Călește legumele în ulei.', 'Adaugă ouăle bătute și gătește la foc mic.']),
  T('mic_dejun', 'Brânză de vaci cu măr și nuci', 5, [['branza_vaci', 180], ['mar', 150], ['nuci', 15]], ['Taie mărul cuburi.', 'Amestecă-l cu brânza și presară nucile.']),
  T('pranz', 'Bowl cu somon și quinoa', 25, [['somon', 130], ['quinoa_fiarta', 150], ['avocado', 40], ['castravete', 80], ['rosii', 80], ['salata_verde', 40]], ['Gătește somonul la tigaie sau la cuptor.', 'Așază quinoa, legumele și avocado în bol, apoi adaugă somonul.']),
  T('pranz', 'Salată cu pui și bulgur', 25, [['piept_pui', 140], ['bulgur_fiert', 160], ['rosii', 100], ['castravete', 80], ['ulei_masline', 10]], ['Gătește puiul la grătar și taie-l fâșii.', 'Amestecă bulgurul cu legumele și uleiul, apoi adaugă puiul.']),
  T('pranz', 'Bowl cu năut și quinoa', 15, [['naut_fiert', 150], ['quinoa_fiarta', 140], ['ardei_gras', 80], ['castravete', 80], ['ulei_masline', 8]], ['Taie legumele cuburi.', 'Amestecă totul și asezonează cu lămâie.']),
  T('pranz', 'Supă de linte cu legume', 30, [['linte_fiarta', 200], ['morcov', 80], ['ceapa', 40], ['paine_integrala', 50], ['ulei_masline', 5]], ['Călește ceapa și morcovul în ulei.', 'Adaugă lintea și apă, fierbe 15 minute și servește cu pâine.']),
  T('pranz', 'Paste integrale cu ton și roșii', 20, [['ton_conserva', 100], ['paste_integrale_fierte', 180], ['sos_rosii', 150], ['ulei_masline', 5]], ['Încălzește sosul de roșii cu uleiul.', 'Adaugă tonul și amestecă totul cu pastele fierte.']),
  T('pranz', 'Mușchi de porc cu cartofi și mazăre', 30, [['muschi_porc', 140], ['cartofi_fierti', 200], ['mazare', 120], ['ulei_masline', 5]], ['Gătește mușchiul la tigaie.', 'Servește cu cartofi fierți și mazăre.']),
  T('cina', 'Pui la cuptor cu cartof dulce și broccoli', 35, [['piept_pui', 150], ['cartof_dulce_copt', 180], ['broccoli', 150], ['ulei_masline', 10]], ['Așază puiul și legumele într-o tavă cu ulei și condimente.', 'Coace 30 de minute la 200 °C.']),
  T('cina', 'Tofu cu orez brun și legume', 25, [['tofu', 160], ['orez_brun_fiert', 150], ['broccoli', 120], ['ardei_gras', 80], ['sos_soia', 10]], ['Călește tofu cuburi până se rumenește.', 'Adaugă legumele și sosul de soia, servește cu orez.']),
  T('cina', 'Cod cu orez și legume', 25, [['cod', 170], ['orez_basmati_fiert', 150], ['dovlecel', 100], ['morcov', 80], ['ulei_masline', 8]], ['Gătește codul la abur sau la cuptor.', 'Servește cu orez și legumele sotate.']),
  T('cina', 'Chili sin carne cu orez brun', 30, [['fasole_rosie', 150], ['porumb', 60], ['sos_rosii', 150], ['orez_brun_fiert', 130], ['ardei_gras', 60]], ['Fierbe fasolea, porumbul și ardeiul în sosul de roșii 15 minute.', 'Servește cu orez brun.']),
  T('cina', 'Frittata cu spanac și feta', 20, [['oua', 150], ['spanac', 100], ['feta', 30], ['paine_integrala', 50]], ['Bate ouăle cu spanacul și feta.', 'Coace 15 minute și servește cu pâine.']),
  T('cina', 'Curry de năut cu spanac', 30, [['naut_fiert', 160], ['spanac', 80], ['sos_rosii', 120], ['orez_basmati_fiert', 120], ['ulei_masline', 5]], ['Fierbe năutul în sosul de roșii cu condimente.', 'Adaugă spanacul la final și servește cu orez.']),
  T('gustare', 'Iaurt grecesc cu afine', 3, [['iaurt_grecesc', 250], ['afine', 80]], ['Pune iaurtul într-un bol și adaugă afinele.']),
  T('gustare', 'Edamame cu măr', 5, [['edamame', 150], ['mar', 100]], ['Fierbe edamame 3 minute și servește cu mărul feliat.']),
  T('gustare', 'Hummus cu morcov', 3, [['hummus', 50], ['morcov', 100]], ['Taie morcovul bastonașe și servește-l cu hummus.']),
];

const HABITS = [
  ['Pregătește prânzul de mâine', 'Gătește sau porționează masa de prânz de seara, ca să nu improvizezi.'],
  ['O porție de legume în plus', 'Adaugă o porție de legume la una dintre mese.'],
  ['Masă fără ecrane', 'Mănâncă măcar o masă fără telefon sau televizor.'],
  ['Culcare înainte de 23:00', 'Un somn bun ajută energia și pofta de mâncare.'],
  ['Pauză de mișcare', 'La fiecare oră de stat jos, ridică-te și mișcă-te 2 minute.'],
];

const WORKOUT_DAYS = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };

function testWorkout(profile, dayIndex) {
  const pool = exercisesFor(profile);
  const pick = (groups, n) => pool.filter(e => groups.includes(e.group)).sort((a, b) => (a.equipment === 'none') - (b.equipment === 'none')).slice(0, n);
  const warmup = pool.find(e => e.group === 'mobilitate');
  const main = [...pick(['picioare'], 2), ...pick(dayIndex % 2 ? ['spate'] : ['piept'], 1), ...pick(['core'], 1), ...pick(['cardio'], 1)];
  const sets = { 'Începător': 2, 'Intermediar': 3, 'Avansat': 4 }[profile.experience] || 2;
  const ex = e => ({ exerciseId: e.id, sets: e.group === 'mobilitate' ? 1 : sets, reps: e.mode === 'reps' ? 12 : 0, seconds: e.mode === 'time' ? (e.group === 'mobilitate' ? 60 : 30) : 0, restSec: e.group === 'mobilitate' ? 15 : 60 });
  return [warmup, ...main].filter(Boolean).map(ex);
}

export function testProvider() {
  return {
    name: 'test',
    label: 'test',
    async week({ profile, targets, dates }) {
      const allowed = new Set(allowedFoods(profile).map(f => f.id));
      const ok = m => m.ingredients.every(i => allowed.has(i.foodId));
      const bySlot = slot => TEST_MEALS.filter(m => m.slot === slot && ok(m));
      const workoutIdx = WORKOUT_DAYS[profile.days_per_week] || WORKOUT_DAYS[3];
      const days = dates.map((date, i) => {
        const meals = ['mic_dejun', 'pranz', 'cina', 'gustare'].map(slot => {
          const list = bySlot(slot);
          return list.length ? structuredClone(list[(i + slot.length) % list.length]) : null;
        }).filter(Boolean);
        // Generatorul de test aduce porțiile la țintă, ca validarea să le accepte fără ajustări mari.
        const kcal = meals.reduce((s, m) => s + nutritionOf(m.ingredients).kcal, 0);
        const factor = targets.kcal / kcal;
        meals.forEach(m => m.ingredients.forEach(ing => { ing.grams = Math.min(500, Math.max(5, Math.round((ing.grams * factor) / 5) * 5)); }));
        const tasks = [{ type: 'apa', title: `Bea ${(targets.water / 1000).toLocaleString('ro-RO')} L de apă`, detail: 'Împarte apa pe parcursul zilei.', waterMl: targets.water, minutes: 0, exercises: [] }];
        if (workoutIdx.includes(i)) {
          tasks.push({ type: 'antrenament', title: 'Antrenament pentru tot corpul', detail: 'Începe cu mobilitatea, apoi fă exercițiile în ordine.', waterMl: 0, minutes: Math.min(profile.session_minutes || 30, 45), exercises: testWorkout(profile, i) });
        } else {
          tasks.push({ type: 'miscare', title: 'Plimbare de 20 de minute', detail: 'Un ritm în care poți vorbi confortabil.', waterMl: 0, minutes: 20, exercises: [] });
        }
        if (i === 0) tasks.push({ type: 'cantarire', title: 'Cântărire de dimineață', detail: 'După trezire, înainte de micul dejun.', waterMl: 0, minutes: 0, exercises: [] });
        const [title, detail] = HABITS[i % HABITS.length];
        tasks.push({ type: 'obicei', title, detail, waterMl: 0, minutes: 0, exercises: [] });
        return { date, note: 'Plan de test generat local, fără AI.', meals, tasks };
      });
      return { data: { days }, content: null, usage: null, model: null };
    },
    async meal({ profile, day, oldMeal, otherMeals }) {
      const allowed = new Set(allowedFoods(profile).map(f => f.id));
      const options = TEST_MEALS.filter(m => m.slot === oldMeal.slot && m.name !== oldMeal.name && !otherMeals.includes(m.name) && m.ingredients.every(i => allowed.has(i.foodId)));
      if (!options.length) throw new AiError('no_alternative', 'Nu există încă o alternativă potrivită pentru această masă.');
      const meal = structuredClone(options[day.length % options.length]);
      return { data: meal, content: null, usage: null, model: null };
    },
  };
}

/** Alege generatorul după configurare. Întoarce null dacă AI-ul nu e configurat. */
export function resolveProvider(config) {
  const mode = config.aiProvider;
  if (mode === 'off') return null;
  if (mode === 'test') return testProvider();
  if (mode === 'anthropic' || (mode === 'auto' && config.anthropicKey)) {
    if (!config.anthropicKey) return null;
    return anthropicProvider(config);
  }
  return mode === 'auto' && !config.isProd ? testProvider() : null;
}

export { FOOD_BY_ID };
