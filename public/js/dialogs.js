'use strict';
// Dialoguri (fereastra modală comună) și notificări scurte (toast).

let workoutTimer = null;
let toastTimer = null;
let toastUndo = null;
let dialogOpener = null;

/** Mesaj scurt. `kind: 'error'` îl anunță imediat cititoarelor de ecran. Opțional, buton de acțiune. */
function toast(message, action, kind = 'status') {
  const n = document.getElementById('toast');
  n.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  n.classList.toggle('error', kind === 'error');
  n.innerHTML = esc(message) + (action ? ` <button type="button" data-action="toastAction">${esc(action.label)}</button>` : '');
  toastUndo = action?.run || null;
  n.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { n.classList.remove('show'); toastUndo = null; }, action ? 7000 : kind === 'error' ? 6000 : 3500);
}

const toastError = err => toast(err?.message || 'A apărut o eroare. Încearcă din nou.', null, 'error');

function hideToast() {
  clearTimeout(toastTimer);
  toastUndo = null;
  document.getElementById('toast').classList.remove('show');
}

/**
 * Deschide dialogul comun. Focusul merge pe primul câmp (sau pe titlu) și revine,
 * la închidere, pe elementul care a deschis dialogul.
 */
function modal(html, { wide = false } = {}) {
  const dialog = document.getElementById('dialog');
  const body = document.getElementById('dialog-body');
  if (!dialog.open) dialogOpener = document.activeElement;
  dialog.classList.toggle('wide', wide);
  body.innerHTML = html;
  hydrateIcons(dialog);
  prepareForms(body);
  const title = body.querySelector('h2');
  if (title) {
    title.id = 'dialog-title';
    dialog.setAttribute('aria-labelledby', 'dialog-title');
  }
  if (!dialog.open) dialog.showModal();
  const first = body.querySelector('input:not([type=hidden]):not([disabled]), select, textarea');
  if (first) first.focus();
  else if (title) { title.tabIndex = -1; title.focus(); }
}

function stopWorkoutTimer() {
  if (workoutTimer) clearInterval(workoutTimer);
  workoutTimer = null;
  ui.workoutRunning = false;
}

function closeDialog() {
  stopWorkoutTimer();
  const dialog = document.getElementById('dialog');
  if (dialog.open) dialog.close();
}

function restoreDialogFocus() {
  const target = dialogOpener;
  dialogOpener = null;
  if (target?.isConnected && typeof target.focus === 'function') target.focus();
  else document.getElementById('content')?.focus();
}

// ---------- Conținutul dialogurilor ----------

function lockedDialog(title) {
  modal(`
    <div class="success-icon">${icon('lock')}</div>
    <h2>${title}</h2>
    <p>Prima săptămână de alimentație și prima zi de antrenament sunt gratuite. Pentru restul planului, descoperă Metamorf Premium.</p>
    <button class="btn dark full" data-action="goPrices">Vezi abonamentele</button>`);
}

function recipeDialog(key, slotIndex) {
  const m = planFor(key)[slotIndex];
  const logged = slotLogged(key, slotIndex);
  const future = isFuture(key);
  modal(`
    <span class="tag">${m.type} · REȚETĂ EXEMPLU</span>
    <h2>${esc(m.name)}</h2>
    <div class="recipe-facts">
      <div><strong>${m.kcal}</strong><small>kcal aproximative</small></div>
      <div><strong>${m.min}</strong><small>minute</small></div>
      <div><strong>${m.protein} g</strong><small>proteine</small></div>
    </div>
    <h3 style="font-size:16px">Ingrediente pentru o porție</h3>
    <ul>${m.ingredients.map(v => `<li>${esc(v)}</li>`).join('')}</ul>
    <h3 style="font-size:16px">Preparare</h3>
    <p>${esc(m.instructions)}</p>
    <p>Valorile sunt demonstrative și pot varia în funcție de produse și preparare.</p>
    ${logged ? '<button class="btn lime full" disabled>Masa este deja în jurnal</button>'
      : future ? '<button class="btn dark full" disabled>Poți înregistra masa în ziua respectivă</button>'
      : `<button class="btn dark full" data-action="recipeDone" data-date="${key}" data-slot="${slotIndex}">Adaugă masa în jurnal</button>`}`);
}

