// Configurare din variabile de mediu. Fișierul `.env` (dacă există) e citit la pornire; variabilele
// deja setate în sistem au prioritate. Nu folosim pachete externe (fără dotenv).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnvFile(file = resolve(ROOT, '.env')) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

const int = (v, fallback) => (v === undefined || v === '' ? fallback : Number.parseInt(v, 10));

/** Construiește configurația. `overrides` e folosit în teste. */
export function buildConfig(env = process.env, overrides = {}) {
  const nodeEnv = env.NODE_ENV || 'development';
  const port = int(env.PORT, 3000);
  const appUrl = (env.APP_URL || `http://localhost:${port}`).replace(/\/$/, '');
  const config = {
    env: nodeEnv,
    isProd: nodeEnv === 'production',
    host: env.HOST || '127.0.0.1',
    port,
    appUrl,
    dbPath: resolve(ROOT, env.DATABASE_PATH || 'data/metamorf.db'),
    outboxDir: resolve(ROOT, env.MAIL_OUTBOX_DIR || 'data/outbox'),
    mailMode: env.MAIL_MODE || 'outbox',
    mailFrom: env.MAIL_FROM || 'Metamorf <no-reply@localhost>',
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : appUrl.startsWith('https://'),
    sessionDays: int(env.SESSION_DAYS, 30),
    scryptCost: int(env.SCRYPT_COST, 17), // N = 2^17 (recomandare OWASP)
    trustProxy: env.TRUST_PROXY === 'true',
    publicDir: resolve(ROOT, 'public'),
    // AI: cheia se citește doar pe server. AI_PROVIDER: auto | anthropic | test | off
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    aiProvider: env.AI_PROVIDER || 'auto',
    aiModel: env.AI_MODEL || 'claude-opus-5-5',
    aiEffort: env.AI_EFFORT || 'medium',
    ...overrides,
  };
  if (config.isProd && !env.APP_URL) throw new Error('APP_URL este obligatoriu în producție.');
  return config;
}
