-- Ecranele 9–11: roluri pentru echipă, abonamente și evenimente de plată, audit cu IP, setările aplicației.

-- Echipa: `users.role = 'admin'` înseamnă „cont de echipă” (are acces la panou); rolul din panou este `admin_role`.
-- Conturile de client (`role = 'user'`) nu devin conturi de echipă din panou.
ALTER TABLE users ADD COLUMN admin_role TEXT CHECK (admin_role IN ('admin', 'editor', 'support'));
ALTER TABLE users ADD COLUMN admin_disabled_at TEXT;
ALTER TABLE users ADD COLUMN admin_last_login_at TEXT;
ALTER TABLE users ADD COLUMN admin_invited_by INTEGER;
UPDATE users SET admin_role = 'admin' WHERE role = 'admin';

-- Jurnalul de audit: adresa IP de la care s-a făcut acțiunea.
ALTER TABLE admin_audit ADD COLUMN ip TEXT;
CREATE INDEX admin_audit_admin ON admin_audit(admin_email, created_at);

-- Platforma pe care a fost cumpărat abonamentul (după integrarea plăților; NULL pentru Premium acordat manual).
ALTER TABLE subscriptions ADD COLUMN platform TEXT CHECK (platform IN ('web', 'ios', 'android'));

-- Notificările (webhook-urile) primite de la procesatorul de plăți, păstrate exact cum au venit.
CREATE TABLE payment_events (
  id              INTEGER PRIMARY KEY,
  provider        TEXT NOT NULL,                       -- de ex. stripe, app_store, google_play
  event_id        TEXT,                                -- identificatorul evenimentului la procesator
  event_type      TEXT NOT NULL,
  signature_valid INTEGER NOT NULL CHECK (signature_valid IN (0, 1)),
  status          TEXT NOT NULL CHECK (status IN ('processed', 'failed', 'ignored')),
  error           TEXT,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  payload         TEXT NOT NULL,                       -- JSON-ul primit
  received_at     TEXT NOT NULL,
  processed_at    TEXT,
  UNIQUE (provider, event_id)
);
CREATE INDEX payment_events_received ON payment_events(received_at);

-- Setările aplicației, modificabile din panou (valorile lipsă = valorile implicite din server/settings.js).
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                            -- JSON
  updated_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
