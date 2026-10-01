// Punctul de pornire: `npm start` (sau `node server/server.js`).
import { loadEnvFile, buildConfig } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';

loadEnvFile();
const config = buildConfig();
const db = openDb(config.dbPath);
const { server } = createApp(config, { db });

if (config.isProd && config.mailMode === 'outbox') {
  console.warn('ATENȚIE: MAIL_MODE=outbox în producție — emailurile de resetare nu sunt trimise. Configurează un furnizor de email.');
}

server.listen(config.port, config.host, () => {
  console.log(`Metamorf rulează la ${config.appUrl} (mediu: ${config.env}, bază de date: ${config.dbPath})`);
});

const shutdown = () => {
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
