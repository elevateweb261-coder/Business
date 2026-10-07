// Catalogul de alimente folosit la planuri și rețete. AI-ul poate alege DOAR alimente de aici (prin `id`) și gramajul;
// caloriile și macronutrienții sunt calculați pe server din catalog, nu preluați de la model.
// Sursa de adevăr este tabelul `foods` (panoul de administrare: import din USDA / CIQUAL / Open Food Facts sau
// introducere manuală). Lista de mai jos este doar catalogul inițial, copiat o singură dată în baza de date
// (server/catalog.js); `FOODS` / `FOOD_BY_ID` conțin catalogul activ, încărcat prin `setFoods`.
//
// Valori la 100 g, alimente gătite unde e indicat. Sursa de referință: USDA FoodData Central (valori uzuale).
// ⚠ Înainte de lansare: verificați fiecare rând cu sursa oficială aleasă (USDA / CIQUAL) — vezi TASKS.md.
//
// diet: 'vegan' < 'vegetarian' < 'fish' < 'meat' < 'pork' (o dietă acceptă alimentele de nivel ≤ pragul ei)
// tags: termeni folosiți la verificarea alimentelor evitate și a alergenilor declarați.

export const FOOD_SOURCE = 'USDA FoodData Central (valori de referință; de verificat înainte de lansare)';

const F = (id, name, group, diet, kcal, protein, carbs, fat, tags = []) => ({ id, name, group, diet, kcal, protein, carbs, fat, tags });

