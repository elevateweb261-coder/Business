-- Schema inițială Metamorf. Toate tabelele cu date personale referă users(id) cu ON DELETE CASCADE,
-- astfel încât ștergerea contului elimină tot.
-- Zilele (`day`) sunt date calendaristice AAAA-LL-ZZ în fusul orar al utilizatorului.

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Bucharest',
  terms_accepted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX password_resets_user ON password_resets(user_id);

CREATE TABLE profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  age INTEGER,
  sex TEXT,
  height_cm REAL,
  weight_kg REAL,
  goal TEXT,
  activity TEXT,
  diet TEXT,
  likes TEXT,
  dislikes TEXT,
  location TEXT,
  equipment TEXT,
  experience TEXT,
  days_per_week INTEGER,
  session_minutes INTEGER,
  -- Date de sănătate: salvate doar cu consimțământ explicit (health_consent_at nenul).
  allergies TEXT,
  health_notes TEXT,
  health_consent_at TEXT,
  onboarding_step INTEGER NOT NULL DEFAULT 0,
  onboarding_done_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (health_consent_at IS NOT NULL OR (allergies IS NULL AND health_notes IS NULL))
);

CREATE TABLE targets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kcal INTEGER NOT NULL,
  protein INTEGER NOT NULL,
  carbs INTEGER NOT NULL,
  fat INTEGER NOT NULL,
  water_ml INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE food_entries (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  logged_at TEXT NOT NULL,
  name TEXT NOT NULL,
  grams REAL,
  kcal REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'example', 'plan', 'barcode', 'photo')),
  plan_slot INTEGER,
  meal_ref TEXT,
  client_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX food_entries_user_day ON food_entries(user_id, day);
-- O masă din plan (mic dejun / prânz / cină) se înregistrează o singură dată pe zi.
CREATE UNIQUE INDEX food_entries_slot_once ON food_entries(user_id, day, plan_slot) WHERE plan_slot IS NOT NULL;
-- Idempotență: aceeași cerere retrimisă (dublu clic, reîncercare) nu creează a doua intrare.
CREATE UNIQUE INDEX food_entries_client ON food_entries(user_id, client_id) WHERE client_id IS NOT NULL;

CREATE TABLE water_days (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  ml INTEGER NOT NULL CHECK (ml BETWEEN 0 AND 10000),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE workout_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  duration_s INTEGER NOT NULL CHECK (duration_s BETWEEN 0 AND 86400),
  plan_ref TEXT,
  client_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX workout_sessions_user_day ON workout_sessions(user_id, day);
CREATE UNIQUE INDEX workout_sessions_client ON workout_sessions(user_id, client_id) WHERE client_id IS NOT NULL;

CREATE TABLE weights (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_at TEXT NOT NULL, -- AAAA-LL-ZZTHH:MM, ora locală a utilizatorului
  kg REAL NOT NULL CHECK (kg BETWEEN 20 AND 400),
  created_at TEXT NOT NULL
);
CREATE INDEX weights_user ON weights(user_id, measured_at);

-- Starea abonamentului. Actualizată doar de notificările verificate ale procesatorului de plăți (etapa 3).
CREATE TABLE subscriptions (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT,
  status TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'active', 'trialing', 'past_due', 'canceled', 'expired')),
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  updated_at TEXT NOT NULL
);

-- Scanări folosite pe zi (etapa 6). Contorizate pe server, în fusul orar al utilizatorului.
CREATE TABLE scan_usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
