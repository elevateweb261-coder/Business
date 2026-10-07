-- Cereri de date (export / ștergere cont), cu cronologie. Emailul și numele sunt păstrate ca instantaneu,
-- ca cererea să rămână documentată și după ștergerea contului (user_id devine NULL).
CREATE TABLE data_requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_name TEXT,
  type TEXT NOT NULL CHECK (type IN ('export', 'delete')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  source TEXT NOT NULL CHECK (source IN ('user', 'admin')),   -- cerută din aplicație sau înregistrată de un administrator
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX data_requests_status ON data_requests(status, created_at);

CREATE TABLE data_request_events (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES data_requests(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  actor_email TEXT,            -- NULL = sistemul / utilizatorul însuși
  created_at TEXT NOT NULL
);
CREATE INDEX data_request_events_request ON data_request_events(request_id, id);

-- Rețete. Valorile nutriționale, alergenii și dietele compatibile NU se stochează:
-- se calculează mereu din catalogul nutrițional (server/plan/foods.js).
CREATE TABLE recipes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('mic_dejun', 'pranz', 'cina', 'gustare')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  prep_minutes INTEGER,
  servings INTEGER NOT NULL DEFAULT 1,
  photo TEXT,                  -- numele fișierului din data/uploads/recipes
  steps_json TEXT NOT NULL DEFAULT '[]',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX recipes_status ON recipes(status, meal_type);

CREATE TABLE recipe_ingredients (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  food_id TEXT NOT NULL,
  grams INTEGER NOT NULL CHECK (grams BETWEEN 1 AND 2000),
  PRIMARY KEY (recipe_id, position)
);
