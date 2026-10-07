'use strict';
// Ecranul 6 (Exerciții: listă + editor cu previzualizare), ecranul 7 (Catalog nutrițional, cu import) și
// ecranul 8 (Media), plus alegerea unui fișier din biblioteca media (folosită și de editorul de rețete).
// Folosește utilitarele din admin.js și admin-content.js (api, modal, toast, render, go, opt, EDITORS…).

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024, MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const fileSize = n => (n >= 1048576 ? `${format(n / 1048576, 1)} MB` : `${format(Math.max(1, Math.round(n / 1024)))} KB`);
const labelsOf = (list, map) => list.map(c => esc(map[c] || c)).join(', ');
const shortAllergen = label => label.split(' (')[0];

// ==================== Încărcare în biblioteca media (cu progres) ====================

/** Motivul pentru care fișierul nu poate fi încărcat, sau null. `accept`: 'image', 'video' sau 'any'. */
function fileProblem(file, accept = 'any') {
  const img = IMAGE_TYPES.includes(file.type), vid = VIDEO_TYPES.includes(file.type);
  if (accept === 'image' && !img) return 'Alege o imagine JPEG, PNG sau WebP.';
  if (accept === 'video' && !vid) return 'Alege un videoclip MP4 sau WebM.';
  if (!img && !vid) return 'Format nesuportat (doar JPEG, PNG, WebP, MP4, WebM).';
  if (img && file.size > MAX_IMAGE_BYTES) return 'Imaginea depășește 5 MB.';
  if (vid && file.size > MAX_VIDEO_BYTES) return 'Videoclipul depășește 50 MB.';
  return null;
}

