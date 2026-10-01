// Trimiterea emailurilor. Momentan există doar modul „outbox” (pentru dezvoltare): mesajul este scris
// într-un fișier din `data/outbox/` și afișat în consolă. Trimiterea reală necesită un furnizor (SMTP/API),
// care nu a fost încă ales — vezi TASKS.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function createMailer(config, { quiet = false } = {}) {
  const sent = []; // păstrat în memorie pentru teste
  return {
    sent,
    async send({ to, subject, text }) {
      if (config.mailMode !== 'outbox') throw new Error(`MAIL_MODE=${config.mailMode} nu este implementat.`);
      sent.push({ to, subject, text });
      if (config.dbPath === ':memory:') return;
      mkdirSync(config.outboxDir, { recursive: true });
      const file = join(config.outboxDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${to.replace(/[^a-z0-9@._-]/gi, '_')}.txt`);
      writeFileSync(file, `From: ${config.mailFrom}\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`, 'utf8');
      if (!quiet) console.log(`\n[email de dezvoltare] către ${to}: ${subject}\n${text}\n(salvat în ${file})\n`);
    },
  };
}
