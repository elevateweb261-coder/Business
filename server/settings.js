// Setările aplicației (ecranul 11): limite de scanare, funcții opționale, mesajul de mentenanță.
// Valorile salvate în `app_settings` le înlocuiesc pe cele implicite de mai jos.

export const DEFAULT_SETTINGS = {
  scanLimitFree: 1,
  scanLimitPremium: 3,
  featureAiPlans: true,
  featurePhotoScan: true,
  maintenanceEnabled: false,
  maintenanceMessage: '',
};

/** Descrierea fiecărei setări (etichete pentru panou și pentru diferențele din jurnalul de audit). */
export const SETTINGS_META = {
  scanLimitFree: { label: 'Scanări pe zi · Gratuit', type: 'int', min: 0, max: 20 },
  scanLimitPremium: { label: 'Scanări pe zi · Premium', type: 'int', min: 0, max: 50 },
  featureAiPlans: { label: 'Generarea planurilor cu AI', type: 'bool' },
  featurePhotoScan: { label: 'Scanarea foto și a codului de bare', type: 'bool' },
  maintenanceEnabled: { label: 'Mesaj de mentenanță afișat', type: 'bool' },
  maintenanceMessage: { label: 'Textul mesajului de mentenanță', type: 'text', max: 300 },
};

export function getSettings(db) {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key, value FROM app_settings').all()) {
    if (r.key in out) { try { out[r.key] = JSON.parse(r.value); } catch { /* valoare coruptă: rămâne cea implicită */ } }
  }
  return out;
}

/** Ce vede aplicația (fără autentificare). */
export const publicSettings = s => ({
  scanLimits: { free: s.scanLimitFree, premium: s.scanLimitPremium },
  features: { aiPlans: s.featureAiPlans, photoScan: s.featurePhotoScan },
  maintenance: s.maintenanceEnabled && s.maintenanceMessage ? { message: s.maintenanceMessage } : null,
});

/** Validează setările trimise; întoarce valorile complete (cele netrimise rămân neschimbate) sau aruncă `fields`. */
export function validateSettings(input, current) {
  const fields = {};
  const next = { ...current };
  for (const [key, meta] of Object.entries(SETTINGS_META)) {
    if (!(key in (input || {}))) continue;
    const v = input[key];
    if (meta.type === 'int') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < meta.min || n > meta.max) fields[key] = `Un număr întreg între ${meta.min} și ${meta.max}.`;
      else next[key] = n;
    } else if (meta.type === 'bool') {
      if (typeof v !== 'boolean') fields[key] = 'Valoare nevalidă.';
      else next[key] = v;
    } else {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s.length > meta.max) fields[key] = `Cel mult ${meta.max} de caractere.`;
      else next[key] = s;
    }
  }
  if (!fields.scanLimitPremium && !fields.scanLimitFree && next.scanLimitPremium < next.scanLimitFree) {
    fields.scanLimitPremium = 'Premium nu poate avea mai puține scanări decât planul gratuit.';
  }
  if (next.maintenanceEnabled && next.maintenanceMessage.length < 10) {
    fields.maintenanceMessage = 'Scrie mesajul afișat utilizatorilor (cel puțin 10 caractere).';
  }
  return { next, fields };
}

/** Diferențele dintre două obiecte: { cheie: [vechi, nou] } doar pentru valorile schimbate. */
export function diffValues(before, after, keys = Object.keys(after)) {
  const out = {};
  for (const k of keys) {
    if (JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null)) out[k] = [before?.[k] ?? null, after?.[k] ?? null];
  }
  return out;
}

export function saveSettings(db, next, userId) {
  const t = new Date().toISOString();
  const up = db.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`);
  for (const [k, v] of Object.entries(next)) up.run(k, JSON.stringify(v), t, userId);
}
