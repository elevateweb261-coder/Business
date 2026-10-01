// Rulează migrațiile fără a porni serverul: `npm run migrate`.
import { loadEnvFile, buildConfig } from './config.js';
import { openDb, migrate } from './db.js';

loadEnvFile();
const config = buildConfig();
const db = openDb(config.dbPath); // openDb aplică deja migrațiile
migrate(db, console.log);
const rows = db.prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version').all();
console.log(`Baza de date ${config.dbPath} este la zi. Migrații aplicate:`);
for (const r of rows) console.log(`  ${r.version}  (${r.applied_at})`);
db.close();