export const SEED_FOODS = [
  // Cereale, pâine, tuberculi
  F('fulgi_ovaz', 'Fulgi de ovăz', 'cereale', 'vegan', 379, 13.2, 67.7, 6.5, ['ovaz', 'gluten']),
  F('granola', 'Granola', 'cereale', 'vegan', 489, 13.7, 53.9, 24.3, ['ovaz', 'gluten', 'nuci']),
  F('quinoa_fiarta', 'Quinoa fiartă', 'cereale', 'vegan', 120, 4.4, 21.3, 1.9, ['quinoa']),
  F('orez_brun_fiert', 'Orez brun fiert', 'cereale', 'vegan', 123, 2.7, 25.6, 1.0, ['orez']),
  F('orez_basmati_fiert', 'Orez basmati fiert', 'cereale', 'vegan', 130, 2.7, 28.2, 0.3, ['orez']),
  F('paste_integrale_fierte', 'Paste integrale fierte', 'cereale', 'vegan', 150, 6.0, 30.0, 1.7, ['paste', 'gluten', 'grau']),
  F('bulgur_fiert', 'Bulgur fiert', 'cereale', 'vegan', 83, 3.1, 18.6, 0.2, ['bulgur', 'gluten', 'grau']),
  F('cuscus_fiert', 'Cuscus fiert', 'cereale', 'vegan', 112, 3.8, 23.2, 0.2, ['cuscus', 'gluten', 'grau']),
  F('paine_integrala', 'Pâine integrală', 'cereale', 'vegan', 247, 13.0, 41.0, 3.4, ['paine', 'gluten', 'grau']),
  F('lipie_integrala', 'Lipie integrală', 'cereale', 'vegan', 310, 9.0, 50.0, 8.0, ['lipie', 'gluten', 'grau']),
  F('cartofi_fierti', 'Cartofi fierți', 'cereale', 'vegan', 87, 1.9, 20.1, 0.1, ['cartof']),
  F('cartof_dulce_copt', 'Cartof dulce copt', 'cereale', 'vegan', 90, 2.0, 20.7, 0.2, ['cartof dulce']),

  // Proteine
  F('piept_pui', 'Piept de pui gătit', 'proteine', 'meat', 165, 31.0, 0, 3.6, ['pui', 'carne']),
  F('piept_curcan', 'Piept de curcan gătit', 'proteine', 'meat', 147, 30.1, 0, 2.1, ['curcan', 'carne']),
  F('vita_slaba', 'Vită slabă gătită', 'proteine', 'meat', 187, 28.0, 0, 8.0, ['vita', 'carne']),
  F('muschi_porc', 'Mușchi de porc gătit', 'proteine', 'pork', 143, 26.0, 0, 3.5, ['porc', 'carne']),
  F('somon', 'Somon gătit', 'proteine', 'fish', 206, 22.1, 0, 12.4, ['somon', 'peste']),
  F('cod', 'File de cod gătit', 'proteine', 'fish', 105, 22.8, 0, 0.9, ['cod', 'peste']),
  F('ton_conserva', 'Ton în suc propriu', 'proteine', 'fish', 116, 25.5, 0, 0.8, ['ton', 'peste']),
  F('oua', 'Ouă', 'proteine', 'vegetarian', 143, 12.6, 0.7, 9.5, ['ou', 'oua']),
  F('albus', 'Albuș de ou', 'proteine', 'vegetarian', 52, 10.9, 0.7, 0.2, ['ou', 'oua']),
  F('tofu', 'Tofu ferm', 'proteine', 'vegan', 144, 17.3, 2.8, 8.7, ['tofu', 'soia']),
  F('tempeh', 'Tempeh', 'proteine', 'vegan', 192, 20.3, 7.6, 10.8, ['tempeh', 'soia']),
  F('naut_fiert', 'Năut fiert', 'proteine', 'vegan', 164, 8.9, 27.4, 2.6, ['naut']),
  F('linte_fiarta', 'Linte fiartă', 'proteine', 'vegan', 116, 9.0, 20.1, 0.4, ['linte']),
  F('fasole_rosie', 'Fasole roșie fiartă', 'proteine', 'vegan', 127, 8.7, 22.8, 0.5, ['fasole']),
  F('fasole_neagra', 'Fasole neagră fiartă', 'proteine', 'vegan', 132, 8.9, 23.7, 0.5, ['fasole']),
  F('fasole_alba', 'Fasole albă fiartă', 'proteine', 'vegan', 139, 9.7, 25.1, 0.4, ['fasole']),
  F('edamame', 'Edamame', 'proteine', 'vegan', 121, 11.9, 8.9, 5.2, ['edamame', 'soia']),

  // Lactate și alternative
  F('iaurt_grecesc', 'Iaurt grecesc 2%', 'lactate', 'vegetarian', 73, 9.9, 3.9, 2.0, ['iaurt', 'lapte', 'lactoza']),
  F('iaurt_simplu', 'Iaurt simplu 1,5%', 'lactate', 'vegetarian', 63, 5.3, 7.0, 1.6, ['iaurt', 'lapte', 'lactoza']),
  F('branza_vaci', 'Brânză de vaci', 'lactate', 'vegetarian', 98, 11.1, 3.4, 4.3, ['branza', 'lapte', 'lactoza']),
  F('feta', 'Brânză feta', 'lactate', 'vegetarian', 264, 14.2, 4.1, 21.3, ['feta', 'branza', 'lapte', 'lactoza']),
  F('parmezan', 'Parmezan', 'lactate', 'vegetarian', 392, 35.8, 3.2, 25.8, ['parmezan', 'branza', 'lapte']),
  F('lapte', 'Lapte 1,5%', 'lactate', 'vegetarian', 47, 3.4, 5.0, 1.5, ['lapte', 'lactoza']),
  F('bautura_soia', 'Băutură de soia neîndulcită', 'lactate', 'vegan', 33, 2.9, 1.7, 1.8, ['soia']),
  F('bautura_ovaz', 'Băutură de ovăz', 'lactate', 'vegan', 45, 0.9, 6.6, 1.5, ['ovaz', 'gluten']),

  // Grăsimi, nuci, semințe
  F('avocado', 'Avocado', 'grasimi', 'vegan', 160, 2.0, 8.5, 14.7, ['avocado']),
  F('ulei_masline', 'Ulei de măsline', 'grasimi', 'vegan', 884, 0, 0, 100, ['ulei']),
  F('nuci', 'Nuci', 'grasimi', 'vegan', 654, 15.2, 13.7, 65.2, ['nuci', 'fructe cu coaja']),
  F('migdale', 'Migdale', 'grasimi', 'vegan', 579, 21.2, 21.6, 49.9, ['migdale', 'fructe cu coaja']),
  F('seminte_chia', 'Semințe de chia', 'grasimi', 'vegan', 486, 16.5, 42.1, 30.7, ['chia', 'seminte']),
  F('seminte_dovleac', 'Semințe de dovleac', 'grasimi', 'vegan', 559, 30.2, 10.7, 49.1, ['seminte']),
  F('unt_arahide', 'Unt de arahide', 'grasimi', 'vegan', 588, 25.0, 20.0, 50.0, ['arahide']),
  F('hummus', 'Hummus', 'grasimi', 'vegan', 166, 7.9, 14.3, 9.6, ['hummus', 'naut', 'susan']),
  F('tahini', 'Tahini', 'grasimi', 'vegan', 595, 17.0, 21.0, 54.0, ['susan']),

  // Fructe
  F('banana', 'Banană', 'fructe', 'vegan', 89, 1.1, 22.8, 0.3, ['banana']),
  F('mar', 'Măr', 'fructe', 'vegan', 52, 0.3, 13.8, 0.2, ['mar']),
  F('para', 'Pară', 'fructe', 'vegan', 57, 0.4, 15.2, 0.1, ['para']),
  F('capsuni', 'Căpșuni', 'fructe', 'vegan', 32, 0.7, 7.7, 0.3, ['capsuni']),
  F('afine', 'Afine', 'fructe', 'vegan', 57, 0.7, 14.5, 0.3, ['afine', 'fructe de padure']),
  F('zmeura', 'Zmeură', 'fructe', 'vegan', 52, 1.2, 11.9, 0.7, ['zmeura', 'fructe de padure']),
  F('kiwi', 'Kiwi', 'fructe', 'vegan', 61, 1.1, 14.7, 0.5, ['kiwi']),
  F('portocala', 'Portocală', 'fructe', 'vegan', 47, 0.9, 11.8, 0.1, ['portocala', 'citrice']),
  F('mango', 'Mango', 'fructe', 'vegan', 60, 0.8, 15.0, 0.4, ['mango']),
  F('struguri', 'Struguri', 'fructe', 'vegan', 69, 0.7, 18.1, 0.2, ['struguri']),
  F('curmale', 'Curmale', 'fructe', 'vegan', 282, 2.5, 75.0, 0.4, ['curmale']),

  // Legume
  F('broccoli', 'Broccoli', 'legume', 'vegan', 35, 2.4, 7.2, 0.4, ['broccoli']),
  F('spanac', 'Spanac', 'legume', 'vegan', 23, 2.9, 3.6, 0.4, ['spanac']),
  F('rosii', 'Roșii', 'legume', 'vegan', 18, 0.9, 3.9, 0.2, ['rosii']),
  F('castravete', 'Castravete', 'legume', 'vegan', 15, 0.7, 3.6, 0.1, ['castravete']),
  F('ardei_gras', 'Ardei gras', 'legume', 'vegan', 31, 1.0, 6.0, 0.3, ['ardei']),
  F('morcov', 'Morcov', 'legume', 'vegan', 41, 0.9, 9.6, 0.2, ['morcov']),
  F('dovlecel', 'Dovlecel', 'legume', 'vegan', 17, 1.2, 3.1, 0.3, ['dovlecel']),
  F('ceapa', 'Ceapă', 'legume', 'vegan', 40, 1.1, 9.3, 0.1, ['ceapa']),
  F('salata_verde', 'Salată verde', 'legume', 'vegan', 15, 1.4, 2.9, 0.2, ['salata']),
  F('ciuperci', 'Ciuperci', 'legume', 'vegan', 22, 3.1, 3.3, 0.3, ['ciuperci']),
  F('conopida', 'Conopidă', 'legume', 'vegan', 25, 1.9, 5.0, 0.3, ['conopida']),
  F('fasole_verde', 'Fasole verde', 'legume', 'vegan', 31, 1.8, 7.0, 0.2, ['fasole verde']),
  F('varza', 'Varză', 'legume', 'vegan', 25, 1.3, 5.8, 0.1, ['varza']),
  F('porumb', 'Porumb dulce', 'legume', 'vegan', 86, 3.3, 18.7, 1.4, ['porumb']),
  F('mazare', 'Mazăre', 'legume', 'vegan', 81, 5.4, 14.5, 0.4, ['mazare']),
  F('vinete', 'Vinete', 'legume', 'vegan', 25, 1.0, 5.9, 0.2, ['vinete']),
  F('sos_rosii', 'Sos de roșii (passata)', 'legume', 'vegan', 29, 1.6, 5.4, 0.2, ['rosii']),

  // Altele
  F('miere', 'Miere', 'altele', 'vegetarian', 304, 0.3, 82.4, 0, ['miere']),
  F('sos_soia', 'Sos de soia', 'altele', 'vegan', 53, 8.1, 4.9, 0.6, ['soia', 'gluten']),
];

