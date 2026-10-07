'use strict';
// Panoul de administrare. Toate datele vin din /api/admin/*, unde serverul verifică rolul de administrator
// și înregistrează acțiunile în jurnalul de audit. Panoul nu primește date de sănătate sau parole.

// Bara laterală, pe grupuri. `roles`: cine vede secțiunea (elementele inaccesibile sunt ascunse, nu dezactivate).
const ROLE_LABEL = { admin: 'Administrator', editor: 'Editor', support: 'Suport' };
const EDITOR = ['admin', 'editor'], SUPPORT = ['admin', 'support'];
const NAV = [
  [null, [['prezentare', 'Panou', 'home', ['admin', 'editor', 'support']]]],
  ['Conținut', [['retete', 'Rețete', 'leaf', EDITOR], ['exercitii', 'Exerciții', 'dumbbell', EDITOR], ['catalog', 'Catalog nutrițional', 'chart', EDITOR], ['media', 'Media', 'camera', EDITOR]]],
  ['Suport', [['utilizatori', 'Utilizatori', 'user', SUPPORT], ['cereri', 'Cereri date', 'upload', SUPPORT]]],
  ['Facturare', [['abonamente', 'Abonamente', 'crown'], ['plati', 'Evenimente plată', 'chart']]],
  ['Sistem', [['ai', 'Utilizare AI', 'sparkles'], ['audit', 'Jurnal audit', 'lock'], ['administratori', 'Administratori', 'user'], ['setari', 'Setări', 'settings']]],
];
const isAdmin = () => state.me?.role === 'admin';
const SECTIONS = Object.fromEntries(NAV.flatMap(([, items]) => items.map(([k, name, ic, roles = ['admin']]) => [k, [name, ic, roles]])));
const canSee = section => SECTIONS[section]?.[2].includes(state.me?.role);
/** Secțiunile cu pagină de detalii: `#secțiune/id`. */
const DETAIL = { utilizatori: /^\d+$/, cereri: /^\d+$/, retete: /^(\d+|nou)$/, exercitii: /^[a-z0-9_]{1,40}$/ };
/** Setat de editoare: întoarce true dacă navigarea a fost oprită (de ex. modificări nesalvate). */
let leaveGuard = null;

const ELIGIBILITY = {
  eligible: 'Eligibili pentru plan automat',
  incomplete: 'Chestionar necompletat',
  specialist: 'Alergii sau limitări (specialist)',
  minor: 'Sub 18 ani',
};

const AUDIT_ACTIONS = {
  view_user: 'A deschis detaliile contului',
  export_user: 'A exportat datele contului',
  logout_user: 'A deconectat contul de pe toate dispozitivele',
  send_reset_link: 'A trimis link de resetare a parolei',
  delete_user: 'A șters contul',
  grant_admin: 'A acordat rolul de administrator',
  revoke_admin: 'A retras rolul de administrator',
  admin_login: 'S-a conectat în panou',
  grant_premium: 'A acordat Premium manual',
  health_access: 'A accesat datele de sănătate',
  enable_2fa: 'A activat autentificarea în doi pași',
  reset_2fa: 'A resetat autentificarea în doi pași (din terminal)',
  create_data_request: 'A înregistrat o cerere de date',
  start_data_request: 'A preluat o cerere de date',
  fail_data_request: 'A marcat o cerere de date ca eșuată',
  create_recipe: 'A creat o rețetă (ciornă)',
  publish_recipe: 'A publicat o rețetă',
  unpublish_recipe: 'A retras publicarea unei rețete',
  update_recipe: 'A modificat o rețetă',
  duplicate_recipe: 'A duplicat o rețetă',
  delete_recipe: 'A șters o rețetă',
  create_exercise: 'A creat un exercițiu (ciornă)',
  publish_exercise: 'A publicat un exercițiu',
  unpublish_exercise: 'A retras publicarea unui exercițiu',
  update_exercise: 'A modificat un exercițiu',
  delete_exercise: 'A șters un exercițiu',
  create_food: 'A adăugat un aliment manual',
  update_food: 'A modificat un aliment manual',
  import_foods: 'A importat alimente în catalog',
  invite_staff: 'A invitat o persoană în echipă',
  resend_staff_invite: 'A retrimis invitația în echipă',
  change_staff_role: 'A schimbat rolul unei persoane din echipă',
  disable_staff: 'A dezactivat un cont de echipă',
  enable_staff: 'A reactivat un cont de echipă',
  update_settings: 'A modificat setările aplicației',
  upload_media: 'A încărcat un fișier media',
  update_media: 'A modificat sursa / licența unui fișier',
  delete_media: 'A șters un fișier media',
};

const state = { section: 'prezentare', period: 'month', users: { q: '', plan: 'all', elig: 'all', from: '', to: '', page: 1 }, id: null, health: {}, me: null, cache: {} };
let dialogOpener = null;
let toastTimer = null;

// ---------- Utilitare ----------

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'X-Metamorf': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Nu se poate contacta serverul.'), { status: 0 });
  }
  const data = await res.json().catch(() => null);
  // Răspuns care nu vine de la serverul Metamorf (de ex. pagină deschisă prin Live Server) sau server vechi.
  if (!res.ok && !data) {
    throw Object.assign(new Error('Panoul trebuie deschis prin serverul Metamorf: pornește-l cu „npm start” și intră la http://localhost:3000/admin.html (nu prin Live Server).'), { status: res.status, fields: {} });
  }
  if (res.status === 404 && data?.error?.code === 'not_found' && path.startsWith('/api/admin/')) {
    throw Object.assign(new Error('Serverul rulează o versiune mai veche, fără această funcție. Repornește-l: Ctrl + C în terminal, apoi „npm start”.'), { status: 404, fields: {} });
  }
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || 'A apărut o eroare.'), { status: res.status, code: data?.error?.code, fields: data?.error?.fields || {} });
  return data;
}

const dt = iso => (iso ? new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—');
const d = iso => (iso ? new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—');
const usd = n => (n === null || n === undefined ? '—' : `$${format(n, 2)}`);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function toast(message, kind = 'status') {
  const n = document.getElementById('toast');
  n.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  n.classList.toggle('error', kind === 'error');
  n.textContent = message;
  n.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.classList.remove('show'), 4000);
}

function modal(html) {
  const dialog = document.getElementById('dialog');
  if (!dialog.open) dialogOpener = document.activeElement;
  document.getElementById('dialog-body').innerHTML = html;
  hydrateIcons(dialog);
  const title = dialog.querySelector('h2');
  if (title) title.id = 'dialog-title';
  if (!dialog.open) dialog.showModal();
  const first = dialog.querySelector('#dialog-body input');
  if (first) first.focus(); else if (title) { title.tabIndex = -1; title.focus(); }
}

function closeDialog() {
  const dialog = document.getElementById('dialog');
  if (dialog.open) dialog.close();
}

const subTag = s => (s.premium
  ? `<span class="tag green">Premium${s.currentPeriodEnd ? ` · până la ${d(s.currentPeriodEnd)}` : ''}</span>`
  : `<span class="tag">Gratuit${s.status !== 'none' ? ` · ${esc(s.status)}` : ''}</span>`);

const pageHead = (title, desc, action = '') => `
  <div class="page-heading"><div><span class="eyebrow">ADMINISTRARE</span><h1 tabindex="-1">${title}</h1><p>${desc}</p></div>${action}</div>`;

const errorState = err => `<div class="page-state"><div class="success-icon">${icon('info')}</div><h1>Nu am putut încărca datele</h1><p>${esc(err.message)}</p><button class="btn dark" data-action="reload">Reîncearcă</button></div>`;

function pager(page, pageSize, total, action) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1) return '';
  return `<div class="adm-pager">
    <button class="btn outline small" data-action="${action}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Înapoi</button>
    <span>Pagina ${page} din ${pages}</span>
    <button class="btn outline small" data-action="${action}" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Înainte</button>
  </div>`;
}

