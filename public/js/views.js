'use strict';
// Randarea paginilor. Fiecare funcție întoarce HTML pe baza `session`, `db` și `ui`.

const heading = (title, desc, action = '') => `
  <div class="page-heading">
    <div><span class="eyebrow">ÎN RITMUL TĂU</span><h1>${title}</h1><p>${desc}</p></div>
    ${action}
  </div>`;

const macroLine = e => `${format(e.protein, 1)} g proteine · ${format(e.carbs, 1)} g carbo · ${format(e.fat, 1)} g grăsimi`;

/** Text de buton cu variantă scurtă pentru telefon. */
const label = (long, short) => `<span class="lbl-long">${long}</span><span class="lbl-short" aria-hidden="true">${short}</span>`;

const mealCover = m => m.image
  ? `<img src="${m.image}" alt="${esc(m.name)}" loading="lazy">`
  : `<span>${esc(m.tagline)}</span><small>${esc(m.sub)}</small><i class="cover-icon" aria-hidden="true">${icon(m.slotIndex === 0 ? 'sparkles' : 'leaf')}</i>`;

const pageState = (iconName, title, text, action = '') => `
  <div class="page-state">
    <div class="success-icon">${icon(iconName)}</div>
    <h1>${title}</h1>
    <p>${text}</p>
    ${action}
  </div>`;

// ---------- Cadru: navigare, bară de sus, subsol ----------

function renderNav() {
  const body = document.body;
  body.classList.toggle('mode-guest', session.mode === 'guest');
  body.classList.toggle('mode-demo', isDemo());
  body.classList.toggle('mode-account', isAccount());

  document.getElementById('nav').innerHTML = Object.entries(VIEWS).map(([key, [name, ic]]) => `
    <button class="nav-item ${ui.view === key ? 'active' : ''}" data-view="${key}" ${ui.view === key ? 'aria-current="page"' : ''}>
      ${icon(ic)}<span>${name}</span>${key === 'alimentatie' ? '<span class="nav-pill">AI</span>' : ''}
    </button>`).join('');

  const tabs = [['acasa', 'Acasă', 'home'], ['alimentatie', 'Mese', 'leaf'], ['antrenamente', 'Mișcare', 'dumbbell'], ['scanner', 'Jurnal', 'scan'], ['progres', 'Progres', 'chart']];
  document.getElementById('tabbar').innerHTML = tabs.map(([key, name, ic]) => `
    <button class="${ui.view === key ? 'active' : ''}" data-view="${key}" ${ui.view === key ? 'aria-current="page"' : ''}>${icon(ic)}<span>${name}</span></button>`).join('');

  const crumbs = { chestionar: 'Profilul și preferințele', 'bun-venit': 'Bun venit', resetare: 'Resetarea parolei' };
  document.getElementById('crumb').textContent = crumbs[ui.view] || VIEWS[ui.view]?.[0] || VIEWS.acasa[0];
  const name = db.form.name || session.user?.name || '';
  document.getElementById('profile-name').textContent = name || 'Profil';
  document.getElementById('profile-sub').textContent = isAccount() ? session.user.email : 'Mod demo · date exemplu';
  document.querySelectorAll('.avatar').forEach(n => { n.textContent = (name.charAt(0) || '·').toUpperCase(); });

  const badge = document.getElementById('mode-badge');
  badge.hidden = !isDemo();
  document.getElementById('year').textContent = new Date().getFullYear();
  document.getElementById('storage-note').textContent = isAccount()
    ? 'Datele tale sunt salvate în contul Metamorf'
    : isDemo()
      ? (storageOk ? 'Mod demo · Exemplele și datele introduse rămân doar în acest browser' : 'Mod demo · Browserul nu permite salvarea; datele se pierd la reîncărcare')
      : 'Nutriție și mișcare, în ritmul tău';
}

// ---------- Bun venit, conectare, resetare ----------

function welcomePage() {
  const tab = ui.authTab;
  const offline = !session.serverAvailable;
  const tabs = `
    <div class="auth-tabs" role="tablist" aria-label="Cont">
      <button role="tab" id="tab-login" aria-selected="${tab === 'login'}" aria-controls="auth-panel" data-action="authTab" data-tab="login">Conectare</button>
      <button role="tab" id="tab-register" aria-selected="${tab === 'register'}" aria-controls="auth-panel" data-action="authTab" data-tab="register">Cont nou</button>
    </div>`;
  const forms = {
    login: `
      <form id="login-form" aria-labelledby="tab-login">
        <label class="field">Email<input type="email" name="email" required autocomplete="email" placeholder="nume@exemplu.ro"></label>
        <label class="field">Parolă<input type="password" name="password" required autocomplete="current-password"></label>
        <button class="btn dark full" type="submit">Conectează-te</button>
        <button class="text-btn forgot-link" type="button" data-action="authTab" data-tab="forgot">Ai uitat parola?</button>
      </form>`,
    register: `
      <form id="register-form" aria-labelledby="tab-register">
        <label class="field">Prenume<input name="name" required maxlength="30" autocomplete="given-name"></label>
        <label class="field">Email<input type="email" name="email" required maxlength="254" autocomplete="email" placeholder="nume@exemplu.ro"></label>
        <label class="field">Parolă<input type="password" name="password" required minlength="10" maxlength="200" autocomplete="new-password" aria-describedby="pw-hint"><small id="pw-hint">Cel puțin 10 caractere. O frază ușor de reținut e o alegere bună.</small></label>
        <label class="check-label"><input type="checkbox" name="terms" required><span>Am citit <button type="button" class="inline-link" data-action="terms">informațiile despre serviciu</button> și <button type="button" class="inline-link" data-action="privacy">confidențialitate</button>. Înțeleg că Metamorf nu oferă sfat medical.</span></label>
        <button class="btn dark full" type="submit">Creează contul</button>
      </form>`,
    forgot: `
      <form id="forgot-form">
        <h2 class="auth-title">Recuperează parola</h2>
        <p class="muted">Îți trimitem un link de resetare, valabil o oră.</p>
        <label class="field">Email<input type="email" name="email" required autocomplete="email" placeholder="nume@exemplu.ro"></label>
        <button class="btn dark full" type="submit">Trimite linkul</button>
        <button class="text-btn forgot-link" type="button" data-action="authTab" data-tab="login">Înapoi la conectare</button>
      </form>`,
  };
  return `
  <div class="welcome">
    <section class="welcome-brand">
      <img src="metamorf-logo.png" alt="metamorf" width="262" height="68">
      <h1>Nutriție și mișcare, în ritmul tău.</h1>
      <p>Jurnal alimentar, hidratare, antrenamente și progres — într-un singur loc, în contul tău.</p>
      <ul class="welcome-points">
        <li>${icon('check')}Datele tale, accesibile doar ție</li>
        <li>${icon('check')}Export și ștergere oricând</li>
        <li>${icon('check')}Începi gratuit</li>
      </ul>
    </section>
    <section class="card welcome-auth">
      ${offline ? `
        <div class="form-alert warn" role="status">Serverul Metamorf nu rulează sau nu poate fi contactat, așa că nu te poți conecta acum. Pentru conturi, pornește serverul (vezi README). Între timp, poți explora modul demo.</div>`
      : `${tab === 'forgot' ? '' : tabs}<div id="auth-panel" ${tab === 'forgot' ? '' : `role="tabpanel" aria-labelledby="tab-${tab}"`}>${forms[tab]}</div>`}
      <div class="divider"><span>sau</span></div>
      <button class="btn outline full" data-action="enterDemo">${icon('sparkles')}Explorează modul demo</button>
      <p class="muted small-print">Modul demo folosește exemple fictive, păstrate doar în acest browser. Nu creează un cont.</p>
    </section>
  </div>`;
}