function profileDialog() {
  const f = db.form;
  if (isDemo()) {
    modal(`
      <h2>Profil demo</h2>
      <p>Explorezi modul demo: exemplele și datele introduse rămân doar în acest browser și nu sunt legate de un cont.</p>
      <button class="btn dark full" data-action="goProfile">Editează profilul demo</button>
      <div class="field-row" style="margin-top:12px">
        <button class="btn outline" data-action="targets">${icon('target')}Ținte zilnice</button>
        <button class="btn danger" data-action="resetAsk">${icon('trash')}Resetează demo</button>
      </div>
      <button class="btn outline full" style="margin-top:12px" data-action="exitDemo">Ieși din demo · conectare sau cont nou</button>`);
    return;
  }
  modal(`
    <h2>Contul tău</h2>
    <div class="profile" style="color:var(--ink);border:0;margin:0">
      <span class="avatar">${esc((f.name || '·').charAt(0).toUpperCase())}</span>
      <div><strong>${esc(f.name)}</strong><small style="color:var(--muted)">${esc(session.user.email)} · ${session.subscription?.premium ? 'Premium' : 'Gratuit'}</small></div>
    </div>
    <div class="settings-list">
      <button data-action="goProfile">${icon('user')}<span>Profil și preferințe<small>${f.done ? 'Chestionar completat' : 'Chestionar necompletat'}</small></span></button>
      <button data-action="targets">${icon('target')}<span>Ținte zilnice<small>${db.targets ? `${format(db.targets.kcal)} kcal · ${format(db.targets.water)} ml apă` : 'Nesetate'}</small></span></button>
      <button data-action="healthData">${icon('heart')}<span>Date de sănătate<small>${f.healthConsent ? 'Acord dat — poți retrage oricând' : 'Fără acord, nu păstrăm alergii sau limitări'}</small></span></button>
      <button data-action="changePassword">${icon('lock')}<span>Schimbă parola</span></button>
      <a href="/api/account/export" download>${icon('upload')}<span>Exportă datele (JSON)<small>Tot ce avem despre tine, într-un fișier</small></span></a>
      ${session.user.role === 'admin' ? `<a href="/admin.html">${icon('settings')}<span>Panou de administrare<small>Statistici, utilizatori, AI, audit</small></span></a>` : ''}
      <button data-action="logout">${icon('close')}<span>Deconectare</span></button>
      <button class="danger" data-action="deleteAccountAsk">${icon('trash')}<span>Șterge contul<small>Definitiv, cu toate datele</small></span></button>
    </div>`);
}

function resetDemoDialog() {
  modal(`
    <div class="success-icon" style="background:#f8e9e5;color:#a4493b">${icon('trash')}</div>
    <h2>Resetezi modul demo?</h2>
    <p>Se șterg din acest browser profilul demo, jurnalul, apa, antrenamentele și greutățile introduse. Exemplele revin la forma inițială.</p>
    <div class="field-row">
      <button class="btn outline" data-action="close">Renunță</button>
      <button class="btn danger" data-action="resetConfirm">Da, resetează</button>
    </div>`);
}

function deleteAccountDialog() {
  modal(`
    <div class="success-icon" style="background:#f8e9e5;color:#a4493b">${icon('trash')}</div>
    <h2>Ștergi contul?</h2>
    <p>Se șterg definitiv contul, profilul, jurnalul, hidratarea, antrenamentele, greutatea și starea abonamentului. Acțiunea nu poate fi anulată. Îți recomandăm să exporți întâi datele.</p>
    <form id="delete-account-form">
      <label class="field">Confirmă cu parola<input type="password" name="password" required autocomplete="current-password"></label>
      <div class="field-row">
        <button type="button" class="btn outline" data-action="close">Renunță</button>
        <button type="submit" class="btn danger">Șterge definitiv</button>
      </div>
    </form>`);
}

