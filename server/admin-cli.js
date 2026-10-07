// Gestionarea rolului de administrator, doar din linia de comandă de pe server:
//   npm run admin -- list
//   npm run admin -- grant nume@exemplu.ro
//   npm run admin -- revoke nume@exemplu.ro
// Contul trebuie să existe deja (creat din aplicație). Rolul NU se poate acorda din aplicație.
import { loadEnvFile, buildConfig } from './config.js';
import { openDb } from './db.js';

loadEnvFile();
const config = buildConfig();
const db = openDb(config.dbPath);
const [command, emailArg] = process.argv.slice(2);
const email = (emailArg || '').trim().toLowerCase();

function audit(action, user) {
  db.prepare('INSERT INTO admin_audit (admin_id, admin_email, action, target_user_id, target_email, details, created_at, ip) VALUES (NULL, ?, ?, ?, ?, NULL, ?, ?)')
    .run('linia de comandă', action, user.id, user.email, new Date().toISOString(), 'server');
}

if (command === 'list') {
  const admins = db.prepare("SELECT email, name, admin_role, admin_disabled_at FROM users WHERE role = 'admin' ORDER BY email").all();
  console.log(admins.length ? admins.map(a => `• ${a.email} (${a.name}) · ${a.admin_role || 'admin'}${a.admin_disabled_at ? ' · dezactivat' : ''}`).join('\n') : 'Nu există administratori.');
} else if ((command === 'grant' || command === 'revoke') && email) {
  const user = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(email);
  if (!user) {
    console.error(`Nu există un cont cu emailul ${email}. Creează întâi contul din aplicație.`);
    process.exitCode = 1;
  } else {
    // `grant` face contul administrator (rol complet, reactivat); `revoke` îl readuce la cont obișnuit.
    if (command === 'grant') db.prepare("UPDATE users SET role = 'admin', admin_role = 'admin', admin_disabled_at = NULL WHERE id = ?").run(user.id);
    else db.prepare("UPDATE users SET role = 'user', admin_role = NULL, admin_disabled_at = NULL WHERE id = ?").run(user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); // reconectare cu noul rol
    audit(command === 'grant' ? 'grant_admin' : 'revoke_admin', user);
    console.log(command === 'grant'
      ? `${email} este acum administrator. Conectează-te din nou și deschide /admin.html.`
      : `${email} nu mai este administrator.`);
  }
} else if (command === 'reset-2fa' && email) {
  // Pentru un administrator care și-a pierdut telefonul: la următoarea conectare configurează din nou codul.
  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
  if (!user) {
    console.error(`Nu există un cont cu emailul ${email}.`);
    process.exitCode = 1;
  } else {
    db.prepare('UPDATE users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_counter = NULL WHERE id = ?').run(user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM admin_mfa_challenges WHERE user_id = ?').run(user.id);
    audit('reset_2fa', user);
    console.log(`Autentificarea în doi pași pentru ${email} a fost resetată. La următoarea conectare în panou se configurează din nou.`);
  }
} else {
  console.log('Folosire:\n  npm run admin -- list\n  npm run admin -- grant nume@exemplu.ro\n  npm run admin -- revoke nume@exemplu.ro\n  npm run admin -- reset-2fa nume@exemplu.ro');
}
db.close();