export const FOODS = [];
export const FOOD_BY_ID = new Map();

/** Înlocuiește catalogul activ (aceleași obiecte exportate, ca modulele care le importă să vadă schimbarea). */
export function setFoods(list) {
  FOODS.splice(0, FOODS.length, ...list);
  FOOD_BY_ID.clear();
  for (const f of list) FOOD_BY_ID.set(f.id, f);
}

export const FOOD_GROUPS = { cereale: 'Cereale și tuberculi', proteine: 'Proteine', lactate: 'Lactate', legume: 'Legume', fructe: 'Fructe', grasimi: 'Grăsimi, nuci și semințe', altele: 'Altele' };
export const DIET_TYPES = { vegan: 'Vegan', vegetarian: 'Vegetarian', fish: 'Pește', meat: 'Carne', pork: 'Porc' };
export const FOOD_SOURCES = { usda: 'USDA', ciqual: 'CIQUAL', off: 'Open Food Facts', manual: 'Manual' };

export const DIET_LEVEL = { vegan: 0, vegetarian: 1, fish: 2, meat: 3, pork: 4 };
export const DIET_MAX = { 'Vegan': 0, 'Vegetarian': 1, 'Fără porc': 3, 'Cu carne': 4 };

/** Alimentele permise pentru tipul de alimentație al utilizatorului. */
export function foodsForDiet(diet) {
  const max = DIET_MAX[diet] ?? 4;
  return FOODS.filter(f => DIET_LEVEL[f.diet] <= max);
}

