// Cereri de date (export / ștergere cont) și cronologia lor. Folosit de aplicație (cereri făcute de client)
// și de panoul de administrare (cereri primite pe alte canale, procesate manual).

const now = () => new Date().toISOString();

export const REQUEST_STATUSES = ['pending', 'processing', 'completed', 'failed'];

export function addRequestEvent(db, requestId, status, message, actorEmail = null) {
  db.prepare('INSERT INTO data_request_events (request_id, status, message, actor_email, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(requestId, status, message, actorEmail, now());
}

/** Creează o cerere și primul eveniment din cronologie. Întoarce id-ul. */
export function createRequest(db, { user, type, source, status = 'pending', note = null, message, actorEmail = null }) {
  const t = now();
  const { lastInsertRowid } = db.prepare(`INSERT INTO data_requests (user_id, user_email, user_name, type, status, source, note, created_at, updated_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(user.id, user.email, user.name ?? null, type, status, source, note, t, t, status === 'completed' ? t : null);
  const id = Number(lastInsertRowid);
  addRequestEvent(db, id, status, message, actorEmail);
  return id;
}

export function setRequestStatus(db, id, status, message, actorEmail = null) {
  const t = now();
  db.prepare('UPDATE data_requests SET status = ?, updated_at = ?, completed_at = CASE WHEN ? = \'completed\' THEN ? ELSE completed_at END WHERE id = ?')
    .run(status, t, status, t, id);
  addRequestEvent(db, id, status, message, actorEmail);
}

/** Cerere finalizată pe loc (de ex. exportul descărcat de client din aplicație). */
export function recordCompletedRequest(db, { user, type, source, requestedMessage, completedMessage, actorEmail = null }) {
  const id = createRequest(db, { user, type, source, status: 'pending', message: requestedMessage, actorEmail });
  setRequestStatus(db, id, 'completed', completedMessage, actorEmail);
  return id;
}