function resetPage() {
  if (!ui.resetToken) return pageState('lock', 'Linkul nu este complet', 'Deschide din nou linkul primit pe email sau cere unul nou.', '<button class="btn dark" data-action="goForgot">Cere un link nou</button>');
  return `
  <div class="welcome single">
    <section class="card welcome-auth">
      <form id="reset-form">
        <h1 class="auth-title">Alege o parolă nouă</h1>
        <p class="muted">După salvare, vei fi deconectat de pe celelalte dispozitive.</p>
        <label class="field">Parola nouă<input type="password" name="password" required minlength="10" maxlength="200" autocomplete="new-password"><small>Cel puțin 10 caractere.</small></label>
        <label class="field">Repetă parola<input type="password" name="confirm" required minlength="10" maxlength="200" autocomplete="new-password"></label>
        <button class="btn dark full" type="submit">Salvează parola</button>
      </form>
    </section>
  </div>`;
}

function loadingPage() {
  return `<div class="page-state" role="status"><span class="spinner big" aria-hidden="true"></span><p>Se încarcă datele tale…</p></div>`;
}

function errorPage() {
  return pageState('info', 'Nu am putut încărca datele', esc(ui.loadError || 'Verifică conexiunea și încearcă din nou.'), '<button class="btn dark" data-action="retryLoad">Reîncearcă</button>');
}

// ---------- Panou ----------

function firstStepsCard() {
  if (!isAccount()) return '';
  const steps = firstSteps();
  const done = steps.filter(s => s.done).length;
  if (done === steps.length) return '';
  return `
  <section class="card first-steps" aria-labelledby="first-steps-title">
    <div class="card-heading"><h3 id="first-steps-title">Primii pași</h3><span class="tag green">${done} din ${steps.length}</span></div>
    <ol class="steps-list">${steps.map((s, i) => `
      <li class="${s.done ? 'done' : ''}">
        <span class="step-num" aria-hidden="true">${s.done ? icon('check') : i + 1}</span>
        <div><strong>${s.title}</strong><small>${s.done ? 'Gata' : s.desc}</small></div>
        ${s.done ? '<span class="sr-only">Finalizat</span>' : `<button class="btn outline small" ${s.action}>${s.cta}</button>`}
      </li>`).join('')}
    </ol>
  </section>`;
}