// ---------- Alergeni (cei 14 alergeni majori din UE, Regulamentul 1169/2011, anexa II) ----------
// Derivați din etichetele alimentelor. ⚠ De verificat înainte de lansare, împreună cu valorile nutriționale.
export const ALLERGENS = {
  gluten: 'Cereale cu gluten',
  lapte: 'Lapte (inclusiv lactoză)',
  oua: 'Ouă',
  peste: 'Pește',
  arahide: 'Arahide',
  soia: 'Soia',
  fructe_coaja: 'Fructe cu coajă lemnoasă',
  susan: 'Susan',
  telina: 'Țelină',
  mustar: 'Muștar',
  crustacee: 'Crustacee',
  moluste: 'Moluște',
  lupin: 'Lupin',
  sulfiti: 'Dioxid de sulf și sulfiți',
};

const TAG_ALLERGEN = {
  gluten: 'gluten', lapte: 'lapte', lactoza: 'lapte', ou: 'oua', oua: 'oua', peste: 'peste', arahide: 'arahide',
  soia: 'soia', nuci: 'fructe_coaja', migdale: 'fructe_coaja', 'fructe cu coaja': 'fructe_coaja', susan: 'susan',
};

/** Codurile de alergeni ale unui aliment: cele salvate în catalog sau, pentru catalogul inițial, deduse din etichete. */
export const allergensOf = food => (Array.isArray(food.allergens) ? food.allergens : [...new Set((food.tags || []).map(t => TAG_ALLERGEN[t]).filter(Boolean))]);

export const DIET_NAMES = ['Cu carne', 'Fără porc', 'Vegetarian', 'Vegan'];

/**
 * Calculul complet al unei rețete din catalog: nutriție totală și pe porție, alergeni, diete compatibile.
 * `ingredients`: [{ foodId, grams }]. Alimentele necunoscute sunt ignorate (și raportate în `unknown`).
 */
export function recipeFacts(ingredients, servings = 1) {
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const allergens = new Set();
  const unknown = [];
  let level = -1;
  for (const i of ingredients) {
    const f = FOOD_BY_ID.get(i.foodId);
    if (!f) { unknown.push(i.foodId); continue; }
    const k = i.grams / 100;
    total.kcal += f.kcal * k; total.protein += f.protein * k; total.carbs += f.carbs * k; total.fat += f.fat * k;
    allergensOf(f).forEach(a => allergens.add(a));
    level = Math.max(level, DIET_LEVEL[f.diet]);
  }
  const round = n => ({ kcal: Math.round(n.kcal), protein: Math.round(n.protein * 10) / 10, carbs: Math.round(n.carbs * 10) / 10, fat: Math.round(n.fat * 10) / 10 });
  const s = Math.max(1, servings || 1);
  return {
    total: round(total),
    perServing: round({ kcal: total.kcal / s, protein: total.protein / s, carbs: total.carbs / s, fat: total.fat / s }),
    allergens: Object.keys(ALLERGENS).filter(a => allergens.has(a)),
    diets: level < 0 ? [] : DIET_NAMES.filter(d => DIET_MAX[d] >= level),
    unknown,
  };
}
