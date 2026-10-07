'use strict';
// Ecranul 4 (Cereri de date) și ecranul 5 (Rețete: listă + editor). Folosește utilitarele din admin.js
// (api, modal, toast, pageHead, pager, render, go, actions, state).

// ==================== Ecranul 4 — Cereri de date ====================

const REQ_STATUS = { pending: ['În așteptare', 'warn'], processing: ['În procesare', 'blue'], completed: ['Finalizată', 'green'], failed: ['Eșuată', 'red'] };
const REQ_TYPE = { export: 'Export de date', delete: 'Ștergere cont' };
const REQ_SOURCE = { user: 'Din aplicație, de către client', admin: 'Înregistrată în panou' };
const statusTag = s => `<span class="tag ${REQ_STATUS[s][1]}">${REQ_STATUS[s][0]}</span>`;
const isOpen = r => r.status === 'pending' || r.status === 'processing';
const opt = (v, cur, n) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(n)}</option>`;

const REQUESTS_DEFAULT = { q: '', type: 'all', status: 'all', page: 1 };
state.requests = { ...REQUESTS_DEFAULT };

async function renderRequests() {
  const f = state.requests;
  const r = await api('GET', `/api/admin/requests?${new URLSearchParams(f)}`);
  const filtered = f.q || f.type !== 'all' || f.status !== 'all';
  return `
  ${pageHead('Cereri de date', 'Cererile clienților de export al datelor și de ștergere a contului. Cele făcute din aplicație apar automat; cele primite pe email sau telefon se înregistrează aici.',
    '<button class="btn dark" data-action="requestNew">' + icon('plus') + 'Înregistrează o cerere</button>')}
  <div class="adm-status-row" role="group" aria-label="Filtrează după stare">
    ${Object.entries(REQ_STATUS).map(([k, [name, cls]]) => `
      <button class="adm-status-chip ${f.status === k ? 'active' : ''}" data-action="requestsStatus" data-status="${k}" aria-pressed="${f.status === k}">
        <span class="adm-dot ${cls}" aria-hidden="true"></span><span>${name}</span><strong>${format(r.counts[k] || 0)}</strong>
      </button>`).join('')}
  </div>
  <form class="adm-filters adm-user-filters" id="requests-filter" role="search" novalidate>
    <label class="field adm-f-search">Caută<input name="q" type="search" value="${esc(f.q)}" placeholder="Nume sau email" maxlength="100"></label>
    <label class="field">Tip<select name="type">${opt('all', f.type, 'Toate')}${opt('export', f.type, REQ_TYPE.export)}${opt('delete', f.type, REQ_TYPE.delete)}</select></label>
    <label class="field">Stare<select name="status">${opt('all', f.status, 'Toate')}${Object.entries(REQ_STATUS).map(([k, [n]]) => opt(k, f.status, n)).join('')}</select></label>
    <div class="adm-f-actions">
      <button class="btn dark" type="submit">${icon('scan')}Filtrează</button>
      ${filtered ? '<button class="btn outline" type="button" data-action="requestsReset">Resetează</button>' : ''}
    </div>
  </form>
  <section class="card adm-table-card">
    ${r.requests.length ? `<div class="table-wrap"><table class="adm-table stack">
      <thead><tr><th scope="col">Utilizator</th><th scope="col">Tip</th><th scope="col">Data cererii</th><th scope="col">Stare</th><th scope="col">Sursă</th><th scope="col"><span class="sr-only">Detalii</span></th></tr></thead>
      <tbody>${r.requests.map(q => `
        <tr>
          <td data-label="Utilizator"><a class="adm-link" href="#cereri/${q.id}">${esc(q.userName || q.userEmail)}</a><br><small class="muted">${esc(q.userEmail)}</small>${q.accountDeleted ? ' <span class="tag">cont șters</span>' : ''}</td>
          <td data-label="Tip">${REQ_TYPE[q.type]}</td>
          <td data-label="Data cererii">${dt(q.createdAt)}</td>
          <td data-label="Stare">${statusTag(q.status)}</td>
          <td data-label="Sursă"><small class="muted">${q.source === 'user' ? 'Aplicație' : 'Panou'}</small></td>
          <td class="adm-row-action"><a class="btn outline small" href="#cereri/${q.id}">Detalii</a></td>
        </tr>`).join('')}
      </tbody></table></div>`
    : `<div class="empty-log">${icon('upload')}<p>${filtered ? 'Nicio cerere nu corespunde filtrelor alese.' : 'Nu există încă cereri de date. Exporturile și ștergerile de cont făcute de clienți vor apărea aici automat.'}</p>${filtered ? '<button class="btn outline small" data-action="requestsReset">Resetează filtrele</button>' : ''}</div>`}
    ${pager(r.page, r.pageSize, r.total, 'requestsPage')}
  </section>`;
}

const requestsBack = () => `<a class="adm-back" href="#cereri"><span aria-hidden="true">←</span><span>Înapoi la cereri</span></a>`;

async function renderRequestDetail() {
  let r;
  try {
    r = await api('GET', `/api/admin/requests/${state.id}`);
  } catch (err) {
    if (err.status === 404) return `${requestsBack()}<div class="page-state"><div class="success-icon">${icon('upload')}</div><h1 tabindex="-1">Cererea nu există</h1><p>Linkul nu este corect.</p><a class="btn dark" href="#cereri">Înapoi la cereri</a></div>`;
    throw err;
  }
  const q = r.request;
  const actor = e => esc(e.actor_email || (q.source === 'user' ? 'clientul, din aplicație' : 'sistem'));
  const data = `data-id="${q.id}" data-email="${esc(q.userEmail)}"`;
  let actionsHtml;
  if (!isOpen(q)) {
    actionsHtml = `<p class="muted">Cererea este închisă (${REQ_STATUS[q.status][0].toLowerCase()}) și nu mai poate fi procesată. Pentru o cerere nouă a aceluiași client, folosește „Înregistrează o cerere”.</p>`;
  } else {
    actionsHtml = `
      <div class="adm-actions">
        ${q.status === 'pending' ? `<button class="btn outline" data-action="requestStart" ${data}>${icon('clock')}Preia cererea</button>` : ''}
        ${q.type === 'export' ? `<button class="btn dark" data-action="requestExport" ${data}>${icon('upload')}Generează exportul (JSON)</button>` : ''}
        ${q.type === 'delete' && isAdmin() ? `<button class="btn danger" data-action="requestDeleteAsk" ${data}>${icon('trash')}Șterge contul</button>` : ''}
        <button class="btn outline" data-action="requestFailAsk" ${data}>${icon('close')}Marchează ca eșuată</button>
      </div>
      <p class="small-note">${q.type === 'export'
        ? 'Exportul descarcă un fișier JSON cu toate datele contului, pe care îl trimiți clientului pe un canal sigur. Cererea devine „finalizată”.'
        : isAdmin() ? 'Ștergerea este definitivă și cere confirmare în doi pași, inclusiv tastarea emailului clientului. Cererea rămâne în listă, pentru evidență.'
        : 'Ștergerea contului o face un administrator. Preia cererea și anunță un administrator.'}</p>`;
  }
  return `
  ${requestsBack()}
  <div class="page-heading">
    <div><span class="eyebrow">CEREREA #${q.id}</span><h1 tabindex="-1">${REQ_TYPE[q.type]}</h1><p>${esc(q.userName || q.userEmail)} · ${statusTag(q.status)}</p></div>
  </div>
  <div class="adm-detail-grid">
    <section class="card">
      <div class="card-heading"><h3>Detalii</h3></div>
      <dl class="adm-dl">
        ${row('Client', esc(q.userName || '—'))}
        ${row('Email', esc(q.userEmail))}
        ${row('Cont', q.accountDeleted ? '<span class="tag">șters</span>' : `<a class="adm-link" href="#utilizatori/${q.userId}">Deschide contul</a>`)}
        ${row('Tip', REQ_TYPE[q.type])}
        ${row('Sursă', REQ_SOURCE[q.source])}
        ${row('Data cererii', dt(q.createdAt))}
        ${row('Ultima actualizare', dt(q.updatedAt))}
        ${row('Finalizată', q.completedAt ? dt(q.completedAt) : '—')}
        ${q.note ? row('Notă', esc(q.note)) : ''}
      </dl>
    </section>
    <section class="card">
      <div class="card-heading"><h3>Acțiuni</h3>${statusTag(q.status)}</div>
      ${actionsHtml}
    </section>
    <section class="card adm-span">
      <div class="card-heading"><h3>Cronologie</h3></div>
      <ol class="adm-timeline">
        ${r.events.map(e => `
          <li class="${REQ_STATUS[e.status][1]}">
            <span class="adm-dot ${REQ_STATUS[e.status][1]}" aria-hidden="true"></span>
            <div><strong>${REQ_STATUS[e.status][0]}</strong><p>${esc(e.message)}</p><small class="muted">${dt(e.created_at)} · ${actor(e)}</small></div>
          </li>`).join('')}
      </ol>
    </section>
  </div>`;
}

function requestNewDialog() {
  modal(`
    <h2>Înregistrează o cerere de date</h2>
    <p>Pentru cereri primite pe alt canal (email, telefon). Cererile făcute de client din aplicație apar automat și nu trebuie înregistrate.</p>
    <form id="request-new-form" novalidate>
      <label class="field">Emailul clientului<input name="email" type="email" required autocomplete="off" maxlength="254" placeholder="client@exemplu.ro"></label>
      <fieldset class="portion-grid" style="grid-template-columns:1fr 1fr"><legend class="sr-only">Tipul cererii</legend>
        <label class="choice portion"><input type="radio" name="type" value="export" required checked><strong>${REQ_TYPE.export}</strong></label>
        <label class="choice portion"><input type="radio" name="type" value="delete" required><strong>${REQ_TYPE.delete}</strong></label>
      </fieldset>
      <label class="field" style="margin-top:14px">Notă (canalul și referința)<textarea name="note" required minlength="5" maxlength="300" rows="3" placeholder="De exemplu: email primit pe 7 octombrie, tichet #57"></textarea><small>Nota apare în cronologia cererii și în jurnalul de audit.</small></label>
      <button class="btn dark full" type="submit">Înregistrează cererea</button>
    </form>`);
}

/** Ștergerea, pasul 1: ce se întâmplă. */
function requestDeleteStep1(id, email) {
  modal(`
    <div class="success-icon" style="background:#f8e9e5;color:#a4493b">${icon('trash')}</div>
    <span class="eyebrow">PASUL 1 DIN 2</span>
    <h2>Ștergi definitiv contul clientului?</h2>
    <p>Se șterg contul <strong>${esc(email)}</strong> și toate datele lui: profil, chestionar, jurnal alimentar, planuri, antrenamente, greutate, abonament și sesiuni. <strong>Acțiunea nu poate fi anulată.</strong></p>
    <p>Cererea rămâne în listă (fără date personale în afara emailului și numelui), iar acțiunea se înregistrează în jurnalul de audit.</p>
    <div class="field-row">
      <button type="button" class="btn outline" data-action="close">Renunță</button>
      <button type="button" class="btn danger" data-action="requestDeleteStep2" data-id="${id}" data-email="${esc(email)}">Continuă</button>
    </div>`);
}

/** Ștergerea, pasul 2: tastarea emailului. Butonul devine activ doar când emailul corespunde. */
function requestDeleteStep2(id, email) {
  modal(`
    <div class="success-icon" style="background:#f8e9e5;color:#a4493b">${icon('lock')}</div>
    <span class="eyebrow">PASUL 2 DIN 2</span>
    <h2>Confirmă cu emailul clientului</h2>
    <p>Scrie adresa <strong>${esc(email)}</strong> pentru a confirma ștergerea definitivă.</p>
    <form id="request-delete-form" data-id="${id}" data-email="${esc(email)}" novalidate>
      <label class="field">Emailul clientului<input name="confirmEmail" type="email" required autocomplete="off" spellcheck="false"></label>
      <div class="field-row">
        <button type="button" class="btn outline" data-action="close">Renunță</button>
        <button type="submit" class="btn danger" disabled>Șterge definitiv</button>
      </div>
    </form>`);
}

function requestFailDialog(id) {
  modal(`
    <h2>Marchezi cererea ca eșuată?</h2>
    <p>Folosește această opțiune când cererea nu poate fi îndeplinită (de exemplu, identitatea solicitantului nu a putut fi confirmată). Cererea se închide.</p>
    <form id="request-fail-form" data-id="${id}" novalidate>
      <label class="field">Motivul<textarea name="reason" required minlength="5" maxlength="300" rows="3" placeholder="De exemplu: solicitantul nu a răspuns la verificarea identității"></textarea><small>Motivul apare în cronologie și în jurnalul de audit.</small></label>
      <div class="field-row">
        <button type="button" class="btn outline" data-action="close">Renunță</button>
        <button type="submit" class="btn danger">Marchează ca eșuată</button>
      </div>
    </form>`);
}

function downloadJson(data, name) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ==================== Ecranul 5 — Rețete ====================

const RECIPES_DEFAULT = { q: '', meal: 'all', diet: 'all', status: 'all', photo: 'all', page: 1 };
state.recipes = { ...RECIPES_DEFAULT };
state.ed = null; // rețeta deschisă în editor
const MAX_STEPS = 20, MAX_INGREDIENTS = 25, MAX_PHOTO = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const recipeStatusTag = s => (s === 'published' ? '<span class="tag green">Publicată</span>' : '<span class="tag">Ciornă</span>');
const dietChips = diets => (diets.length ? `<span class="adm-chips">${diets.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</span>` : '<span class="muted">—</span>');

async function recipesCatalog() {
  if (!state.cache.recipes) {
    const c = await api('GET', '/api/admin/recipes-catalog');
    c.byId = new Map(c.foods.map(f => [f.id, f]));
    state.cache.recipes = c;
  }
  return state.cache.recipes;
}

async function renderRecipes() {
  const f = state.recipes;
  const r = await api('GET', `/api/admin/recipes?${new URLSearchParams(f)}`);
  const filtered = f.q || ['meal', 'diet', 'status', 'photo'].some(k => f[k] !== 'all');
  return `
  ${pageHead('Rețete', `${format(r.total)} ${r.total === 1 ? 'rețetă' : 'rețete'}${filtered ? ' găsite cu filtrele alese' : ''}. Caloriile, macronutrienții și alergenii se calculează automat din catalogul nutrițional.`,
    `<a class="btn dark" href="#retete/nou">${icon('plus')}Rețetă nouă</a>`)}
  <form class="adm-filters adm-user-filters" id="recipes-filter" role="search" novalidate>
    <label class="field adm-f-search">Caută<input name="q" type="search" value="${esc(f.q)}" placeholder="Numele rețetei" maxlength="100"></label>
    <label class="field">Tip masă<select name="meal">${opt('all', f.meal, 'Toate')}${Object.entries(r.mealTypes).map(([k, n]) => opt(k, f.meal, n)).join('')}</select></label>
    <label class="field">Alimentație<select name="diet">${opt('all', f.diet, 'Toate')}${r.diets.map(x => opt(x, f.diet, x)).join('')}</select></label>
    <label class="field">Stare<select name="status">${opt('all', f.status, 'Toate')}${opt('draft', f.status, 'Ciornă')}${opt('published', f.status, 'Publicată')}</select></label>
    <label class="field">Fotografie<select name="photo">${opt('all', f.photo, 'Toate')}${opt('with', f.photo, 'Cu fotografie')}${opt('without', f.photo, 'Fără fotografie')}</select></label>
    <div class="adm-f-actions">
      <button class="btn dark" type="submit">${icon('scan')}Filtrează</button>
      ${filtered ? '<button class="btn outline" type="button" data-action="recipesReset">Resetează</button>' : ''}
    </div>
  </form>
  <section class="card adm-table-card">
    ${r.recipes.length ? `<div class="table-wrap"><table class="adm-table stack adm-recipes">
      <thead><tr><th scope="col"><span class="sr-only">Fotografie</span></th><th scope="col">Nume</th><th scope="col">Tip masă</th><th scope="col">Alimentație compatibilă</th><th scope="col" class="num">Calorii / porție</th><th scope="col">Stare</th><th scope="col"><span class="sr-only">Editează</span></th></tr></thead>
      <tbody>${r.recipes.map(x => `
        <tr>
          <td class="adm-thumb-cell">${x.photoUrl ? `<img class="adm-thumb" src="${esc(x.photoUrl)}" alt="" width="64" height="48" loading="lazy">` : `<span class="adm-thumb empty" aria-hidden="true">${icon('camera')}</span>`}</td>
          <td data-label="Nume"><a class="adm-link" href="#retete/${x.id}">${esc(x.name)}</a>${x.photoUrl ? '' : ' <span class="tag warn">fără fotografie</span>'}<br><small class="muted">Actualizată ${d(x.updatedAt)}</small></td>
          <td data-label="Tip masă">${esc(x.mealTypeLabel)}</td>
          <td data-label="Alimentație">${dietChips(x.facts.diets)}</td>
          <td data-label="Calorii / porție" class="num">${x.facts.perServing.kcal ? `${format(x.facts.perServing.kcal)} kcal` : '—'}</td>
          <td data-label="Stare">${recipeStatusTag(x.status)}</td>
          <td class="adm-row-action"><a class="btn outline small" href="#retete/${x.id}">${icon('edit')}Editează</a></td>
        </tr>`).join('')}
      </tbody></table></div>`
    : `<div class="empty-log">${icon('leaf')}<p>${filtered ? 'Nicio rețetă nu corespunde filtrelor alese.' : 'Nu există încă rețete. Creează prima rețetă: ingredientele se aleg din catalogul nutrițional, iar valorile se calculează automat.'}</p>${filtered ? '<button class="btn outline small" data-action="recipesReset">Resetează filtrele</button>' : '<a class="btn dark small" href="#retete/nou">Creează prima rețetă</a>'}</div>`}
    ${pager(r.page, r.pageSize, r.total, 'recipesPage')}
  </section>`;
}

// ---------- Editor ----------

const edFrom = (r, key) => ({
  key, id: r?.id ?? null, name: r?.name ?? '', description: r?.description ?? '', mealType: r?.mealType ?? '',
  prepMinutes: r?.prepMinutes ?? '', servings: r?.servings ?? 1,
  steps: r?.steps?.length ? [...r.steps] : [''],
  ingredients: (r?.ingredients || []).map(i => ({ foodId: i.foodId, grams: i.grams })),
  status: r?.status ?? 'draft', photoUrl: r?.photoUrl ?? null, pendingPhoto: null, preview: null,
  updatedAt: r?.updatedAt ?? null, publishedAt: r?.publishedAt ?? null, dirty: false,
});

/** Același calcul ca pe server (recipeFacts), pentru panoul actualizat live. Serverul recalculează la salvare. */
function liveFacts(ed, cat) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const found = new Set();
  let level = -1;
  for (const i of ed.ingredients) {
    const f = cat.byId.get(i.foodId);
    const g = Number(i.grams);
    if (!f || !Number.isFinite(g) || g <= 0) continue;
    for (const k of Object.keys(t)) t[k] += f[k] * g / 100;
    f.allergens.forEach(a => found.add(a));
    level = Math.max(level, cat.dietLevel[f.diet]);
  }
  const s = Math.max(1, Number(ed.servings) || 1);
  const round = n => ({ kcal: Math.round(n.kcal), protein: Math.round(n.protein * 10) / 10, carbs: Math.round(n.carbs * 10) / 10, fat: Math.round(n.fat * 10) / 10 });
  return {
    servings: s, total: round(t), perServing: round({ kcal: t.kcal / s, protein: t.protein / s, carbs: t.carbs / s, fat: t.fat / s }),
    allergens: Object.keys(cat.allergens).filter(a => found.has(a)),
    diets: level < 0 ? [] : cat.diets.filter(x => cat.dietMax[x] >= level),
  };
}

function factsHtml(ed, cat) {
  const f = liveFacts(ed, cat);
  const empty = !ed.ingredients.length;
  const g = n => `${format(n, 1)} g`;
  return `
    <div class="card-heading"><h3>Valori nutriționale</h3><span class="tag">calcul automat</span></div>
    <div class="adm-facts-kcal"><strong>${format(f.perServing.kcal)}</strong><span>kcal / porție</span></div>
    <dl class="adm-facts-macros">
      <div><dt>Proteine</dt><dd>${g(f.perServing.protein)}</dd></div>
      <div><dt>Carbohidrați</dt><dd>${g(f.perServing.carbs)}</dd></div>
      <div><dt>Grăsimi</dt><dd>${g(f.perServing.fat)}</dd></div>
    </dl>
    <p class="adm-facts-total">Toată rețeta (${f.servings} ${f.servings === 1 ? 'porție' : 'porții'}): <strong>${format(f.total.kcal)} kcal</strong> · P ${g(f.total.protein)} · C ${g(f.total.carbs)} · G ${g(f.total.fat)}</p>
    <h4 class="adm-subhead">Alergeni</h4>
    ${empty ? '<p class="muted">Se determină din ingrediente.</p>'
      : f.allergens.length ? `<span class="adm-chips">${f.allergens.map(a => `<span class="tag warn">${esc(cat.allergens[a])}</span>`).join('')}</span>`
      : '<p class="muted">Niciunul dintre cei 14 alergeni reglementați în UE.</p>'}
    <h4 class="adm-subhead">Potrivită pentru</h4>
    ${empty ? '<p class="muted">Se determină din ingrediente.</p>' : dietChips(f.diets)}
    <p class="small-note">Valorile, alergenii și tipurile de alimentație rezultă din catalogul nutrițional și nu pot fi modificate manual. Alergenii sunt deduși din ingrediente; verifică și eticheta produselor folosite.</p>`;
}

function ingredientsHtml(ed, cat) {
  if (!ed.ingredients.length) return '<p class="muted adm-ing-empty">Niciun ingredient încă. Caută un aliment în catalog și alege gramajul.</p>';
  return `<ul class="adm-ing-list">${ed.ingredients.map((i, n) => {
    const f = cat.byId.get(i.foodId);
    if (!f) return `<li class="adm-ing"><div class="adm-ing-name"><strong>${esc(i.foodId)}</strong><small class="tag warn">nu mai există în catalog — elimină-l</small></div><span></span><span></span><button type="button" class="icon-button" data-action="ingRemove" data-index="${n}" aria-label="Elimină ingredientul">${icon('trash')}</button></li>`;
    const kcal = Math.round(f.kcal * (Number(i.grams) || 0) / 100);
    return `
    <li class="adm-ing">
      <div class="adm-ing-name"><strong>${esc(f.name)}</strong><small>${f.kcal} kcal / 100 g${f.allergens.length ? ` · conține: ${f.allergens.map(a => esc(cat.allergens[a].split(' (')[0].toLowerCase())).join(', ')}` : ''}</small></div>
      <label class="adm-ing-grams"><span class="sr-only">Gramaj pentru ${esc(f.name)}</span><input type="number" min="1" max="2000" step="1" inputmode="numeric" data-ing="${n}" value="${esc(i.grams)}"><span aria-hidden="true">g</span></label>
      <span class="adm-ing-kcal" data-kcal="${n}">${format(kcal)} kcal</span>
      <button type="button" class="icon-button" data-action="ingRemove" data-index="${n}" aria-label="Elimină ${esc(f.name)}">${icon('trash')}</button>
    </li>`;
  }).join('')}</ul>`;
}

function stepsHtml(ed) {
  const last = ed.steps.length - 1;
  return ed.steps.map((s, n) => `
    <li class="adm-step" data-index="${n}">
      <span class="adm-drag" title="Trage pentru a reordona" aria-hidden="true">${icon('grip')}</span>
      <span class="adm-step-num" aria-hidden="true">${n + 1}</span>
      <label class="field"><span class="sr-only">Pasul ${n + 1}</span><textarea data-step="${n}" rows="2" maxlength="500" placeholder="Descrie pasul ${n + 1}">${esc(s)}</textarea></label>
      <div class="adm-step-tools">
        <button type="button" class="icon-button" data-action="stepMove" data-index="${n}" data-dir="-1" aria-label="Mută pasul ${n + 1} mai sus" ${n === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button type="button" class="icon-button" data-action="stepMove" data-index="${n}" data-dir="1" aria-label="Mută pasul ${n + 1} mai jos" ${n === last ? 'disabled' : ''}>${icon('down')}</button>
        <button type="button" class="icon-button" data-action="stepRemove" data-index="${n}" aria-label="Șterge pasul ${n + 1}">${icon('trash')}</button>
      </div>
    </li>`).join('');
}

function photoHtml(ed) {
  const src = ed.preview || ed.photoUrl;
  return `
    ${src ? `<img class="adm-photo-img" src="${esc(src)}" alt="Previzualizarea fotografiei rețetei">` : `<div class="adm-photo-img empty">${icon('camera')}<span>Fără fotografie</span></div>`}
    <div class="adm-photo-tools">
      <label class="btn outline small adm-file">${icon('upload')}${src ? 'Încarcă alta' : 'Încarcă o fotografie'}<input type="file" id="recipe-photo" accept="${PHOTO_TYPES.join(',')}"></label>
      ${ed.id ? `<button type="button" class="btn outline small" data-action="recipePhotoPick">${icon('camera')}Din biblioteca media</button>` : ''}
      ${src ? `<button type="button" class="btn outline small" data-action="photoRemoveAsk">${icon('trash')}Elimină</button>` : ''}
    </div>
    <small class="muted">JPEG, PNG sau WebP, cel mult 5 MB. ${ed.pendingPhoto ? '<strong>Fotografia se încarcă la salvare.</strong>' : ed.id ? 'Fotografia se salvează imediat după alegere.' : 'Fotografia se încarcă la prima salvare.'}</small>`;
}

function editorActionsHtml(ed) {
  const pub = ed.status === 'published';
  return `
    <div class="card-heading"><h3>Publicare</h3>${recipeStatusTag(ed.status)}</div>
    <p class="adm-dirty ${ed.dirty ? 'on' : ''}" id="ed-dirty" role="status">${ed.dirty ? 'Modificări nesalvate' : ed.id ? `Salvată ${dt(ed.updatedAt)}` : 'Rețetă nouă, nesalvată'}</p>
    <div class="form-alert error" id="ed-alert" role="alert" tabindex="-1" hidden></div>
    <div class="adm-ed-buttons">
      ${pub
        ? `<button class="btn dark full" data-action="recipeSave" data-status="published">${icon('check')}Salvează modificările</button>
           <button class="btn outline full" data-action="recipeUnpublishAsk">Retrage publicarea</button>`
        : `<button class="btn outline full" data-action="recipeSave" data-status="draft">Salvează ciornă</button>
           <button class="btn dark full" data-action="recipeSave" data-status="published">${icon('check')}Publică</button>`}
      ${ed.id ? `<button class="btn outline full" data-action="recipeDuplicate">${icon('copy')}Duplică</button>
      <button class="btn danger full" data-action="recipeDeleteAsk">${icon('trash')}Șterge rețeta</button>` : ''}
    </div>
    ${pub ? '' : '<p class="small-note">Pentru publicare: timp de preparare, cel puțin un pas și cel puțin două ingrediente.</p>'}`;
}

const recipesBack = () => `<a class="adm-back" href="#retete"><span aria-hidden="true">←</span><span>Înapoi la rețete</span></a>`;

async function renderRecipeEditor() {
  const cat = await recipesCatalog();
  if (!state.ed || state.ed.key !== state.id) {
    if (state.id === 'nou') state.ed = edFrom(null, 'nou');
    else {
      try {
        state.ed = edFrom(await api('GET', `/api/admin/recipes/${state.id}`), state.id);
      } catch (err) {
        if (err.status === 404) return `${recipesBack()}<div class="page-state"><div class="success-icon">${icon('leaf')}</div><h1 tabindex="-1">Rețeta nu există</h1><p>A fost ștearsă sau linkul nu este corect.</p><a class="btn dark" href="#retete">Înapoi la rețete</a></div>`;
        throw err;
      }
    }
  }
  const ed = state.ed;
  return `
  ${recipesBack()}
  <div class="page-heading">
    <div><span class="eyebrow">${ed.id ? `EDITOR · REȚETA #${ed.id}` : 'REȚETĂ NOUĂ'}</span><h1 tabindex="-1" id="ed-title">${esc(ed.name || 'Rețetă nouă')}</h1>
    <p>${recipeStatusTag(ed.status)}${ed.publishedAt ? ` · publicată ${d(ed.publishedAt)}` : ''}</p></div>
  </div>
  <div class="adm-editor">
    <form id="recipe-form" class="adm-editor-main" novalidate>
      <section class="card">
        <div class="card-heading"><h3>Informații generale</h3></div>
        <label class="field">Nume<input name="name" required minlength="3" maxlength="80" value="${esc(ed.name)}" placeholder="De exemplu: Bol cu quinoa și năut"></label>
        <label class="field">Descriere<textarea name="description" maxlength="500" rows="3" placeholder="Pe scurt, ce face rețeta specială">${esc(ed.description)}</textarea></label>
        <div class="adm-ed-row">
          <label class="field">Tip masă<select name="mealType" required>${opt('', ed.mealType, 'Alege…')}${Object.entries(cat.mealTypes).map(([k, n]) => opt(k, ed.mealType, n)).join('')}</select></label>
          <label class="field">Timp de preparare (minute)<input name="prepMinutes" type="number" min="1" max="600" step="1" inputmode="numeric" value="${esc(ed.prepMinutes)}"></label>
          <label class="field">Porții<input name="servings" type="number" min="1" max="20" step="1" inputmode="numeric" value="${esc(ed.servings)}"></label>
        </div>
      </section>
      <section class="card">
        <div class="card-heading"><h3>Fotografie</h3></div>
        <div class="adm-photo" id="ed-photo">${photoHtml(ed)}</div>
      </section>
      <section class="card">
        <div class="card-heading"><h3>Ingrediente</h3><span class="tag">din catalogul nutrițional</span></div>
        <div class="adm-ac">
          <label class="field" for="ing-search">Adaugă un ingredient</label>
          <input id="ing-search" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ing-options" autocomplete="off" placeholder="Caută: ovăz, somon, năut…" maxlength="60">
          <ul id="ing-options" class="adm-ac-list" role="listbox" aria-label="Alimente din catalog" hidden></ul>
        </div>
        <div id="ing-rows">${ingredientsHtml(ed, cat)}</div>
        <p class="adm-err" data-err="ingredients" role="alert" hidden></p>
      </section>
      <section class="card">
        <div class="card-heading"><h3>Pași de preparare</h3><small class="muted adm-drag-hint">Trage de <span aria-hidden="true">⠿</span> sau folosește săgețile pentru a reordona</small></div>
        <ol class="adm-steps" id="step-list">${stepsHtml(ed)}</ol>
        <p class="adm-err" data-err="steps" role="alert" hidden></p>
        <button type="button" class="btn outline small" data-action="stepAdd">${icon('plus')}Adaugă un pas</button>
      </section>
    </form>
    <aside class="adm-editor-side" aria-label="Valori calculate și publicare">
      <section class="card adm-facts" id="ed-facts" aria-live="polite">${factsHtml(ed, cat)}</section>
      <section class="card" id="ed-actions">${editorActionsHtml(ed)}</section>
    </aside>
  </div>`;
}

// Actualizări parțiale ale editorului (fără a reconstrui formularul, ca focusul și textul să rămână pe loc).
function refresh(part) {
  const ed = state.ed, cat = state.cache.recipes;
  const set = (id, html) => { const el = document.getElementById(id); if (el) { el.innerHTML = html; hydrateIcons(el); } };
  if (part === 'facts' || part === 'ingredients') set('ed-facts', factsHtml(ed, cat));
  if (part === 'ingredients') set('ing-rows', ingredientsHtml(ed, cat));
  if (part === 'steps') set('step-list', stepsHtml(ed));
  if (part === 'photo') set('ed-photo', photoHtml(ed));
  if (part === 'actions') set('ed-actions', editorActionsHtml(ed));
}

function markDirty() {
  if (!state.ed) return;
  const was = state.ed.dirty;
  state.ed.dirty = true;
  if (!was) refresh('actions');
}

// ---------- Autocompletare ingrediente ----------

const ac = { items: [], active: -1 };

function acRender(query) {
  const input = document.getElementById('ing-search'), list = document.getElementById('ing-options');
  if (!input || !list) return;
  const q = normalize(query.trim());
  if (!q) { acClose(); return; }
  const cat = state.cache.recipes, used = new Set(state.ed.ingredients.map(i => i.foodId));
  ac.items = cat.foods.filter(f => !used.has(f.id) && normalize(`${f.name} ${f.group}`).includes(q))
    .sort((a, b) => normalize(a.name).indexOf(q) - normalize(b.name).indexOf(q)).slice(0, 8);
  ac.active = ac.items.length ? 0 : -1;
  list.innerHTML = ac.items.length
    ? ac.items.map((f, n) => `<li role="option" id="ing-opt-${n}" data-food="${esc(f.id)}" aria-selected="${n === 0}"><strong>${esc(f.name)}</strong><small>${esc(f.group)} · ${f.kcal} kcal / 100 g</small></li>`).join('')
    : `<li class="adm-ac-none" aria-disabled="true">${state.ed.ingredients.length >= MAX_INGREDIENTS ? `Ai atins limita de ${MAX_INGREDIENTS} de ingrediente.` : 'Niciun aliment găsit în catalog.'}</li>`;
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  acActive(ac.active);
}

function acActive(n) {
  const input = document.getElementById('ing-search');
  ac.active = n;
  document.querySelectorAll('#ing-options [role=option]').forEach((li, i) => { li.setAttribute('aria-selected', String(i === n)); if (i === n) li.scrollIntoView({ block: 'nearest' }); });
  if (n >= 0) input.setAttribute('aria-activedescendant', `ing-opt-${n}`); else input.removeAttribute('aria-activedescendant');
}

function acClose() {
  const input = document.getElementById('ing-search'), list = document.getElementById('ing-options');
  if (list) { list.hidden = true; list.innerHTML = ''; }
  input?.setAttribute('aria-expanded', 'false');
  input?.removeAttribute('aria-activedescendant');
  ac.items = []; ac.active = -1;
}

function acChoose(foodId) {
  const ed = state.ed;
  if (ed.ingredients.length >= MAX_INGREDIENTS) { toast(`Cel mult ${MAX_INGREDIENTS} de ingrediente.`, 'error'); return; }
  if (ed.ingredients.some(i => i.foodId === foodId)) return;
  ed.ingredients.push({ foodId, grams: 100 });
  markDirty();
  acClose();
  document.getElementById('ing-search').value = '';
  refresh('ingredients');
  // Focus pe gramaj, ca să poată fi ajustat imediat.
  const g = document.querySelector(`[data-ing="${ed.ingredients.length - 1}"]`);
  g?.focus(); g?.select();
}

// ---------- Fotografie ----------

async function uploadPhoto(id, file) {
  let res;
  try {
    res = await fetch(`/api/admin/recipes/${id}/photo`, { method: 'PUT', credentials: 'same-origin', headers: { 'X-Metamorf': '1', 'Content-Type': file.type }, body: file });
  } catch {
    throw new Error('Nu se poate contacta serverul.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || (res.status === 413 ? 'Fotografia depășește 5 MB.' : 'Fotografia nu a putut fi încărcată.'));
  return data;
}

async function choosePhoto(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!PHOTO_TYPES.includes(file.type)) { toast('Alege o imagine JPEG, PNG sau WebP.', 'error'); input.value = ''; return; }
  if (file.size > MAX_PHOTO) { toast('Fotografia depășește 5 MB.', 'error'); input.value = ''; return; }
  const ed = state.ed;
  if (ed.preview) URL.revokeObjectURL(ed.preview);
  ed.preview = URL.createObjectURL(file);
  if (!ed.id) { ed.pendingPhoto = file; markDirty(); refresh('photo'); return; }
  refresh('photo');
  const box = document.getElementById('ed-photo');
  box?.classList.add('busy');
  try {
    const r = await uploadPhoto(ed.id, file);
    ed.photoUrl = r.photoUrl;
    toast('Fotografia a fost salvată.');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    URL.revokeObjectURL(ed.preview);
    ed.preview = null;
    box?.classList.remove('busy');
    refresh('photo');
  }
}

// ---------- Salvare ----------

function showEditorErrors(err) {
  const form = document.getElementById('recipe-form');
  const alert = document.getElementById('ed-alert');
  let first = null;
  for (const [name, message] of Object.entries(err.fields || {})) {
    if (name === 'steps' || name === 'ingredients') {
      const el = document.querySelector(`[data-err="${name}"]`);
      el.textContent = message;
      el.hidden = false;
      first ||= el.closest('.card');
    } else {
      const el = showFieldError(form, name, message);
      first ||= el;
    }
  }
  if (alert) {
    alert.textContent = Object.keys(err.fields || {}).length ? `${err.message} Verifică câmpurile marcate.` : err.message;
    alert.hidden = false;
  }
  if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (first.focus && first.matches('input, select, textarea')) first.focus({ preventScroll: true }); }
  else alert?.focus();
}

function clearEditorErrors() {
  const form = document.getElementById('recipe-form');
  if (form) clearFormErrors(form);
  document.querySelectorAll('.adm-err').forEach(e => { e.hidden = true; e.textContent = ''; });
  const alert = document.getElementById('ed-alert');
  if (alert) alert.hidden = true;
}

async function saveRecipe(status) {
  const ed = state.ed;
  const wasPublished = ed.status === 'published';
  clearEditorErrors();
  const body = {
    name: ed.name.trim(), description: ed.description.trim(), mealType: ed.mealType,
    prepMinutes: ed.prepMinutes === '' ? null : Number(ed.prepMinutes), servings: Number(ed.servings),
    steps: ed.steps.map(s => s.trim()).filter(Boolean),
    ingredients: ed.ingredients.map(i => ({ foodId: i.foodId, grams: Number(i.grams) })),
    status,
  };
  let r;
  try {
    r = ed.id ? await api('PUT', `/api/admin/recipes/${ed.id}`, body) : await api('POST', '/api/admin/recipes', body);
  } catch (err) {
    if (err.status === 401 || err.status === 403) throw err;
    showEditorErrors(err);
    return;
  }
  let photoError = null;
  if (ed.pendingPhoto) {
    try { r.photoUrl = (await uploadPhoto(r.id, ed.pendingPhoto)).photoUrl; } catch (err) { photoError = err; }
  }
  if (ed.preview) URL.revokeObjectURL(ed.preview);
  state.ed = edFrom(r, String(r.id));
  if (state.id !== String(r.id)) { state.id = String(r.id); history.replaceState(null, '', `#retete/${r.id}`); }
  await render({ focus: false });
  if (photoError) toast(`Rețeta a fost salvată, dar fotografia nu: ${photoError.message}`, 'error');
  else toast(status === 'published' ? (wasPublished ? 'Modificările au fost publicate.' : 'Rețeta a fost publicată.') : (wasPublished ? 'Publicarea a fost retrasă; rețeta este acum ciornă.' : 'Ciorna a fost salvată.'));
}

// Navigarea în afara unui editor (rețetă, exercițiu) cu modificări nesalvate cere confirmare.
// EDITORS: secțiunea → cheia din `state` unde stă elementul deschis în editor.
const EDITORS = { retete: 'ed' };
leaveGuard = target => {
  const key = EDITORS[state.section];
  const ed = key && state[key];
  if (!ed) return false;
  if (!ed.dirty) { state[key] = null; return false; }
  modal(`
    <h2>Ai modificări nesalvate</h2>
    <p>Dacă ieși din editor, modificările făcute în „${esc(ed.name || 'elementul nou')}” se pierd.</p>
    <div class="field-row">
      <button type="button" class="btn outline" data-action="close">Rămâi în editor</button>
      <button type="button" class="btn danger" data-action="leaveEditor" data-target="${esc(target)}">Ieși fără să salvezi</button>
    </div>`);
  return true;
};
window.addEventListener('beforeunload', e => { if (Object.values(EDITORS).some(k => state[k]?.dirty)) { e.preventDefault(); e.returnValue = ''; } });

// ==================== Înregistrare în panou ====================

RENDER.cereri = () => (state.id ? renderRequestDetail() : renderRequests());
RENDER.retete = () => (state.id ? renderRecipeEditor() : renderRecipes());

Object.assign(actions, {
  // Cereri
  requestNew: () => requestNewDialog(),
  requestsPage: b => { state.requests.page = Number(b.dataset.page); render(); },
  requestsReset: () => { state.requests = { ...REQUESTS_DEFAULT }; render({ focus: false }); },
  requestsStatus: b => { state.requests.status = state.requests.status === b.dataset.status ? 'all' : b.dataset.status; state.requests.page = 1; render({ focus: false }); },
  requestStart: async b => { await api('POST', `/api/admin/requests/${b.dataset.id}/start`); toast('Cererea a fost preluată.'); await render({ focus: false }); },
  requestExport: async b => {
    const data = await api('POST', `/api/admin/requests/${b.dataset.id}/export`);
    downloadJson(data, `metamorf-export-cerere-${b.dataset.id}.json`);
    toast('Exportul a fost descărcat, iar cererea a fost finalizată.');
    await render({ focus: false });
  },
  requestDeleteAsk: b => requestDeleteStep1(b.dataset.id, b.dataset.email),
  requestDeleteStep2: b => requestDeleteStep2(b.dataset.id, b.dataset.email),
  requestFailAsk: b => requestFailDialog(b.dataset.id),
  // Rețete
  recipesPage: b => { state.recipes.page = Number(b.dataset.page); render(); },
  recipesReset: () => { state.recipes = { ...RECIPES_DEFAULT }; render({ focus: false }); },
  recipeSave: b => saveRecipe(b.dataset.status),
  recipeUnpublishAsk: () => confirmDialog({ title: 'Retragi publicarea?', text: 'Rețeta nu va mai fi disponibilă în aplicație și devine ciornă. Modificările din editor se salvează odată cu retragerea.', action: 'recipeUnpublish', id: state.ed.id, button: 'Retrage publicarea', danger: true }),
  recipeUnpublish: async () => { closeDialog(); await saveRecipe('draft'); },
  recipeDuplicate: async () => {
    if (state.ed.dirty) {
      confirmDialog({ title: 'Duplici versiunea salvată?', text: 'Copia se face după ultima versiune salvată; modificările nesalvate din editor nu sunt incluse și se pierd.', action: 'recipeDuplicateGo', id: state.ed.id, button: 'Duplică fără modificări' });
      return;
    }
    await actions.recipeDuplicateGo();
  },
  recipeDuplicateGo: async () => {
    const r = await api('POST', `/api/admin/recipes/${state.ed.id}/duplicate`);
    closeDialog();
    state.ed = null;
    go(`retete/${r.id}`, { force: true });
    toast('Copia a fost creată ca ciornă.');
  },
  recipeDeleteAsk: () => confirmDialog({ title: 'Ștergi rețeta?', text: `Rețeta „${esc(state.ed.name)}” se șterge definitiv, împreună cu ingredientele și pașii ei. Acțiunea nu poate fi anulată.`, action: 'recipeDelete', id: state.ed.id, button: 'Șterge definitiv', danger: true }),
  recipeDelete: async () => {
    await api('DELETE', `/api/admin/recipes/${state.ed.id}`);
    closeDialog();
    state.ed = null;
    go('retete', { force: true });
    toast('Rețeta a fost ștearsă.');
  },
  leaveEditor: b => { state[EDITORS[state.section]] = null; closeDialog(); go(b.dataset.target, { force: true }); },
  stepAdd: () => {
    const ed = state.ed;
    if (ed.steps.length >= MAX_STEPS) { toast(`Cel mult ${MAX_STEPS} pași.`, 'error'); return; }
    ed.steps.push('');
    markDirty();
    refresh('steps');
    document.querySelector(`[data-step="${ed.steps.length - 1}"]`)?.focus();
  },
  stepMove: b => {
    const from = Number(b.dataset.index), to = from + Number(b.dataset.dir);
    moveStep(from, to);
    // Focusul rămâne pe aceeași săgeată, la noua poziție a pasului.
    const again = document.querySelector(`[data-action="stepMove"][data-index="${to}"][data-dir="${b.dataset.dir}"]:not([disabled])`)
      || document.querySelector(`[data-step="${to}"]`);
    again?.focus();
  },
  stepRemove: b => {
    const ed = state.ed;
    ed.steps.splice(Number(b.dataset.index), 1);
    if (!ed.steps.length) ed.steps.push('');
    markDirty();
    refresh('steps');
  },
  ingRemove: b => {
    state.ed.ingredients.splice(Number(b.dataset.index), 1);
    markDirty();
    refresh('ingredients');
    document.getElementById('ing-search')?.focus();
  },
  photoRemoveAsk: () => {
    const ed = state.ed;
    if (ed.pendingPhoto || !ed.photoUrl) { // fotografia nu a fost încă încărcată
      if (ed.preview) URL.revokeObjectURL(ed.preview);
      ed.preview = null; ed.pendingPhoto = null;
      refresh('photo');
      return;
    }
    confirmDialog({ title: 'Elimini fotografia?', text: 'Rețeta va apărea fără fotografie (cu indicatorul „fără fotografie” în listă).', action: 'photoRemove', id: ed.id, button: 'Elimină fotografia', danger: true });
  },
  recipePhotoPick: async () => {
    const m = await pickMedia('image');
    if (!m) return;
    const r = await api('POST', `/api/admin/recipes/${state.ed.id}/photo-media`, { filename: m.filename });
    state.ed.photoUrl = r.photoUrl;
    refresh('photo');
    toast('Fotografia a fost aleasă din biblioteca media.');
  },
  photoRemove: async () => {
    await api('DELETE', `/api/admin/recipes/${state.ed.id}/photo`);
    state.ed.photoUrl = null;
    closeDialog();
    refresh('photo');
    toast('Fotografia a fost eliminată.');
  },
});

function moveStep(from, to) {
  const steps = state.ed.steps;
  if (from === to || to < 0 || to >= steps.length) return;
  const [s] = steps.splice(from, 1);
  steps.splice(to, 0, s);
  markDirty();
  refresh('steps');
}

// ---------- Evenimente ----------

document.addEventListener('submit', async e => {
  const form = e.target;
  if (form.id === 'requests-filter' || form.id === 'recipes-filter') {
    const f = Object.fromEntries(new FormData(form));
    f.q = String(f.q || '').trim();
    if (form.id === 'requests-filter') state.requests = { ...f, page: 1 }; else state.recipes = { ...f, page: 1 };
    render({ focus: false });
    return;
  }
  if (form.id === 'recipe-form') return; // salvarea se face din butoanele din panoul lateral
  if (!['request-new-form', 'request-fail-form', 'request-delete-form'].includes(form.id)) return;
  if (!validateForm(form)) return;
  const f = new FormData(form);
  try {
    await withBusy(form.querySelector('[type=submit]'), async () => {
      if (form.id === 'request-new-form') {
        const r = await api('POST', '/api/admin/requests', { email: String(f.get('email')).trim(), type: f.get('type'), note: String(f.get('note')).trim() });
        closeDialog();
        toast('Cererea a fost înregistrată.');
        go(`cereri/${r.id}`);
      } else if (form.id === 'request-fail-form') {
        await api('POST', `/api/admin/requests/${form.dataset.id}/fail`, { reason: String(f.get('reason')).trim() });
        closeDialog();
        toast('Cererea a fost marcată ca eșuată.');
        await render({ focus: false });
      } else {
        await api('POST', `/api/admin/requests/${form.dataset.id}/delete`, { confirmEmail: String(f.get('confirmEmail')).trim() });
        closeDialog();
        toast('Contul a fost șters definitiv. Cererea a fost finalizată.');
        await render({ focus: false });
      }
    }, 'Se trimite…');
  } catch (err) {
    formError(form, err);
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  // Al doilea pas al ștergerii: butonul se activează doar când emailul tastat corespunde.
  if (t.name === 'confirmEmail' && t.form?.id === 'request-delete-form') {
    t.form.querySelector('[type=submit]').disabled = t.value.trim().toLowerCase() !== t.form.dataset.email.toLowerCase();
    return;
  }
  const ed = state.ed;
  if (!ed || !t.closest('#recipe-form')) return;
  if (t.id === 'ing-search') { acRender(t.value); return; }
  if (t.dataset.step !== undefined) { ed.steps[Number(t.dataset.step)] = t.value; markDirty(); return; }
  if (t.dataset.ing !== undefined) {
    const n = Number(t.dataset.ing);
    ed.ingredients[n].grams = t.value === '' ? '' : Number(t.value);
    const f = state.cache.recipes.byId.get(ed.ingredients[n].foodId);
    const k = document.querySelector(`[data-kcal="${n}"]`);
    if (f && k) k.textContent = `${format(Math.round(f.kcal * (Number(t.value) || 0) / 100))} kcal`;
    markDirty();
    refresh('facts');
    return;
  }
  if (['name', 'description', 'mealType', 'prepMinutes', 'servings'].includes(t.name)) {
    ed[t.name] = t.value;
    if (t.name === 'name') document.getElementById('ed-title').textContent = t.value.trim() || 'Rețetă nouă';
    if (t.name === 'servings') refresh('facts');
    clearFieldError(t);
    markDirty();
  }
});

document.addEventListener('change', e => { if (e.target.id === 'recipe-photo') choosePhoto(e.target); });

// Autocompletare: tastatură și clic.
document.addEventListener('keydown', e => {
  if (e.target.id !== 'ing-search') return;
  const open = !document.getElementById('ing-options').hidden;
  if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) acRender(e.target.value); else if (ac.items.length) acActive((ac.active + 1) % ac.items.length); }
  else if (e.key === 'ArrowUp' && open && ac.items.length) { e.preventDefault(); acActive((ac.active - 1 + ac.items.length) % ac.items.length); }
  else if (e.key === 'Enter') { e.preventDefault(); if (open && ac.active >= 0) acChoose(ac.items[ac.active].id); }
  else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); acClose(); }
});
document.addEventListener('mousedown', e => { if (e.target.closest('#ing-options [role=option]')) e.preventDefault(); });
document.addEventListener('click', e => {
  const opt = e.target.closest('#ing-options [role=option]');
  if (opt) acChoose(opt.dataset.food);
  else if (!e.target.closest('.adm-ac')) acClose();
});
document.addEventListener('focusout', e => { if (e.target.id === 'ing-search') setTimeout(() => { if (!document.activeElement?.closest?.('.adm-ac')) acClose(); }, 0); });

