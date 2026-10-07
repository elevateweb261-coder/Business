-- Administrare: rol pe cont, ultima activitate și jurnal de audit.

-- Rolul se acordă doar din linia de comandă de pe server (npm run admin), niciodată din aplicație.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));

-- Ultima activitate (actualizată cel mult o dată pe oră), pentru statistici „utilizatori activi”.
ALTER TABLE users ADD COLUMN last_seen_at TEXT;

-- Fiecare acțiune a unui administrator (inclusiv vizualizarea detaliilor unui cont) rămâne înregistrată.
-- Fără cheie străină spre utilizatorul vizat, ca istoricul să rămână și după ștergerea contului.
CREATE TABLE admin_audit (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id INTEGER,
  target_email TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX admin_audit_created ON admin_audit(created_at);