function changePasswordDialog() {
  modal(`
    <h2>Schimbă parola</h2>
    <form id="password-form">
      <label class="field">Parola actuală<input type="password" name="current" required autocomplete="current-password"></label>
      <label class="field">Parola nouă<input type="password" name="next" required minlength="10" maxlength="200" autocomplete="new-password"><small>Cel puțin 10 caractere. Celelalte dispozitive vor fi deconectate.</small></label>
      <button class="btn dark full" type="submit">Salvează parola</button>
    </form>`);
}

function healthDataDialog() {
  const f = db.form;
  modal(`
    <h2>Date de sănătate</h2>
    ${f.healthConsent ? `
      <p>Ai dat acordul pentru păstrarea acestor informații:</p>
      <ul><li>Alergii / intoleranțe: ${esc(f.allergies || '—')}</li><li>Limitări fizice: ${esc(f.health || '—')}</li></ul>
      <p>Dacă retragi acordul, informațiile se șterg imediat din cont.</p>
      <button class="btn danger full" data-action="withdrawHealth">Retrage acordul și șterge datele</button>`
    : `<p>Nu ai dat acordul pentru date de sănătate, așa că nu păstrăm alergii sau limitări fizice. Le poți adăuga din chestionar (pașii 4 și 6).</p>
      <button class="btn outline full" data-action="goProfile">Deschide chestionarul</button>`}`);
}

function targetsDialog() {
  const t = db.targets || {};
  const num = (name, label, min, max, step = 1) => `<label class="field">${label}<input name="${name}" type="number" inputmode="numeric" min="${min}" max="${max}" step="${step}" value="${t[name] ?? ''}" required></label>`;
  modal(`
    <h2>Țintele tale zilnice</h2>
    <p>Setează valorile convenite, de exemplu, cu nutriționistul tău. Aplicația nu calculează și nu recomandă aceste ținte.</p>
    <form id="targets-form">
      <div class="field-row">${num('kcal', 'Calorii (kcal)', 800, 6000, 10)}${num('water', 'Apă (ml)', 500, 6000, 50)}</div>
      <div class="field-row">${num('protein', 'Proteine (g)', 10, 400)}${num('carbs', 'Carbohidrați (g)', 10, 900)}</div>
      ${num('fat', 'Grăsimi (g)', 10, 300)}
      <button class="btn dark full" type="submit">Salvează țintele</button>
      ${isDemo() ? '<button class="text-btn" type="button" data-action="targetsClear" style="margin-top:14px">Revino la valorile exemplu</button>'
        : db.targets ? '<button class="text-btn" type="button" data-action="targetsClear" style="margin-top:14px">Șterge țintele</button>' : ''}
    </form>`);
}

function entryDialog(id) {
  const e = findEntry(id);
  if (!e) return;
  const num = (name, label, max, step) => `<label class="field">${label}<input name="${name}" type="number" inputmode="decimal" min="0" max="${max}" step="${step}" value="${e[name]}" required></label>`;
  modal(`
    <h2>Editează intrarea</h2>
    <form id="entry-form" data-id="${esc(id)}">
      <label class="field">Denumire<input name="name" required maxlength="120" value="${esc(e.name)}"></label>
      <div class="field-row">${num('kcal', 'Calorii (kcal)', 5000, 1)}${num('protein', 'Proteine (g)', 500, '0.1')}</div>
      <div class="field-row">${num('carbs', 'Carbohidrați (g)', 800, '0.1')}${num('fat', 'Grăsimi (g)', 400, '0.1')}</div>
      <p>Valorile sunt pentru întreaga porție înregistrată.</p>
      <button class="btn dark full" type="submit">Salvează modificările</button>
    </form>`);
}

function weightDialog() {
  const last = sortedWeights().at(-1)?.value ?? db.form.weight;
  modal(`
    <h2>O nouă înregistrare</h2>
    <form id="weight-form">
      <label class="field">Greutate (kg)<input name="weight" type="number" inputmode="decimal" min="30" max="300" step=".1" required placeholder="${last ? esc(format(Number(last), 1)) : '70'}"></label>
      <div class="field-row">
        <label class="field">Data<input name="date" type="date" required value="${today()}" max="${today()}"></label>
        <label class="field">Ora<input name="time" type="time" required value="${clockTime()}"></label>
      </div>
      <p>Pentru comparații corecte, cântărește-te în condiții similare (de exemplu, dimineața).</p>
      <button class="btn dark full" type="submit">Înregistrează</button>
    </form>`);
}

