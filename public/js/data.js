'use strict';
// Conținut demonstrativ: secțiuni, mese, exerciții. Valorile nutriționale sunt aproximative și nu sunt verificate pentru alergeni.

/** Secțiunile din meniu: cheie hash → [titlu, pictogramă]. */
const VIEWS = {
  acasa: ['Prezentare generală', 'home'],
  alimentatie: ['Plan alimentar', 'leaf'],
  antrenamente: ['Antrenamente', 'dumbbell'],
  scanner: ['Scanner & jurnal', 'scan'],
  progres: ['Progresul meu', 'chart'],
  abonamente: ['Abonamente', 'crown'],
};

/** Opțiunile chestionarului — aceleași valori sunt validate și pe server (server/options.js). */
const OPTIONS = {
  gender: ['Femeie', 'Bărbat', 'Prefer să nu indic'],
  goal: ['Echilibru', 'Slăbire', 'Masă musculară'],
  activity: ['Sedentar', 'Moderat', 'Activ', 'Foarte activ'],
  diet: ['Cu carne', 'Fără porc', 'Vegetarian', 'Vegan'],
  location: ['Acasă', 'La sală'],
  experience: ['Începător', 'Intermediar', 'Avansat'],
  equipment: ['Fără echipament', 'Gantere', 'Benzi elastice', 'Echipament de sală'],
  days: [2, 3, 4, 5, 6],
  minutes: [20, 30, 45, 60],
};

const SLOTS = [
  { key: 'breakfast', type: 'MIC DEJUN', label: 'Mic dejun', time: '08:00' },
  { key: 'lunch', type: 'PRÂNZ', label: 'Prânz', time: '13:00' },
  { key: 'dinner', type: 'CINĂ', label: 'Cină', time: '19:00' },
];

/** Cât de „restrictiv” e fiecare fel de mâncare: o dietă acceptă mesele cu nivel ≤ pragul ei. */
const DIET_LEVEL = { vegan: 0, vegetarian: 1, fish: 2, meat: 3, pork: 4 };
const DIET_MAX = { 'Vegan': 0, 'Vegetarian': 1, 'Fără porc': 3, 'Cu carne': 4 };