function uploadMediaFile(file, { accept = 'any', source = '', onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/admin/media?${new URLSearchParams({ name: file.name, accept, source })}`);
    xhr.setRequestHeader('X-Metamorf', '1');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* răspuns gol */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(Object.assign(new Error(data?.error?.message || (xhr.status === 413 ? 'Fișierul este prea mare.' : 'Încărcarea nu a reușit.')), { status: xhr.status, fields: data?.error?.fields || {} }));
    };
    xhr.onerror = () => reject(new Error('Nu se poate contacta serverul.'));
    xhr.send(file);
  });
}

const progressBar = (id, label) => `<div class="adm-progress" id="${id}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>`;
function setProgress(id, fraction) {
  const el = document.getElementById(id);
  if (!el) return;
  const pctValue = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  el.setAttribute('aria-valuenow', String(pctValue));
  el.firstElementChild.style.width = `${pctValue}%`;
}

function mediaThumb(m) {
  return m.kind === 'video'
    ? `<span class="adm-thumb-media"><video src="${esc(m.url)}#t=0.1" preload="metadata" muted playsinline></video><span class="adm-play" aria-hidden="true">${icon('play')}</span></span>`
    : `<span class="adm-thumb-media"><img src="${esc(m.url)}" alt="" loading="lazy"></span>`;
}

// ---------- Alegerea unui fișier din bibliotecă ----------

let pickResolve = null, pickItems = [];

/** Deschide biblioteca media și întoarce fișierul ales (sau null dacă dialogul a fost închis). */
async function pickMedia(kind) {
  const r = await api('GET', `/api/admin/media?kind=${kind}`);
  pickItems = r.items;
  return new Promise(resolve => {
    pickResolve = resolve;
    modal(`
      <h2>Alege ${kind === 'image' ? 'o imagine' : 'un videoclip'} din biblioteca media</h2>
      ${r.items.length ? `<div class="adm-media-grid small">${r.items.map(m => `
        <button type="button" class="adm-media-card" data-action="mediaPick" data-id="${m.id}">${mediaThumb(m)}<span class="adm-media-name">${esc(m.originalName || m.filename)}</span></button>`).join('')}</div>`
      : `<p>Biblioteca nu conține încă ${kind === 'image' ? 'imagini' : 'videoclipuri'}. Încarcă-le din secțiunea Media sau direct din editor.</p>`}
      ${r.total > r.items.length ? `<p class="small-note">Sunt afișate cele mai recente ${r.items.length} din ${r.total}.</p>` : ''}`);
  });
}

document.getElementById('dialog').addEventListener('close', () => {
  if (pickResolve) { const f = pickResolve; pickResolve = null; f(null); }
});

// ==================== Ecranul 6 — Exerciții ====================

const EXERCISES_DEFAULT = { q: '', muscle: 'all', place: 'all', equipment: 'all', level: 'all', video: 'all', status: 'all', incomplete: '', page: 1 };
state.exercises = { ...EXERCISES_DEFAULT };
state.ex = null; // exercițiul deschis în editor
EDITORS.exercitii = 'ex';

async function exOptions() {
  return (state.cache.exOptions ||= await api('GET', '/api/admin/exercises-options'));
}

const exStatusTag = s => (s === 'published' ? '<span class="tag green">Publicat</span>' : '<span class="tag">Ciornă</span>');

async function renderExercises() {
  const f = state.exercises;
  const r = await api('GET', `/api/admin/exercises?${new URLSearchParams(f)}`);
  const o = r.options;
  state.cache.exOptions = o;
  const filtered = f.q || f.incomplete || ['muscle', 'place', 'equipment', 'level', 'video', 'status'].some(k => f[k] !== 'all');
  const sel = (name, label, map, extra = '') => `<label class="field">${label}<select name="${name}">${opt('all', f[name], 'Toate')}${extra}${Object.entries(map).map(([k, v]) => opt(k, f[name], v)).join('')}</select></label>`;
  return `
  ${pageHead('Exerciții', `${format(r.total)} ${r.total === 1 ? 'exercițiu' : 'exerciții'}${filtered ? ' găsite cu filtrele alese' : ''}. Planurile AI folosesc doar exercițiile publicate.`,
    `<a class="btn dark" href="#exercitii/nou">${icon('plus')}Exercițiu nou</a>`)}
  ${r.incomplete && !f.incomplete ? `<div class="notice-card">${icon('info')}<div><strong>${r.incomplete} ${r.incomplete === 1 ? 'exercițiu publicat nu are' : 'exerciții publicate nu au'} nivel sau recomandări.</strong><p>Provin din catalogul inițial. Completează nivelul, seriile, repetările și pauza recomandate, apoi greșelile frecvente.</p></div><button class="btn outline small" data-action="exIncomplete">Arată-le</button></div>` : ''}
  <form class="adm-filters adm-user-filters" id="exercises-filter" role="search" novalidate>
    <label class="field adm-f-search">Caută<input name="q" type="search" value="${esc(f.q)}" placeholder="Numele exercițiului" maxlength="100"></label>
    ${sel('muscle', 'Grupă musculară', o.muscles)}
    ${sel('place', 'Locație', o.places)}
    ${sel('equipment', 'Echipament', o.equipment)}
    ${sel('level', 'Nivel', o.levels, opt('none', f.level, 'Nesetat'))}
    <label class="field">Video<select name="video">${opt('all', f.video, 'Toate')}${opt('with', f.video, 'Cu video')}${opt('without', f.video, 'Fără video')}</select></label>
    <label class="field">Stare<select name="status">${opt('all', f.status, 'Toate')}${opt('draft', f.status, 'Ciornă')}${opt('published', f.status, 'Publicat')}</select></label>
    <div class="adm-f-actions">
      <button class="btn dark" type="submit">${icon('scan')}Filtrează</button>
      ${filtered ? '<button class="btn outline" type="button" data-action="exercisesReset">Resetează</button>' : ''}
    </div>
  </form>
  ${f.incomplete ? `<p class="adm-filter-note">${icon('info')}Afișez doar exercițiile publicate fără nivel sau recomandări. <button class="text-btn" data-action="exercisesReset">Arată toate</button></p>` : ''}
  <section class="card adm-table-card">
    ${r.items.length ? `<div class="table-wrap"><table class="adm-table stack">
      <thead><tr><th scope="col"><span class="sr-only">Imagine</span></th><th scope="col">Nume</th><th scope="col">Grupă musculară</th><th scope="col">Locație</th><th scope="col">Echipament</th><th scope="col">Nivel</th><th scope="col">Video</th><th scope="col">Stare</th><th scope="col"><span class="sr-only">Editează</span></th></tr></thead>
      <tbody>${r.items.map(e => `
        <tr>
          <td class="adm-thumb-cell">${e.imageUrl ? `<img class="adm-thumb" src="${esc(e.imageUrl)}" alt="" width="64" height="48" loading="lazy">` : `<span class="adm-thumb empty" aria-hidden="true">${icon('dumbbell')}</span>`}</td>
          <td data-label="Nume"><a class="adm-link" href="#exercitii/${esc(e.id)}">${esc(e.name)}</a></td>
          <td data-label="Grupă musculară">${labelsOf(e.muscles, o.muscles) || '—'}</td>
          <td data-label="Locație">${labelsOf(e.places, o.places) || '—'}</td>
          <td data-label="Echipament">${labelsOf(e.equipment, o.equipment)}</td>
          <td data-label="Nivel">${e.level ? esc(o.levels[e.level]) : '<span class="muted">Nesetat</span>'}</td>
          <td data-label="Video">${e.video || e.videoUrl ? `<span class="tag green">${e.video ? 'Da · fișier' : 'Da · link'}</span>` : '<span class="tag">Nu</span>'}</td>
          <td data-label="Stare">${exStatusTag(e.status)}</td>
          <td class="adm-row-action"><a class="btn outline small" href="#exercitii/${esc(e.id)}">${icon('edit')}Editează</a></td>
        </tr>`).join('')}
      </tbody></table></div>`
    : `<div class="empty-log">${icon('dumbbell')}<p>${filtered ? 'Niciun exercițiu nu corespunde filtrelor alese.' : 'Nu există încă exerciții.'}</p>${filtered ? '<button class="btn outline small" data-action="exercisesReset">Resetează filtrele</button>' : '<a class="btn dark small" href="#exercitii/nou">Creează primul exercițiu</a>'}</div>`}
    ${pager(r.page, r.pageSize, r.total, 'exercisesPage')}
  </section>`;
}

// ---------- Editor ----------

const exFrom = (e, key) => ({
  key, id: e?.id ?? null, name: e?.name ?? '', status: e?.status ?? 'draft',
  muscles: [...(e?.muscles || [])], places: [...(e?.places || [])], equipment: [...(e?.equipment || ['none'])],
  level: e?.level ?? '', mode: e?.mode ?? 'reps',
  sets: e?.sets ?? '', reps: e?.reps ?? '', seconds: e?.seconds ?? '', restSec: e?.restSec ?? '',
  steps: e?.steps?.length ? [...e.steps] : [''], mistakes: e?.mistakes?.length ? [...e.mistakes] : [''],
  image: e?.image ?? null, imageUrl: e?.imageUrl ?? null,
  video: e?.video ?? null, videoFileUrl: e?.videoFileUrl ?? null, videoUrl: e?.videoUrl ?? '', videoSource: e?.videoSource ?? '',
  videoKind: e?.video ? 'file' : e?.videoUrl ? 'link' : 'none',
  updatedAt: e?.updatedAt ?? null, publishedAt: e?.publishedAt ?? null, dirty: false,
});

const LISTS = {
  steps: { label: 'Pasul', max: 15, maxLen: 300, placeholder: n => `Descrie pasul ${n}` },
  mistakes: { label: 'Greșeala', max: 10, maxLen: 200, placeholder: () => 'De exemplu: genunchii cad spre interior' },
};

function listRowsHtml(kind) {
  const items = state.ex[kind], last = items.length - 1, c = LISTS[kind];
  return items.map((s, n) => `
    <li class="adm-step" data-index="${n}">
      <span class="adm-drag" title="Trage pentru a reordona" aria-hidden="true">${icon('grip')}</span>
      <span class="adm-step-num ${kind === 'mistakes' ? 'warn' : ''}" aria-hidden="true">${kind === 'mistakes' ? '!' : n + 1}</span>
      <label class="field"><span class="sr-only">${c.label} ${n + 1}</span><textarea data-li="${kind}" data-index="${n}" rows="2" maxlength="${c.maxLen}" placeholder="${esc(c.placeholder(n + 1))}">${esc(s)}</textarea></label>
      <div class="adm-step-tools">
        <button type="button" class="icon-button" data-action="liMove" data-list="${kind}" data-index="${n}" data-dir="-1" aria-label="Mută ${c.label.toLowerCase()} ${n + 1} mai sus" ${n === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button type="button" class="icon-button" data-action="liMove" data-list="${kind}" data-index="${n}" data-dir="1" aria-label="Mută ${c.label.toLowerCase()} ${n + 1} mai jos" ${n === last ? 'disabled' : ''}>${icon('down')}</button>
        <button type="button" class="icon-button" data-action="liRemove" data-list="${kind}" data-index="${n}" aria-label="Șterge ${c.label.toLowerCase()} ${n + 1}">${icon('trash')}</button>
      </div>
    </li>`).join('');
}

function checksHtml(name, map, selected) {
  return Object.entries(map).map(([k, v]) => `<label class="adm-check"><input type="checkbox" name="${name}" value="${k}" ${selected.includes(k) ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('');
}

function exImageHtml() {
  const x = state.ex;
  return `
    ${x.imageUrl ? `<img class="adm-photo-img" src="${esc(x.imageUrl)}" alt="Imaginea exercițiului">` : `<div class="adm-photo-img empty">${icon('camera')}<span>Fără imagine</span></div>`}
    <div class="adm-photo-tools">
      <label class="btn outline small adm-file">${icon('upload')}Încarcă o imagine<input type="file" id="ex-image-file" accept="${IMAGE_TYPES.join(',')}"></label>
      <button type="button" class="btn outline small" data-action="exImagePick">${icon('camera')}Din biblioteca media</button>
      ${x.image ? `<button type="button" class="btn outline small" data-action="exImageRemove">${icon('trash')}Elimină</button>` : ''}
    </div>
    ${progressBar('ex-image-progress', 'Încărcarea imaginii')}
    <small class="muted">JPEG, PNG sau WebP, cel mult 5 MB. Imaginea se salvează în biblioteca media și apare în exercițiu după salvare.</small>
    <p class="adm-err" data-err="image" role="alert" hidden></p>`;
}

function exVideoHtml() {
  const x = state.ex;
  const kinds = { none: 'Fără video', file: 'Videoclip propriu', link: 'Link din sursă licențiată' };
  let body = '';
  if (x.videoKind === 'file') {
    body = `
      ${x.videoFileUrl ? `<video class="adm-video-prev" src="${esc(x.videoFileUrl)}" controls preload="metadata" playsinline></video>` : '<p class="muted">Niciun videoclip ales.</p>'}
      <div class="adm-photo-tools">
        <label class="btn outline small adm-file">${icon('upload')}${x.video ? 'Încarcă altul' : 'Încarcă un videoclip'}<input type="file" id="ex-video-file" accept="${VIDEO_TYPES.join(',')}"></label>
        <button type="button" class="btn outline small" data-action="exVideoPick">${icon('play')}Din biblioteca media</button>
      </div>
      ${progressBar('ex-video-progress', 'Încărcarea videoclipului')}
      <small class="muted">MP4 sau WebM, cel mult 50 MB. Completează sursa / licența înainte de încărcare.</small>`;
  } else if (x.videoKind === 'link') {
    body = `<label class="field">Link către videoclip<input name="videoUrl" type="url" maxlength="300" value="${esc(x.videoUrl)}" placeholder="https://…" inputmode="url" spellcheck="false"><small>Doar surse care permit explicit folosirea (licență deschisă sau acord scris). În aplicație apare ca link „Vezi demonstrația video”.</small></label>`;
  }
  return `
    <fieldset class="adm-checks radio" aria-label="Tipul videoclipului">${Object.entries(kinds).map(([k, v]) => `<label class="adm-check"><input type="radio" name="videoKind" value="${k}" ${x.videoKind === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</fieldset>
    ${x.videoKind !== 'none' ? `
      <label class="field">Sursă / licență (obligatoriu)<input name="videoSource" maxlength="300" value="${esc(x.videoSource)}" placeholder="De exemplu: Filmare proprie Metamorf · sau · CC BY 4.0, autor, adresa sursei"></label>
      ${body}` : ''}
    <p class="adm-err" data-err="video" role="alert" hidden></p>`;
}

/** Obiectul pentru previzualizare, în forma primită de aplicație din plan. */
function exPreviewModel() {
  const x = state.ex;
  const n = v => (v === '' || v === null ? null : Number(v));
  const video = x.videoKind === 'file' && x.videoFileUrl ? { url: x.videoFileUrl, file: true, source: x.videoSource }
    : x.videoKind === 'link' && /^https:\/\//.test(x.videoUrl) ? { url: x.videoUrl, file: false, source: x.videoSource } : null;
  return {
    name: x.name, mode: x.mode, sets: n(x.sets), reps: n(x.reps), seconds: n(x.seconds), restSec: n(x.restSec),
    steps: x.steps.map(s => s.trim()).filter(Boolean), mistakes: x.mistakes.map(s => s.trim()).filter(Boolean),
    imageUrl: x.imageUrl, video,
  };
}

function exPreviewRefresh() {
  const el = document.getElementById('ex-preview');
  if (!el) return;
  const old = el.querySelector('video');
  el.innerHTML = exerciseDetailHtml(exPreviewModel());
  hydrateIcons(el);
  // Același videoclip: păstrăm elementul existent, ca redarea să nu se reia la fiecare tastă.
  const fresh = el.querySelector('video');
  if (old && fresh && old.getAttribute('src') === fresh.getAttribute('src')) fresh.replaceWith(old);
}

function exActionsHtml() {
  const x = state.ex, pub = x.status === 'published';
  return `
    <div class="card-heading"><h3>Publicare</h3>${exStatusTag(x.status)}</div>
    <p class="adm-dirty ${x.dirty ? 'on' : ''}" role="status">${x.dirty ? 'Modificări nesalvate' : x.id ? `Salvat ${dt(x.updatedAt)}` : 'Exercițiu nou, nesalvat'}</p>
    <div class="form-alert error" id="ex-alert" role="alert" tabindex="-1" hidden></div>
    <div class="adm-ed-buttons">
      ${pub
        ? `<button class="btn dark full" data-action="exSave" data-status="published">${icon('check')}Salvează modificările</button>
           <button class="btn outline full" data-action="exUnpublishAsk">Retrage publicarea</button>`
        : `<button class="btn outline full" data-action="exSave" data-status="draft">Salvează ciornă</button>
           <button class="btn dark full" data-action="exSave" data-status="published">${icon('check')}Publică</button>`}
      ${x.id ? `<button class="btn danger full" data-action="exDeleteAsk">${icon('trash')}Șterge exercițiul</button>` : ''}
    </div>
    <p class="small-note">Doar exercițiile publicate pot fi alese de AI în planuri. Pentru publicare: grupe musculare, locație, nivel, recomandări și cel puțin un pas.</p>`;
}

const exBack = () => `<a class="adm-back" href="#exercitii"><span aria-hidden="true">←</span><span>Înapoi la exerciții</span></a>`;

async function renderExerciseEditor() {
  const o = await exOptions();
  if (!state.ex || state.ex.key !== state.id) {
    if (state.id === 'nou') state.ex = exFrom(null, 'nou');
    else {
      try {
        state.ex = exFrom(await api('GET', `/api/admin/exercises/${encodeURIComponent(state.id)}`), state.id);
      } catch (err) {
        if (err.status === 404) return `${exBack()}<div class="page-state"><div class="success-icon">${icon('dumbbell')}</div><h1 tabindex="-1">Exercițiul nu există</h1><p>A fost șters sau linkul nu este corect.</p><a class="btn dark" href="#exercitii">Înapoi la exerciții</a></div>`;
        throw err;
      }
    }
  }
  const x = state.ex;
  return `
  ${exBack()}
  <div class="page-heading">
    <div><span class="eyebrow">${x.id ? `EDITOR · ${esc(x.id.toUpperCase())}` : 'EXERCIȚIU NOU'}</span><h1 tabindex="-1" id="ex-title">${esc(x.name || 'Exercițiu nou')}</h1>
    <p>${exStatusTag(x.status)}${x.publishedAt ? ` · publicat ${d(x.publishedAt)}` : ''}</p></div>
  </div>
  <div class="adm-editor">
    <form id="exercise-form" class="adm-editor-main" novalidate>
      <section class="card">
        <div class="card-heading"><h3>Informații generale</h3></div>
        <label class="field">Nume<input name="name" required minlength="3" maxlength="80" value="${esc(x.name)}" placeholder="De exemplu: Genuflexiuni cu gantera"></label>
        <div class="adm-ed-row two">
          <label class="field">Nivel<select name="level">${opt('', x.level, 'Alege…')}${Object.entries(o.levels).map(([k, v]) => opt(k, x.level, v)).join('')}</select></label>
          <label class="field">Se măsoară în<select name="mode">${opt('reps', x.mode, 'Repetări')}${opt('time', x.mode, 'Secunde (durată)')}</select></label>
        </div>
        <fieldset class="adm-checks"><legend>Grupe musculare <small>(prima aleasă este grupa principală)</small></legend>${checksHtml('muscles', o.muscles, x.muscles)}</fieldset>
        <p class="adm-err" data-err="muscles" role="alert" hidden></p>
        <fieldset class="adm-checks"><legend>Locație</legend>${checksHtml('places', o.places, x.places)}</fieldset>
        <p class="adm-err" data-err="places" role="alert" hidden></p>
        <fieldset class="adm-checks"><legend>Echipament necesar <small>(selectare multiplă)</small></legend>${checksHtml('equipment', o.equipment, x.equipment)}</fieldset>
      </section>
      <section class="card">
        <div class="card-heading"><h3>Recomandări</h3></div>
        <div class="adm-ed-row">
          <label class="field">Serii<input name="sets" type="number" min="1" max="6" step="1" inputmode="numeric" value="${esc(x.sets)}"></label>
          <label class="field" ${x.mode === 'reps' ? '' : 'hidden'} data-mode="reps">Repetări<input name="reps" type="number" min="1" max="30" step="1" inputmode="numeric" value="${esc(x.reps)}"></label>
          <label class="field" ${x.mode === 'time' ? '' : 'hidden'} data-mode="time">Durată (secunde)<input name="seconds" type="number" min="10" max="300" step="1" inputmode="numeric" value="${esc(x.seconds)}"></label>
          <label class="field">Pauză (secunde)<input name="restSec" type="number" min="0" max="300" step="5" inputmode="numeric" value="${esc(x.restSec)}"></label>
        </div>
        <small class="muted">Orientative. Planul AI ajustează volumul după nivelul utilizatorului, în limitele aplicației.</small>
      </section>
      <section class="card">
        <div class="card-heading"><h3>Instrucțiuni pas cu pas</h3><small class="muted adm-drag-hint">Trage de <span aria-hidden="true">⠿</span> sau folosește săgețile</small></div>
        <ol class="adm-steps" id="ex-steps" data-sortable="steps">${listRowsHtml('steps')}</ol>
        <p class="adm-err" data-err="steps" role="alert" hidden></p>
        <button type="button" class="btn outline small" data-action="liAdd" data-list="steps">${icon('plus')}Adaugă un pas</button>
      </section>
      <section class="card">
        <div class="card-heading"><h3>Greșeli frecvente</h3></div>
        <ul class="adm-steps" id="ex-mistakes" data-sortable="mistakes">${listRowsHtml('mistakes')}</ul>
        <p class="adm-err" data-err="mistakes" role="alert" hidden></p>
        <button type="button" class="btn outline small" data-action="liAdd" data-list="mistakes">${icon('plus')}Adaugă o greșeală</button>
      </section>
      <section class="card">
        <div class="card-heading"><h3>Imagine</h3></div>
        <div class="adm-photo" id="ex-image">${exImageHtml()}</div>
      </section>
      <section class="card">
        <div class="card-heading"><h3>Video</h3></div>
        <div id="ex-video">${exVideoHtml()}</div>
      </section>
    </form>
    <aside class="adm-editor-side" aria-label="Publicare și previzualizare">
      <section class="card" id="ex-actions">${exActionsHtml()}</section>
      <section class="card adm-preview">
        <div class="card-heading"><h3>Previzualizare în aplicație</h3><span class="tag">live</span></div>
        <div class="adm-phone"><div class="adm-phone-screen" id="ex-preview">${exerciseDetailHtml(exPreviewModel())}</div></div>
        <p class="small-note">Așa apare exercițiul când clientul îl deschide din planul de antrenament. Seriile și pauzele din plan sunt stabilite pentru fiecare client.</p>
      </section>
    </aside>
  </div>`;
}

function exRefresh(part) {
  const set = (id, html) => { const el = document.getElementById(id); if (el) { el.innerHTML = html; hydrateIcons(el); } };
  if (part === 'steps' || part === 'mistakes') set(part === 'steps' ? 'ex-steps' : 'ex-mistakes', listRowsHtml(part));
  if (part === 'image') set('ex-image', exImageHtml());
  if (part === 'video') set('ex-video', exVideoHtml());
  if (part === 'actions') set('ex-actions', exActionsHtml());
  exPreviewRefresh();
}

function exDirty() {
  const was = state.ex.dirty;
  state.ex.dirty = true;
  if (!was) exRefresh('actions');
}

function exMove(kind, from, to) {
  const list = state.ex[kind];
  if (from === to || to < 0 || to >= list.length) return;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  exDirty();
  exRefresh(kind);
}

async function exUpload(file, kind) {
  const x = state.ex;
  const problem = fileProblem(file, kind);
  if (problem) { toast(problem, 'error'); return; }
  const form = document.getElementById('exercise-form');
  if (kind === 'video' && x.videoSource.trim().length < 3) {
    showFieldError(form, 'videoSource', 'Completează mai întâi sursa / licența videoclipului.');
    form.elements.videoSource?.focus();
    return;
  }
  const bar = `ex-${kind}-progress`;
  document.getElementById(bar)?.classList.add('on');
  try {
    const m = await uploadMediaFile(file, { accept: kind, source: kind === 'video' ? x.videoSource.trim() : '', onProgress: p => setProgress(bar, p) });
    if (kind === 'image') { x.image = m.filename; x.imageUrl = m.url; } else { x.video = m.filename; x.videoFileUrl = m.url; }
    exDirty();
    exRefresh(kind);
    toast(kind === 'image' ? 'Imaginea a fost încărcată în biblioteca media. Salvează exercițiul ca s-o folosească.' : 'Videoclipul a fost încărcat în biblioteca media. Salvează exercițiul ca să-l folosească.');
  } catch (err) {
    document.getElementById(bar)?.classList.remove('on');
    toast(err.message, 'error');
  }
}

function exShowErrors(err) {
  const form = document.getElementById('exercise-form');
  const alert = document.getElementById('ex-alert');
  let first = null;
  for (const [name, message] of Object.entries(err.fields || {})) {
    const slot = document.querySelector(`#exercise-form [data-err="${name}"]`)
      || (form.elements[name] ? null : document.querySelector(`#exercise-form [data-err="${name === 'videoUrl' || name === 'videoSource' ? 'video' : name}"]`));
    if (slot) {
      slot.textContent = message;
      slot.hidden = false;
      first ||= slot.closest('.card');
    } else {
      const el = showFieldError(form, name, message);
      first ||= el;
    }
  }
  if (alert) {
    alert.textContent = Object.keys(err.fields || {}).length ? `${err.message} Verifică câmpurile marcate.` : err.message;
    alert.hidden = false;
  }
  if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (first.matches?.('input, select, textarea')) first.focus({ preventScroll: true }); }
  else alert?.focus();
}

async function exSave(status) {
  const x = state.ex;
  const wasPublished = x.status === 'published';
  const form = document.getElementById('exercise-form');
  clearFormErrors(form);
  form.querySelectorAll('.adm-err').forEach(e => { e.hidden = true; e.textContent = ''; });
  document.getElementById('ex-alert').hidden = true;
  const body = {
    name: x.name.trim(), status, level: x.level, mode: x.mode,
    muscles: x.muscles, places: x.places, equipment: x.equipment,
    sets: x.sets, reps: x.reps, seconds: x.seconds, restSec: x.restSec,
    steps: x.steps.map(s => s.trim()).filter(Boolean), mistakes: x.mistakes.map(s => s.trim()).filter(Boolean),
    image: x.image,
    video: x.videoKind === 'file' ? x.video : null,
    videoUrl: x.videoKind === 'link' ? x.videoUrl.trim() : '',
    videoSource: x.videoKind === 'none' ? '' : x.videoSource.trim(),
  };
  let r;
  try {
    r = x.id ? await api('PUT', `/api/admin/exercises/${encodeURIComponent(x.id)}`, body) : await api('POST', '/api/admin/exercises', body);
  } catch (err) {
    if (err.status === 401 || err.status === 403) throw err;
    exShowErrors(err);
    return;
  }
  state.ex = exFrom(r, r.id);
  if (state.id !== r.id) { state.id = r.id; history.replaceState(null, '', `#exercitii/${r.id}`); }
  await render({ focus: false });
  toast(status === 'published' ? (wasPublished ? 'Modificările au fost publicate.' : 'Exercițiul a fost publicat și poate fi folosit în planuri.') : (wasPublished ? 'Publicarea a fost retrasă; exercițiul nu mai apare în planurile noi.' : 'Ciorna a fost salvată.'));
}

// ==================== Ecranul 7 — Catalog nutrițional ====================

const FOODS_DEFAULT = { q: '', source: 'all', page: 1 };
state.foods = { ...FOODS_DEFAULT };
const SOURCE_TAG = { usda: 'blue', ciqual: 'blue', off: 'blue', manual: 'warn' };

function foodsTableHtml(r) {
  const o = r.options;
  const f = state.foods;
  const filtered = f.q || f.source !== 'all';
  const g = n => format(n, 1);
  if (!r.items.length) {
    return `<div class="empty-log">${icon('leaf')}<p>${filtered ? 'Niciun aliment nu corespunde căutării.' : 'Catalogul este gol. Importă alimente dintr-o sursă verificată.'}</p>${filtered ? '<button class="btn outline small" data-action="foodsReset">Resetează</button>' : ''}</div>`;
  }
  return `<div class="table-wrap"><table class="adm-table stack adm-foods">
    <thead><tr><th scope="col">Aliment</th><th scope="col">Sursă</th><th scope="col" class="num">kcal</th><th scope="col" class="num">Proteine</th><th scope="col" class="num">Carbohidrați</th><th scope="col" class="num">Grăsimi</th><th scope="col">Alergeni</th><th scope="col" class="num">Rețete</th><th scope="col"><span class="sr-only">Acțiuni</span></th></tr></thead>
    <tbody>${r.items.map(x => `
      <tr>
        <td data-label="Aliment"><button class="adm-link text-btn" data-action="foodOpen" data-id="${esc(x.id)}">${esc(x.name)}</button><br><small class="muted">${esc(o.groups[x.group] || x.group)}</small></td>
        <td data-label="Sursă"><span class="tag ${SOURCE_TAG[x.source]}">${esc(o.sources[x.source])}</span>${x.sourceRef ? `<br><small class="muted">${esc(x.sourceRef)}</small>` : ''}</td>
        <td data-label="kcal / 100 g" class="num">${format(x.kcal)}</td>
        <td data-label="Proteine" class="num">${g(x.protein)} g</td>
        <td data-label="Carbohidrați" class="num">${g(x.carbs)} g</td>
        <td data-label="Grăsimi" class="num">${g(x.fat)} g</td>
        <td data-label="Alergeni">${x.allergens.length ? `<span class="adm-chips">${x.allergens.map(a => `<span class="tag warn">${esc(shortAllergen(o.allergens[a] || a))}</span>`).join('')}</span>` : '<span class="muted">—</span>'}</td>
        <td data-label="Rețete" class="num">${x.recipes ? `<button class="text-btn adm-link" data-action="foodOpen" data-id="${esc(x.id)}" aria-label="${x.recipes} rețete folosesc ${esc(x.name)}">${x.recipes}</button>` : '<span class="muted">0</span>'}</td>
        <td class="adm-row-action">${x.editable
          ? `<button class="btn outline small" data-action="foodEdit" data-id="${esc(x.id)}">${icon('edit')}Editează</button>`
          : `<span class="adm-ro" title="Valori verificate: doar pentru citire">${icon('lock')}<span>Doar citire</span></span>`}</td>
      </tr>`).join('')}
    </tbody></table></div>
    ${pager(r.page, r.pageSize, r.total, 'foodsPage')}`;
}

async function renderFoods() {
  const f = state.foods;
  const r = await api('GET', `/api/admin/foods?${new URLSearchParams(f)}`);
  state.cache.foodOptions = r.options;
  const chips = [['all', 'Toate', r.counts.all], ...Object.entries(r.options.sources).map(([k, v]) => [k, v, r.counts[k]])];
  return `
  ${pageHead('Catalog nutrițional', `${format(r.counts.all)} alimente; valorile sunt la 100 g. Rețetele și planurile AI își calculează caloriile din acest catalog.`,
    `<div class="adm-head-actions"><button class="btn outline" data-action="foodNew">${icon('plus')}Aliment manual</button><button class="btn dark" data-action="foodImport">${icon('upload')}Importă</button></div>`)}
  <div class="notice-card">${icon('lock')}<div><strong>Valorile din surse verificate sunt doar pentru citire.</strong><p>Alimentele din USDA, CIQUAL și Open Food Facts se actualizează doar prin import; se editează numai cele introduse manual. Catalogul inițial conține valori de referință USDA, de verificat înainte de lansare.</p></div></div>
  <div class="adm-filters">
    <div class="adm-segment" role="group" aria-label="Filtrează după sursă">${chips.map(([k, v, n]) => `<button data-action="foodsSource" data-source="${k}" aria-pressed="${f.source === k}">${esc(v)} <span class="muted">${format(n)}</span></button>`).join('')}</div>
    <label class="field adm-f-search"><span class="sr-only">Caută în catalog</span><input id="foods-q" type="search" value="${esc(f.q)}" placeholder="Caută după nume sau cod" maxlength="100" autocomplete="off"></label>
  </div>
  <section class="card adm-table-card" id="foods-results" aria-live="polite">${foodsTableHtml(r)}</section>`;
}

async function refreshFoods() {
  const box = document.getElementById('foods-results');
  if (!box) return;
  box.classList.add('loading');
  try {
    const r = await api('GET', `/api/admin/foods?${new URLSearchParams(state.foods)}`);
    box.innerHTML = foodsTableHtml(r);
    hydrateIcons(box);
  } catch (err) {
    box.innerHTML = `<div class="empty-log"><p>${esc(err.message)}</p><button class="btn outline small" data-action="reload">Reîncearcă</button></div>`;
  } finally {
    box.classList.remove('loading');
  }
}

async function foodDetails(id) {
  const { food: x, usedIn, options: o } = await api('GET', `/api/admin/foods/${encodeURIComponent(id)}`);
  const g = n => `${format(n, 1)} g`;
  modal(`
    <span class="tag ${SOURCE_TAG[x.source]}">${esc(o.sources[x.source])}${x.sourceRef ? ` · ${esc(x.sourceRef)}` : ''}</span>
    <h2>${esc(x.name)}</h2>
    <dl class="adm-dl">
      ${row('Grupă', esc(o.groups[x.group] || x.group))}
      ${row('Tip alimentație', esc(o.diets[x.diet]))}
      ${row('Energie', `${format(x.kcal)} kcal / 100 g`)}
      ${row('Proteine · carbohidrați · grăsimi', `${g(x.protein)} · ${g(x.carbs)} · ${g(x.fat)}`)}
      ${row('Alergeni', x.allergens.length ? x.allergens.map(a => esc(o.allergens[a])).join(', ') : 'Niciunul')}
      ${row('Identificator', `<code>${esc(x.id)}</code>`)}
      ${row('Actualizat', dt(x.updatedAt))}
    </dl>
    <h3 class="adm-subhead">Folosit în ${usedIn.length} ${usedIn.length === 1 ? 'rețetă' : 'rețete'}</h3>
    ${usedIn.length ? `<ul class="adm-usage">${usedIn.map(r => `<li><a class="adm-link" href="#retete/${r.id}">${esc(r.name)}</a></li>`).join('')}</ul>` : '<p>Nicio rețetă nu folosește acest aliment.</p>'}
    ${x.editable ? `<button class="btn dark full" data-action="foodEdit" data-id="${esc(x.id)}">${icon('edit')}Editează</button>`
      : '<p class="small-note">Valori verificate: se actualizează doar prin import din sursă.</p>'}`);
}

async function foodForm(id) {
  const o = state.cache.foodOptions || (await api('GET', '/api/admin/foods?page=1')).options;
  const x = id ? (await api('GET', `/api/admin/foods/${encodeURIComponent(id)}`)).food : null;
  const v = k => (x ? String(x[k]).replace('.', ',') : '');
  const numField = (name, label, max) => `<label class="field">${label}<input name="${name}" required inputmode="decimal" pattern="[0-9]+([.,][0-9]+)?" data-pattern-message="Introdu un număr, de exemplu 12,5." maxlength="6" value="${esc(v(name))}" data-max="${max}"></label>`;
  modal(`
    <span class="tag warn">INTRODUS MANUAL</span>
    <h2>${x ? 'Editează alimentul' : 'Aliment nou'}</h2>
    <p>Folosește introducerea manuală doar pentru produse fără corespondent în USDA, CIQUAL sau Open Food Facts, cu valorile de pe etichetă.</p>
    <form id="food-form" ${x ? `data-id="${esc(x.id)}"` : ''} novalidate>
      <label class="field">Nume<input name="name" required minlength="2" maxlength="80" value="${esc(x?.name || '')}"></label>
      <div class="adm-ed-row two">
        <label class="field">Grupă<select name="group" required>${Object.entries(o.groups).map(([k, n]) => opt(k, x?.group || 'altele', n)).join('')}</select></label>
        <label class="field">Tip alimentație<select name="diet" required>${opt('', x?.diet || '', 'Alege…')}${Object.entries(o.diets).map(([k, n]) => opt(k, x?.diet || '', n)).join('')}</select></label>
      </div>
      <div class="adm-ed-row four">
        ${numField('kcal', 'kcal / 100 g', 900)}${numField('protein', 'Proteine (g)', 100)}${numField('carbs', 'Carbohidrați (g)', 100)}${numField('fat', 'Grăsimi (g)', 100)}
      </div>
      <p class="small-note" id="food-energy" aria-live="polite"></p>
      <fieldset class="adm-checks"><legend>Alergeni</legend>${checksHtml('allergens', o.allergens, x?.allergens || [])}</fieldset>
      <button class="btn dark full" type="submit">${x ? 'Salvează' : 'Adaugă alimentul'}</button>
    </form>`);
  foodEnergyHint();
}

/** Verificare orientativă: energia rezultată din macronutrienți (4 / 4 / 9 kcal pe gram). */
function foodEnergyHint() {
  const form = document.getElementById('food-form');
  const out = document.getElementById('food-energy');
  if (!form || !out) return;
  const n = k => Number(String(form.elements[k].value).replace(',', '.'));
  const [p, c, f, k] = ['protein', 'carbs', 'fat', 'kcal'].map(n);
  if (![p, c, f].every(Number.isFinite) || !form.elements.protein.value || !form.elements.carbs.value || !form.elements.fat.value) { out.textContent = ''; return; }
  const est = Math.round(p * 4 + c * 4 + f * 9);
  const off = Number.isFinite(k) && form.elements.kcal.value && Math.abs(est - k) > Math.max(25, k * 0.2);
  out.textContent = `Din macronutrienți rezultă aproximativ ${est} kcal.${off ? ' Diferența față de valoarea introdusă e mare; verifică eticheta.' : ''}`;
  out.classList.toggle('warn', !!off);
}

// ---------- Import ----------

const IMPORT_COLUMNS = [
  ['nume', 'name', true, 'Denumirea alimentului'],
  ['sursa', 'source', true, 'USDA, CIQUAL, Open Food Facts sau manual'],
  ['referinta_sursa', 'sourceRef', false, 'Codul din sursă (FDC ID, cod CIQUAL, cod de bare); obligatoriu pentru sursele verificate'],
  ['dieta', 'diet', true, 'vegan, vegetarian, pește, carne sau porc'],
  ['kcal', 'kcal', true, 'Energie la 100 g'],
  ['proteine', 'protein', true, 'Grame la 100 g (zecimale cu virgulă sau punct)'],
  ['carbohidrati', 'carbs', true, 'Grame la 100 g'],
  ['grasimi', 'fat', true, 'Grame la 100 g'],
  ['grupa', 'group', false, 'cereale, proteine, lactate, legume, fructe, grasimi, altele (implicit: altele)'],
  ['alergeni', 'allergens', false, 'Separați prin virgulă: gluten, lapte, oua, peste, arahide, soia, fructe_coaja, susan…'],
  ['id', 'id', false, 'Identificatorul din catalog, pentru a actualiza un aliment anume'],
];
const HEADER_ALIASES = {
  ...Object.fromEntries(IMPORT_COLUMNS.map(([ro, key]) => [ro, key])),
  name: 'name', denumire: 'name', source: 'source', source_ref: 'sourceRef', sourceref: 'sourceRef', cod_sursa: 'sourceRef', cod: 'sourceRef',
  diet: 'diet', group: 'group', calorii: 'kcal', energie: 'kcal', energy: 'kcal', protein: 'protein', carbs: 'carbs', carbohydrates: 'carbs',
  fat: 'fat', lipide: 'fat', allergens: 'allergens',
};
const headerKey = h => HEADER_ALIASES[normalize(h).trim().replace(/[\s-]+/g, '_')];
const IMPORT_BATCH = 100, IMPORT_MAX_ROWS = 5000;

/** CSV cu separator „;” sau „,”, câmpuri între ghilimele. Întoarce [{ line, cells }]. */
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const head = text.split(/\r?\n/, 1)[0];
  const delim = (head.match(/;/g) || []).length >= (head.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], field = '', quoted = false, line = 1, rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else { if (c === '\n') line++; field += c; }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push({ line: rowLine, cells: row }); row = [];
      line++; rowLine = line;
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push({ line: rowLine, cells: row }); }
  return rows.filter(r => r.cells.some(c => c.trim()));
}

/** Rândurile de importat dintr-un fișier CSV sau JSON. Aruncă o eroare cu explicație dacă formatul nu e bun. */
function importRows(name, text) {
  let rows;
  if (/\.json$/i.test(name) || /^\s*\[/.test(text)) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Fișierul JSON nu este valid.'); }
    if (!Array.isArray(data)) throw new Error('Fișierul JSON trebuie să conțină o listă de alimente.');
    rows = data.map((o, i) => {
      const out = { line: i + 1 };
      for (const [k, v] of Object.entries(o || {})) { const key = headerKey(k); if (key) out[key] = v; }
      return out;
    });
  } else {
    const table = parseCsv(text);
    if (table.length < 2) throw new Error('Fișierul nu conține rânduri de date după antet.');
    const keys = table[0].cells.map(headerKey);
    const missing = IMPORT_COLUMNS.filter(([, key, req]) => req && !keys.includes(key)).map(([ro]) => ro);
    if (missing.length) throw new Error(`Lipsesc coloanele: ${missing.join(', ')}. Descarcă șablonul pentru antetul corect.`);
    rows = table.slice(1).map(r => {
      const out = { line: r.line };
      keys.forEach((k, i) => { if (k) out[k] = (r.cells[i] ?? '').trim(); });
      return out;
    });
  }
  if (!rows.length) throw new Error('Fișierul nu conține alimente.');
  if (rows.length > IMPORT_MAX_ROWS) throw new Error(`Cel mult ${IMPORT_MAX_ROWS} de rânduri într-un import (fișierul are ${rows.length}). Împarte fișierul.`);
  return rows;
}

function foodImportDialog() {
  modal(`
    <h2>Importă alimente</h2>
    <p>Fișier CSV (separator „;” sau „,”, codare UTF-8) sau JSON. Un rând cu același cod din sursă (sau același identificator) actualizează alimentul existent; celelalte se adaugă. Rândurile greșite sunt raportate și nu opresc restul importului.</p>
    <details class="adm-details"><summary>Coloanele fișierului</summary>
      <table class="adm-table compact"><tbody>${IMPORT_COLUMNS.map(([ro, , req, info]) => `<tr><td><code>${ro}</code>${req ? ' <span class="tag">obligatoriu</span>' : ''}</td><td class="adm-wrap">${esc(info)}</td></tr>`).join('')}</tbody></table>
    </details>
    <button type="button" class="text-btn adm-link" data-action="foodTemplate">${icon('upload')}Descarcă șablonul CSV</button>
    <form id="food-import-form" novalidate>
      <label class="adm-drop small" id="import-drop">${icon('upload')}<span><strong>Alege fișierul</strong> sau trage-l aici</span><small id="import-file-name">CSV sau JSON, cel mult 5 MB</small><input type="file" name="file" accept=".csv,.json,text/csv,application/json" required></label>
      <div class="form-error" role="alert" hidden></div>
      <button class="btn dark full" type="submit">${icon('upload')}Începe importul</button>
    </form>`);
}

async function runImport(file) {
  const box = document.querySelector('#food-import-form .form-error');
  const fail = msg => { box.textContent = msg; box.hidden = false; };
  if (!file) return fail('Alege un fișier CSV sau JSON.');
  if (file.size > 5 * 1024 * 1024) return fail('Fișierul depășește 5 MB.');
  let rows;
  try { rows = importRows(file.name, await file.text()); } catch (err) { return fail(err.message); }
  const total = rows.length, batches = Math.ceil(total / IMPORT_BATCH);
  const sum = { added: 0, updated: 0, unchanged: 0, errors: [] };
  modal(`
    <h2>Se importă alimentele…</h2>
    <p id="import-status" role="status">Pregătesc ${format(total)} ${total === 1 ? 'rând' : 'rânduri'} din „${esc(file.name)}”.</p>
    ${progressBar('import-progress', 'Progresul importului')}
    <p class="small-note">Poți închide fereastra; importul continuă și vei vedea rezumatul la final.</p>`);
  document.getElementById('import-progress').classList.add('on');
  for (let b = 0; b < batches; b++) {
    const part = rows.slice(b * IMPORT_BATCH, (b + 1) * IMPORT_BATCH);
    const status = document.getElementById('import-status');
    if (status) status.textContent = `Lotul ${b + 1} din ${batches} · rândurile ${format(b * IMPORT_BATCH + 1)}–${format(b * IMPORT_BATCH + part.length)} din ${format(total)}`;
    try {
      const r = await api('POST', '/api/admin/foods/import', { file: file.name, rows: part });
      sum.added += r.added; sum.updated += r.updated; sum.unchanged += r.unchanged; sum.errors.push(...r.errors);
    } catch (err) {
      if (err.status === 401 || err.status === 403) throw err;
      sum.errors.push(...part.map(p => ({ line: p.line, name: p.name || '', message: `Lotul nu a putut fi trimis: ${err.message}` })));
    }
    setProgress('import-progress', (b + 1) / batches);
  }
  const shown = sum.errors.slice(0, 100);
  const summary = `
    <h2>Import încheiat</h2>
    <p>„${esc(file.name)}” · ${format(total)} ${total === 1 ? 'rând' : 'rânduri'}</p>
    <div class="adm-import-sum">
      <div class="ok"><strong>${format(sum.added)}</strong><span>adăugate</span></div>
      <div class="ok"><strong>${format(sum.updated)}</strong><span>actualizate</span></div>
      <div><strong>${format(sum.unchanged)}</strong><span>neschimbate</span></div>
      <div class="${sum.errors.length ? 'bad' : ''}"><strong>${format(sum.errors.length)}</strong><span>erori</span></div>
    </div>
    ${shown.length ? `<h3 class="adm-subhead">Rânduri cu erori${sum.errors.length > shown.length ? ` (primele ${shown.length})` : ''}</h3>
      <div class="table-wrap adm-import-errors"><table class="adm-table compact"><thead><tr><th scope="col">Linia</th><th scope="col">Aliment</th><th scope="col">Problema</th></tr></thead>
      <tbody>${shown.map(e => `<tr><td>${e.line}</td><td>${esc(e.name || '—')}</td><td class="adm-wrap">${esc(e.message)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <button class="btn dark full" data-action="close">Închide</button>`;
  if (document.getElementById('dialog').open) modal(summary);
  else toast(`Import încheiat: ${sum.added} adăugate, ${sum.updated} actualizate, ${sum.errors.length} erori.`, sum.errors.length ? 'error' : 'status');
  if (state.section === 'catalog') refreshFoods();
}

function downloadTemplate() {
  const csv = `﻿${IMPORT_COLUMNS.map(([ro]) => ro).join(';')}\n`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'metamorf-import-alimente.csv' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ==================== Ecranul 8 — Media ====================

const MEDIA_DEFAULT = { kind: 'all', unused: '', page: 1 };
state.media = { ...MEDIA_DEFAULT };
let mediaItems = [];

async function renderMedia() {
  const f = state.media;
  const r = await api('GET', `/api/admin/media?${new URLSearchParams(f)}`);
  mediaItems = r.items;
  const kinds = [['all', 'Toate', r.counts.all], ['image', 'Fotografii', r.counts.image], ['video', 'Videoclipuri', r.counts.video]];
  const filtered = f.kind !== 'all' || f.unused;
  return `
  ${pageHead('Media', 'Fotografiile și videoclipurile folosite în rețete și exerciții. Fișierele folosite nu pot fi șterse.',
    `<label class="btn dark adm-file">${icon('upload')}Încarcă fișiere<input type="file" id="media-files" multiple accept="${[...IMAGE_TYPES, ...VIDEO_TYPES].join(',')}"></label>`)}
  <div class="adm-drop" id="media-drop">${icon('upload')}<span><strong>Trage aici fotografii sau videoclipuri</strong></span><small>JPEG, PNG, WebP până la 5 MB · MP4, WebM până la 50 MB · cu sursă / licență</small></div>
  <div class="adm-filters">
    <div class="adm-segment" role="group" aria-label="Tip">${kinds.map(([k, v, n]) => `<button data-action="mediaKind" data-kind="${k}" aria-pressed="${f.kind === k}">${v} <span class="muted">${format(n)}</span></button>`).join('')}</div>
    <div class="adm-segment"><button data-action="mediaUnused" aria-pressed="${!!f.unused}">${icon('info')}Doar nefolosite <span class="muted">${format(r.counts.unused)}</span></button></div>
  </div>
  ${r.items.length ? `<div class="adm-media-grid">${r.items.map(m => `
    <button type="button" class="adm-media-card" data-action="mediaOpen" data-id="${m.id}" aria-label="Detalii: ${esc(m.originalName || m.filename)}">
      ${mediaThumb(m)}
      <span class="adm-media-name">${esc(m.originalName || m.filename)}</span>
      <span class="adm-media-meta">${m.width ? `${m.width}×${m.height} · ` : ''}${fileSize(m.bytes)}</span>
      <span class="adm-media-tags">${m.used ? '' : '<span class="tag">nefolosit</span>'}${m.source ? '' : '<span class="tag warn">fără sursă</span>'}</span>
    </button>`).join('')}</div>`
  : `<section class="card"><div class="empty-log">${icon('camera')}<p>${filtered ? 'Niciun fișier nu corespunde filtrelor alese.' : 'Biblioteca este goală. Încarcă fotografii și videoclipuri sau adaugă-le din editoarele de rețete și exerciții.'}</p>${filtered ? '<button class="btn outline small" data-action="mediaReset">Arată toate</button>' : ''}</div></section>`}
  ${r.total > r.pageSize ? `<section class="card adm-table-card">${pager(r.page, r.pageSize, r.total, 'mediaPage')}</section>` : ''}`;
}

async function mediaDetails(id) {
  const { item: m, usage } = await api('GET', `/api/admin/media/${id}`);
  const where = u => (u.type === 'recipe' ? `<a class="adm-link" href="#retete/${u.id}">Rețeta „${esc(u.name)}”</a>` : `<a class="adm-link" href="#exercitii/${esc(u.id)}">Exercițiul „${esc(u.name)}”</a>`);
  modal(`
    <div class="adm-media-detail">
      <span class="tag">${m.kind === 'video' ? 'VIDEOCLIP' : 'FOTOGRAFIE'}</span>
      <h2>${esc(m.originalName || m.filename)}</h2>
      ${m.kind === 'video' ? `<video class="adm-media-big" src="${esc(m.url)}" controls preload="metadata" playsinline></video>` : `<img class="adm-media-big" src="${esc(m.url)}" alt="">`}
      <dl class="adm-dl">
        ${row('Dimensiune', `${fileSize(m.bytes)}${m.width ? ` · ${m.width} × ${m.height} px` : ''}`)}
        ${row('Format', esc(m.mime))}
        ${row('Fișier', `<code>${esc(m.filename)}</code>`)}
        ${row('Încărcat', `${dt(m.createdAt)}${m.uploadedBy ? ` · ${esc(m.uploadedBy)}` : ''}`)}
        ${row('Folosit în', usage.length ? `<ul class="adm-usage">${usage.map(u => `<li>${where(u)} <small class="muted">(${esc(u.role)})</small></li>`).join('')}</ul>` : '<span class="tag">nefolosit</span>')}
      </dl>
      <form id="media-source-form" data-id="${m.id}" novalidate>
        <label class="field">Sursă / licență${m.kind === 'video' ? ' (obligatoriu)' : ''}<input name="source" maxlength="300" ${m.kind === 'video' ? 'required minlength="3"' : ''} value="${esc(m.source || '')}" placeholder="De exemplu: Fotografie proprie Metamorf"></label>
        <button class="btn outline small" type="submit">Salvează sursa</button>
      </form>
      ${usage.length
        ? `<p class="small-note adm-blocked">${icon('lock')}Ștergerea este blocată cât timp fișierul este folosit. Înlocuiește-l mai întâi în ${usage.length === 1 ? 'elementul' : 'elementele'} de mai sus.</p>`
        : `<button class="btn danger full" data-action="mediaDeleteAsk" data-id="${m.id}" data-name="${esc(m.originalName || m.filename)}">${icon('trash')}Șterge fișierul</button>`}
    </div>`);
}

let uploadQueue = [];

function mediaUploadDialog(files) {
  uploadQueue = [...files].map(file => ({ file, problem: fileProblem(file) }));
  const ok = uploadQueue.filter(u => !u.problem).length;
  modal(`
    <h2>Încarcă ${uploadQueue.length === 1 ? 'un fișier' : `${uploadQueue.length} fișiere`}</h2>
    <ul class="adm-upload-list">${uploadQueue.map((u, i) => `
      <li class="${u.problem ? 'bad' : ''}">
        <span>${icon(u.file.type.startsWith('video') ? 'play' : 'camera')}<strong>${esc(u.file.name)}</strong><small>${fileSize(u.file.size)}</small></span>
        <small class="adm-upload-status" id="up-status-${i}">${u.problem ? esc(u.problem) : 'Pregătit'}</small>
        ${u.problem ? '' : progressBar(`up-bar-${i}`, `Încărcarea fișierului ${u.file.name}`)}
      </li>`).join('')}</ul>
    ${ok ? `<form id="media-upload-form" novalidate>
      <label class="field">Sursă / licență (obligatoriu)<input name="source" required minlength="3" maxlength="300" placeholder="De exemplu: Fotografie proprie Metamorf · sau · CC BY 4.0, autor, sursa"><small>Se aplică tuturor fișierelor de mai sus; o poți modifica apoi pentru fiecare.</small></label>
      <button class="btn dark full" type="submit">${icon('upload')}Încarcă ${ok === 1 ? 'fișierul' : `${ok} fișiere`}</button>
    </form>` : '<p>Niciun fișier nu poate fi încărcat.</p><button class="btn outline full" data-action="close">Închide</button>'}`);
}

async function runMediaUpload(form) {
  const source = String(new FormData(form).get('source')).trim();
  form.querySelectorAll('input, button').forEach(el => { el.disabled = true; });
  let done = 0, failed = 0;
  for (const [i, u] of uploadQueue.entries()) {
    if (u.problem) continue;
    const status = document.getElementById(`up-status-${i}`);
    document.getElementById(`up-bar-${i}`)?.classList.add('on');
    if (status) status.textContent = 'Se încarcă…';
    try {
      await uploadMediaFile(u.file, { source, onProgress: p => setProgress(`up-bar-${i}`, p) });
      done++;
      if (status) { status.textContent = 'Încărcat'; status.classList.add('ok'); }
    } catch (err) {
      failed++;
      if (status) { status.textContent = err.message; status.classList.add('bad'); }
    }
  }
  form.outerHTML = `<p role="status"><strong>${done} ${done === 1 ? 'fișier încărcat' : 'fișiere încărcate'}</strong>${failed ? `, ${failed} ${failed === 1 ? 'eșuat' : 'eșuate'}` : ''}.</p><button class="btn dark full" data-action="close">Închide</button>`;
  if (state.section === 'media') render({ focus: false });
}

// ==================== Înregistrare în panou ====================

RENDER.exercitii = () => (state.id ? renderExerciseEditor() : renderExercises());
RENDER.catalog = renderFoods;
RENDER.media = renderMedia;

Object.assign(actions, {
  // Bibliotecă
  mediaPick: b => {
    const m = pickItems.find(x => String(x.id) === b.dataset.id);
    const f = pickResolve;
    pickResolve = null;
    closeDialog();
    f?.(m || null);
  },
  // Exerciții
  exercisesPage: b => { state.exercises.page = Number(b.dataset.page); render(); },
  exercisesReset: () => { state.exercises = { ...EXERCISES_DEFAULT }; render({ focus: false }); },
  exIncomplete: () => { state.exercises = { ...EXERCISES_DEFAULT, incomplete: '1' }; render({ focus: false }); },
  exSave: b => exSave(b.dataset.status),
  exUnpublishAsk: () => confirmDialog({ title: 'Retragi publicarea?', text: 'Exercițiul nu va mai fi ales în planurile noi și devine ciornă. Planurile deja generate nu se schimbă. Modificările din editor se salvează odată cu retragerea.', action: 'exUnpublish', id: state.ex.id, button: 'Retrage publicarea', danger: true }),
  exUnpublish: async () => { closeDialog(); await exSave('draft'); },
  exDeleteAsk: () => confirmDialog({ title: 'Ștergi exercițiul?', text: `„${esc(state.ex.name)}” se șterge definitiv și nu va mai fi ales în planurile noi. Planurile deja generate îl păstrează. Imaginea și videoclipul rămân în biblioteca media.`, action: 'exDelete', id: state.ex.id, button: 'Șterge definitiv', danger: true }),
  exDelete: async () => {
    await api('DELETE', `/api/admin/exercises/${encodeURIComponent(state.ex.id)}`);
    closeDialog();
    state.ex = null;
    go('exercitii', { force: true });
    toast('Exercițiul a fost șters.');
  },
  liAdd: b => {
    const kind = b.dataset.list, list = state.ex[kind];
    if (list.length >= LISTS[kind].max) { toast(`Cel mult ${LISTS[kind].max}.`, 'error'); return; }
    list.push('');
    exDirty();
    exRefresh(kind);
    document.querySelector(`[data-li="${kind}"][data-index="${list.length - 1}"]`)?.focus();
  },
  liMove: b => {
    const kind = b.dataset.list, from = Number(b.dataset.index), to = from + Number(b.dataset.dir);
    exMove(kind, from, to);
    (document.querySelector(`[data-action="liMove"][data-list="${kind}"][data-index="${to}"][data-dir="${b.dataset.dir}"]:not([disabled])`)
      || document.querySelector(`[data-li="${kind}"][data-index="${to}"]`))?.focus();
  },
  liRemove: b => {
    const kind = b.dataset.list, list = state.ex[kind];
    list.splice(Number(b.dataset.index), 1);
    if (!list.length) list.push('');
    exDirty();
    exRefresh(kind);
  },
  exImagePick: async () => {
    const m = await pickMedia('image');
    if (!m) return;
    Object.assign(state.ex, { image: m.filename, imageUrl: m.url });
    exDirty();
    exRefresh('image');
  },
  exImageRemove: () => { Object.assign(state.ex, { image: null, imageUrl: null }); exDirty(); exRefresh('image'); },
  exVideoPick: async () => {
    const m = await pickMedia('video');
    if (!m) return;
    Object.assign(state.ex, { video: m.filename, videoFileUrl: m.url });
    if (!state.ex.videoSource && m.source) state.ex.videoSource = m.source;
    exDirty();
    exRefresh('video');
  },
  // Catalog nutrițional
  foodsPage: b => { state.foods.page = Number(b.dataset.page); refreshFoods(); document.getElementById('foods-results')?.scrollIntoView({ block: 'start' }); },
  foodsReset: () => { state.foods = { ...FOODS_DEFAULT }; render({ focus: false }); },
  foodsSource: b => { state.foods.source = b.dataset.source; state.foods.page = 1; render({ focus: false }); },
  foodOpen: b => foodDetails(b.dataset.id),
  foodEdit: b => foodForm(b.dataset.id),
  foodNew: () => foodForm(null),
  foodImport: () => foodImportDialog(),
  foodTemplate: () => downloadTemplate(),
  // Media
  mediaPage: b => { state.media.page = Number(b.dataset.page); render(); },
  mediaKind: b => { state.media.kind = b.dataset.kind; state.media.page = 1; render({ focus: false }); },
  mediaUnused: () => { state.media.unused = state.media.unused ? '' : '1'; state.media.page = 1; render({ focus: false }); },
  mediaReset: () => { state.media = { ...MEDIA_DEFAULT }; render({ focus: false }); },
  mediaOpen: b => mediaDetails(b.dataset.id),
  mediaDeleteAsk: b => confirmDialog({ title: 'Ștergi definitiv fișierul?', text: `„${esc(b.dataset.name)}” se șterge din biblioteca media și de pe server. Acțiunea nu poate fi anulată.`, action: 'mediaDelete', id: b.dataset.id, button: 'Șterge definitiv', danger: true }),
  mediaDelete: async b => {
    await api('DELETE', `/api/admin/media/${b.dataset.id}`);
    closeDialog();
    toast('Fișierul a fost șters.');
    render({ focus: false });
  },
});

// ---------- Evenimente ----------

document.addEventListener('submit', async e => {
  const form = e.target;
  if (form.id === 'exercises-filter') {
    const f = Object.fromEntries(new FormData(form));
    state.exercises = { ...EXERCISES_DEFAULT, ...f, q: String(f.q || '').trim(), page: 1 };
    render({ focus: false });
    return;
  }
  if (form.id === 'exercise-form') return; // salvarea se face din butoanele din panoul lateral
  if (form.id === 'food-import-form') {
    try { await runImport(form.elements.file.files[0]); } catch (err) { toast(err.message, 'error'); }
    return;
  }
  if (form.id === 'media-upload-form') {
    if (!validateForm(form)) return;
    await runMediaUpload(form);
    return;
  }
  if (form.id !== 'food-form' && form.id !== 'media-source-form') return;
  if (!validateForm(form)) return;
  const f = new FormData(form);
  try {
    await withBusy(form.querySelector('[type=submit]'), async () => {
      if (form.id === 'food-form') {
        const body = { name: String(f.get('name')).trim(), group: f.get('group'), diet: f.get('diet'), kcal: f.get('kcal'), protein: f.get('protein'), carbs: f.get('carbs'), fat: f.get('fat'), allergens: f.getAll('allergens') };
        const id = form.dataset.id;
        await (id ? api('PUT', `/api/admin/foods/${encodeURIComponent(id)}`, body) : api('POST', '/api/admin/foods', body));
        closeDialog();
        toast(id ? 'Alimentul a fost actualizat. Rețetele care îl folosesc își recalculează valorile.' : 'Alimentul a fost adăugat în catalog.');
        refreshFoods();
      } else {
        await api('PUT', `/api/admin/media/${form.dataset.id}`, { source: String(f.get('source')).trim() });
        toast('Sursa / licența a fost salvată.');
        if (state.section === 'media') render({ focus: false });
      }
    }, 'Se salvează…');
  } catch (err) {
    formError(form, err);
  }
});

let foodsTimer = null;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'foods-q') {
    clearTimeout(foodsTimer);
    foodsTimer = setTimeout(() => { state.foods.q = t.value.trim(); state.foods.page = 1; refreshFoods(); }, 250);
    return;
  }
  if (t.closest?.('#food-form')) { foodEnergyHint(); return; }
  const x = state.ex;
  if (!x || !t.closest?.('#exercise-form')) return;
  if (t.dataset.li) { x[t.dataset.li][Number(t.dataset.index)] = t.value; exDirty(); exPreviewRefresh(); return; }
  if (t.type === 'checkbox') {
    const form = t.form;
    if (t.name === 'equipment') {
      // „Fără echipament” exclude restul; fără nicio alegere revine la „fără echipament”.
      const boxes = [...form.querySelectorAll('[name="equipment"]')];
      if (t.value === 'none' && t.checked) boxes.forEach(b => { if (b.value !== 'none') b.checked = false; });
      else if (t.checked) boxes.find(b => b.value === 'none').checked = false;
      if (!boxes.some(b => b.checked)) boxes.find(b => b.value === 'none').checked = true;
    }
    // Ordinea de bifare contează la grupe: prima rămâne grupa principală.
    const checked = [...form.querySelectorAll(`[name="${t.name}"]:checked`)].map(b => b.value);
    x[t.name] = [...x[t.name].filter(v => checked.includes(v)), ...checked.filter(v => !x[t.name].includes(v))];
    const slot = document.querySelector(`[data-err="${t.name}"]`);
    if (slot) slot.hidden = true;
    exDirty();
    exPreviewRefresh();
    return;
  }
  if (t.name === 'videoKind') { x.videoKind = t.value; exDirty(); exRefresh('video'); return; }
  if (['name', 'level', 'mode', 'sets', 'reps', 'seconds', 'restSec', 'videoUrl', 'videoSource'].includes(t.name)) {
    x[t.name] = t.value;
    if (t.name === 'name') document.getElementById('ex-title').textContent = t.value.trim() || 'Exercițiu nou';
    if (t.name === 'mode') document.querySelectorAll('#exercise-form [data-mode]').forEach(l => { l.hidden = l.dataset.mode !== t.value; });
    clearFieldError(t);
    exDirty();
    exPreviewRefresh();
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'ex-image-file' && t.files[0]) exUpload(t.files[0], 'image');
  if (t.id === 'ex-video-file' && t.files[0]) exUpload(t.files[0], 'video');
  if (t.id === 'media-files' && t.files.length) { mediaUploadDialog(t.files); t.value = ''; }
  if (t.name === 'file' && t.form?.id === 'food-import-form') {
    const label = document.getElementById('import-file-name');
    if (label) label.textContent = t.files[0] ? `${t.files[0].name} · ${fileSize(t.files[0].size)}` : 'CSV sau JSON, cel mult 5 MB';
  }
});

// Linkurile din dialoguri (de ex. „Folosit în”) închid dialogul înainte de navigare.
document.addEventListener('click', e => { if (e.target.closest('#dialog a[href^="#"]')) closeDialog(); });

// Încărcare prin tragere: pe pagina Media (oriunde) și în zona de import.
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragover', e => {
  if (!hasFiles(e)) return;
  const zone = state.section === 'media' && !document.getElementById('dialog').open ? document.getElementById('media-drop') : e.target.closest?.('#import-drop');
  if (!zone) return;
  e.preventDefault();
  zone.classList.add('over');
});
document.addEventListener('dragleave', e => { if (hasFiles(e) && !e.relatedTarget) document.querySelectorAll('.adm-drop.over').forEach(z => z.classList.remove('over')); });
document.addEventListener('drop', e => {
  if (!hasFiles(e)) return;
  document.querySelectorAll('.adm-drop.over').forEach(z => z.classList.remove('over'));
  const importZone = e.target.closest?.('#import-drop');
  if (importZone) {
    e.preventDefault();
    const input = importZone.querySelector('input[type=file]');
    input.files = e.dataTransfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (state.section === 'media' && !document.getElementById('dialog').open) {
    e.preventDefault();
    mediaUploadDialog(e.dataTransfer.files);
  }
});

// Reordonarea pașilor și a greșelilor din exerciții prin tragere (doar de mâner).
let liDrag = null;
document.addEventListener('pointerdown', e => { const li = e.target.closest('[data-sortable] .adm-drag')?.closest('.adm-step'); if (li) li.draggable = true; });
document.addEventListener('dragstart', e => {
  const li = e.target.closest?.('[data-sortable] .adm-step');
  if (!li || !li.draggable) return;
  liDrag = { list: li.parentElement.dataset.sortable, from: Number(li.dataset.index) };
  li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(liDrag.from));
});
const liTarget = e => {
  const li = e.target.closest?.('[data-sortable] .adm-step');
  if (!li || !liDrag || li.parentElement.dataset.sortable !== liDrag.list) return null;
  const r = li.getBoundingClientRect();
  return { li, after: e.clientY > r.top + r.height / 2 };
};
document.addEventListener('dragover', e => {
  const t = liTarget(e);
  if (!t) return;
  e.preventDefault();
  document.querySelectorAll('[data-sortable] .drop-before, [data-sortable] .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
  t.li.classList.add(t.after ? 'drop-after' : 'drop-before');
});
document.addEventListener('drop', e => {
  const t = liTarget(e);
  if (!t) return;
  e.preventDefault();
  let to = Number(t.li.dataset.index) + (t.after ? 1 : 0);
  if (to > liDrag.from) to -= 1;
  const { list, from } = liDrag;
  liDrag = null;
  exMove(list, from, to);
});
document.addEventListener('dragend', () => {
  liDrag = null;
  document.querySelectorAll('[data-sortable] .adm-step').forEach(x => { x.draggable = false; x.classList.remove('dragging', 'drop-before', 'drop-after'); });
});
