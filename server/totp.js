// Coduri de autentificare în doi pași (TOTP, RFC 6238): 6 cifre, pas de 30 de secunde, HMAC-SHA1 —
// compatibil cu Google Authenticator, Microsoft Authenticator, Authy, 1Password etc.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Cheie nouă de 160 de biți, în base32 (cum o afișează aplicațiile de autentificare). */
export const generateSecret = () => base32Encode(randomBytes(20));

export const counterAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS);

export function codeFor(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = h[h.length - 1] & 15;
  const bin = ((h[offset] & 127) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Verifică un cod, acceptând pasul curent și câte unul înainte/după (diferențe mici de ceas).
 * Întoarce pasul folosit sau null. Codurile deja folosite (pas ≤ lastCounter) sunt respinse.
 */
export function verifyCode(secret, code, lastCounter = -1, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const current = counterAt(now);
  for (const c of [current, current - 1, current + 1]) {
    if (c <= lastCounter) continue;
    const expected = Buffer.from(codeFor(secret, c));
    if (timingSafeEqual(expected, Buffer.from(String(code)))) return c;
  }
  return null;
}

export function otpauthUri(email, secret, issuer = 'Metamorf Admin') {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}
