// Criptarea datelor sensibile stocate de server (de exemplu, cheile de autentificare în doi pași).
// Cheia vine din SECRET_KEY (.env, 32 de octeți în base64). În dezvoltare, dacă lipsește, se creează automat
// în data/secret.key (folderul data/ nu ajunge în git). În producție, SECRET_KEY este obligatorie.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function loadSecretKey(config) {
  if (config.secretKey) {
    const key = Buffer.from(config.secretKey, 'base64');
    if (key.length !== 32) throw new Error('SECRET_KEY trebuie să aibă 32 de octeți, în base64.');
    return key;
  }
  if (config.isProd) throw new Error('SECRET_KEY este obligatorie în producție.');
  if (config.dbPath === ':memory:') return randomBytes(32); // teste
  const file = join(dirname(config.dbPath), 'secret.key');
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  return Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
}

/** AES-256-GCM. Rezultat: v1.iv.tag.date (base64url). */
export function encrypt(key, text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decrypt(key, payload) {
  const [v, iv, tag, data] = String(payload).split('.');
  if (v !== 'v1') throw new Error('Format necunoscut.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