// Reordonarea pașilor prin tragere: doar de mâner, ca textul din pas să rămână selectabil.
let dragFrom = null;
document.addEventListener('pointerdown', e => { const li = e.target.closest('#step-list .adm-drag')?.closest('.adm-step'); if (li) li.draggable = true; });
document.addEventListener('dragstart', e => {
  const li = e.target.closest?.('#step-list .adm-step');
  if (!li || !li.draggable) return;
  dragFrom = Number(li.dataset.index);
  li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragFrom));
});
const dropTarget = e => {
  const li = e.target.closest?.('#step-list .adm-step');
  if (!li || dragFrom === null) return null;
  const r = li.getBoundingClientRect();
  return { li, after: e.clientY > r.top + r.height / 2 };
};
document.addEventListener('dragover', e => {
  const t = dropTarget(e);
  if (!t) return;
  e.preventDefault();
  document.querySelectorAll('#step-list .drop-before, #step-list .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
  t.li.classList.add(t.after ? 'drop-after' : 'drop-before');
});
document.addEventListener('drop', e => {
  const t = dropTarget(e);
  if (!t) return;
  e.preventDefault();
  let to = Number(t.li.dataset.index) + (t.after ? 1 : 0);
  if (to > dragFrom) to -= 1;
  const from = dragFrom;
  dragFrom = null;
  moveStep(from, to);
});
document.addEventListener('dragend', () => {
  dragFrom = null;
  document.querySelectorAll('#step-list .adm-step').forEach(x => { x.draggable = false; x.classList.remove('dragging', 'drop-before', 'drop-after'); });
});