/** `image`: fotografie sau ilustrație (din public/). Mesele fără imagine afișează un titlu pe fundal verde. */
const MEALS = {
  breakfast: [
    { id: 'b-ovaz-iaurt', name: 'Ovăz cremos cu fructe', diet: 'vegetarian', kcal: 380, protein: 16, carbs: 54, fat: 11, min: 10, tagline: 'Un început bun.', sub: 'Cremos. Proaspăt. Simplu.',
      ingredients: ['Fulgi de ovăz · 60 g', 'Iaurt simplu · 150 g', 'Fructe de pădure · 100 g', 'Semințe de chia · 10 g'],
      instructions: 'Fierbe ovăzul cu apă, lasă-l să se răcească puțin, apoi adaugă iaurtul, fructele și semințele.' },
    { id: 'b-omleta', name: 'Omletă cu legume & pâine integrală', diet: 'vegetarian', kcal: 380, protein: 24, carbs: 30, fat: 18, min: 15, tagline: 'Cald și sățios.', sub: 'Ouă · legume · pâine integrală',
      ingredients: ['Ouă · 2 buc.', 'Ardei, roșii și spanac · 120 g', 'Pâine integrală · 50 g', 'Ulei de măsline · 5 g'],
      instructions: 'Călește ușor legumele în ulei, adaugă ouăle bătute și gătește la foc mic până se închegă. Servește cu pâinea.' },
    { id: 'b-ovaz-vegan', name: 'Ovăz cu băutură vegetală & banană', diet: 'vegan', kcal: 370, protein: 12, carbs: 58, fat: 10, min: 10, tagline: 'Plant based.', sub: 'Ovăz · soia · banană',
      ingredients: ['Fulgi de ovăz · 60 g', 'Băutură de soia · 200 ml', 'Banană · 90 g', 'Semințe de chia · 10 g'],
      instructions: 'Fierbe ovăzul în băutura vegetală, apoi adaugă banana feliată și semințele.' },
    { id: 'b-iaurt-granola', name: 'Iaurt grecesc cu granola & căpșuni', diet: 'vegetarian', kcal: 360, protein: 22, carbs: 45, fat: 10, min: 5, image: 'img/meal-iaurt-granola.svg', tagline: 'Rapid și proaspăt.', sub: 'Iaurt · granola · căpșuni',
      ingredients: ['Iaurt grecesc 2% · 200 g', 'Granola fără zahăr adăugat · 40 g', 'Căpșuni · 100 g', 'Miere · 5 g'],
      instructions: 'Pune iaurtul într-un bol, adaugă granola și căpșunile feliate, apoi un fir de miere.' },
    { id: 'b-avocado', name: 'Tartine cu avocado & roșii', diet: 'vegan', kcal: 365, protein: 11, carbs: 42, fat: 17, min: 8, tagline: 'Verde la micul dejun.', sub: 'Avocado · roșii · semințe',
      ingredients: ['Pâine integrală · 70 g', 'Avocado · 60 g', 'Roșii cherry · 100 g', 'Semințe de dovleac · 8 g'],
      instructions: 'Prăjește pâinea, întinde avocado zdrobit, adaugă roșiile tăiate și semințele. Condimentează după gust.' },
    { id: 'b-chia', name: 'Budincă de chia cu mango', diet: 'vegan', kcal: 345, protein: 10, carbs: 40, fat: 16, min: 5, tagline: 'Pregătită de aseară.', sub: 'Chia · mango · migdale',
      ingredients: ['Semințe de chia · 30 g', 'Băutură de soia · 200 ml', 'Mango · 100 g', 'Fulgi de migdale · 8 g'],
      instructions: 'Amestecă semințele de chia cu băutura vegetală și lasă peste noapte la frigider. Dimineața adaugă mango și migdalele.' },
    { id: 'b-branza-vaci', name: 'Brânză de vaci cu măr & nuci', diet: 'vegetarian', kcal: 340, protein: 26, carbs: 28, fat: 14, min: 5, tagline: 'Proteină dimineața.', sub: 'Brânză de vaci · măr · nuci',
      ingredients: ['Brânză de vaci · 180 g', 'Măr · 150 g', 'Nuci · 15 g', 'Scorțișoară · după gust'],
      instructions: 'Taie mărul cuburi și amestecă-l cu brânza de vaci. Presară nucile și scorțișoara.' },
  ],
  lunch: [
    { id: 'l-somon', name: 'Bowl cu somon & quinoa', diet: 'fish', kcal: 520, protein: 35, carbs: 48, fat: 20, min: 25, image: 'meal.jpg', tagline: 'Proaspăt.', sub: 'Somon · quinoa · avocado',
      ingredients: ['Somon · 120 g', 'Quinoa gătită · 140 g', 'Avocado · 40 g', 'Roșii, castravete și salată · 180 g'],
      instructions: 'Gătește somonul și quinoa separat. Pune-le într-un bol împreună cu legumele și avocado. Asezonează după preferințe.' },
    { id: 'l-pui-bulgur', name: 'Salată cu pui la grătar & bulgur', diet: 'meat', kcal: 485, protein: 40, carbs: 50, fat: 14, min: 25, tagline: 'Simplu și sățios.', sub: 'Pui · bulgur · legume',
      ingredients: ['Piept de pui · 140 g', 'Bulgur gătit · 150 g', 'Salată verde, castravete, roșii · 200 g', 'Ulei de măsline · 10 g'],
      instructions: 'Gătește pieptul de pui la grătar și taie-l fâșii. Amestecă bulgurul cu legumele și uleiul, apoi adaugă puiul.' },
    { id: 'l-naut', name: 'Bowl cu năut & quinoa', diet: 'vegan', kcal: 495, protein: 20, carbs: 68, fat: 16, min: 15, tagline: 'Plant based.', sub: 'Năut · quinoa · legume',
      ingredients: ['Năut gătit · 150 g', 'Quinoa gătită · 140 g', 'Avocado · 40 g', 'Legume proaspete · 180 g'],
      instructions: 'Amestecă quinoa și năutul cu legumele și avocado. Asezonează cu lămâie și condimente.' },
    { id: 'l-ton', name: 'Paste integrale cu ton & roșii', diet: 'fish', kcal: 510, protein: 34, carbs: 66, fat: 12, min: 20, tagline: 'Gata în 20 de minute.', sub: 'Paste · ton · busuioc',
      ingredients: ['Paste integrale · 80 g (crude)', 'Ton în suc propriu · 100 g', 'Sos de roșii · 150 g', 'Ulei de măsline · 5 g', 'Busuioc · după gust'],
      instructions: 'Fierbe pastele. Încălzește sosul de roșii, adaugă tonul scurs și amestecă totul cu pastele și busuiocul.' },
    { id: 'l-linte', name: 'Supă cremă de linte roșie', diet: 'vegan', kcal: 435, protein: 24, carbs: 62, fat: 10, min: 30, tagline: 'Caldă și catifelată.', sub: 'Linte · morcov · cocos',
      ingredients: ['Linte roșie · 80 g (crudă)', 'Morcov și ceapă · 150 g', 'Lapte de cocos light · 50 ml', 'Pâine integrală · 40 g'],
      instructions: 'Fierbe lintea cu legumele până se înmoaie, pasează și adaugă laptele de cocos. Servește cu pâinea.' },
    { id: 'l-curcan-wrap', name: 'Wrap cu curcan & legume', diet: 'meat', kcal: 440, protein: 32, carbs: 46, fat: 14, min: 15, tagline: 'La pachet.', sub: 'Curcan · hummus · legume',
      ingredients: ['Lipie integrală · 70 g', 'Piept de curcan · 100 g', 'Hummus · 30 g', 'Legume crude · 120 g'],
      instructions: 'Întinde hummusul pe lipie, adaugă curcanul gătit și legumele, apoi rulează strâns.' },
    { id: 'l-falafel', name: 'Salată cu falafel la cuptor & tzatziki', diet: 'vegetarian', kcal: 460, protein: 20, carbs: 55, fat: 18, min: 30, tagline: 'Gust mediteranean.', sub: 'Falafel · tzatziki · salată',
      ingredients: ['Falafel la cuptor · 120 g', 'Salată, roșii, ceapă roșie · 180 g', 'Tzatziki · 80 g', 'Lipie integrală · 40 g'],
      instructions: 'Coace falafelul până devine auriu. Servește-l peste salată, cu tzatziki și lipie.' },
    { id: 'l-quinoa-fasole', name: 'Salată de quinoa cu fasole neagră', diet: 'vegan', kcal: 455, protein: 18, carbs: 64, fat: 14, min: 15, tagline: 'Colorată.', sub: 'Quinoa · fasole · porumb',
      ingredients: ['Quinoa gătită · 150 g', 'Fasole neagră · 100 g', 'Porumb · 50 g', 'Ardei și ceapă roșie · 100 g', 'Ulei de măsline și lime · 8 g'],
      instructions: 'Amestecă toate ingredientele și lasă salata 10 minute la rece, ca să se lege aromele.' },
    { id: 'l-porc', name: 'Mușchi de porc cu piure de mazăre', diet: 'pork', kcal: 455, protein: 38, carbs: 40, fat: 16, min: 30, tagline: 'Gătit acasă.', sub: 'Porc · mazăre · cartofi',
      ingredients: ['Mușchi de porc · 140 g', 'Mazăre · 150 g', 'Cartofi · 120 g', 'Ulei de măsline · 5 g'],
      instructions: 'Gătește mușchiul la tigaie sau la cuptor. Fierbe mazărea și cartofii, apoi pasează-le într-un piure.' },
    { id: 'l-fasole-alba', name: 'Tocăniță de legume cu fasole albă', diet: 'vegan', kcal: 450, protein: 20, carbs: 66, fat: 12, min: 35, tagline: 'Ca la bunica.', sub: 'Fasole · legume · mărar',
      ingredients: ['Fasole albă gătită · 160 g', 'Morcov, ardei, ceapă, roșii · 200 g', 'Pâine integrală · 40 g', 'Ulei de măsline · 8 g'],
      instructions: 'Călește legumele în ulei, adaugă fasolea și puțină apă, apoi fierbe la foc mic 20 de minute. Presară mărar la final.' },
  ],
  dinner: [
    { id: 'd-pui-cuptor', name: 'Pui la cuptor cu legume', diet: 'meat', kcal: 540, protein: 42, carbs: 52, fat: 18, min: 30, tagline: 'O seară în echilibru.', sub: 'Ingrediente simple, mai mult gust.',
      ingredients: ['Piept de pui · 150 g', 'Cartof dulce · 180 g', 'Broccoli · 150 g', 'Ulei de măsline · 10 g'],
      instructions: 'Taie legumele și așază-le alături de pui într-o tavă. Adaugă condimente și gătește până când carnea este bine făcută.' },
    { id: 'd-tofu', name: 'Tofu cu legume la cuptor', diet: 'vegan', kcal: 465, protein: 26, carbs: 50, fat: 18, min: 30, tagline: 'O seară în echilibru.', sub: 'Tofu · cartof dulce · broccoli',
      ingredients: ['Tofu · 160 g', 'Cartof dulce · 180 g', 'Broccoli · 150 g', 'Ulei de măsline · 5 g'],
      instructions: 'Coace tofu și legumele cu condimentele preferate, până devin aurii.' },
    { id: 'd-peste', name: 'Pește alb cu legume la abur & orez', diet: 'fish', kcal: 425, protein: 36, carbs: 48, fat: 10, min: 25, tagline: 'Ușor, pentru seară.', sub: 'Pește · orez · legume',
      ingredients: ['File de cod sau merluciu · 160 g', 'Orez basmati gătit · 140 g', 'Morcov, dovlecel și fasole verde · 200 g', 'Lămâie și ulei de măsline · 5 g'],
      instructions: 'Gătește peștele și legumele la abur. Servește cu orezul și stropește cu lămâie și ulei.' },
    { id: 'd-chili', name: 'Chili sin carne cu orez brun', diet: 'vegan', kcal: 480, protein: 22, carbs: 80, fat: 8, min: 30, image: 'img/meal-chili.svg', tagline: 'Picant, după gust.', sub: 'Fasole · porumb · orez brun',
      ingredients: ['Fasole roșie · 150 g', 'Porumb · 60 g', 'Sos de roșii și ardei · 200 g', 'Orez brun gătit · 120 g'],
      instructions: 'Fierbe la foc mic fasolea și porumbul în sosul de roșii cu condimente. Servește cu orezul.' },
    { id: 'd-vita', name: 'Vită slabă cu legume sotate & orez', diet: 'meat', kcal: 495, protein: 38, carbs: 50, fat: 16, min: 25, tagline: 'Rapid, la wok.', sub: 'Vită · legume · orez',
      ingredients: ['Vită slabă · 130 g', 'Orez basmati gătit · 140 g', 'Ardei, ceapă, broccoli · 200 g', 'Sos de soia · 10 ml'],
      instructions: 'Taie carnea fâșii subțiri și călește-o rapid. Adaugă legumele și sosul de soia, apoi servește cu orez.' },
    { id: 'd-frittata', name: 'Frittata cu spanac & feta', diet: 'vegetarian', kcal: 400, protein: 28, carbs: 22, fat: 22, min: 20, tagline: 'Din cuptor.', sub: 'Ouă · spanac · feta',
      ingredients: ['Ouă · 3 buc.', 'Spanac · 100 g', 'Brânză feta · 30 g', 'Pâine integrală · 40 g'],
      instructions: 'Bate ouăle cu spanacul și feta mărunțită, toarnă într-o formă și coace 15 minute.' },
    { id: 'd-curry', name: 'Curry de năut cu spanac', diet: 'vegan', kcal: 470, protein: 20, carbs: 70, fat: 12, min: 30, tagline: 'Aromat.', sub: 'Năut · spanac · orez',
      ingredients: ['Năut gătit · 160 g', 'Spanac · 80 g', 'Sos de roșii cu lapte de cocos light · 150 ml', 'Orez basmati gătit · 100 g'],
      instructions: 'Fierbe năutul în sos cu condimente de curry, adaugă spanacul la final și servește cu orez.' },
    { id: 'd-ardei', name: 'Ardei umpluți cu curcan & orez', diet: 'meat', kcal: 430, protein: 34, carbs: 42, fat: 14, min: 50, tagline: 'Ca acasă.', sub: 'Curcan · orez · roșii',
      ingredients: ['Ardei grași · 2 buc.', 'Carne tocată de curcan · 120 g', 'Orez · 40 g (crud)', 'Sos de roșii · 100 g'],
      instructions: 'Amestecă carnea cu orezul și condimentele, umple ardeii și fierbe-i în sosul de roșii aproximativ 40 de minute.' },
    { id: 'd-paste-legume', name: 'Paste integrale cu legume la cuptor', diet: 'vegan', kcal: 475, protein: 17, carbs: 76, fat: 12, min: 30, tagline: 'Gustul cuptorului.', sub: 'Paste · dovlecel · ardei',
      ingredients: ['Paste integrale · 80 g (crude)', 'Dovlecel, ardei, vinete · 220 g', 'Roșii cherry · 100 g', 'Ulei de măsline · 10 g'],
      instructions: 'Coace legumele cu ulei și condimente 25 de minute, apoi amestecă-le cu pastele fierte.' },
  ],
};

/** Exerciții demonstrative: [nume, volum, descriere]. */
const EXERCISES = [
  ['Genuflexiuni', '3 serii × 12 repetări', 'Ține spatele drept și coboară controlat, în limita confortului.'],
  ['Flotări la perete', '3 serii × 10 repetări', 'Sprijină palmele de perete și apropie trunchiul prin îndoirea coatelor.'],
  ['Podul fesier', '3 serii × 12 repetări', 'Din poziție culcată cu genunchii îndoiți, ridică lent bazinul.'],
  ['Bird dog', '2 serii × 10 pe fiecare parte', 'Din sprijin pe mâini și genunchi, întinde brațul și piciorul opus.'],
  ['Mobilitate ușoară', '5 minute', 'Mișcări lente pentru umeri și șolduri, fără a forța articulațiile.'],
];

/** Produse fixe afișate de scannerul demonstrativ. */
const DEMO_SCAN = {
  photo: { name: 'Bowl cu somon · masă exemplu', kcal: 520, protein: 35, carbs: 48, fat: 20 },
  barcode: { name: 'Iaurt simplu · produs exemplu', kcal: 120, protein: 9, carbs: 12, fat: 4 },
};
