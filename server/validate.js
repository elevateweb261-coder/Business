// Validare simplă a datelor primite. Fiecare regulă întoarce valoarea curățată sau aruncă un mesaj în română.
import { badRequest } from './http.js';

class FieldError extends Error {}
const fail = msg => { throw new FieldError(msg); };

export const rules = {
  str: ({ max = 200, min = 0, optional = false } = {}) => v => {
    if (v === undefined || v === null || v === '') {
      if (optional) return null;
      fail('Completează acest câmp.');
    }
    if (typeof v !== 'string') fail('Valoare invalidă.');
    const s = v.trim();
    if (!s && !optional) fail('Completează acest câmp.');
    if (s.length < min) fail(`Folosește cel puțin ${min} caractere.`);
    if (s.length > max) fail(`Folosește cel mult ${max} caractere.`);
    return s || null;
  },
  num: ({ min, max, optional = false, int = false, decimals } = {}) => v => {
    if (v === undefined || v === null || v === '') {
      if (optional) return null;
      fail('Completează acest câmp.');
    }
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n)) fail('Introdu un număr.');
    if (int && !Number.isInteger(n)) fail('Introdu un număr întreg.');
    if (min !== undefined && n < min) fail(`Valoarea minimă este ${min}.`);
    if (max !== undefined && n > max) fail(`Valoarea maximă este ${max}.`);
    return decimals !== undefined ? Math.round(n * 10 ** decimals) / 10 ** decimals : n;
  },
  oneOf: (values, { optional = false } = {}) => v => {
    if ((v === undefined || v === null || v === '') && optional) return null;
    if (!values.includes(v)) fail('Alege una dintre opțiunile disponibile.');
    return v;
  },
  bool: () => v => v === true,
  email: () => v => {
    if (typeof v !== 'string' || !v.trim()) fail('Completează adresa de email.');
    const s = v.trim().toLowerCase();
    if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) fail('Introdu o adresă de email validă.');
    return s;
  },
  password: () => v => {
    if (typeof v !== 'string' || !v) fail('Completează parola.');
    if (v.length < 10) fail('Parola trebuie să aibă cel puțin 10 caractere.');
    if (v.length > 200) fail('Parola este prea lungă.');
    return v;
  },
  day: () => v => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) fail('Dată invalidă.');
    return v;
  },
  localDateTime: () => v => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) || Number.isNaN(Date.parse(v + ':00Z'))) fail('Data sau ora nu sunt valide.');
    return v;
  },
  clientId: () => v => {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(v)) fail('Identificator invalid.');
    return v;
  },
};

/**
 * Validează `body` după `schema` ({câmp: regulă}). Cu `partial`, câmpurile lipsă sunt ignorate.
 * Întoarce doar câmpurile din schemă. Aruncă 422 cu erori pe câmpuri.
 */
export function validate(body, schema, { partial = false } = {}) {
  const out = {};
  const fields = {};
  for (const [key, rule] of Object.entries(schema)) {
    if (partial && !(key in body)) continue;
    try {
      out[key] = rule(body[key]);
    } catch (err) {
      if (!(err instanceof FieldError)) throw err;
      fields[key] = err.message;
    }
  }
  if (Object.keys(fields).length) throw badRequest('Verifică datele introduse.', fields);
  return out;
}

/** Ziua curentă (AAAA-LL-ZZ) într-un fus orar IANA. */
export function todayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

/** Respinge datele din viitor, raportat la ziua curentă a utilizatorului. */
export function assertNotFuture(day, timeZone, field = 'day') {
  if (day > todayIn(timeZone)) throw badRequest('Data nu poate fi în viitor.', { [field]: 'Data nu poate fi în viitor.' });
}