// ---------- Prezentare generală ----------

function tile(label, value, sub = '') {
  return `<section class="card adm-tile"><span class="metric-label">${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</section>`;
}

/**
 * Grafic cu bare, o singură serie: capete rotunjite (4px) ancorate pe linia de bază, 2px între bare,
 * grilă discretă, detalii la trecerea cursorului / focus și tabel cu aceleași date.
 */
function barChart(buckets, { aria, unit = ['cont nou', 'conturi noi'], labelEvery = 1, width = 720 }) {
  const W = width, H = 200, padL = 30, padB = 24, padT = 10;
  const max = Math.max(1, ...buckets.map(b => b.count));
  const step = max <= 5 ? 1 : Math.ceil(max / 4);
  const top = Math.ceil(max / step) * step;
  const plotW = W - padL - 6, plotH = H - padB - padT;
  const slot = plotW / buckets.length;
  const barW = Math.max(3, Math.min(48, slot - 2));
  const y = v => padT + plotH - (v / top) * plotH;
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const bars = buckets.map((b, i) => {
    const x = padL + i * slot + (slot - barW) / 2;
    const h = (b.count / top) * plotH;
    const label = `${b.label}: ${b.count} ${b.count === 1 ? unit[0] : unit[1]}`;
    const r = Math.min(4, h / 2, barW / 2);
    const path = h > 0
      ? `M${x},${y(0)} V${y(b.count) + r} Q${x},${y(b.count)} ${x + r},${y(b.count)} H${x + barW - r} Q${x + barW},${y(b.count)} ${x + barW},${y(b.count) + r} V${y(0)} Z`
      : '';
    return `<g class="adm-bar" data-tip="${esc(label)}" tabindex="0" role="img" aria-label="${esc(label)}">
      <rect x="${padL + i * slot}" y="${padT}" width="${slot}" height="${plotH}" fill="transparent"/>${path ? `<path d="${path}"/>` : ''}</g>`;
  }).join('');
  const last = buckets.length - 1;
  // Etichete la fiecare `labelEvery` bare, plus ultima; o etichetă prea apropiată de ultima e omisă.
  const xLabels = buckets.map((b, i) => (i === last || (i % labelEvery === 0 && last - i >= Math.max(2, labelEvery / 2)))
    ? `<text x="${padL + i * slot + slot / 2}" y="${H - 6}" text-anchor="middle">${esc(b.short || b.label)}</text>` : '').join('');
  return `
  <svg class="adm-chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(aria)}">
    ${ticks.map(t => `<line x1="${padL}" x2="${W - 6}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? 'base' : 'grid'}"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
    ${bars}${xLabels}
  </svg>
  <details class="adm-table-toggle"><summary>Vezi datele ca tabel</summary>
    <div class="table-wrap"><table><thead><tr><th scope="col">Perioada</th><th scope="col" class="num">${esc(unit[1][0].toUpperCase() + unit[1].slice(1))}</th></tr></thead>
    <tbody>${buckets.map(b => `<tr><td>${esc(b.label)}</td><td class="num">${b.count}</td></tr>`).join('')}</tbody></table></div>
  </details>`;
}

/** Cadru de grafic fără date (de ex. venituri înainte de integrarea plăților): axe + mesaj, fără bare inventate. */
function emptyChart(labels, message, width = 720) {
  const W = width, H = 200, padL = 30, padB = 24, padT = 10;
  const slot = (W - padL - 6) / labels.length;
  return `
  <div class="adm-chart-empty">
    <svg class="adm-chart" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      ${[0, 1, 2, 3].map(i => `<line x1="${padL}" x2="${W - 6}" y1="${padT + i * (H - padB - padT) / 3}" y2="${padT + i * (H - padB - padT) / 3}" class="${i === 3 ? 'base' : 'grid'}"/>`).join('')}
      ${labels.map((l, i) => `<text x="${padL + i * slot + slot / 2}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>`).join('')}
    </svg>
    <div class="adm-chart-msg" role="status">${icon('info')}<p>${esc(message)}</p></div>
  </div>`;
}

function eligibilityBars(e, total) {
  const max = Math.max(1, ...Object.values(e));
  return `<ul class="adm-hbars">${Object.entries(ELIGIBILITY).map(([k, name]) => `
    <li><div class="adm-hbar-head"><span>${name}</span><strong>${e[k]} <small>(${pct(e[k], total)}%)</small></strong></div>
    <div class="adm-hbar" aria-hidden="true"><i style="width:${(e[k] / max) * 100}%"></i></div></li>`).join('')}
  </ul>`;
}

function planBars(plans) {
  if (!plans.total) return `<div class="empty-log">${icon('crown')}<p><strong>Niciun abonament activ încă.</strong><br>Distribuția pe 1, 3 și 6 luni apare după primele abonamente.</p></div>`;
  const max = Math.max(1, ...Object.values(plans.counts));
  return `<ul class="adm-hbars">${Object.entries(plans.labels).map(([k, name]) => `
    <li><div class="adm-hbar-head"><span>${name}</span><strong>${plans.counts[k]} <small>(${pct(plans.counts[k], plans.total)}%)</small></strong></div>
    <div class="adm-hbar" aria-hidden="true"><i style="width:${(plans.counts[k] / max) * 100}%"></i></div></li>`).join('')}
  </ul>${plans.other ? `<p class="small-note">${plans.other} abonamente cu altă durată.</p>` : ''}`;
}

function retentionTile(r) {
  const label = r.days === 7 ? 'După 7 zile' : 'După 30 de zile';
  if (!r.cohort) return `<div class="adm-ret"><span class="metric-label">${label}</span><strong>—</strong><small>Date insuficiente: niciun client înscris de cel puțin ${r.days} zile.</small></div>`;
  return `<div class="adm-ret"><span class="metric-label">${label}</span><strong>${format(r.pct, 1)}%</strong>
    <div class="adm-hbar" aria-hidden="true"><i style="width:${r.pct}%"></i></div>
    <small>${r.retained} din ${r.cohort} ${r.cohort === 1 ? 'client înscris' : 'clienți înscriși'} de cel puțin ${r.days} zile au revenit după ziua ${r.days}.</small></div>`;
}

const PERIOD_LABEL = { week: 'Săptămână', month: 'Lună', year: 'An' };

async function renderOverview() {
  const [d, o] = await Promise.all([api('GET', `/api/admin/dashboard?period=${state.period}`), api('GET', '/api/admin/overview')]);
  const c = d.cards;
  const isYear = d.signups.granularity === 'month';
  const signupBuckets = d.signups.buckets.map(b => ({ ...b, short: isYear ? b.label.split(' ')[0] : b.label.replace(/\.$/, '') }));
  const periodText = { week: 'ultimele 7 zile', month: 'ultimele 30 de zile', year: 'ultimele 12 luni' }[d.period];
  const selector = `
    <div class="adm-segment" role="group" aria-label="Perioada graficului de conturi noi">
      ${Object.entries(PERIOD_LABEL).map(([k, n]) => `<button data-action="period" data-period="${k}" aria-pressed="${k === d.period}">${n}</button>`).join('')}
    </div>`;
  return `
  ${pageHead('Panou', `Clienții Metamorf, pe scurt. „Azi” după ora României · fără conturile de administrare.`, selector)}
  <div class="adm-tiles">
    ${tile('Utilizatori total', format(c.usersTotal), 'clienți înregistrați')}
    ${tile('Utilizatori noi', `${format(c.newToday)} <span class="adm-tile-unit">azi</span>`, `${format(c.new7)} în ultimele 7 zile`)}
    ${tile('Abonamente Premium active', format(c.premiumActive), c.premiumActive ? 'cu perioada plătită în curs' : 'niciun abonament încă')}
    ${d.revenue ? tile('Venituri luna curentă', '—', 'Plățile nu sunt încă integrate') : ''}
  </div>
  <div class="adm-grid ${d.revenue ? 'even' : 'single'}">
    ${d.revenue ? `
    <section class="card">
      <div class="card-heading"><h3>Venituri · ultimele 12 luni</h3><span class="tag">doar administratori</span></div>
      ${emptyChart(d.revenue.months.map(m => m.label.split(' ')[0]), d.revenue.reason, 480)}
    </section>` : ''}
    <section class="card">
      <div class="card-heading"><h3>Conturi noi · ${periodText}</h3><span class="tag">${format(d.signups.total)} în total</span></div>
      ${d.signups.total
        ? barChart(signupBuckets, { aria: `Conturi noi, ${periodText}`, labelEvery: d.period === 'month' ? (d.revenue ? 7 : 5) : d.period === 'year' && d.revenue ? 2 : 1, width: d.revenue ? 480 : 720 })
        : `<div class="empty-log">${icon('user')}<p>Niciun cont nou în ${periodText}.</p></div>`}
    </section>
  </div>
  <div class="adm-grid even">
    <section class="card">
      <div class="card-heading"><h3>Abonamente active pe durată</h3></div>
      ${planBars(d.plans)}
    </section>
    <section class="card">
      <div class="card-heading"><h3>Retenție</h3><span class="tag">% clienți activi după înscriere</span></div>
      <div class="adm-ret-grid">${retentionTile(d.retention.d7)}${retentionTile(d.retention.d30)}</div>
      <p class="small-note">Activ = a folosit aplicația (jurnal, apă, antrenament, greutate, sarcini sau conectare) după ziua respectivă.</p>
    </section>
  </div>
  <div class="adm-grid even">
    <section class="card">
      <div class="card-heading"><h3>Eligibilitate pentru planul automat</h3></div>
      ${eligibilityBars(o.eligibility, o.users.total)}
    </section>
    <section class="card">
      <div class="card-heading"><h3>Activitate și AI · ultimele 7 / 30 de zile</h3><span class="tag ${o.aiProvider === 'ai' ? 'green' : 'warn'}">${o.aiProvider === 'ai' ? 'AI activ' : o.aiProvider === 'test' ? 'AI în mod test' : 'AI neconfigurat'}</span></div>
      <ul class="adm-list">
        <li><span>Înregistrări în jurnal (7 zile)</span><strong>${format(o.activity7.foodEntries)}</strong></li>
        <li><span>Antrenamente finalizate (7 zile)</span><strong>${format(o.activity7.workouts)}</strong></li>
        <li><span>Planuri generate (7 zile)</span><strong>${format(o.activity7.plans)}</strong></li>
        <li><span>Cereri AI (30 de zile)</span><strong>${format(o.ai30.requests)} · ${o.ai30.failed} eșuate</strong></li>
        <li><span>Cost AI estimat (30 de zile)</span><strong>${usd(o.ai30.costUsd)}</strong></li>
      </ul>
      <button class="btn outline small" data-section="ai">Detalii utilizare AI</button>
    </section>
  </div>`;
}

// ---------- Utilizatori ----------

const ELIG_SHORT = { eligible: 'Eligibil pentru plan AI', minor: 'Flux separat', specialist: 'Flux separat', incomplete: 'Chestionar necompletat' };
const EVENT_LABEL = { manual_grant: 'Premium acordat manual', payment: 'Plată', renewal: 'Reînnoire', cancel: 'Anulare', expire: 'Expirare' };

const planCell = s => (s.premium
  ? `<span class="tag green">Premium${s.planLabel ? ` · ${esc(s.planLabel)}` : ''}</span>${s.manual ? ' <span class="tag">manual</span>' : ''}`
  : '<span class="tag">Gratuit</span>');

async function renderUsers() {
  const f = state.users;
  const params = new URLSearchParams({ q: f.q, plan: f.plan, elig: f.elig, from: f.from, to: f.to, page: f.page });
  const r = await api('GET', `/api/admin/users?${params}`);
  const filtered = f.q || f.plan !== 'all' || f.elig !== 'all' || f.from || f.to;
  const opt = (v, cur, n) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${n}</option>`;
  return `
  ${pageHead('Utilizatori', `${format(r.total)} ${r.total === 1 ? 'client' : 'clienți'}${filtered ? ' găsiți cu filtrele alese' : ''}. Conturile de administrare nu apar aici.`)}
  <form class="adm-filters adm-user-filters" id="users-filter" role="search" novalidate>
    <label class="field adm-f-search">Caută<input name="q" type="search" value="${esc(f.q)}" placeholder="Nume sau email" maxlength="100"></label>
    <label class="field">Plan<select name="plan">${opt('all', f.plan, 'Toate')}${opt('free', f.plan, 'Gratuit')}${opt('premium', f.plan, 'Premium')}</select></label>
    <label class="field">Plan AI<select name="elig">${opt('all', f.elig, 'Toți')}${opt('eligible', f.elig, 'Eligibili pentru plan AI')}${opt('separate', f.elig, 'Flux separat')}${opt('incomplete', f.elig, 'Chestionar necompletat')}</select></label>
    <label class="field">Înregistrat de la<input name="from" type="date" value="${esc(f.from)}"></label>
    <label class="field">până la<input name="to" type="date" value="${esc(f.to)}"></label>
    <div class="adm-f-actions">
      <button class="btn dark" type="submit">${icon('scan')}Filtrează</button>
      ${filtered ? '<button class="btn outline" type="button" data-action="usersReset">Resetează</button>' : ''}
    </div>
  </form>
  <section class="card adm-table-card">
    ${r.users.length ? `<div class="table-wrap"><table class="adm-table stack">
      <thead><tr><th scope="col">Nume</th><th scope="col">Email</th><th scope="col">Plan</th><th scope="col">Data înregistrării</th><th scope="col">Ultima activitate</th><th scope="col"><span class="sr-only">Detalii</span></th></tr></thead>
      <tbody>${r.users.map(u => `
        <tr>
          <td data-label="Nume"><a class="adm-link" href="#utilizatori/${u.id}">${esc(u.name)}</a></td>
          <td data-label="Email">${esc(u.email)}</td>
          <td data-label="Plan">${planCell(u.subscription)}</td>
          <td data-label="Data înregistrării">${d(u.createdAt)}</td>
          <td data-label="Ultima activitate">${u.lastActivityAt ? dt(u.lastActivityAt) : '—'}</td>
          <td class="adm-row-action"><a class="btn outline small" href="#utilizatori/${u.id}">Detalii</a></td>
        </tr>`).join('')}
      </tbody></table></div>`
    : `<div class="empty-log">${icon('user')}<p>${filtered ? 'Niciun client nu corespunde filtrelor alese.' : 'Încă nu există clienți înregistrați.'}</p>${filtered ? '<button class="btn outline small" data-action="usersReset">Resetează filtrele</button>' : ''}</div>`}
    ${pager(r.page, r.pageSize, r.total, 'usersPage')}
  </section>`;
}