function dailyCards() {
  const t = totals(), tg = db.targets, water = getDay().water;
  const waterTarget = tg?.water || 2000;
  const glass = waterTarget / 8;
  const calorieCard = tg ? `
      <div class="calorie-layout">
        <div class="ring">
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="52"/><circle class="value" cx="60" cy="60" r="52" style="stroke-dashoffset:${327 * (1 - Math.min(t.kcal / tg.kcal, 1))}"/></svg>
          <div class="ring-label"><strong>${format(t.kcal)}</strong><small>din ${format(tg.kcal)} kcal</small></div>
        </div>
        <div class="calorie-side">
          <div><span class="metric-label">Consumate</span><span class="metric-number">${format(t.kcal)} <small>kcal</small></span></div>
          <div><span class="metric-label">${t.kcal > tg.kcal ? 'Peste ținta ta' : 'Rămase'}</span><span class="metric-number">${format(Math.abs(tg.kcal - t.kcal))} <small>kcal</small></span></div>
        </div>
      </div>
      <div class="card-foot">${icon('info')}<span>Țintă setată de tine, nu recomandare medicală</span><button class="text-btn" data-action="targets">Modifică</button></div>`
    : `
      <div class="metric-number big-number">${format(t.kcal)} <small>kcal consumate</small></div>
      <div class="empty-inline">${icon('target')}<p>Nu ai setat încă o țintă zilnică. O poți stabili împreună cu un specialist.</p><button class="btn outline small" data-action="targets">Setează ținta</button></div>`;
  return `
  <div class="dashboard-top">
    <section class="card">
      <div class="card-heading"><h3>Calorii astăzi</h3>${icon('fire')}</div>
      ${calorieCard}
    </section>
    <section class="card">
      <div class="card-heading"><h3>Macronutrienți</h3><span class="tag">Astăzi</span></div>
      ${[['Proteine', 'protein'], ['Carbohidrați', 'carbs'], ['Grăsimi', 'fat']].map(([name, key]) => `
        <div class="macro">
          <div class="macro-head"><strong>${name}</strong><span>${format(t[key], 1)} ${tg ? `<small>/ ${format(tg[key])} g</small>` : '<small>g</small>'}</span></div>
          ${tg ? `<div class="bar" role="progressbar" aria-label="${name}" aria-valuemin="0" aria-valuemax="${tg[key]}" aria-valuenow="${Math.round(t[key])}"><i style="width:${Math.min(t[key] / tg[key] * 100, 100)}%"></i></div>` : '<div class="bar" aria-hidden="true"></div>'}
        </div>`).join('')}
    </section>
    <section class="card water-card">
      <div class="card-heading"><h3>Hidratare</h3>${icon('drop')}</div>
      <div class="water-count">${format(water / 1000, 2)} <small>/ ${tg ? `${format(waterTarget / 1000, 2)} L` : 'L'}</small></div>
      <div class="water-glasses" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<span class="${i < Math.floor(water / glass) ? 'filled' : ''}">${icon('glass')}</span>`).join('')}</div>
      <div class="water-add">
        <span>${format(water)} ml înregistrați</span>
        <div class="water-buttons">
          <button data-action="waterMinus" aria-label="Scade 250 ml" ${water ? '' : 'disabled'}>${icon('minus')}</button>
          <button data-action="water" aria-label="Adaugă 250 ml">${icon('plus')} 250 ml</button>
        </div>
      </div>
    </section>
  </div>`;
}

function mealFeature() {
  if (isAccount() && planDay()) return planFeature();
  const key = today();
  const m = planFor(key)[1]; // prânzul zilei (bowl cu somon, când dieta îl permite)
  const logged = slotLogged(key, m.slotIndex);
  return `
  <article class="card meal-feature">
    <div class="meal-photo">
      ${m.image ? `<img src="${m.image}" alt="${esc(m.name)}">` : `<div class="meal-card-top">${mealCover(m)}</div>`}
      <span class="photo-label">${m.time} · ${m.slotLabel}</span>
    </div>
    <div class="meal-copy">
      <span class="eyebrow">${logged ? 'ÎNREGISTRATĂ ÎN JURNAL' : 'URMĂTOAREA TA MASĂ'}</span>
      <h3>${esc(m.name)}</h3>
      <div class="meal-meta"><span>${icon('fire')}${m.kcal} kcal</span><span>${icon('clock')}${m.min} min</span></div>
      <div class="meal-macros">${macroLine(m)}</div>
      <button class="btn outline" data-action="recipe" data-date="${key}" data-slot="${m.slotIndex}">Vezi rețeta</button>
    </div>
  </article>`;
}

function workoutCard() {
  if (isAccount() && planDay()) return planWorkoutCard();
  const done = getDay().workouts.length > 0;
  return `
  <article class="card workout-card">
    <div class="workout-top"><span class="workout-symbol">${icon('dumbbell')}</span><span class="tag">${esc(db.form.location || 'Acasă')} · ${esc(db.form.experience || 'Începător')}</span></div>
    <h3>Mișcare pentru tot corpul</h3>
    <p>${done ? 'Ai bifat mișcarea de azi. Bravo!' : 'Un pas mic. Mai multă energie pentru ziua ta.'}</p>
    <div class="workout-actions"><span>25 min · 5 exerciții</span><button class="btn dark" data-view="antrenamente">${done ? 'Vezi antrenamentul' : 'Începe sesiunea'}</button></div>
  </article>`;
}

function weekChart(week) {
  const target = db.targets?.kcal || Math.max(1, ...week.map(d => d.kcal));
  return `<div class="weekly-chart" role="img" aria-label="Calorii înregistrate în fiecare zi a săptămânii">${week.map((d, i) => `
    <div class="chart-day ${d.isToday ? 'today' : ''}" title="${WEEKDAYS_LONG[i]}: ${format(d.kcal)} kcal">
      <div class="chart-column"><i style="height:${Math.min(d.kcal / target, 1) * 100}%"></i></div>
      <small>${WEEKDAYS[i]}</small>
    </div>`).join('')}</div>`;
}

function scannerMini() {
  if (isAccount() || !appSettings.features.photoScan) return `
    <div class="scanner-mini"><div class="scan-icon">${icon('scan')}</div><div><h3>Ce ai în farfurie?</h3><p>Notează rapid ce ai mâncat.</p></div></div>
    <div class="scan-small"><span>${appSettings.features.photoScan ? 'Scanarea foto și codul de bare vin în curând' : 'Adaugă mesele manual, în câteva secunde'}</span><button class="btn outline small" data-view="scanner">Adaugă manual</button></div>`;
  const left = scansLeft();
  return `
    <div class="scanner-mini"><div class="scan-icon">${icon('scan')}</div><div><h3>Ce ai în farfurie?</h3><p>O fotografie. Un jurnal mai simplu.</p></div></div>
    <div class="scan-small"><span>${left ? `${scanCount(left)} demo ${left === 1 ? 'disponibilă' : 'disponibile'} azi` : 'Scanările demo de azi au fost folosite'}</span><button class="btn outline small" data-view="scanner">${left ? 'Scanează o masă' : 'Adaugă manual'}</button></div>`;
}

function dashboard() {
  const week = weekActivity();
  const active = week.filter(d => d.active).length;
  const greeting = db.form.name ? `Bună, ${esc(db.form.name)}. E timpul pentru tine.` : 'Bună! E timpul pentru tine.';
  return `
  ${heading(greeting, 'Echilibrul se construiește zi de zi. Hai să continuăm.', `<button class="date-pill" data-action="yearCalendar" aria-haspopup="dialog" aria-label="${longDate()}. Deschide calendarul anului">${icon('calendar')}<span class="date-long">${longDate()}</span><span class="date-short">${shortDate(new Date())}</span></button>`)}
  ${firstStepsCard()}
  <section class="hero">
    <div class="orbit"></div>
    <div class="hero-text">
      <div class="hero-tag">${icon('sparkles')}O SCHIMBARE CARE ÎNCEPE CU TINE</div>
      <h2>Obiceiuri mici.<br>O transformare pe termen lung.</h2>
      <p>Nutriție și mișcare, potrivite ritmului tău.</p>
      <button class="btn lime" data-view="chestionar">${db.form.done ? 'Actualizează preferințele' : 'Completează profilul'}</button>
    </div>
    <div class="hero-habit">
      <div class="habit-number">${active}<span>/7</span></div>
      <div>
        <strong>Zile active săptămâna aceasta</strong>
        <p>${active ? 'Săptămâna ta, pas cu pas.' : 'Prima înregistrare îți pornește săptămâna.'}</p>
        <div class="habit-days">${week.map((d, i) => `<span class="habit-day ${d.active ? 'done' : ''} ${d.isToday ? 'today' : ''}" title="${WEEKDAYS_LONG[i]}${d.active ? ' · activ' : ''}">${d.active ? icon('check') : WEEKDAYS[i][0]}</span>`).join('')}</div>
      </div>
    </div>
  </section>
  ${dailyCards()}
  ${isAccount() ? todayTasksCard() : ''}
  <div class="lower-grid">
    <div>
      <div class="section-label"><h2>În farfuria ta astăzi</h2><button class="text-btn" data-view="alimentatie">Vezi planul alimentar</button></div>
      ${mealFeature()}
    </div>
    <div>
      <div class="section-label"><h2>Mișcarea de astăzi</h2><span class="tag green">${getDay().workouts.length ? 'Finalizat azi' : isAccount() && planDay() ? 'Din planul tău' : 'Ziua 1 · Gratuit'}</span></div>
      ${workoutCard()}
    </div>
  </div>
  <div class="bottom-grid">
    <section class="card">
      <div class="card-heading"><h3>Ritmul acestei săptămâni</h3><span class="activity-summary"><strong>${active} ${active === 1 ? 'zi activă' : 'zile active'}</strong><span>din 7 zile</span></span></div>
      ${weekChart(week)}
    </section>
    <section class="card">${scannerMini()}</section>
  </div>`;
}

// ---------- Plan alimentar ----------

function mealButton(key, m) {
  if (slotLogged(key, m.slotIndex)) return `<button class="btn lime full" disabled>${label('Înregistrată în jurnal', 'În jurnal')}</button>`;
  if (isFuture(key)) return `<button class="btn dark full" disabled>${label('Disponibil în ziua respectivă', 'Mai târziu')}</button>`;
  return `<button class="btn dark full" data-action="mealDone" data-date="${key}" data-slot="${m.slotIndex}">${label('Am mâncat această masă', 'Am mâncat')}</button>`;
}

function aiNotice() {
  if (!isAccount()) return '';
  const e = db.form.eligibility;
  const reason = {
    incomplete: 'Completează chestionarul ca să pregătim planul potrivit pentru tine.',
    minor: 'Pentru persoanele sub 18 ani nu generăm automat un plan individual. Recomandăm un plan stabilit cu un părinte și un specialist.',
    specialist: 'Ai indicat alergii sau limitări. Pentru siguranța ta, nu generăm automat un plan individual — recomandăm evaluarea unui specialist.',
    eligible: 'Planul personalizat pe 28 de zile va fi disponibil după conectarea serviciului AI pe server.',
  }[e] || '';
  return `
  <div class="notice-card">
    ${icon('info')}
    <div><strong>Acestea sunt exemple generale, nu planul tău personalizat.</strong><p>${reason}</p></div>
    ${e === 'incomplete' ? '<button class="btn outline small" data-view="chestionar">Completează</button>' : ''}
  </div>`;
}

function foodPage() {
  if (isAccount() && db.plan?.plan) return planFoodPage();
  const now = today();
  const key = ui.selectedDate;
  const sel = parseKey(key);
  const plan = planFor(key);
  const terms = dislikeTerms();
  const diet = db.form.diet || 'Toate tipurile';
  return `
  ${heading(isAccount() ? 'Idei pentru mesele tale' : 'Planul tău alimentar', 'O săptămână de idei pentru mese. Începe cu ce îți place.', `<button class="btn outline" data-view="chestionar">${icon('settings')}Preferințe</button>`)}
  ${isAccount() ? planSetupCard() : aiNotice()}
  <div class="week-tabs">${[1, 2, 3, 4].map(w => `<button class="week-tab ${w === 1 ? 'active' : ''}" data-action="week" data-week="${w}" ${w === 1 ? 'aria-current="true"' : ''}>${w > 1 ? icon('lock') : icon('calendar')}Săptămâna ${w}${w === 1 ? ' · Gratuit' : ''}</button>`).join('')}</div>
  <div class="day-picker" role="group" aria-label="Alege ziua">${weekDates().map((date, i) => {
    const k = dateKey(date);
    return `<button class="day-btn ${k === key ? 'active' : ''} ${k === now ? 'today' : ''}" data-action="day" data-date="${k}" aria-pressed="${k === key}" aria-label="${WEEKDAYS_LONG[i]}, ${shortDate(date)}${k === now ? ', astăzi' : ''}">${WEEKDAYS[i]}<strong>${date.getDate()}</strong>${k === now ? 'Astăzi' : shortMonth(date)}</button>`;
  }).join('')}</div>
  <div class="section-label"><h2>Meniul pentru ${WEEKDAYS_LONG[weekdayIndex(sel)]}, ${shortDate(sel)}</h2><span class="tag green">${esc(diet)} · ${isAccount() ? 'Exemplu general' : 'Exemplu de plan'}</span></div>
  <div class="meal-list">${plan.map(m => `
    <article class="card meal-card">
      <div class="meal-card-top">${mealCover(m)}<span class="photo-label">${m.time}</span></div>
      <div class="meal-card-body">
        <span class="eyebrow">${m.type}</span>
        <h3>${esc(m.name)}</h3>
        <div class="meal-meta"><span>${icon('fire')}${m.kcal} kcal</span><span>${icon('clock')}${m.min} min</span></div>
        ${m.conflicts.length ? `<p><span class="tag warn">Conține: ${esc(m.conflicts.join(', '))}</span></p>` : ''}
        <p>${macroLine(m)}</p>
        <div class="meal-actions">
          <button class="btn outline full" data-action="recipe" data-date="${key}" data-slot="${m.slotIndex}">${label('Rețetă & ingrediente', 'Rețetă')}</button>
          ${mealButton(key, m)}
        </div>
      </div>
    </article>`).join('')}
  </div>
  ${terms.length ? `<div class="info-strip">${icon('leaf')}Am ocolit, unde a fost posibil, mesele care conțin: ${esc(db.form.dislike)}. Verifică totuși ingredientele fiecărei rețete.</div>` : ''}
  <div class="info-strip">${icon('info')}Valori aproximative, din exemple. Exemplele nu sunt verificate pentru alergeni și nu țin cont de condiții medicale.</div>
  <section class="hero" style="margin-top:24px">
    <div class="hero-text">
      <div class="hero-tag">${icon('crown')}METAMORF PREMIUM</div>
      <h2>Continuitate pentru toată luna.</h2>
      <p>Săptămânile 2–4 sunt incluse în abonament.</p>
      <button class="btn lime" data-view="abonamente">Descoperă abonamentele</button>
    </div>
    <div class="hero-habit">${icon('lock')}</div>
  </section>`;
}

// ---------- Antrenamente ----------

function workoutPage() {
  if (isAccount() && db.plan?.plan) return planWorkoutPage();
  const sessions = getDay().workouts;
  const last = sessions.at(-1);
  return `
  ${heading('Mișcare care se potrivește cu tine.', 'Un plan simplu, acasă sau la sală. Fiecare sesiune contează.', `<button class="btn outline" data-action="trainingSettings">${icon('settings')}Configurează</button>`)}
  ${isAccount() ? `<div class="notice-card">${icon('info')}<div><strong>Sesiune exemplu, aceeași pentru toți.</strong><p>Planurile adaptate obiectivului, echipamentului și timpului tău vor folosi un catalog de exerciții verificat (etapa următoare).</p></div></div>` : ''}
  <div class="week-tabs">${[1, 2, 3, 4, 5, 6, 7].map(w => `<button class="week-tab ${w === 1 ? 'active' : ''}" data-action="trainingDay" data-day="${w}" ${w === 1 ? 'aria-current="true"' : ''}>${w > 1 ? icon('lock') : icon('dumbbell')}Ziua ${w}</button>`).join('')}</div>
  <div class="two-col">
    <section class="card">
      <div class="card-heading"><h3>Sesiunea ta · Tot corpul</h3><span class="tag green">Ziua 1 gratuită</span></div>
      <div class="exercise-list">${EXERCISES.map(([n, r], i) => `
        <div class="exercise">
          <span class="exercise-num">0${i + 1}</span>
          <div><h3>${n}</h3><p>${r}</p></div>
          <button class="icon-button" data-action="exercise" data-index="${i}" aria-label="Instrucțiuni pentru ${n}">${icon('info')}</button>
        </div>`).join('')}
      </div>
    </section>
    <section class="card workout-overview">
      <span class="hero-tag">${icon('dumbbell')}${esc(db.form.location || 'Acasă').toUpperCase()} · ${esc(db.form.experience || 'Începător').toUpperCase()}</span>
      <h2>Fă loc pentru<br>mai multă energie.</h2>
      <p>${last ? `Azi: ${sessions.length} ${sessions.length === 1 ? 'sesiune înregistrată' : 'sesiuni înregistrate'} · ultima ${timer(last.seconds)} min.` : 'Pornește cronometrul și marchează sesiunea când termini.'}</p>
      <div class="workout-stats">
        <div><strong>25</strong><small>minute</small></div>
        <div><strong>5</strong><small>exerciții</small></div>
        <div><strong>${esc(db.form.days || '—')}</strong><small>zile / săptămână</small></div>
      </div>
      <button class="btn lime full" data-action="startWorkout">${last ? icon('check') : icon('play')}${last ? 'Finalizată azi · încă o sesiune' : 'Începe antrenamentul'}</button>
      <button class="btn transparent full" style="margin-top:12px" data-action="trainingSettings">Ajustează programul</button>
    </section>
  </div>
  <div class="info-strip">${icon('info')}Acesta este un exemplu, nu un antrenament adaptat limitărilor fizice. Oprește sesiunea dacă apare disconfort.</div>`;
}

// ---------- Scanner & jurnal ----------

const MANUAL_FORM = `
    <form id="manual-form">
      <label class="field">Numele alimentului<input name="name" required maxlength="70" placeholder="De exemplu, iaurt cu fructe"></label>
      <div class="field-row">
        <label class="field">Porție (g)<input name="portion" type="number" inputmode="decimal" min="1" max="5000" required value="100"></label>
        <label class="field">Calorii / 100 g<input name="kcal" type="number" inputmode="decimal" min="0" max="1000" step="any" required placeholder="120"></label>
      </div>
      <div class="field-row">
        <label class="field">Proteine / 100 g<input name="protein" type="number" inputmode="decimal" min="0" max="100" step=".1" value="0" required></label>
        <label class="field">Carbohidrați / 100 g<input name="carbs" type="number" inputmode="decimal" min="0" max="100" step=".1" value="0" required></label>
      </div>
      <label class="field">Grăsimi / 100 g<input name="fat" type="number" inputmode="decimal" min="0" max="100" step=".1" value="0" required></label>
      <p class="muted" style="font-size:12px">Valorile se găsesc pe eticheta produsului, la „valori nutriționale / 100 g”.</p>
      <button type="submit" class="btn dark full">Adaugă în jurnal</button>
    </form>`;

function scanInput() {
  if (ui.scanMode === 'manual') return MANUAL_FORM;
  if (isAccount()) {
    return ui.scanMode === 'barcode'
      ? `<div class="empty-log">${icon('scan')}<p><strong>Căutarea după cod de bare nu este încă disponibilă.</strong><br>Va folosi o bază de date nutrițională publică, cu confirmarea porției înainte de salvare.</p><button class="btn outline small" data-action="scanMode" data-mode="manual">Adaugă manual</button></div>`
      : `<div class="empty-log">${icon('camera')}<p><strong>Analiza foto nu este încă disponibilă.</strong><br>Necesită configurarea serviciului AI și acordul tău pentru prelucrarea fotografiilor. Nu încărcăm imagini până atunci.</p><button class="btn outline small" data-action="scanMode" data-mode="manual">Adaugă manual</button></div>`;
  }
  if (ui.scanMode === 'foto') return `
    <div class="scanner-zone">
      ${ui.scanImage ? `<img src="${ui.scanImage}" alt="Fotografia selectată pentru masă">` : icon('camera')}
      <h3>${ui.scanImage ? 'Fotografia ta este pregătită' : 'Ce mănânci astăzi?'}</h3>
      <p>${ui.scanImage ? esc(ui.scanFileName) : 'Încarcă o fotografie clară a mesei. Imaginea nu se salvează și nu părăsește acest dispozitiv.'}</p>
      <input type="file" id="food-file" accept="image/*" hidden>
      <button class="btn dark" data-action="upload">${icon('upload')}${ui.scanImage ? 'Schimbă fotografia' : 'Alege o fotografie'}</button>
    </div>
    <button class="btn lime full" style="margin-top:18px" data-action="demoScan" ${ui.scanImage ? '' : 'disabled'}>Vezi un rezultat demonstrativ</button>
    <p style="font-size:12px;color:var(--muted)">Demo: fotografia nu este analizată de AI. Rezultatul afișat este un exemplu fix.</p>`;
  return `
    <form id="barcode-form">
      <label class="field">Codul de bare<input name="barcode" inputmode="numeric" pattern="[0-9]{8}|[0-9]{12,14}" data-pattern-message="Codul are 8, 12, 13 sau 14 cifre." required placeholder="Introdu 8, 12, 13 sau 14 cifre"><small>Căutarea reală va utiliza o bază de date nutrițională.</small></label>
      <button class="btn dark" type="submit">Vezi un produs demonstrativ</button>
      <p style="font-size:12px;color:var(--muted)">Codul nu este căutat online în modul demo.</p>
    </form>`;
}

function journalRows(key = today()) {
  const log = getDay(key).log;
  if (!log.length) return `
    <div class="empty-log">${icon('leaf')}<p>Nimic înregistrat încă azi.<br>Adaugă un aliment manual sau o masă din exemple.</p>
      <button class="btn outline small" data-view="alimentatie">Vezi exemplele de mese</button></div>`;
  const marks = { plan: 'din plan', example: 'din exemple', scan: 'exemplu scanner' };
  return log.map(e => `
    <div class="food-log">
      <div>
        <h4>${esc(e.name)}</h4>
        <small>${e.time ? `${esc(e.time)} · ` : ''}${macroLine(e)}${marks[e.source] ? `<span class="mark">${marks[e.source]}</span>` : ''}</small>
      </div>
      <div class="log-side">
        <strong>${format(e.kcal)} kcal</strong>
        <button class="icon-button" data-action="editEntry" data-id="${esc(e.id)}" aria-label="Editează ${esc(e.name)}">${icon('edit')}</button>
        <button class="icon-button danger" data-action="deleteEntry" data-id="${esc(e.id)}" aria-label="Șterge ${esc(e.name)}">${icon('trash')}</button>
      </div>
    </div>`).join('');
}

function scannerPage() {
  const r = ui.scanResult;
  // Scanarea foto / cod de bare poate fi oprită de echipă din setări: rămâne doar introducerea manuală.
  const modes = !appSettings.features.photoScan ? [['manual', 'Manual']]
    : isAccount() ? [['manual', 'Manual'], ['barcode', 'Cod de bare'], ['foto', 'Fotografie']] : [['foto', 'Fotografie'], ['barcode', 'Cod de bare'], ['manual', 'Manual']];
  if (!modes.some(([v]) => v === ui.scanMode)) ui.scanMode = 'manual';
  return `
  ${heading('Farfuria ta, mai ușor de înțeles.', 'Fotografie, cod de bare sau introducere manuală. Tu alegi.')}
  <div class="two-col">
    <section class="card">
      <div class="scan-modes" role="group" aria-label="Mod de adăugare">${modes.map(([v, n]) => `<button class="${ui.scanMode === v ? 'active' : ''}" aria-pressed="${ui.scanMode === v}" data-action="scanMode" data-mode="${v}">${n}</button>`).join('')}</div>
      ${scanInput()}
      ${r ? `
      <div class="scan-result">
        <span class="eyebrow">REZULTAT DEMONSTRATIV</span>
        <h3>${esc(r.name)}</h3>
        <div class="result-kcal">${r.kcal} <small style="font-size:14px">kcal</small></div>
        <p>Porție exemplu · ${macroLine(r)}</p>
        <button class="btn dark full" data-action="saveScan">Înregistrează exemplul în jurnal</button>
      </div>` : ''}
    </section>
    <section class="card">
      <div class="card-heading"><h3>Jurnalul de astăzi</h3><span class="tag">${format(totals().kcal)} kcal</span></div>
      ${journalRows()}
      ${isDemo() && appSettings.features.photoScan ? `<div class="info-strip" style="margin-top:22px">${icon('scan')}${scansLeft() ? `${scanCount(appSettings.scanLimits.free)} demo / zi.` : 'Scanările demo de azi au fost folosite.'} Premium include ${scanCount(appSettings.scanLimits.premium)} pe zi.</div>` : ''}
      <button class="btn outline full" style="margin-top:16px" data-view="abonamente">Vezi accesul Premium</button>
    </section>
  </div>`;
}

// ---------- Progres ----------

const weightLabel = w => `${shortDate(parseKey(w.date))}${w.time ? `, ${w.time}` : ''}`;

function weightGraph(list) {
  if (!list.length) return `<div class="empty">${icon('chart')}<p>Încă nu ai înregistrat greutatea. Prima valoare va apărea aici.</p><button class="btn outline small" data-action="addWeight">Notează greutatea</button></div>`;
  const vals = list.map(w => w.value);
  const min = Math.min(...vals) - .5, max = Math.max(...vals) + .5;
  const x = i => list.length === 1 ? 360 : 20 + i * 680 / (list.length - 1);
  const pts = vals.map((v, i) => [x(i), 180 - (v - min) / (max - min) * 150]);
  const line = `M${pts.map(p => p.join(',')).join(' L')}`;
  const step = Math.max(1, Math.ceil((list.length - 1) / 6));
  const labelIdx = list.map((_, i) => i).filter(i => i % step === 0 || i === list.length - 1);
  return `
  <svg class="line-chart" viewBox="0 0 720 205" role="img" aria-label="Graficul greutății: de la ${format(vals[0], 1)} la ${format(vals.at(-1), 1)} kilograme, ${list.length} înregistrări" preserveAspectRatio="none">
    <defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#c7dcaa" stop-opacity=".5"/><stop offset="1" stop-color="#c7dcaa" stop-opacity="0"/></linearGradient></defs>
    ${[40, 90, 140, 190].map(y => `<path d="M20 ${y}H700" stroke="#e9eee4" stroke-dasharray="4 5" fill="none"/>`).join('')}
    ${list.length > 1 ? `<path d="${line} L700 190 L20 190 Z" fill="url(#area)"/><path d="${line}" fill="none" stroke="#406349" stroke-width="3" vector-effect="non-scaling-stroke"/>` : ''}
    ${pts.map(([cx, cy], i) => `<circle cx="${cx}" cy="${cy}" r="4" fill="${list[i].demo ? '#fff' : '#406349'}" stroke="#406349" stroke-width="2"><title>${weightLabel(list[i])}: ${format(list[i].value, 1)} kg${list[i].demo ? ' (exemplu)' : ''}</title></circle>`).join('')}
  </svg>
  <div class="chart-legend">${labelIdx.map(i => `<span>${shortDate(parseKey(list[i].date))}</span>`).join('')}</div>`;
}

function progressPage() {
  const list = sortedWeights();
  const current = list.at(-1)?.value, start = list[0]?.value;
  const demo = hasDemoWeights();
  const sessions = workoutCount(30);
  return `
  ${heading('Progresul are mai multe forme.', 'Privește evoluția în timp. Nu doar un număr de pe cântar.', `<button class="btn dark" data-action="addWeight" aria-label="Înregistrează greutatea">${icon('plus')}${label('Înregistrează greutatea', 'Adaugă')}</button>`)}
  <div class="progress-hero">
    <section class="card">
      <span class="metric-label">Greutate înregistrată</span>
      <div class="large-metric">${list.length ? format(current, 1) : '—'} <small>kg</small></div>
      <span class="tag">${list.length ? `Ultima: ${weightLabel(list.at(-1))}` : 'Nicio înregistrare'}</span>
    </section>
    <section class="card">
      <span class="metric-label">Schimbare în această perioadă</span>
      <div class="large-metric">${list.length > 1 ? `${current - start > 0 ? '+' : ''}${format(current - start, 1)}` : '—'} <small>kg</small></div>
      <span class="metric-label">${list.length > 1 ? `Față de ${format(start, 1)} kg la ${shortDate(parseKey(list[0].date))}` : 'Adaugă cel puțin două valori'}</span>
    </section>
    <section class="card">
      <span class="metric-label">Sesiuni de mișcare</span>
      <div class="large-metric">${sessions} <small>${sessions === 1 ? 'sesiune' : 'sesiuni'}</small></div>
      <span class="tag green">În ultimele 30 de zile</span>
    </section>
  </div>
  <section class="card">
    <div class="card-heading"><h3>Evoluția greutății</h3><span class="tag">${demo ? 'Include date exemplu (puncte goale)' : 'Înregistrările tale'}</span></div>
    ${weightGraph(list)}
  </section>
  <div class="bottom-grid">
    <section class="card">
      <div class="card-heading"><h3>Înregistrări recente</h3><span class="tag">kg</span></div>
      ${list.length ? list.slice(-5).reverse().map(w => `
        <div class="food-log">
          <div><h4>${weightLabel(w)}</h4><small>${w.demo ? '<span class="mark" style="margin:0">exemplu</span>' : 'Înregistrarea ta'}</small></div>
          <div class="log-side">
            <strong>${format(w.value, 1)} kg</strong>
            <button class="icon-button danger" data-action="deleteWeight" data-id="${esc(w.id)}" aria-label="Șterge greutatea din ${weightLabel(w)}">${icon('trash')}</button>
          </div>
        </div>`).join('') : `<div class="empty-log"><p>Nicio înregistrare încă.</p></div>`}
      ${demo ? `<div class="actions-row"><button class="btn outline small" data-action="clearDemoWeights">Șterge datele exemplu</button></div>` : ''}
    </section>
    <section class="card">
      <div class="card-heading"><h3>Fotografii de progres</h3>${icon('camera')}</div>
      <div class="empty">${icon('lock')}<p>Fotografiile de progres vor fi disponibile după implementarea stocării private, a controlului de acces și a ștergerii.</p></div>
    </section>
  </div>`;
}

// ---------- Abonamente ----------

function pricesPage() {
  const plans = [['1 lună', 'Flexibilitate, lună de lună.'], ['3 luni', 'Timp să construiești o rutină.'], ['6 luni', 'Un angajament pentru tine.']];
  const perks = ['Plan alimentar pentru 4 săptămâni', 'Acces la toate zilele de antrenament', `${scanCount(appSettings.scanLimits.premium)} de mese pe zi`, 'Jurnal alimentar și progres'];
  const sub = session.subscription;
  return `
  ${heading('Mai multă continuitate. Mai mult pentru tine.', 'Alege perioada potrivită. Acces complet la alimentație și mișcare.')}
  ${isAccount() ? `<div class="notice-card">${icon('crown')}<div><strong>Planul tău: ${sub?.premium ? 'Premium' : 'Gratuit'}</strong><p>${sub?.premium ? `Activ până la ${new Date(sub.currentPeriodEnd).toLocaleDateString('ro-RO')}.` : 'Ai acces la săptămâna 1 de mese, ziua 1 de antrenament și jurnal.'}</p></div></div>` : ''}
  <div class="price-grid">${plans.map(([title, desc], i) => `
    <section class="card price-card ${i === 1 ? 'featured' : ''}">
      ${i === 1 ? '<span class="floating-label">Pentru o rutină constantă</span>' : ''}
      <span class="eyebrow">METAMORF PREMIUM</span>
      <h2>${title}</h2>
      <p style="font-size:14px;color:var(--muted)">${desc}</p>
      <div class="price">În curând<small>Prețul va fi anunțat înainte de lansare</small></div>
      <ul>${perks.map(s => `<li>${icon('check')}${s}</li>`).join('')}</ul>
      <button class="btn ${i === 1 ? 'dark' : 'outline'} full" data-action="subscription" data-period="${title}">Vezi detaliile</button>
    </section>`).join('')}
  </div>
  <section class="card" style="margin-top:30px">
    <div class="card-heading"><h3>Începe gratuit. Continuă când ești pregătit.</h3>${icon('heart')}</div>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Serviciu</th><th scope="col">Acces gratuit</th><th scope="col">Premium</th></tr></thead>
      <tbody>
        <tr><td>Plan alimentar</td><td>Săptămâna 1</td><td>Săptămânile 1–4</td></tr>
        <tr><td>Antrenamente</td><td>Ziua 1</td><td>Toate zilele</td></tr>
        <tr><td>Scanner alimentar</td><td>${scanCount(appSettings.scanLimits.free)} / zi</td><td>${scanCount(appSettings.scanLimits.premium)} / zi</td></tr>
      </tbody>
    </table></div>
  </section>
  <div class="info-strip">${icon('info')}Plățile nu sunt încă active. Nu se efectuează nicio plată în această versiune.</div>`;
}

// ---------- Chestionar (6 pași) ----------

const QUESTION_STEPS = 6;
const option = (values, value, placeholder) => (placeholder ? `<option value="">${placeholder}</option>` : '')
  + values.map(v => `<option ${String(v) === String(value) ? 'selected' : ''}>${v}</option>`).join('');
const field = (name, label, type = 'text', extra = '', hint = '') => `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(db.form[name])}" ${extra}>${hint ? `<small>${hint}</small>` : ''}</label>`;
const selectField = (name, label, values, required = true) => `<label class="field">${label}<select name="${name}" ${required ? 'required' : ''}>${option(values, db.form[name], db.form[name] === '' ? 'Alege…' : '')}</select></label>`;

