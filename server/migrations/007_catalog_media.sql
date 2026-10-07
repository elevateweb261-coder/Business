-- Ecranele 6–8: exercițiile și alimentele trec din cod în baza de date (editabile din panou), plus biblioteca media.
-- Tabelele se populează o singură dată, la pornire, din catalogul inițial din `server/plan/*.js` (vezi server/catalog.js).

CREATE TABLE exercises (
  id            TEXT PRIMARY KEY,                       -- identificator stabil folosit de planuri (ex. „genuflexiuni”)
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  muscles_json  TEXT NOT NULL DEFAULT '[]',             -- grupe musculare; prima este grupa principală
  places_json   TEXT NOT NULL DEFAULT '[]',             -- 'acasa', 'sala'
  equipment_json TEXT NOT NULL DEFAULT '["none"]',
  level         TEXT CHECK (level IN ('incepator', 'intermediar', 'avansat')),
  mode          TEXT NOT NULL DEFAULT 'reps' CHECK (mode IN ('reps', 'time')),
  sets          INTEGER,                                -- recomandări (orientative pentru AI și pentru client)
  reps          INTEGER,
  seconds       INTEGER,
  rest_sec      INTEGER,
  steps_json    TEXT NOT NULL DEFAULT '[]',
  mistakes_json TEXT NOT NULL DEFAULT '[]',
  image         TEXT,                                   -- numele fișierului din biblioteca media
  video         TEXT,                                   -- fișier video încărcat (biblioteca media) …
  video_url     TEXT,                                   -- … sau link către o sursă licențiată
  video_source  TEXT,                                   -- sursa / licența videoclipului (obligatorie dacă există video)
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  published_at  TEXT
);

CREATE TABLE foods (
  id             TEXT PRIMARY KEY,                      -- folosit de rețete și planuri
  name           TEXT NOT NULL,
  food_group     TEXT NOT NULL,
  diet           TEXT NOT NULL CHECK (diet IN ('vegan', 'vegetarian', 'fish', 'meat', 'pork')),
  kcal           REAL NOT NULL,
  protein        REAL NOT NULL,
  carbs          REAL NOT NULL,
  fat            REAL NOT NULL,
  allergens_json TEXT NOT NULL DEFAULT '[]',
  tags_json      TEXT NOT NULL DEFAULT '[]',            -- termeni de căutare (alimente evitate)
  source         TEXT NOT NULL CHECK (source IN ('usda', 'ciqual', 'off', 'manual')),
  source_ref     TEXT,                                  -- codul din sursă (FDC ID, cod CIQUAL, cod de bare)
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX foods_source ON foods(source, source_ref);

CREATE TABLE media (
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  folder        TEXT NOT NULL CHECK (folder IN ('recipes', 'library')),
  filename      TEXT NOT NULL UNIQUE,
  mime          TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  width         INTEGER,
  height        INTEGER,
  original_name TEXT,
  source        TEXT,                                   -- sursă / licență
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL
);