const row = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;

function healthBlock(u) {
  const h = u.health;
  const data = state.health[u.account.id];
  if (data) {
    return `
    <section class="card adm-health open">
      <div class="card-heading"><h3>${icon('heart')}Date de sănătate</h3><span class="tag warn">acces înregistrat</span></div>
      <dl class="adm-dl">
        ${row('Acord pentru date de sănătate', data.consent ? `Da, din ${d(data.consentAt)}` : 'Nu')}
        ${row('Alergii și intoleranțe', esc(data.allergies || '—'))}
        ${row('Limitări fizice', esc(data.limitations || '—'))}
        ${row('Vârstă', data.age ?? '—')}
        ${row('Înălțime', data.heightCm ? `${format(data.heightCm)} cm` : '—')}
        ${row('Greutate (chestionar)', data.weightKg ? `${format(data.weightKg, 1)} kg` : '—')}
        ${row('Ultima cântărire', data.lastWeight ? `${format(data.lastWeight.kg, 1)} kg · ${esc(data.lastWeight.at.replace('T', ', '))}` : '—')}
      </dl>
      <p class="small-note">Accesul a fost înregistrat în jurnalul de audit, cu motivul indicat. Datele rămân afișate doar până închizi această pagină.</p>
      <button class="btn outline small" data-action="healthHide" data-id="${u.account.id}">${icon('lock')}Ascunde datele</button>
    </section>`;
  }
  return `
  <section class="card adm-health">
    <div class="adm-health-icon">${icon('lock')}</div>
    <div>
      <h3>Date de sănătate protejate</h3>
      <p>Alergiile, limitările fizice, greutatea, înălțimea și vârsta nu sunt afișate. ${h.consent ? 'Clientul a dat acordul pentru păstrarea acestor date.' : 'Clientul nu a dat acordul pentru date de sănătate.'}</p>
    </div>
    ${h.canRequestAccess ? `<button class="btn outline" data-action="healthAsk" data-id="${u.account.id}">${icon('lock')}Solicită acces</button>` : ''}
  </section>`;
}