const HEALTH_CONSENT = f => `
  <label class="check-label consent-box"><input type="checkbox" name="healthConsent" ${f.healthConsent ? 'checked' : ''}><span><strong>Acord pentru date de sănătate.</strong> Sunt de acord ca Metamorf să păstreze alergiile, intoleranțele și limitările pe care le indic, doar pentru a adapta exemplele și a stabili dacă e nevoie de un specialist. Pot retrage acordul oricând din profil; informațiile se șterg atunci.</span></label>`;

function questionStep() {
  const f = db.form;
  switch (ui.step) {
    case 1: return `
      <h2>Să facem cunoștință.</h2><p>Datele de bază ne ajută să alegem exemplele potrivite.</p>
      ${field('name', 'Prenume', 'text', 'required maxlength="30" autocomplete="given-name"')}
      <div class="field-row">${field('age', 'Vârstă', 'number', 'required min="13" max="100" step="1" inputmode="numeric"')}${selectField('gender', 'Sex', OPTIONS.gender)}</div>
      <div class="field-row">${field('height', 'Înălțime (cm)', 'number', 'required min="100" max="230" step="1" inputmode="numeric"')}${field('weight', 'Greutate (kg)', 'number', 'required min="30" max="300" step=".1" inputmode="decimal"')}</div>`;
    case 2: return `
      <h2>Ce îți dorești pentru tine?</h2><p>Alege obiectivul principal. Îl poți schimba oricând.</p>
      <fieldset class="choice-fieldset"><legend class="sr-only">Obiectiv</legend>
      <div class="choice-grid">${[['Echilibru', 'Obiceiuri sănătoase'], ['Slăbire', 'O evoluție treptată'], ['Masă musculară', 'Mișcare și nutriție']].map(([v, d]) => `<label class="choice"><input type="radio" name="goal" value="${v}" required ${v === f.goal ? 'checked' : ''}><strong>${v}</strong><small>${d}</small></label>`).join('')}</div>
      </fieldset>
      <div style="margin-top:24px">${selectField('activity', 'Nivel de activitate zilnică', OPTIONS.activity)}</div>
      ${Number(f.age) < 18 ? `<div class="info-strip">${icon('info')}Pentru persoanele sub 18 ani, aplicația oferă doar exemple de obiceiuri sănătoase. Un plan individual necesită implicarea unui părinte și a unui specialist.</div>` : ''}`;
    case 3: return `
      <h2>Mese pe gustul tău.</h2><p>Preferințele adaptează exemplele de mese.</p>
      ${selectField('diet', 'Tipul de alimentație', OPTIONS.diet)}
      ${field('likes', 'Alimente preferate', 'text', 'maxlength="200" placeholder="De exemplu: pește, linte, fructe de pădure"', 'Opțional. Separă prin virgulă.')}
      ${field('dislike', 'Alimente pe care le eviți', 'text', 'maxlength="200" placeholder="De exemplu: ciuperci, ton"', 'Opțional. Le ocolim în exemple, unde există alternative.')}`;
    case 4: return `
      <h2>Alergii și intoleranțe</h2><p>Sunt date de sănătate, așa că le păstrăm doar cu acordul tău explicit.</p>
      ${HEALTH_CONSENT(f)}
      ${field('allergies', 'Alergii sau intoleranțe', 'text', 'maxlength="200" placeholder="Lasă gol dacă nu se aplică"', 'Dacă indici alergii, aplicația nu va genera automat un plan individual; recomandăm un specialist.')}
      <div class="info-strip">${icon('info')}Exemplele de mese nu sunt verificate pentru alergeni.</div>`;
    case 5: return `
      <h2>Mișcare în ritmul tău.</h2><p>Unde te antrenezi și cât timp ai.</p>
      <div class="field-row">${selectField('location', 'Locație', OPTIONS.location)}${selectField('experience', 'Experiență', OPTIONS.experience)}</div>
      ${selectField('equipment', 'Echipament disponibil', OPTIONS.equipment)}
      <div class="field-row">${selectField('days', 'Zile pe săptămână', OPTIONS.days)}${selectField('minutes', 'Minute pe sesiune', OPTIONS.minutes)}</div>`;
    default: return `
      <h2>Limitări fizice</h2><p>Spune-ne dacă e ceva de care trebuie să ținem cont.</p>
      ${f.healthConsent ? '' : HEALTH_CONSENT(f)}
      ${field('health', 'Limitări fizice sau condiții relevante', 'text', 'maxlength="300" placeholder="Opțional, de exemplu: dureri de genunchi"', 'Dacă indici limitări, nu generăm automat un plan individual.')}
      <label class="check-label"><input type="checkbox" name="ack" required><span>Înțeleg că Metamorf oferă exemple orientative, care nu înlocuiesc sfatul unui medic sau nutriționist.</span></label>`;
  }
}

