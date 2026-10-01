// Opțiunile acceptate în chestionar. Valorile sunt aceleași texte afișate în interfață.
export const OPTIONS = {
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

export const ONBOARDING_STEPS = 6;

/**
 * Eligibilitatea pentru un plan individual generat automat (etapa 4):
 * doar adulți, fără alergii și fără limitări/condiții declarate.
 */
export function planEligibility(p) {
  if (!p?.onboarding_done_at) return 'incomplete';
  if (p.age !== null && p.age < 18) return 'minor';
  if (p.allergies || p.health_notes) return 'specialist';
  return 'eligible';
}
