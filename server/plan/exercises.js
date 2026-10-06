// Catalogul de exerciții. AI-ul poate alege DOAR exerciții de aici (prin `id`), cu serii, repetări/secunde și pauze.
// Fără videoclipuri sau linkuri: demonstrațiile video se adaugă doar din conținut propriu sau licențiat.
// ⚠ Înainte de lansare: instrucțiunile trebuie revizuite de un antrenor.
//
// equipment: ce e necesar — 'none', 'gantere', 'benzi', 'sala'
// mode: 'reps' (repetări) sau 'time' (secunde)

const E = (id, name, group, equipment, mode, instructions) => ({ id, name, group, equipment, mode, instructions });

export const EXERCISES = [
  // Fără echipament
  E('genuflexiuni', 'Genuflexiuni', 'picioare', 'none', 'reps', 'Picioarele la lățimea umerilor, coboară controlat ca și cum te-ai așeza, cu spatele drept și genunchii în direcția vârfurilor.'),
  E('fandari', 'Fandări alternative', 'picioare', 'none', 'reps', 'Fă un pas mare înainte și coboară până când ambii genunchi sunt la aproximativ 90°. Revino și schimbă piciorul.'),
  E('pod_fesier', 'Podul fesier', 'picioare', 'none', 'reps', 'Culcat pe spate, cu genunchii îndoiți, ridică bazinul strângând fesierii, apoi coboară lent.'),
  E('ridicari_gambe', 'Ridicări pe vârfuri', 'picioare', 'none', 'reps', 'În picioare, ridică-te pe vârfuri, menține o secundă, apoi coboară controlat.'),
  E('flotari_perete', 'Flotări la perete', 'piept', 'none', 'reps', 'Palmele pe perete la nivelul umerilor; apropie pieptul de perete îndoind coatele, apoi împinge înapoi.'),
  E('flotari_genunchi', 'Flotări pe genunchi', 'piept', 'none', 'reps', 'Sprijin pe palme și genunchi, corpul drept de la genunchi la cap; coboară pieptul și împinge înapoi.'),
  E('flotari', 'Flotări', 'piept', 'none', 'reps', 'Sprijin pe palme și vârfuri, corpul drept; coboară pieptul aproape de sol și împinge înapoi.'),
  E('superman', 'Superman', 'spate', 'none', 'reps', 'Culcat pe abdomen, ridică ușor brațele și picioarele de pe sol, menține o secundă, apoi coboară.'),
  E('plank', 'Plank', 'core', 'none', 'time', 'Sprijin pe antebrațe și vârfuri, corpul drept, abdomenul strâns. Respiră normal.'),
  E('plank_lateral', 'Plank lateral', 'core', 'none', 'time', 'Sprijin pe un antebraț și pe marginea tălpilor, bazinul ridicat, corpul în linie dreaptă. Schimbă partea.'),
  E('bird_dog', 'Bird dog', 'core', 'none', 'reps', 'Din sprijin pe palme și genunchi, întinde brațul și piciorul opus, menține, apoi schimbă partea.'),
  E('dead_bug', 'Dead bug', 'core', 'none', 'reps', 'Culcat pe spate cu brațele în sus și genunchii la 90°, coboară alternativ brațul și piciorul opus, cu spatele lipit de sol.'),
  E('mountain_climbers', 'Mountain climbers', 'cardio', 'none', 'time', 'Din poziția de flotare, adu alternativ genunchii spre piept, într-un ritm confortabil.'),
  E('jumping_jacks', 'Jumping jacks', 'cardio', 'none', 'time', 'Sari depărtând picioarele și ridicând brațele, apoi revino. Variantă fără sărituri: pas lateral.'),
  E('mers_alert', 'Mers alert pe loc', 'cardio', 'none', 'time', 'Mers pe loc ridicând genunchii și balansând brațele, într-un ritm care îți crește ușor pulsul.'),
  E('mobilitate_solduri', 'Mobilitate șolduri', 'mobilitate', 'none', 'time', 'Cercuri lente cu șoldurile și balansări ale picioarelor, fără a forța amplitudinea.'),
  E('mobilitate_umeri', 'Mobilitate umeri', 'mobilitate', 'none', 'time', 'Cercuri cu brațele și rotiri ale umerilor înainte și înapoi, lent și controlat.'),
  E('intindere_posterior', 'Întindere posterioară a coapsei', 'mobilitate', 'none', 'time', 'Cu un picior întins înainte, apleacă-te ușor din șold, cu spatele drept, până simți o întindere confortabilă.'),

  // Gantere
  E('genuflexiuni_goblet', 'Genuflexiuni goblet', 'picioare', 'gantere', 'reps', 'Ține o gantere la piept, cu ambele mâini; coboară în genuflexiune cu pieptul ridicat.'),
  E('deadlift_romanesc', 'Îndreptări românești cu gantere', 'picioare', 'gantere', 'reps', 'Cu genunchii ușor îndoiți, coboară ganterele pe lângă picioare împingând șoldurile înapoi, cu spatele drept.'),
  E('impins_gantere', 'Împins cu gantere de la piept', 'piept', 'gantere', 'reps', 'Culcat pe spate (pe sol sau bancă), împinge ganterele în sus și coboară-le controlat până la nivelul pieptului.'),
  E('ramat_gantera', 'Ramat cu gantera', 'spate', 'gantere', 'reps', 'Sprijinit cu o mână, trage gantera spre șold cu cotul aproape de corp, apoi coboară lent.'),
  E('presa_umeri', 'Presă pentru umeri cu gantere', 'umeri', 'gantere', 'reps', 'Așezat sau în picioare, împinge ganterele deasupra capului fără a arcui spatele.'),
  E('flexii_biceps', 'Flexii pentru biceps', 'brate', 'gantere', 'reps', 'Cu coatele lângă corp, ridică ganterele spre umeri, apoi coboară controlat.'),
  E('extensii_triceps', 'Extensii pentru triceps', 'brate', 'gantere', 'reps', 'Ține o gantere deasupra capului cu ambele mâini și coboar-o în spatele capului îndoind coatele.'),

  // Benzi elastice
  E('ramat_banda', 'Ramat cu banda elastică', 'spate', 'benzi', 'reps', 'Prinde banda fixată în fața ta și trage mânerele spre corp, apropiind omoplații.'),
  E('pallof_banda', 'Presa Pallof cu banda', 'core', 'benzi', 'reps', 'Cu banda fixată lateral, ține mânerul la piept și împinge-l înainte fără să lași corpul să se rotească.'),
  E('pasi_laterali_banda', 'Pași laterali cu banda', 'picioare', 'benzi', 'reps', 'Cu banda deasupra genunchilor, în semi-genuflexiune, fă pași laterali controlați.'),

  // Sală
  E('presa_picioare', 'Presa pentru picioare', 'picioare', 'sala', 'reps', 'Cu tălpile pe platformă, coboară controlat până la un unghi confortabil al genunchilor și împinge înapoi.'),
  E('helcometru', 'Tracțiuni la helcometru', 'spate', 'sala', 'reps', 'Trage bara spre partea de sus a pieptului, cu pieptul ridicat, apoi revino controlat.'),
  E('ramat_cablu', 'Ramat la cablu', 'spate', 'sala', 'reps', 'Așezat, trage mânerul spre abdomen cu spatele drept și omoplații apropiați.'),
  E('aparat_piept', 'Împins la aparat pentru piept', 'piept', 'sala', 'reps', 'Împinge mânerele înainte până aproape de întinderea brațelor, apoi revino lent.'),
  E('bicicleta', 'Bicicletă staționară', 'cardio', 'sala', 'time', 'Pedalează într-un ritm în care poți vorbi, dar nu poți cânta.'),
  E('banda_inclinata', 'Mers pe bandă înclinată', 'cardio', 'sala', 'time', 'Mers alert pe bandă cu înclinație moderată, fără să te ții de mânere.'),
];

export const EXERCISE_BY_ID = new Map(EXERCISES.map(e => [e.id, e]));

/** Echipamentul disponibil, după preferințele utilizatorului. */
export function availableEquipment(profile) {
  const set = new Set(['none']);
  if (profile.location === 'La sală' || profile.equipment === 'Echipament de sală') {
    ['gantere', 'benzi', 'sala'].forEach(e => set.add(e));
  } else if (profile.equipment === 'Gantere') set.add('gantere');
  else if (profile.equipment === 'Benzi elastice') set.add('benzi');
  return set;
}

export function exercisesFor(profile) {
  const eq = availableEquipment(profile);
  return EXERCISES.filter(e => eq.has(e.equipment));
}