function questionnaire() {
  return `
  <div class="onboarding-wrap">
    ${heading('Planul începe cu tine.', isAccount() ? 'Răspunsurile se salvează în contul tău la fiecare pas.' : 'Modul demo: răspunsurile rămân doar în acest browser.')}
    <div class="step-trail" role="progressbar" aria-label="Progres chestionar" aria-valuemin="1" aria-valuemax="${QUESTION_STEPS}" aria-valuenow="${ui.step}">${Array.from({ length: QUESTION_STEPS }, (_, i) => `<i class="${i < ui.step ? 'done' : ''}"></i>`).join('')}</div>
    <form class="card form-card" id="profile-form">
      <span class="eyebrow">PASUL ${ui.step} DIN ${QUESTION_STEPS}</span>
      ${questionStep()}
      <div class="form-actions">
        ${ui.step > 1 ? '<button type="button" class="btn outline" data-action="previousStep">Înapoi</button>' : '<button type="button" class="text-btn" data-view="acasa">Înapoi la panou</button>'}
        <button type="submit" class="btn dark">${ui.step === QUESTION_STEPS ? 'Finalizează' : 'Salvează și continuă'}</button>
      </div>
    </form>
  </div>`;
}

// ---------- Randare ----------

const PAGES = {
  acasa: dashboard, alimentatie: foodPage, antrenamente: workoutPage, scanner: scannerPage,
  progres: progressPage, abonamente: pricesPage, chestionar: questionnaire,
  'bun-venit': welcomePage, resetare: resetPage, incarcare: loadingPage, eroare: errorPage,
};
const GUEST_PAGES = ['bun-venit', 'resetare', 'incarcare', 'eroare'];