function trainingSettingsDialog() {
  modal(`
    <h2>Mișcare în ritmul tău</h2>
    <form id="training-form">
      ${selectField('location', 'Unde te antrenezi?', OPTIONS.location)}
      ${selectField('experience', 'Nivel de experiență', OPTIONS.experience)}
      ${selectField('equipment', 'Echipament', OPTIONS.equipment)}
      <div class="field-row">${selectField('days', 'Zile pe săptămână', OPTIONS.days)}${selectField('minutes', 'Minute pe sesiune', OPTIONS.minutes)}</div>
      <p>Exercițiile afișate rămân exemple până la introducerea planurilor adaptate.</p>
      <button class="btn dark full" type="submit">Salvează</button>
    </form>`);
}

function workoutDialog() {
  stopWorkoutTimer();
  ui.seconds = 0;
  modal(`
    <span class="tag green">SESIUNE · TOT CORPUL</span>
    <h2>Un moment pentru mișcare.</h2>
    <p>Pornește, pune pe pauză și marchează sesiunea ca finalizată când termini.</p>
    <div id="timer" role="timer" aria-live="off" style="text-align:center;font-family:Manrope;font-size:55px;letter-spacing:-2px;margin:25px 0">00:00</div>
    <button class="btn outline full" id="pause-button" data-action="pauseWorkout" aria-pressed="false">Pauză</button>
    <button class="btn dark full" style="margin-top:12px" data-action="finishWorkout">Marchează sesiunea ca finalizată</button>`);
  ui.workoutRunning = true;
  workoutTimer = setInterval(() => {
    if (!ui.workoutRunning) return;
    ui.seconds++;
    const t = document.getElementById('timer');
    if (t) t.textContent = timer(ui.seconds);
  }, 1000);
}

function exerciseDialog(i) {
  const [n, r, d] = EXERCISES[i];
  modal(`
    <h2>${n}</h2>
    <span class="tag green">${r}</span>
    <p>${d}</p>
    <p>Instrucțiuni orientative. Oprește exercițiul dacă apare durere.</p>`);
}

function subscriptionDialog(period) {
  modal(`
    <span class="tag green">METAMORF PREMIUM</span>
    <h2>Abonament · ${esc(period)}</h2>
    <p>Include planul alimentar complet, toate zilele de antrenament și ${scanCount(appSettings.scanLimits.premium)} pe zi.</p>
    <p>Plățile nu sunt încă active: prețurile și procesatorul de plăți nu au fost configurate. Prețul, reînnoirea și condițiile de anulare vor fi afișate înainte de activare.</p>
    <button class="btn outline full" data-action="close">Continuă explorarea</button>`);
}

function notificationsDialog() {
  const steps = isAccount() ? firstSteps().filter(s => !s.done) : [];
  modal(`
    <h2>Notificări</h2>
    ${steps.length ? `<p>Ai ${steps.length} ${steps.length === 1 ? 'pas rămas' : 'pași rămași'} pentru a începe:</p><ul>${steps.map(s => `<li>${s.title}</li>`).join('')}</ul>`
      : '<p>Nu ai notificări noi. Mementourile (apă, mese, antrenament) vor fi disponibile într-o versiune viitoare.</p>'}
    <div class="info-strip">${icon('calendar')}Prima săptămână de exemple de mese este gratuită.</div>`);
}

function privacyDialog() {
  modal(`
    <h2>Confidențialitate</h2>
    <p><strong>Cont:</strong> datele tale (profil, jurnal, hidratare, antrenamente, greutate) sunt salvate pe serverul Metamorf și sunt accesibile doar contului tău. Parola este stocată doar sub formă de hash.</p>
    <p><strong>Date de sănătate:</strong> alergiile și limitările fizice se păstrează doar cu acordul tău explicit și se șterg când îl retragi.</p>
    <p><strong>Controlul tău:</strong> poți exporta datele și șterge contul oricând, din profil.</p>
    <p><strong>Mod demo:</strong> exemplele și ce introduci rămân doar în browser. Fotografiile nu se salvează și nu sunt trimise nicăieri.</p>
    <p>Acesta este un rezumat pentru versiunea de dezvoltare. Politica finală va fi publicată înainte de lansare.</p>`);
}