async function renderUserDetail() {
  const id = state.id;
  let u;
  try {
    u = await api('GET', `/api/admin/users/${id}`);
  } catch (err) {
    if (err.status === 404) return `${backLink()}<div class="page-state"><div class="success-icon">${icon('user')}</div><h1 tabindex="-1">Contul nu există</h1><p>Contul a fost șters sau linkul nu este corect.</p><a class="btn dark" href="#utilizatori">Înapoi la utilizatori</a></div>`;
    throw err;
  }
  const a = u.account, p = u.profile, s = u.subscription;
  const subText = s.premium
    ? `Premium${s.planLabel ? ` · ${esc(s.planLabel)}` : ''} · valabil până la ${d(s.currentPeriodEnd)}${s.provider === 'manual' ? ' · acordat manual' : ''}`
    : `Gratuit${s.status !== 'none' ? ` · ultimul abonament: ${esc(s.status)}` : ''}`;
  return `
  ${backLink()}
  <div class="page-heading">
    <div><span class="eyebrow">DETALII CONT</span><h1 tabindex="-1">${esc(a.name)}</h1><p>${esc(a.email)} · ${planCell({ ...s, manual: s.provider === 'manual' })} <span class="tag">${esc(ELIG_SHORT[p.eligibility] || '')}</span></p></div>
  </div>
  <div class="adm-detail-grid">
    <section class="card">
      <div class="card-heading"><h3>Cont</h3></div>
      <dl class="adm-dl">
        ${row('Email', esc(a.email))}
        ${row('Email confirmat', a.emailVerified ? `Da, ${d(a.emailVerifiedAt)}` : 'Nu <small class="muted">· confirmarea emailului se activează după configurarea furnizorului de email</small>')}
        ${row('Înregistrat', dt(a.createdAt))}
        ${row('Ultima activitate', dt(a.lastActivityAt))}
        ${row('Fus orar', esc(a.timezone))}
        ${row('Chestionar', p.onboardingDone ? 'Completat' : `Pasul ${p.step} din 6`)}
        ${row('Plan AI', esc(ELIG_SHORT[p.eligibility] || '—'))}
        ${row('Obiectiv · alimentație', `${esc(p.goal || '—')} · ${esc(p.diet || '—')}`)}
        ${row('Antrenament', `${esc(p.location || '—')} · ${esc(p.experience || '—')}`)}
        ${row('Ținte zilnice', u.targetsSet ? 'Setate' : 'Nesetate')}
      </dl>
    </section>
    <section class="card">
      <div class="card-heading"><h3>Abonament</h3></div>
      <dl class="adm-dl">
        ${row('Stare', subText)}
        ${row('Scanări folosite azi', `${u.scansToday.used} din ${u.scansToday.limit} <small class="muted">· ziua ${esc(u.scansToday.day)}, fusul clientului</small>`)}
      </dl>
      <h4 class="adm-subhead">Istoric</h4>
      ${u.subscriptionHistory.length ? `<div class="table-wrap"><table class="adm-table compact"><thead><tr><th scope="col">Data</th><th scope="col">Eveniment</th><th scope="col">Valabil până</th><th scope="col">Motiv · de către</th></tr></thead>
      <tbody>${u.subscriptionHistory.map(e => `<tr><td>${dt(e.created_at)}</td><td>${esc(EVENT_LABEL[e.type] || e.type)}${e.planLabel ? ` · ${esc(e.planLabel)}` : ''}</td><td>${d(e.period_end)}</td><td class="adm-wrap">${esc(e.reason || '—')}${e.actor_email ? `<br><small class="muted">${esc(e.actor_email)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">Niciun eveniment de abonament. Plățile vor apărea aici după integrarea procesatorului de plăți.</p>'}
    </section>
    ${healthBlock(u)}
    <section class="card">
      <div class="card-heading"><h3>Acțiuni</h3></div>
      <div class="adm-actions">
        <button class="btn outline" data-action="resetAsk" data-id="${a.id}" data-email="${esc(a.email)}">${icon('lock')}Trimite link de resetare a parolei</button>
        <button class="btn outline" data-action="logoutAsk" data-id="${a.id}" data-sessions="${u.counts.sessions}">${icon('close')}Deconectează toate dispozitivele</button>
        ${isAdmin() ? `<button class="btn outline" data-action="premiumAsk" data-id="${a.id}">${icon('crown')}Acordă Premium manual</button>` : ''}
        <button class="btn outline" data-action="exportUser" data-id="${a.id}">${icon('upload')}Exportă datele (JSON)</button>
        ${isAdmin() ? `<button class="btn danger" data-action="deleteAsk" data-id="${a.id}" data-email="${esc(a.email)}">${icon('trash')}Șterge contul</button>` : ''}
      </div>
      <p class="small-note">Toate acțiunile și deschiderea acestei pagini sunt înregistrate în jurnalul de audit.</p>
    </section>
    <section class="card">
      <div class="card-heading"><h3>Activitate</h3></div>
      <dl class="adm-dl">
        ${row('Înregistrări în jurnal', u.counts.foodEntries)}
        ${row('Antrenamente finalizate', u.counts.workouts)}
        ${row('Cântăriri', u.counts.weights)}
        ${row('Planuri generate', u.counts.plans)}
        ${row('Sesiuni active', u.counts.sessions)}
      </dl>
      ${u.aiRequests.length ? `<h4 class="adm-subhead">Ultimele cereri AI</h4><div class="table-wrap"><table class="adm-table compact"><thead><tr><th scope="col">Data</th><th scope="col">Tip</th><th scope="col">Rezultat</th></tr></thead>
      <tbody>${u.aiRequests.map(r => `<tr><td>${dt(r.created_at)}</td><td>${r.kind === 'week' ? 'Plan săptămânal' : 'Înlocuire masă'}</td><td>${r.ok ? '<span class="tag green">Reușit</span>' : `<span class="tag warn">${esc(r.error || 'Eșuat')}</span>`}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </section>
  </div>`;
}

const backLink = () => `<a class="adm-back" href="#utilizatori"><span aria-hidden="true">←</span><span>Înapoi la utilizatori</span></a>`;

function confirmDialog({ title, text, action, id, button, danger = false }) {
  modal(`
    <h2>${title}</h2>
    <p>${text}</p>
    <div class="field-row">
      <button type="button" class="btn outline" data-action="close">Renunță</button>
      <button type="button" class="btn ${danger ? 'danger' : 'dark'}" data-action="${action}" data-id="${id}">${button}</button>
    </div>`);
}

function premiumDialog(id) {
  modal(`
    <h2>Acordă Premium manual</h2>
    <p>Folosește această opțiune pentru situații excepționale (compensații, parteneriate). Nu creează o plată și nu emite factură. Dacă clientul are deja Premium, perioada se adaugă la cea existentă.</p>
    <form id="premium-form" data-id="${id}" novalidate>
      <fieldset class="portion-grid" style="grid-template-columns:repeat(3,1fr)"><legend class="sr-only">Durata</legend>
        ${[['1_luna', '1 lună'], ['3_luni', '3 luni'], ['6_luni', '6 luni']].map(([v, n], i) => `<label class="choice portion"><input type="radio" name="plan" value="${v}" required ${i === 0 ? 'checked' : ''}><strong>${n}</strong></label>`).join('')}
      </fieldset>
      <label class="field" style="margin-top:14px">Motiv (obligatoriu)<textarea name="reason" required minlength="10" maxlength="300" rows="3" placeholder="De exemplu: compensație pentru întreruperea din 3 octombrie (tichet #128)"></textarea><small>Motivul apare în istoricul abonamentului și în jurnalul de audit.</small></label>
      <button class="btn dark full" type="submit">${icon('crown')}Acordă Premium</button>
    </form>`);
}

function healthDialog(id) {
  modal(`
    <div class="success-icon" style="background:#fbf1e3;color:#93652a">${icon('lock')}</div>
    <h2>Solicită acces la datele de sănătate</h2>
    <div class="form-alert warn" role="note">Datele de sănătate sunt date personale sensibile. Accesul se acordă doar cu un motiv legitim (de exemplu, o solicitare a clientului) și <strong>este înregistrat în jurnalul de audit</strong>, împreună cu numele tău și motivul.</div>
    <form id="health-form" data-id="${id}" novalidate>
      <label class="field">Motivul accesului<textarea name="reason" required minlength="15" maxlength="300" rows="3" placeholder="De exemplu: clientul a cerut verificarea planului, tichet #42"></textarea></label>
      <label class="check-label"><input type="checkbox" name="ack" required><span>Înțeleg că accesul este înregistrat și că pot folosi aceste date doar pentru motivul indicat.</span></label>
      <button class="btn dark full" type="submit">Solicită acces</button>
    </form>`);
}

function deleteDialog(id, email) {
  modal(`
    <div class="success-icon" style="background:#f8e9e5;color:#a4493b">${icon('trash')}</div>
    <h2>Ștergi definitiv contul?</h2>
    <p>Se șterg contul <strong>${esc(email)}</strong> și toate datele lui: profil, jurnal, planuri, greutate, abonament. Acțiunea nu poate fi anulată și rămâne în jurnalul de audit.</p>
    <p>Folosește această acțiune doar la cererea utilizatorului (de exemplu, o cerere de ștergere primită pe email).</p>
    <form id="delete-form" data-id="${id}">
      <label class="field">Scrie adresa de email a contului pentru confirmare<input name="confirmEmail" type="email" required autocomplete="off" placeholder="${esc(email)}"></label>
      <div class="form-error" role="alert" hidden></div>
      <div class="field-row">
        <button type="button" class="btn outline" data-action="close">Renunță</button>
        <button type="submit" class="btn danger">Șterge definitiv</button>
      </div>
    </form>`);
}

// ---------- AI ----------

async function renderAi() {
  const r = await api('GET', '/api/admin/ai');
  const kind = k => (k === 'week' ? 'Plan săptămânal' : 'Înlocuire masă');
  return `
  ${pageHead('Utilizare AI', 'Cererile către serviciul AI, tokenii consumați și costul estimat.')}
  <div class="notice-card">${icon('info')}<div><strong>Costul este o estimare.</strong><p>Calculat din tokeni cu prețurile de listă (${Object.entries(r.prices).map(([m, p]) => `${esc(m)}: $${p.input} / $${p.output} per milion de tokeni de intrare / ieșire`).join('; ')}), fără reducerile din cache. Costul real apare în consola Anthropic.</p></div></div>
  <section class="card adm-table-card">
    <div class="card-heading"><h3>Pe zile · ultimele 30 de zile</h3></div>
    ${r.daily.length ? `<div class="table-wrap"><table class="adm-table"><thead><tr><th scope="col">Ziua</th><th scope="col">Model</th><th scope="col" class="num">Cereri</th><th scope="col" class="num">Reușite</th><th scope="col" class="num">Tokeni intrare</th><th scope="col" class="num">Tokeni ieșire</th><th scope="col" class="num">Cost estimat</th></tr></thead>
    <tbody>${r.daily.map(x => `<tr><td>${d(x.day + 'T12:00:00Z')}</td><td>${esc(x.model || 'test (fără AI)')}</td><td class="num">${x.requests}</td><td class="num">${x.ok}</td><td class="num">${format(x.inputTokens)}</td><td class="num">${format(x.outputTokens)}</td><td class="num">${usd(x.costUsd)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty-log">${icon('sparkles')}<p>Nicio cerere AI în ultimele 30 de zile.</p></div>`}
  </section>
  <section class="card adm-table-card">
    <div class="card-heading"><h3>Ultimele 100 de cereri</h3></div>
    ${r.requests.length ? `<div class="table-wrap"><table class="adm-table"><thead><tr><th scope="col">Data</th><th scope="col">Cont</th><th scope="col">Tip</th><th scope="col">Generator</th><th scope="col">Rezultat</th><th scope="col" class="num">Încercări</th><th scope="col" class="num">Tokeni</th><th scope="col" class="num">Cost</th></tr></thead>
    <tbody>${r.requests.map(x => `<tr><td>${dt(x.createdAt)}</td><td>${esc(x.email || 'cont șters')}</td><td>${kind(x.kind)}</td><td>${esc(x.model || x.provider)}</td><td>${x.ok ? '<span class="tag green">Reușit</span>' : `<span class="tag warn">${esc(x.error || 'Eșuat')}</span>`}</td><td class="num">${x.attempts}</td><td class="num">${format((x.inputTokens || 0) + (x.outputTokens || 0))}</td><td class="num">${usd(x.costUsd)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty-log"><p>Nicio cerere încă.</p></div>`}
  </section>`;
}

// ---------- Audit ----------

/** Trimitere la cererea sau rețeta vizată de o acțiune din jurnal. */
function auditRef(x) {
  if (!x) return '';
  if (x.exercise) return x.name ? ` · exercițiul „${esc(x.name)}”` : ` · <a class="adm-link" href="#exercitii/${esc(x.exercise)}">exercițiul ${esc(x.exercise)}</a>`;
  if (x.food) return ` · alimentul „${esc(x.name || x.food)}”`;
  if (x.media) return ` · fișierul „${esc(x.name || x.media)}”`;
  if (x.added !== undefined) return `${x.file ? ` · ${esc(x.file)}` : ''}: ${x.added} adăugate, ${x.updated} actualizate, ${x.errors} erori`;
  if (x.request) return ` · <a class="adm-link" href="#cereri/${Number(x.request)}">cererea #${Number(x.request)}</a>`;
  if (x.recipe) {
    const name = x.name ? ` „${esc(x.name)}”` : '';
    const ref = x.name ? `rețeta #${Number(x.recipe)}${name}` : `<a class="adm-link" href="#retete/${Number(x.recipe)}">rețeta #${Number(x.recipe)}</a>`;
    return ` · ${ref}${x.copy ? ` → <a class="adm-link" href="#retete/${Number(x.copy)}">#${Number(x.copy)}</a>` : ''}${x.photo !== undefined ? (x.photo ? ' (fotografie nouă)' : ' (fotografie eliminată)') : ''}`;
  }
  return '';
}

// ---------- Randare și navigare ----------

// Ecranele de conținut și suport (cereri, rețete) se adaugă din admin-content.js.
const RENDER = { prezentare: renderOverview, utilizatori: () => (state.id ? renderUserDetail() : renderUsers()), ai: renderAi };
const CRUMB_DETAIL = { utilizatori: () => 'Detalii', cereri: () => `Cererea #${state.id}`, retete: () => (state.id === 'nou' ? 'Rețetă nouă' : 'Editor'), exercitii: () => (state.id === 'nou' ? 'Exercițiu nou' : 'Editor') };

function renderNav() {
  document.getElementById('nav').innerHTML = NAV.map(([group, items]) => {
    const visible = items.filter(([k]) => canSee(k));
    if (!visible.length) return '';
    return `${group ? `<div class="nav-group-label" aria-hidden="true">${group}</div>` : ''}${visible.map(([k, name, ic]) => `
    <button class="nav-item ${state.section === k ? 'active' : ''}" data-section="${k}" ${state.section === k ? 'aria-current="page"' : ''}>${icon(ic)}<span>${name}</span></button>`).join('')}`;
  }).join('');
  document.getElementById('crumb').textContent = SECTIONS[state.section][0] + (state.id && CRUMB_DETAIL[state.section] ? ` / ${CRUMB_DETAIL[state.section]()}` : '');
}

const currentHash = () => (state.id ? `${state.section}/${state.id}` : state.section);

async function render({ focus = true } = {}) {
  renderNav();
  const el = document.getElementById('content');
  const loading = setTimeout(() => { el.innerHTML = '<div class="page-state" role="status"><span class="spinner big" aria-hidden="true"></span><p>Se încarcă…</p></div>'; }, 250);
  try {
    const html = await RENDER[state.section]();
    clearTimeout(loading);
    el.innerHTML = `<div class="fade-in">${html}</div>`;
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      if (err.status === 401) auth.notice = 'Sesiunea de administrare a expirat. Conectează-te din nou.';
      auth.step = 'password';
      return renderLogin();
    }
    clearTimeout(loading);
    el.innerHTML = errorState(err);
  }
  hydrateIcons(el);
  if (focus) el.querySelector('h1')?.focus({ preventScroll: true });
}

// ---------- Conectare (ecranul 1): email + parolă, apoi codul 2FA ----------

const auth = { step: 'password', challenge: null, setup: null, notice: '' };

function authShell(inner) {
  return `
  <div class="welcome adm-auth">
    <section class="welcome-brand">
      <img src="metamorf-logo.png" alt="metamorf" width="262" height="68">
      <h1 class="adm-auth-title">Panou de administrare</h1>
      <p>Acces doar pentru echipa Metamorf. Conturile de administrare se creează intern, nu prin înregistrare.</p>
      <ul class="welcome-points">
        <li>${icon('lock')}Conectare în doi pași, cu aplicația de autentificare</li>
        <li>${icon('check')}Blocare temporară după prea multe încercări</li>
        <li>${icon('check')}Fiecare acțiune este înregistrată în jurnalul de audit</li>
      </ul>
    </section>
    <section class="card welcome-auth">${inner}</section>
  </div>`;
}

const stepTag = n => `<span class="eyebrow">PASUL ${n} DIN 2</span>`;

const codeField = () => `
  <label class="field">Cod de 6 cifre<input class="code-input" name="code" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" data-pattern-message="Codul are exact 6 cifre."></label>`;

function passwordStep() {
  return `
  <form id="adm-login-form" novalidate>
    ${stepTag(1)}
    <h2 class="auth-title" tabindex="-1">Conectare administrator</h2>
    <p class="muted">Introdu emailul și parola contului de administrare.</p>
    ${auth.notice ? `<div class="form-alert warn" role="status">${esc(auth.notice)}</div>` : ''}
    <label class="field">Email<input type="email" name="email" required autocomplete="username" placeholder="nume@metamorf.ro"></label>
    <label class="field">Parolă<input type="password" name="password" required autocomplete="current-password"></label>
    <button class="btn dark full" type="submit">Continuă</button>
  </form>`;
}

function codeStep() {
  return `
  <form id="adm-code-form" novalidate>
    ${stepTag(2)}
    <h2 class="auth-title" tabindex="-1">Codul de verificare</h2>
    <p class="muted">Deschide aplicația de autentificare și introdu codul de 6 cifre pentru <strong>Metamorf Admin</strong>. Codul se schimbă la fiecare 30 de secunde.</p>
    ${codeField()}
    <button class="btn dark full" type="submit">Verifică și intră în panou</button>
    <button class="text-btn forgot-link" type="button" data-action="authBack">Înapoi la email și parolă</button>
  </form>`;
}

function setupStep() {
  return `
  <form id="adm-code-form" novalidate>
    ${stepTag(2)}
    <h2 class="auth-title" tabindex="-1">Activează conectarea în doi pași</h2>
    <p class="muted">Este prima ta conectare în panou. Leagă contul de o aplicație de autentificare de pe telefon.</p>
    <ol class="setup-steps">
      <li>Instalează o aplicație de autentificare: Google Authenticator, Microsoft Authenticator, Authy sau 1Password.</li>
      <li>În aplicație, alege <strong>„Adaugă cont”</strong> și scanează codul QR:
        <div class="qr-box" role="img" aria-label="Cod QR pentru aplicația de autentificare">${auth.setup.qrSvg}</div>
        <details><summary>Nu poți scana? Introdu cheia manual</summary>
          <p class="muted">Cont: Metamorf Admin · tip: bazat pe timp</p>
          <code class="setup-key">${esc(auth.setup.secret)}</code>
        </details>
      </li>
      <li>Introdu mai jos codul de 6 cifre afișat de aplicație.</li>
    </ol>
    ${codeField()}
    <button class="btn dark full" type="submit">Activează și intră în panou</button>
    <button class="text-btn forgot-link" type="button" data-action="authBack">Renunță</button>
  </form>`;
}

function renderLogin() {
  document.body.classList.add('mode-guest', 'adm-denied');
  const el = document.getElementById('content');
  el.innerHTML = authShell(auth.step === 'password' ? passwordStep() : auth.step === 'setup' ? setupStep() : codeStep());
  hydrateIcons(el);
  (el.querySelector('input') || el.querySelector('h2'))?.focus();
}

function renderDenied(err) {
  auth.step = 'password';
  auth.notice = err.status === 403 ? 'Contul cu care ești conectat în aplicație nu are acces la panou. Conectează-te cu un cont de administrator.' : '';
  renderLogin();
}

/** După conectare: încarcă panoul. */
async function enterPanel() {
  const me = await api('GET', '/api/admin/me');
  document.body.classList.remove('mode-guest', 'adm-denied');
  document.getElementById('admin-name').textContent = me.name;
  document.getElementById('admin-email').textContent = `${me.email} · ${(ROLE_LABEL[me.role] || me.role).toLowerCase()}`;
  document.querySelector('.admin-badge').textContent = `Rol: ${ROLE_LABEL[me.role] || me.role}`;
  document.querySelectorAll('.avatar').forEach(a => { a.textContent = me.name.charAt(0).toUpperCase(); });
  state.me = me;
  go(location.hash.slice(1) || 'prezentare');
}

/** Erori de formular: pe câmp (dacă serverul le indică) sau în caseta de sus. */
function formError(form, err) {
  clearFormErrors(form);
  let first = null;
  for (const [name, message] of Object.entries(err.fields || {})) {
    const el = showFieldError(form, name, message);
    first ||= el;
  }
  setFormAlert(form, Object.keys(err.fields || {}).length ? '' : err.message);
  (first || form.querySelector('.form-alert'))?.focus?.();
}

function go(target, { force = false } = {}) {
  let [section, id] = String(target || '').split('/');
  if (!SECTIONS[section] || !canSee(section)) { section = 'prezentare'; id = null; }
  id = DETAIL[section]?.test(id || '') ? id : null;
  const hash = id ? `${section}/${id}` : section;
  if (!force && hash !== currentHash() && leaveGuard?.(hash)) {
    if (location.hash.slice(1) !== currentHash()) history.pushState(null, '', `#${currentHash()}`);
    return;
  }
  state.section = section;
  state.id = id;
  if (location.hash.slice(1) !== hash) history.pushState(null, '', `#${hash}`);
  document.body.classList.remove('menu-open');
  render();
  window.scrollTo({ top: 0 });
}

async function busy(button, fn) {
  if (!button || button.disabled) return fn();
  const html = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Se lucrează…';
  try { return await fn(); } finally { if (button.isConnected) { button.disabled = false; button.innerHTML = html; } }
}

const actions = {
  menu: () => {
    const open = document.body.classList.toggle('menu-open');
    document.querySelector('[data-action="menu"]').setAttribute('aria-expanded', String(open));
    if (open) { void document.getElementById('sidebar').offsetWidth; document.querySelector('#nav .nav-item.active')?.focus(); }
  },
  close: closeDialog,
  reload: () => render(),
  usersPage: b => { state.users.page = Number(b.dataset.page); render(); },
  exportUser: async b => {
    const res = await fetch(`/api/admin/users/${b.dataset.id}/export`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Exportul nu a reușit.');
    const blob = await res.blob();
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `metamorf-export-${b.dataset.id}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Exportul a fost descărcat.');
  },
  usersReset: () => { state.users = { q: '', plan: 'all', elig: 'all', from: '', to: '', page: 1 }; render({ focus: false }); },
  resetAsk: b => confirmDialog({ title: 'Trimiți link de resetare a parolei?', text: `Clientul primește la ${esc(b.dataset.email)} un link valabil o oră. Parola actuală rămâne valabilă până când o schimbă.`, action: 'resetLink', id: b.dataset.id, button: 'Trimite linkul' }),
  resetLink: async b => { const r = await api('POST', `/api/admin/users/${b.dataset.id}/reset-link`); closeDialog(); toast(r.message); },
  logoutAsk: b => confirmDialog({ title: 'Deconectezi toate dispozitivele?', text: `Clientul va fi deconectat de pe toate dispozitivele (${b.dataset.sessions} ${b.dataset.sessions === '1' ? 'sesiune activă' : 'sesiuni active'}) și va trebui să se conecteze din nou.`, action: 'logoutUser', id: b.dataset.id, button: 'Deconectează', danger: true }),
  logoutUser: async b => { const r = await api('POST', `/api/admin/users/${b.dataset.id}/logout`); closeDialog(); toast(`Contul a fost deconectat (${r.sessions} ${r.sessions === 1 ? 'sesiune' : 'sesiuni'}).`); render({ focus: false }); },
  premiumAsk: b => premiumDialog(b.dataset.id),
  healthAsk: b => healthDialog(b.dataset.id),
  healthHide: b => { delete state.health[b.dataset.id]; render({ focus: false }); },
  deleteAsk: b => deleteDialog(b.dataset.id, b.dataset.email),
  period: b => { state.period = b.dataset.period; render({ focus: false }); },
  authBack: () => { Object.assign(auth, { step: 'password', challenge: null, setup: null, notice: '' }); renderLogin(); },
  logout: async () => {
    await api('POST', '/api/auth/logout').catch(() => {});
    Object.assign(auth, { step: 'password', challenge: null, setup: null, notice: 'Te-ai deconectat din panou.' });
    renderLogin();
  },
};

document.addEventListener('click', async e => {
  const nav = e.target.closest('[data-section]');
  if (nav) { closeDialog(); go(nav.dataset.section); return; }
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled || !actions[b.dataset.action]) return;
  try { await busy(b, () => actions[b.dataset.action](b)); } catch (err) { toast(err.message, 'error'); }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'adm-login-form' || form.id === 'adm-code-form') {
    if (!validateForm(form)) return;
    const f = new FormData(form);
    try {
      await withBusy(form.querySelector('[type=submit]'), async () => {
        if (form.id === 'adm-login-form') {
          const r = await api('POST', '/api/admin/auth/login', { email: f.get('email'), password: f.get('password') });
          Object.assign(auth, { step: r.step, challenge: r.challenge, setup: r.step === 'setup' ? { qrSvg: r.qrSvg, secret: r.secret } : null, notice: '' });
          renderLogin();
        } else {
          await api('POST', '/api/admin/auth/verify', { challenge: auth.challenge, code: String(f.get('code')).trim() });
          Object.assign(auth, { step: 'password', challenge: null, setup: null, notice: '' });
          await enterPanel();
          toast('Te-ai conectat în panou.');
        }
      }, form.id === 'adm-login-form' ? 'Se verifică…' : 'Se verifică codul…');
    } catch (err) {
      // Pasul 2 a expirat sau au fost prea multe coduri greșite: înapoi la pasul 1, cu explicație.
      if (err.code === 'challenge_expired') {
        Object.assign(auth, { step: 'password', challenge: null, setup: null, notice: err.message });
        renderLogin();
        return;
      }
      formError(form, err);
      if (err.status === 429) form.querySelector('[type=submit]').disabled = true; // blocat temporar
    }
    return;
  }
  if (form.id === 'users-filter') {
    const f = new FormData(form);
    const from = String(f.get('from') || ''), to = String(f.get('to') || '');
    if (from && to && from > to) { showFieldError(form, 'to', 'Data de sfârșit este înaintea celei de început.'); return; }
    state.users = { q: String(f.get('q')).trim(), plan: String(f.get('plan')), elig: String(f.get('elig')), from, to, page: 1 };
    render({ focus: false });
    return;
  }
  if (form.id === 'premium-form' || form.id === 'health-form') {
    if (!validateForm(form)) return;
    const f = new FormData(form);
    const id = form.dataset.id;
    try {
      await withBusy(form.querySelector('[type=submit]'), async () => {
        if (form.id === 'premium-form') {
          const r = await api('POST', `/api/admin/users/${id}/premium`, { plan: f.get('plan'), reason: String(f.get('reason')).trim() });
          closeDialog();
          toast(`Premium acordat până la ${d(r.until)}.`);
        } else {
          state.health[id] = await api('POST', `/api/admin/users/${id}/health-access`, { reason: String(f.get('reason')).trim() });
          closeDialog();
          toast('Acces acordat și înregistrat în jurnalul de audit.');
        }
        await render({ focus: false });
      }, 'Se trimite…');
    } catch (err) {
      formError(form, err);
    }
    return;
  }
  if (form.id === 'delete-form') {
    if (!form.reportValidity()) return;
    const box = form.querySelector('.form-error');
    try {
      await busy(form.querySelector('[type=submit]'), () => api('DELETE', `/api/admin/users/${form.dataset.id}`, { confirmEmail: form.elements.confirmEmail.value }));
      closeDialog();
      toast('Contul a fost șters.');
      go('utilizatori');
    } catch (err) {
      box.hidden = false;
      box.textContent = err.fields?.confirmEmail || err.message;
    }
  }
});

// Detalii la trecerea cursorului / focus pe barele graficului.
const tip = document.getElementById('chart-tip');
function showTip(target) {
  const bar = target.closest?.('.adm-bar');
  if (!bar) { tip.hidden = true; return; }
  tip.textContent = bar.dataset.tip;
  tip.hidden = false;
  // Deasupra barei (sau a zonei ei, dacă valoarea e 0)
  const r = (bar.querySelector('path') || bar).getBoundingClientRect();
  tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`;
  tip.style.top = `${r.top + window.scrollY - tip.offsetHeight - 8}px`;
}
document.addEventListener('mouseover', e => showTip(e.target));
document.addEventListener('focusin', e => showTip(e.target));
document.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

const dialogEl = document.getElementById('dialog');
dialogEl.addEventListener('close', () => { if (dialogOpener?.isConnected) dialogOpener.focus(); dialogOpener = null; });
dialogEl.addEventListener('click', e => { if (e.target === dialogEl) closeDialog(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) actions.menu(); });
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== currentHash()) go(h); });

// Pornire după încărcarea tuturor scripturilor (admin-content.js adaugă ecrane și acțiuni).
document.addEventListener('DOMContentLoaded', async function boot() {
  hydrateIcons();
  document.getElementById('year').textContent = new Date().getFullYear();
  try {
    await enterPanel();
  } catch (err) {
    renderNav();
    renderDenied(err.status === 403 ? err : { status: 401 });
  }
});
