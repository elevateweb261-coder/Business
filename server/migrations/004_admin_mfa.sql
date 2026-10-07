-- Autentificare în doi pași (TOTP) pentru administratori.

-- Cheia TOTP este stocată criptată (AES-256-GCM, cheia serverului — vezi server/secret.js).
ALTER TABLE users ADD COLUMN totp_secret_enc TEXT;
ALTER TABLE users ADD COLUMN totp_enabled_at TEXT;
-- Ultimul pas de timp folosit: un cod nu poate fi folosit de două ori.
ALTER TABLE users ADD COLUMN totp_last_counter INTEGER;

-- O sesiune care a trecut și de pasul al doilea (necesar pentru panoul de administrare).
ALTER TABLE sessions ADD COLUMN mfa_at TEXT;

-- Pasul intermediar dintre parolă și cod: valabil 5 minute, cu număr limitat de încercări.
CREATE TABLE admin_mfa_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pending_secret_enc TEXT,       -- doar la prima configurare
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
