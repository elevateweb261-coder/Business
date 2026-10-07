-- Confirmarea emailului (fluxul de confirmare se activează după alegerea furnizorului de email).
ALTER TABLE users ADD COLUMN email_verified_at TEXT;

-- Istoricul abonamentului: fiecare schimbare, cu sursa ei (procesatorul de plăți sau un administrator) și motivul.
CREATE TABLE subscription_events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                 -- 'manual_grant' | 'payment' | 'renewal' | 'cancel' | 'expire' ...
  source TEXT NOT NULL CHECK (source IN ('admin', 'processor')),
  plan TEXT,
  status TEXT,
  period_end TEXT,
  reason TEXT,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX subscription_events_user ON subscription_events(user_id, created_at);