function render() {
  renderNav();
  const el = document.getElementById('content');
  el.innerHTML = `<div class="fade-in">${PAGES[ui.view]()}</div>`;
  hydrateIcons(el);
  prepareForms(el);
}

function refresh() {
  render();
  document.querySelector('#content > .fade-in')?.classList.remove('fade-in');
}

/** Navighează la o secțiune. Acceptă și forme ca 'resetare/TOKEN'. */
function navigate(target, { focus = true } = {}) {
  let [view, ...rest] = String(target || '').split('/');
  if (view === 'resetare') {
    if (rest.length) {
      ui.resetToken = rest.join('/');
      history.replaceState(null, '', '#resetare'); // tokenul nu rămâne în istoric
    }
  } else if (session.mode === 'guest') {
    if (!GUEST_PAGES.includes(view)) view = 'bun-venit';
  } else if (!PAGES[view] || GUEST_PAGES.includes(view)) {
    view = 'acasa';
  }
  ui.view = view;
  if (location.hash.slice(1) !== view && view !== 'incarcare' && view !== 'eroare') location.hash = view;
  closeMenu();
  if (!weekDates().some(d => dateKey(d) === ui.selectedDate)) ui.selectedDate = today();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  // La schimbarea paginii mutăm focusul pe titlu, ca cititoarele de ecran să anunțe pagina nouă.
  if (focus) {
    const h1 = document.querySelector('#content h1');
    if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
  }
}
