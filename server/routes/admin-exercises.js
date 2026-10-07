// Exerciții (ecranul 6): listă cu filtre și editor. Doar exercițiile publicate ajung în catalogul folosit de planuri.
// Videoclipurile: fișier propriu din biblioteca media sau link către o sursă licențiată — în ambele cazuri cu
// „sursă / licență” obligatorie.
import { badRequest, notFound } from '../http.js';
import { adminHelpers, diffValues } from '../admin-common.js';
import { MUSCLES, PLACES, EQUIPMENT, LEVELS } from '../plan/exercises.js';
import { exerciseFromRow, mediaLookup, reloadExercises, uniqueId } from '../catalog.js';
import { mediaByFilename } from '../media.js';

const ROLES = ['admin', 'editor'];
const now = () => new Date().toISOString();
const OPTIONS = { muscles: MUSCLES, places: PLACES, equipment: EQUIPMENT, levels: LEVELS };

const intOrNull = v => (v === '' || v === null || v === undefined ? null : Number(v));
const strList = v => (Array.isArray(v) ? v.map(x => String(x ?? '').trim()).filter(Boolean) : []);
const codes = (v, allowed) => [...new Set(Array.isArray(v) ? v.map(String) : [])].filter(x => x in allowed);

export function registerExerciseRoutes(router, app) {
  const { db } = app;
  const { on, audit } = adminHelpers(app);

  const out = r => exerciseFromRow(r, mediaLookup(db));
  const load = ctx => {
    const r = db.prepare('SELECT * FROM exercises WHERE id = ?').get(String(ctx.params.id));
    if (!r) throw notFound('Exercițiul nu există.');
    return r;
  };

  /** Validează conținutul. La publicare, toate câmpurile care apar în aplicație sunt obligatorii. */
  function validateExercise(body, publish) {
    const fields = {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 3 || name.length > 80) fields.name = 'Numele trebuie să aibă 3–80 de caractere.';

    const steps = strList(body.steps);
    if (steps.length > 15) fields.steps = 'Cel mult 15 pași.';
    else if (steps.some(s => s.length < 3 || s.length > 300)) fields.steps = 'Fiecare pas trebuie să aibă 3–300 de caractere.';
    else if (publish && !steps.length) fields.steps = 'Adaugă cel puțin un pas.';

    const mistakes = strList(body.mistakes);
    if (mistakes.length > 10) fields.mistakes = 'Cel mult 10 greșeli frecvente.';
    else if (mistakes.some(s => s.length < 3 || s.length > 200)) fields.mistakes = 'Fiecare greșeală trebuie să aibă 3–200 de caractere.';

    const muscles = codes(body.muscles, MUSCLES);
    if (publish && !muscles.length) fields.muscles = 'Alege cel puțin o grupă musculară.';
    const places = codes(body.places, PLACES);
    if (publish && !places.length) fields.places = 'Alege unde se poate face exercițiul.';
    let equipment = codes(body.equipment, EQUIPMENT);
    if (equipment.length > 1) equipment = equipment.filter(e => e !== 'none');
    if (!equipment.length) equipment = ['none'];

    const level = body.level ? String(body.level) : null;
    if (level && !(level in LEVELS)) fields.level = 'Alege nivelul.';
    else if (publish && !level) fields.level = 'Alege nivelul.';

    const mode = body.mode === 'time' ? 'time' : body.mode === 'reps' ? 'reps' : null;
    if (!mode) fields.mode = 'Alege dacă exercițiul se măsoară în repetări sau în secunde.';
    const sets = intOrNull(body.sets), reps = intOrNull(body.reps), seconds = intOrNull(body.seconds), rest = intOrNull(body.restSec);
    const range = (v, min, max, key, msg) => {
      if (v !== null && (!Number.isInteger(v) || v < min || v > max)) fields[key] = msg;
      else if (publish && v === null) fields[key] = msg;
    };
    range(sets, 1, 6, 'sets', 'Seriile recomandate: între 1 și 6.');
    if (mode === 'reps') range(reps, 1, 30, 'reps', 'Repetările recomandate: între 1 și 30.');
    if (mode === 'time') range(seconds, 10, 300, 'seconds', 'Durata recomandată: între 10 și 300 de secunde.');
    range(rest, 0, 300, 'restSec', 'Pauza recomandată: între 0 și 300 de secunde.');

    const image = body.image ? String(body.image) : null;
    if (image && mediaByFilename(db, image)?.kind !== 'image') fields.image = 'Imaginea nu există în biblioteca media.';
    const video = body.video ? String(body.video) : null;
    if (video && mediaByFilename(db, video)?.kind !== 'video') fields.video = 'Videoclipul nu există în biblioteca media.';
    const videoUrl = typeof body.videoUrl === 'string' && body.videoUrl.trim() ? body.videoUrl.trim() : null;
    if (videoUrl) {
      let ok = false;
      try { ok = new URL(videoUrl).protocol === 'https:'; } catch { /* adresă invalidă */ }
      if (!ok || videoUrl.length > 300) fields.videoUrl = 'Linkul trebuie să fie o adresă https:// validă (cel mult 300 de caractere).';
      if (video) fields.videoUrl = 'Alege fie un videoclip încărcat, fie un link — nu amândouă.';
    }
    const videoSource = typeof body.videoSource === 'string' ? body.videoSource.trim() : '';
    if ((video || videoUrl) && (videoSource.length < 3 || videoSource.length > 300)) fields.videoSource = 'Completează sursa / licența videoclipului (3–300 de caractere).';

    if (Object.keys(fields).length) throw badRequest(publish ? 'Exercițiul nu poate fi publicat încă.' : 'Verifică datele exercițiului.', fields);
    return {
      name, steps, mistakes, muscles, places, equipment, level, mode, sets,
      reps: mode === 'reps' ? reps : null, seconds: mode === 'time' ? seconds : null, rest,
      image, video, videoUrl, videoSource: video || videoUrl ? videoSource : null,
    };
  }

  function save(id, d, status, userId) {
    const t = now();
    const cols = [d.name, status, JSON.stringify(d.muscles), JSON.stringify(d.places), JSON.stringify(d.equipment), d.level, d.mode,
      d.sets, d.reps, d.seconds, d.rest, JSON.stringify(d.steps), JSON.stringify(d.mistakes), d.image, d.video, d.videoUrl, d.videoSource];
    if (id) {
      const prev = db.prepare('SELECT status, published_at FROM exercises WHERE id = ?').get(id);
      db.prepare(`UPDATE exercises SET name = ?, status = ?, muscles_json = ?, places_json = ?, equipment_json = ?, level = ?, mode = ?,
        sets = ?, reps = ?, seconds = ?, rest_sec = ?, steps_json = ?, mistakes_json = ?, image = ?, video = ?, video_url = ?, video_source = ?,
        updated_by = ?, updated_at = ?, published_at = ? WHERE id = ?`)
        .run(...cols, userId, t, status === 'published' ? (prev.status === 'published' ? prev.published_at : t) : null, id);
    } else {
      id = uniqueId(db, 'exercises', d.name);
      db.prepare(`INSERT INTO exercises (id, name, status, muscles_json, places_json, equipment_json, level, mode, sets, reps, seconds, rest_sec,
        steps_json, mistakes_json, image, video, video_url, video_source, created_by, updated_by, created_at, updated_at, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, ...cols, userId, userId, t, t, status === 'published' ? t : null);
    }
    // Videoclipul încărcat preia sursa / licența, dacă nu o avea deja în bibliotecă.
    if (d.video) db.prepare("UPDATE media SET source = ? WHERE filename = ? AND (source IS NULL OR source = '')").run(d.videoSource, d.video);
    reloadExercises(db);
    return id;
  }

  on('GET', '/api/admin/exercises-options', () => OPTIONS, { roles: ROLES });

  on('GET', '/api/admin/exercises', ctx => {
    const sp = ctx.url.searchParams;
    const q = (sp.get('q') || '').trim().toLowerCase();
    const page = Math.max(1, Number.parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = 25;
    let list = db.prepare('SELECT * FROM exercises ORDER BY name').all().map(out);
    // Publicate, dar fără nivel sau fără recomandări (de ex. exercițiile din catalogul inițial).
    const incomplete = list.filter(e => e.status === 'published' && (!e.level || !e.sets || e.restSec === null)).length;
    const muscle = sp.get('muscle'), place = sp.get('place'), equipment = sp.get('equipment'), level = sp.get('level'), video = sp.get('video'), status = sp.get('status');
    if (q) list = list.filter(e => e.name.toLowerCase().includes(q) || e.id.includes(q));
    if (muscle in MUSCLES) list = list.filter(e => e.muscles.includes(muscle));
    if (place in PLACES) list = list.filter(e => e.places.includes(place));
    if (equipment in EQUIPMENT) list = list.filter(e => e.equipment.includes(equipment));
    if (level in LEVELS) list = list.filter(e => e.level === level);
    if (level === 'none') list = list.filter(e => !e.level);
    if (video === 'with') list = list.filter(e => e.video || e.videoUrl);
    if (video === 'without') list = list.filter(e => !e.video && !e.videoUrl);
    if (status === 'draft' || status === 'published') list = list.filter(e => e.status === status);
    if (sp.get('incomplete') === '1') list = list.filter(e => e.status === 'published' && (!e.level || !e.sets || e.restSec === null));
    return { total: list.length, page, pageSize, incomplete, options: OPTIONS, items: list.slice((page - 1) * pageSize, page * pageSize) };
  }, { roles: ROLES });

  on('GET', '/api/admin/exercises/:id', ctx => out(load(ctx)), { roles: ROLES });

  on('POST', '/api/admin/exercises', ctx => {
    const publish = ctx.body.status === 'published';
    const d = validateExercise(ctx.body, publish);
    const id = save(null, d, publish ? 'published' : 'draft', ctx.user.id);
    audit(ctx, publish ? 'publish_exercise' : 'create_exercise', null, { exercise: id });
    ctx.status = 201;
    return out(db.prepare('SELECT * FROM exercises WHERE id = ?').get(id));
  }, { roles: ROLES });

  const AUDITED = ['name', 'status', 'muscles', 'places', 'equipment', 'level', 'mode', 'sets', 'reps', 'seconds', 'restSec', 'steps', 'mistakes', 'image', 'video', 'videoUrl', 'videoSource'];

  on('PUT', '/api/admin/exercises/:id', ctx => {
    const r = load(ctx);
    const before = out(r);
    const publish = ctx.body.status === 'published';
    save(r.id, validateExercise(ctx.body, publish), publish ? 'published' : 'draft', ctx.user.id);
    const action = publish && r.status !== 'published' ? 'publish_exercise' : !publish && r.status === 'published' ? 'unpublish_exercise' : 'update_exercise';
    const after = out(db.prepare('SELECT * FROM exercises WHERE id = ?').get(r.id));
    audit(ctx, action, null, { exercise: r.id, name: after.name, changes: diffValues(before, after, AUDITED) });
    return after;
  }, { roles: ROLES });

  on('DELETE', '/api/admin/exercises/:id', ctx => {
    const r = load(ctx);
    db.prepare('DELETE FROM exercises WHERE id = ?').run(r.id);
    reloadExercises(db);
    audit(ctx, 'delete_exercise', null, { exercise: r.id, name: r.name });
    return { ok: true };
  }, { roles: ROLES });
}