function termsDialog() {
  modal(`
    <h2>Despre serviciu</h2>
    <p>Metamorf oferă instrumente pentru jurnal alimentar, hidratare, antrenamente și progres. Exemplele de mese și exerciții sunt orientative și nu reprezintă sfat medical sau nutrițional individual.</p>
    <p>Planurile generate automat și plățile nu sunt încă active. Prețurile, facturarea, anularea, rambursarea și regulile pentru minori vor fi stabilite înainte de lansare.</p>`);
}

// ---------- Calendarul anului ----------

const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
let calendar = { year: null, activity: {}, selected: null };

const hasActivity = a => !!a && (a.meals > 0 || a.water > 0 || a.workouts > 0);

function calendarMonth(year, m) {
  const now = today();
  const offset = weekdayIndex(new Date(year, m, 1));
  const count = new Date(year, m + 1, 0).getDate();
  const cells = Array.from({ length: offset }, () => '<span class="cal-blank" aria-hidden="true"></span>');
  for (let d = 1; d <= count; d++) {
    const key = dateKey(new Date(year, m, d));
    const active = hasActivity(calendar.activity[key]);
    const cls = ['cal-day', key === now && 'today', active && 'active', key > now && 'future', key === calendar.selected && 'selected'].filter(Boolean).join(' ');
    const label = `${d} ${MONTHS[m].toLowerCase()}${key === now ? ', astăzi' : ''}${active ? ', zi cu înregistrări' : ''}`;
    cells.push(`<button class="${cls}" data-action="calDay" data-date="${key}" aria-label="${label}" aria-pressed="${key === calendar.selected}">${d}</button>`);
  }
  return `
    <section class="cal-month" aria-label="${MONTHS[m]} ${year}" ${year === new Date().getFullYear() && m === new Date().getMonth() ? 'data-current="true"' : ''}>
      <h3>${MONTHS[m]}</h3>
      <div class="cal-grid cal-head" aria-hidden="true">${WEEKDAYS.map(w => `<span>${w[0]}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
    </section>`;
}

function calendarDetails(key) {
  const date = parseKey(key);
  const a = calendar.activity[key];
  const inWeek = weekDates().some(d => dateKey(d) === key);
  let text;
  if (key > today()) text = 'Zi din viitor — nu există încă înregistrări.';
  else if (!hasActivity(a)) text = 'Nimic înregistrat în această zi.';
  else {
    const parts = [];
    if (a.meals) parts.push(`${format(a.kcal)} kcal din ${a.meals} ${a.meals === 1 ? 'înregistrare' : 'înregistrări'}`);
    if (a.water) parts.push(`${format(a.water / 1000, 2)} L apă`);
    if (a.workouts) parts.push(`${a.workouts} ${a.workouts === 1 ? 'antrenament' : 'antrenamente'}`);
    text = parts.join(' · ');
  }
  return `
    <div><strong>${longDate(date)}</strong><p>${text}</p></div>
    <div class="cal-actions">
      ${key === today() ? '<button class="btn outline small" data-view="scanner">Jurnalul de azi</button>' : ''}
      ${inWeek ? `<button class="btn dark small" data-action="calOpenDay" data-date="${key}">Vezi meniul zilei</button>` : ''}
    </div>`;
}

async function yearCalendarDialog(year = new Date().getFullYear()) {
  if (calendar.year !== year) {
    if (!document.getElementById('dialog').open) modal('<h2>Calendar</h2><div class="page-state" role="status" style="min-height:200px"><span class="spinner big" aria-hidden="true"></span><p>Se încarcă anul…</p></div>', { wide: true });
    calendar = { year, activity: await yearActivity(year), selected: calendar.selected };
  }
  if (!calendar.selected || !calendar.selected.startsWith(`${year}-`)) calendar.selected = year === new Date().getFullYear() ? today() : `${year}-01-01`;
  const activeDays = Object.values(calendar.activity).filter(hasActivity).length;
  const maxYear = new Date().getFullYear() + 1;
  modal(`
    <div class="cal-top">
      <div>
        <h2>Calendarul tău · ${year}</h2>
        <p>${activeDays ? `${activeDays} ${activeDays === 1 ? 'zi' : 'zile'} cu înregistrări în ${year}.` : `Nicio zi cu înregistrări în ${year}.`}</p>
      </div>
      <div class="cal-nav">
        <button class="icon-button" data-action="calYear" data-year="${year - 1}" aria-label="Anul ${year - 1}" ${year <= 2020 ? 'disabled' : ''}>‹</button>
        <button class="btn outline small" data-action="calYear" data-year="${new Date().getFullYear()}" ${year === new Date().getFullYear() ? 'disabled' : ''}>Anul curent</button>
        <button class="icon-button" data-action="calYear" data-year="${year + 1}" aria-label="Anul ${year + 1}" ${year >= maxYear ? 'disabled' : ''}>›</button>
      </div>
    </div>
    <div class="cal-legend"><span><i class="lg-today"></i>Astăzi</span><span><i class="lg-active"></i>Zi cu înregistrări</span><span><i class="lg-selected"></i>Selectată</span></div>
    <div class="cal-scroll" tabindex="-1"><div class="year-grid">${MONTHS.map((_, m) => calendarMonth(year, m)).join('')}</div></div>
    <div class="cal-details" id="cal-details" aria-live="polite">${calendarDetails(calendar.selected)}</div>`, { wide: true });
  // Dacă lunile nu încap, derulăm (doar zona lunilor) până la luna curentă.
  const scroller = document.querySelector('#dialog .cal-scroll');
  const current = scroller?.querySelector('.cal-month[data-current]');
  if (current && scroller.scrollHeight > scroller.clientHeight) scroller.scrollTop = current.offsetTop - 4;
}

/** Selectează o zi fără a reconstrui dialogul (focusul rămâne pe zi). */
function selectCalendarDay(key) {
  calendar.selected = key;
  document.querySelectorAll('#dialog .cal-day.selected').forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); });
  const b = document.querySelector(`#dialog .cal-day[data-date="${key}"]`);
  b?.classList.add('selected');
  b?.setAttribute('aria-pressed', 'true');
  const box = document.getElementById('cal-details');
  box.innerHTML = calendarDetails(key);
  hydrateIcons(box);
}

