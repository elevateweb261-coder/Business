-- Planuri personalizate (mese + sarcini zilnice), generate de AI sau, în dezvoltare, de generatorul local de test.

-- Un plan acoperă o săptămână (luni–duminică). `week_index` = a câta săptămână din programul utilizatorului
-- (1 = prima, gratuită; 2+ = Premium).
CREATE TABLE plans (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  week_index INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ai', 'test')),
  model TEXT,
  targets_json TEXT NOT NULL,   -- țintele folosite la generare
  created_at TEXT NOT NULL,
  UNIQUE (user_id, week_start)
);

-- O zi din plan: mese (cu ingrediente, gramaje și nutriție calculată pe server) și sarcini.
CREATE TABLE plan_days (
  id INTEGER PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, day)
);
CREATE INDEX plan_days_plan ON plan_days(plan_id);

-- Sarcini bifate.
CREATE TABLE plan_task_done (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  task_id TEXT NOT NULL,
  done_at TEXT NOT NULL,
  PRIMARY KEY (user_id, day, task_id)
);

-- Jurnal de utilizare AI: cost, limite zilnice, depanare. Nu conține date de sănătate.
CREATE TABLE ai_requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,           -- 'week' | 'meal'
  day TEXT NOT NULL,            -- ziua (fusul utilizatorului) în care s-a făcut cererea
  provider TEXT NOT NULL,
  model TEXT,
  ok INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  input_tokens INTEGER,
  output_tokens INTEGER,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ai_requests_user_day ON ai_requests(user_id, day);
