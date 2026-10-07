// Parole (scrypt), tokenuri de sesiune / resetare și limitarea încercărilor.
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const scryptAsync = (password, salt, keylen, opts) => new Promise((resolve, reject) => {
  scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
});

const KEYLEN = 64;

/** Hash în format `scrypt$logN$r$p$sare$hash` — parametrii se pot crește ulterior fără a invalida parolele vechi. */
export async function hashPassword(password, logN = 17) {
  const salt = randomBytes(16);
  const N = 2 ** logN, r = 8, p = 1;
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 });
  return `scrypt$${logN}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, logN, r, p, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const N = 2 ** Number(logN);
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scryptAsync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, { N, r: Number(r), p: Number(p), maxmem: 256 * N * Number(r) + 1024 * 1024 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Token aleator pentru browser + hash-ul lui pentru baza de date (tokenul în clar nu e stocat). */
export function newToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export const hashToken = token => createHash('sha256').update(String(token)).digest('hex');

/** Limitare simplă în memorie: maxim `limit` evenimente per cheie într-o fereastră de `windowMs`. */
export class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }
  #recent(key, now) {
    const list = (this.hits.get(key) || []).filter(t => now - t < this.windowMs);
    this.hits.set(key, list);
    return list;
  }
  blocked(key, now = Date.now()) {
    return this.#recent(key, now).length >= this.limit;
  }
  hit(key, now = Date.now()) {
    this.#recent(key, now).push(now);
    if (this.hits.size > 10000) for (const [k, v] of this.hits) if (!v.length || now - v.at(-1) > this.windowMs) this.hits.delete(k);
  }
  reset(key) {
    this.hits.delete(key);
  }
  /** Câte milisecunde mai sunt până se poate încerca din nou (0 dacă nu e blocat). */
  retryAfter(key, now = Date.now()) {
    const list = this.#recent(key, now);
    return list.length < this.limit ? 0 : Math.max(0, this.windowMs - (now - list[0]));
  }
}