function profileResultDialog() {
  const e = db.form.eligibility;
  if (e === 'minor' || e === 'specialist') {
    modal(`
      <div class="success-icon">${icon('heart')}</div>
      <h2>Profilul tău a fost salvat.</h2>
      <p>${e === 'minor'
        ? 'Pentru persoanele sub 18 ani nu generăm automat un plan individual. Îți recomandăm să stabilești planul împreună cu un părinte și un specialist.'
        : 'Pentru că ai indicat alergii sau limitări, nu generăm automat un plan individual. Îți recomandăm evaluarea unui medic sau nutriționist.'}
      Poți folosi în continuare jurnalul, hidratarea și progresul.</p>
      <button class="btn dark full" data-action="backDashboard">Înapoi la panou</button>`);
    return;
  }
  modal(`
    <div class="success-icon">${icon('check')}</div>
    <h2>Profilul tău este gata.</h2>
    <p>${isAccount()
      ? 'Preferințele sunt salvate în contul tău. Planul personalizat pe 28 de zile va fi disponibil după conectarea serviciului AI; până atunci, vezi exemple potrivite tipului tău de alimentație.'
      : 'Explorează exemplele pentru tipul tău de alimentație. Datele rămân în acest browser.'}</p>
    ${dislikeTerms().length ? '<p>Mesele care conțin alimentele evitate sunt înlocuite, unde există o alternativă.</p>' : ''}
    <button class="btn dark full" data-action="resultPlan">Vezi exemplele de mese</button>`);
}
