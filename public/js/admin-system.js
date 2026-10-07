'use strict';
// Ecranul 9 (Abonamente, Evenimente de plată — doar citire), ecranul 10 (Jurnal de audit — cronologie cu filtre și
// diferențe colorate) și ecranul 11 (Administratori, Setări). Folosește utilitarele din admin.js / admin-content.js.

// ==================== Ecranul 9 — Abonamente ====================

const SUB_STATE = { active: ['Activ', 'green'], canceled: ['Anulat', 'warn'], expired: ['Expirat', ''] };
const SUBS_DEFAULT = { q: '', state: 'all', plan: 'all', platform: 'all', page: 1 };
state.subs = { ...SUBS_DEFAULT };

async function renderSubscriptions() {
  const f = state.subs;
  const r = await api('GET', `/api/admin/subscriptions?${new URLSearchParams(f)}`);
  const filtered = f.q || ['state', 'plan', 'platform'].some(k => f[k] !== 'all');
  return `
  ${pageHead('Abonamente', 'Abonamentele clienților. Doar citire: starea se schimbă prin plățile confirmate de procesator sau, excepțional, prin Premium acordat manual din pagina clientului.')}
  <div class="adm-status-row three" role="group" aria-label="Filtrează după stare">
    ${Object.entries(SUB_STATE).map(([k, [name, cls]]) => `
      <button class="adm-status-chip ${f.state === k ? 'active' : ''}" data-action="subsState" data-state="${k}" aria-pressed="${f.state === k}">
        <span class="adm-dot ${cls || ''}" aria-hidden="true"></span><span>${name}</span><strong>${format(r.counts[k] || 0)}</strong>
      </button>`).join('')}
  </div>
  <form class="adm-filters adm-user-filters" id="subs-filter" role="search" novalidate>
    <label class="field adm-f-search">Caută<input name="q" type="search" value="${esc(f.q)}" placeholder="Nume sau email" maxlength="100"></label>
    <label class="field">Perioadă<select name="plan">${opt('all', f.plan, 'Toate')}${Object.entries(r.plans).map(([k, v]) => opt(k, f.plan, v)).join('')}</select></label>
    <label class="field">Platformă<select name="platform">${opt('all', f.platform, 'Toate')}${Object.entries(r.platforms).map(([k, v]) => opt(k, f.platform, v)).join('')}</select></label>
    <label class="field">Stare<select name="state">${opt('all', f.state, 'Toate')}${Object.entries(SUB_STATE).map(([k, [v]]) => opt(k, f.state, v)).join('')}</select></label>
    <div class="adm-f-actions">
      <button class="btn dark" type="submit">${icon('scan')}Filtrează</button>
      ${filtered ? '<button class="btn outline" type="button" data-action="subsReset">Resetează</button>' : ''}
    </div>
  </form>
  <section class="card adm-table-card">
    ${r.items.length ? `<div class="table-wrap"><table class="adm-table stack">
      <thead><tr><th scope="col">Utilizator</th><th scope="col">Perioadă</th><th scope="col">Platformă</th><th scope="col">Stare</th><th scope="col">Valabil până la</th></tr></thead>
      <tbody>${r.items.map(s => `
        <tr>
          <td data-label="Utilizator"><a class="adm-link" href="#utilizatori/${s.userId}">${esc(s.name)}</a><br><small class="muted">${esc(s.email)}</small></td>
          <td data-label="Perioadă">${esc(s.planLabel)}</td>
          <td data-label="Platformă">${s.platform ? esc(r.platforms[s.platform]) : '<span class="muted">—</span>'}</td>
          <td data-label="Stare"><span class="tag ${SUB_STATE[s.state][1]}">${SUB_STATE[s.state][0]}</span>${s.pastDue ? ' <span class="tag red">plată restantă</span>' : ''}${s.state === 'active' && s.cancelAtPeriodEnd ? ' <span class="tag">nu se reînnoiește</span>' : ''}</td>
          <td data-label="Valabil până la">${d(s.validUntil)}</td>
        </tr>`).join('')}
      </tbody></table></div>`
    : `<div class="empty-log">${icon('crown')}<p>${filtered ? 'Niciun abonament nu corespunde filtrelor alese.' : 'Nu există încă abonamente. Plățile nu sunt integrate; aici apar deocamdată doar abonamentele Premium acordate manual.'}</p>${filtered ? '<button class="btn outline small" data-action="subsReset">Resetează filtrele</button>' : ''}</div>`}
    ${pager(r.page, r.pageSize, r.total, 'subsPage')}
  </section>`;
}

// ---------- Evenimente de plată ----------

const EVENT_STATUS = { processed: ['Procesat', 'green'], failed: ['Eșuat', 'red'], ignored: ['Ignorat', ''] };
const PAY_DEFAULT = { status: 'all', signature: 'all', type: 'all', page: 1 };
state.pay = { ...PAY_DEFAULT };

/** JSON afișat cu indentare (escapat). */
const prettyJson = v => esc(typeof v === 'string' ? v : JSON.stringify(v, null, 2));

async function renderPayments() {
  const f = state.pay;
  const params = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v !== 'all')));
  const r = await api('GET', `/api/admin/payment-events?${params}`);
  const filtered = ['status', 'signature', 'type'].some(k => f[k] !== 'all');
  return `
  ${pageHead('Evenimente de plată', 'Notificările (webhook) primite de la procesatorul de plăți: tip, dată, verificarea semnăturii și rezultatul procesării. Doar citire.')}
  ${r.processorConfigured ? '' : `<div class="notice-card">${icon('info')}<div><strong>Procesatorul de plăți nu este încă integrat.</strong><p>După integrare, fiecare notificare primită apare aici exact cum a venit, cu verificarea semnăturii. Până atunci lista rămâne goală; nu afișăm plăți simulate.</p></div></div>`}
  <form class="adm-filters adm-user-filters" id="pay-filter" novalidate>
    <label class="field">Rezultat<select name="status">${opt('all', f.status, 'Toate')}${Object.entries(EVENT_STATUS).map(([k, [v]]) => opt(k, f.status, `${v} (${r.counts[k] || 0})`)).join('')}</select></label>
    <label class="field">Semnătură<select name="signature">${opt('all', f.signature, 'Toate')}${opt('valid', f.signature, 'Validă')}${opt('invalid', f.signature, `Invalidă (${r.counts.invalidSignature})`)}</select></label>
    <label class="field">Tip eveniment<select name="type">${opt('all', f.type, 'Toate')}${r.types.map(t => opt(t, f.type, t)).join('')}</select></label>
    <div class="adm-f-actions">
      <button class="btn dark" type="submit">${icon('scan')}Filtrează</button>
      ${filtered ? '<button class="btn outline" type="button" data-action="payReset">Resetează</button>' : ''}
    </div>
  </form>
  ${r.events.length ? `<div class="adm-events">${r.events.map(e => `
    <details class="card adm-event">
      <summary>
        <span class="adm-event-type"><code>${esc(e.type)}</code><small class="muted">${esc(e.provider)}${e.user ? ` · ${esc(e.user.email)}` : ''}</small></span>
        <span class="adm-event-date">${dt(e.receivedAt)}</span>
        <span class="tag ${e.signatureValid ? 'green' : 'red'}">${e.signatureValid ? 'Semnătură validă' : 'Semnătură invalidă'}</span>
        <span class="tag ${EVENT_STATUS[e.status][1]}">${EVENT_STATUS[e.status][0]}</span>
      </summary>
      <dl class="adm-dl">
        ${row('ID eveniment', e.eventId ? `<code>${esc(e.eventId)}</code>` : '—')}
        ${row('Procesat la', dt(e.processedAt))}
        ${e.error ? row('Eroare', `<span class="adm-error-text">${esc(e.error)}</span>`) : ''}
        ${e.user ? row('Client', `<a class="adm-link" href="#utilizatori/${e.user.id}">${esc(e.user.email)}</a>`) : ''}
      </dl>
      <h4 class="adm-subhead">Conținutul primit (JSON)</h4>
      <pre class="adm-json">${prettyJson(e.payload)}</pre>
    </details>`).join('')}</div>
    <section class="card adm-table-card">${pager(r.page, r.pageSize, r.total, 'payPage')}</section>`
  : `<section class="card"><div class="empty-log">${icon('chart')}<p>${filtered ? 'Niciun eveniment nu corespunde filtrelor alese.' : 'Nu a fost primită încă nicio notificare de plată.'}</p>${filtered ? '<button class="btn outline small" data-action="payReset">Resetează filtrele</button>' : ''}</div></section>`}`;
}

// ==================== Ecranul 10 — Jurnal de audit ====================

const AUDIT_DEFAULT = { admin: '', action: '', from: '', to: '', page: 1 };
state.audit = { ...AUDIT_DEFAULT };

/** Denumirile câmpurilor din diferențe (conținut, echipă, setări). */
const DIFF_LABELS = {
  name: 'Nume', description: 'Descriere', mealType: 'Tip masă', status: 'Stare', prepMinutes: 'Timp de preparare (min)', servings: 'Porții',
  steps: 'Pași', ingredients: 'Ingrediente', muscles: 'Grupe musculare', places: 'Locație', equipment: 'Echipament', level: 'Nivel',
  mode: 'Se măsoară în', sets: 'Serii', reps: 'Repetări', seconds: 'Secunde', restSec: 'Pauză (s)', mistakes: 'Greșeli frecvente',
  image: 'Imagine', video: 'Video (fișier)', videoUrl: 'Link video', videoSource: 'Sursă / licență video', group: 'Grupă', diet: 'Tip alimentație',
  kcal: 'kcal / 100 g', protein: 'Proteine', carbs: 'Carbohidrați', fat: 'Grăsimi', allergens: 'Alergeni', source: 'Sursă / licență',
  role: 'Rol', scanLimitFree: 'Scanări pe zi · Gratuit', scanLimitPremium: 'Scanări pe zi · Premium', featureAiPlans: 'Generarea planurilor cu AI',
  featurePhotoScan: 'Scanarea foto și a codului de bare', maintenanceEnabled: 'Mesaj de mentenanță afișat', maintenanceMessage: 'Textul mesajului de mentenanță',
};

const diffValue = v => (v === null || v === undefined || v === '' ? '<span class="muted">—</span>' : typeof v === 'boolean' ? (v ? 'Pornit' : 'Oprit') : esc(typeof v === 'object' ? JSON.stringify(v) : v));

/** Diferența colorată: valoarea veche (roșu, tăiat) → valoarea nouă (verde). Listele: elemente scoase / adăugate. */
function diffHtml(changes) {
  return `<table class="adm-diff"><tbody>${Object.entries(changes).map(([k, [a, b]]) => {
    let cell;
    if (Array.isArray(a) || Array.isArray(b)) {
      const oldL = a || [], newL = b || [];
      const removed = oldL.filter(x => !newL.includes(x)), added = newL.filter(x => !oldL.includes(x));
      cell = removed.length || added.length
        ? `<ul class="adm-diff-list">${removed.map(x => `<li class="del"><span aria-hidden="true">−</span> <del>${diffValue(x)}</del></li>`).join('')}${added.map(x => `<li class="ins"><span aria-hidden="true">+</span> <ins>${diffValue(x)}</ins></li>`).join('')}</ul>`
        : '<span class="muted">Aceleași elemente, în altă ordine</span>';
    } else {
      cell = `<del>${diffValue(a)}</del> <span class="muted" aria-label="devine">→</span> <ins>${diffValue(b)}</ins>`;
    }
    return `<tr><th scope="row">${esc(DIFF_LABELS[k] || k)}</th><td>${cell}</td></tr>`;
  }).join('')}</tbody></table>`;
}

async function renderAuditLog() {
  const f = state.audit;
  const params = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')));
  const r = await api('GET', `/api/admin/audit?${params}`);
  const filtered = f.admin || f.action || f.from || f.to;
  const tz = r.timezone || 'Europe/Bucharest';
  const dayKey = iso => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  const dayLabel = iso => capitalize(new Intl.DateTimeFormat('ro-RO', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)));
  const time = iso => new Intl.DateTimeFormat('ro-RO', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
  const actions = r.actions.map(a => [a, AUDIT_ACTIONS[a] || a]).sort((x, y) => x[1].localeCompare(y[1], 'ro'));
  const groups = [];
  for (const e of r.entries) {
    const k = dayKey(e.created_at);
    if (groups.at(-1)?.key !== k) groups.push({ key: k, label: dayLabel(e.created_at), items: [] });
    groups.at(-1).items.push(e);
  }
  return `
  ${pageHead('Jurnal de audit', `Toate acțiunile din panou: cine, ce, asupra cui, când și de la ce IP. Doar citire. Orele sunt în fusul ${esc(tz)}.`)}
  <form class="adm-filters adm-user-filters" id="audit-filter" novalidate>
    <label class="field">Administrator<select name="admin">${opt('', f.admin, 'Toți')}${r.admins.map(a => opt(a, f.admin, a)).join('')}</select></label>
    <label class="field adm-f-search">Tip acțiune<select name="action">${opt('', f.action, 'Toate')}${actions.map(([k, v]) => opt(k, f.action, v)).join('')}</select></label>
    <label class="field">De la<input name="from" type="date" value="${esc(f.from)}"></label>
    <label class="field">Până la<input name="to" type="date" value="${esc(f.to)}"></label>
    <div class="adm-f-actions">
      <button class="btn dark" type="submit">${icon('scan')}Filtrează</button>
      ${filtered ? '<button class="btn outline" type="button" data-action="auditReset">Resetează</button>' : ''}
    </div>
  </form>
  <p class="adm-filter-note">${format(r.total)} ${r.total === 1 ? 'acțiune' : 'acțiuni'}${filtered ? ' cu filtrele alese' : ''}.</p>
  ${groups.length ? groups.map(g => `
    <section class="adm-day">
      <h2 class="adm-day-label">${esc(g.label)}</h2>
      <ol class="adm-audit">${g.items.map(e => {
        const x = e.details || {};
        const changes = x.changes && Object.keys(x.changes).length ? x.changes : null;
        return `
        <li class="card adm-audit-item">
          <time datetime="${esc(e.created_at)}">${time(e.created_at)}</time>
          <div class="adm-audit-body">
            <p><strong>${esc(e.admin_email)}</strong> · ${esc(AUDIT_ACTIONS[e.action] || e.action)}${x.sessions !== undefined ? ` (${x.sessions} ${x.sessions === 1 ? 'sesiune' : 'sesiuni'})` : ''}${auditRef(x)}</p>
            <p class="adm-audit-meta">${e.target_email ? `${icon('user')}${esc(e.target_email)}` : ''}<span>IP ${esc(e.ip || '—')}</span></p>
            ${x.reason ? `<p class="adm-audit-reason">Motiv: ${esc(x.reason)}</p>` : ''}
            ${x.role && !changes ? `<p class="adm-audit-reason">Rol: ${esc(ROLE_LABEL[x.role] || x.role)}</p>` : ''}
            ${changes ? `<details class="adm-diff-box" ${Object.keys(changes).length <= 4 ? 'open' : ''}><summary>${Object.keys(changes).length} ${Object.keys(changes).length === 1 ? 'modificare' : 'modificări'}</summary>${diffHtml(changes)}</details>` : ''}
          </div>
        </li>`;
      }).join('')}</ol>
    </section>`).join('')
  : `<section class="card"><div class="empty-log">${icon('lock')}<p>${filtered ? 'Nicio acțiune nu corespunde filtrelor alese.' : 'Nicio acțiune înregistrată încă.'}</p>${filtered ? '<button class="btn outline small" data-action="auditReset">Resetează filtrele</button>' : ''}</div></section>`}
  ${r.total > r.pageSize ? `<section class="card adm-table-card">${pager(r.page, r.pageSize, r.total, 'auditLogPage')}</section>` : ''}`;
}

// ==================== Ecranul 11 — Administratori ====================

const ROLE_INFO = {
  admin: 'Acces complet: conținut, utilizatori, cereri de date, facturare, audit, echipă și setări. Doar administratorii pot accesa datele de sănătate, acorda Premium manual sau șterge conturi.',
  editor: 'Conținut: rețete, exerciții, catalog nutrițional și media. Nu vede utilizatorii, facturarea sau setările.',
  support: 'Suport: utilizatori (fără date de sănătate) și cereri de date. Nu poate șterge conturi și nu vede facturarea, conținutul sau setările.',
};
let staffList = [];

async function renderStaff() {
  const r = await api('GET', '/api/admin/staff');
  staffList = r.staff;
  const status = s => (s.disabled ? '<span class="tag">Dezactivat</span>' : s.pending ? '<span class="tag warn">Invitație trimisă</span>' : '<span class="tag green">Activ</span>');
  return `
  ${pageHead('Administratori', 'Echipa care are acces la panou, cu rolul fiecăruia. Conturile de client nu devin conturi de echipă.',
    `<button class="btn dark" data-action="staffInvite">${icon('plus')}Invită o persoană</button>`)}
  <section class="card adm-table-card">
    <div class="table-wrap"><table class="adm-table stack">
      <thead><tr><th scope="col">Persoană</th><th scope="col">Rol</th><th scope="col">2FA</th><th scope="col">Ultima conectare</th><th scope="col">Stare</th><th scope="col"><span class="sr-only">Acțiuni</span></th></tr></thead>
      <tbody>${r.staff.map(s => `
        <tr class="${s.disabled ? 'adm-row-muted' : ''}">
          <td data-label="Persoană"><strong>${esc(s.name)}</strong>${s.self ? ' <span class="tag">tu</span>' : ''}<br><small class="muted">${esc(s.email)}</small></td>
          <td data-label="Rol"><span class="tag ${s.role === 'admin' ? 'green' : 'blue'}">${esc(r.roles[s.role])}</span></td>
          <td data-label="2FA">${s.twoFactor ? `<span class="adm-ok">${icon('check')}Activ</span>` : '<span class="tag warn">Neconfigurat</span>'}</td>
          <td data-label="Ultima conectare">${s.lastLoginAt ? dt(s.lastLoginAt) : '<span class="muted">Niciodată</span>'}</td>
          <td data-label="Stare">${status(s)}</td>
          <td class="adm-row-action">${s.self ? '<small class="muted">Contul tău</small>' : `<div class="adm-row-buttons">
            ${s.disabled ? '' : `<button class="btn outline small" data-action="staffRoleAsk" data-id="${s.id}">Schimbă rolul</button>`}
            ${s.pending && !s.disabled ? `<button class="btn outline small" data-action="staffResendAsk" data-id="${s.id}">Retrimite invitația</button>` : ''}
            ${s.disabled ? `<button class="btn outline small" data-action="staffEnableAsk" data-id="${s.id}">Reactivează</button>` : `<button class="btn danger small" data-action="staffDisableAsk" data-id="${s.id}">Dezactivează</button>`}
          </div>`}</td>
        </tr>`).join('')}
      </tbody></table></div>
  </section>
  <section class="card">
    <div class="card-heading"><h3>Ce poate face fiecare rol</h3></div>
    <dl class="adm-dl">${Object.entries(r.roles).map(([k, v]) => row(esc(v), esc(ROLE_INFO[k]))).join('')}</dl>
    <p class="small-note">Fiecare persoană se conectează cu parolă și cod de autentificare în doi pași. Un cont dezactivat este deconectat imediat. Pentru un telefon pierdut: <code>npm run admin -- reset-2fa email</code> pe server.</p>
  </section>`;
}

const roleRadios = (current, name = 'role') => Object.entries(ROLE_LABEL).map(([k, v]) => `
  <label class="choice adm-role-choice"><input type="radio" name="${name}" value="${k}" required ${k === current ? 'checked' : ''}><strong>${v}</strong><small>${esc(ROLE_INFO[k])}</small></label>`).join('');

function staffInviteDialog() {
  modal(`
    <h2>Invită o persoană în echipă</h2>
    <p>Persoana primește pe email un link pentru setarea parolei (valabil 72 de ore). La prima conectare în panou activează autentificarea în doi pași.</p>
    <form id="staff-invite-form" novalidate>
      <label class="field">Nume<input name="name" required minlength="2" maxlength="60" autocomplete="off"></label>
      <label class="field">Email de serviciu<input name="email" type="email" required maxlength="254" autocomplete="off" placeholder="nume@metamorf.ro"></label>
      <fieldset class="adm-role-grid"><legend>Rol</legend>${roleRadios('editor')}</fieldset>
      <p class="small-note">În versiunea de dezvoltare emailurile nu pleacă: se salvează pe server, în <code>data/outbox</code>.</p>
      <button class="btn dark full" type="submit">${icon('check')}Trimite invitația</button>
    </form>`);
}

function staffRoleDialog(s) {
  modal(`
    <h2>Schimbă rolul</h2>
    <p><strong>${esc(s.name)}</strong> (${esc(s.email)}) are acum rolul <strong>${ROLE_LABEL[s.role]}</strong>. Noul rol se aplică imediat.</p>
    <form id="staff-role-form" data-id="${s.id}" data-current="${s.role}" novalidate>
      <fieldset class="adm-role-grid"><legend class="sr-only">Rol nou</legend>${roleRadios(s.role)}</fieldset>
      <div class="field-row">
        <button type="button" class="btn outline" data-action="close">Renunță</button>
        <button type="submit" class="btn dark">Confirmă schimbarea</button>
      </div>
    </form>`);
}

// ==================== Ecranul 11 — Setări ====================

state.settingsDraft = null;
EDITORS.setari = 'settingsDraft';

async function renderSettings() {
  const r = await api('GET', '/api/admin/settings');
  if (!state.settingsDraft) state.settingsDraft = { name: 'setări', saved: r.values, values: { ...r.values }, meta: r.meta, dirty: false };
  const sd = state.settingsDraft;
  sd.saved = r.values;
  sd.meta = r.meta;
  const v = sd.values;
  const toggle = (key, desc) => `
    <label class="adm-switch">
      <input type="checkbox" name="${key}" ${v[key] ? 'checked' : ''}>
      <span class="adm-switch-track" aria-hidden="true"></span>
      <span><strong>${esc(r.meta[key].label)}</strong><small>${desc}</small></span>
    </label>`;
  return `
  ${pageHead('Setări', `Valabile pentru toată aplicația. Fiecare salvare cere confirmare și apare în jurnalul de audit.${r.updatedAt ? ` Ultima modificare: ${dt(r.updatedAt)}${r.updatedBy ? ` · ${esc(r.updatedBy)}` : ''}.` : ''}`)}
  <form id="settings-form" class="adm-settings" novalidate>
    <section class="card">
      <div class="card-heading"><h3>Limite de scanare</h3></div>
      <div class="adm-ed-row two">
        <label class="field">${esc(r.meta.scanLimitFree.label)}<input name="scanLimitFree" type="number" min="${r.meta.scanLimitFree.min}" max="${r.meta.scanLimitFree.max}" step="1" inputmode="numeric" required value="${v.scanLimitFree}"></label>
        <label class="field">${esc(r.meta.scanLimitPremium.label)}<input name="scanLimitPremium" type="number" min="${r.meta.scanLimitPremium.min}" max="${r.meta.scanLimitPremium.max}" step="1" inputmode="numeric" required value="${v.scanLimitPremium}"></label>
      </div>
      <p class="small-note">Apar în aplicație (pagina de abonamente, scannerul demo) și în pagina clientului din panou. Se vor aplica și scanării reale, când va fi lansată.</p>
    </section>
    <section class="card">
      <div class="card-heading"><h3>Funcții opționale</h3></div>
      ${toggle('featureAiPlans', 'Butonul „Generează planul” și înlocuirea meselor. Când e oprit, planurile existente rămân vizibile.')}
      ${toggle('featurePhotoScan', 'Modurile „Fotografie” și „Cod de bare” din jurnal. Când e oprit, rămâne introducerea manuală.')}
      <p class="adm-switch-off">${icon('info')}<span><strong>Lista de cumpărături</strong> nu există încă în aplicație; comutatorul ei apare aici când funcția va fi implementată.</span></p>
    </section>
    <section class="card">
      <div class="card-heading"><h3>Mesaj de mentenanță</h3></div>
      ${toggle('maintenanceEnabled', 'Afișat sus, în aplicație, tuturor utilizatorilor. Nu blochează aplicația.')}
      <label class="field">Text (cel mult 300 de caractere)<textarea name="maintenanceMessage" rows="3" maxlength="300" placeholder="De exemplu: Duminică, între 02:00 și 03:00, aplicația poate fi indisponibilă câteva minute.">${esc(v.maintenanceMessage)}</textarea></label>
      <div class="adm-maint-preview" ${v.maintenanceEnabled && v.maintenanceMessage ? '' : 'hidden'}><span class="muted">Previzualizare:</span><div class="maintenance-banner static">${icon('info')}<span id="maint-preview-text">${esc(v.maintenanceMessage)}</span></div></div>
    </section>
    <div class="adm-settings-bar">
      <span id="settings-status" role="status">${sd.dirty ? 'Modificări nesalvate' : 'Nicio modificare'}</span>
      <button type="button" class="btn outline" data-action="settingsReset" ${sd.dirty ? '' : 'disabled'}>Renunță la modificări</button>
      <button type="submit" class="btn dark" ${sd.dirty ? '' : 'disabled'}>${icon('check')}Salvează…</button>
    </div>
  </form>`;
}

function settingsChanges() {
  const sd = state.settingsDraft;
  return Object.fromEntries(Object.keys(sd.values).filter(k => JSON.stringify(sd.values[k]) !== JSON.stringify(sd.saved[k])).map(k => [k, [sd.saved[k], sd.values[k]]]));
}

function settingsSync() {
  const sd = state.settingsDraft;
  sd.dirty = Object.keys(settingsChanges()).length > 0;
  const form = document.getElementById('settings-form');
  if (!form) return;
  document.getElementById('settings-status').textContent = sd.dirty ? 'Modificări nesalvate' : 'Nicio modificare';
  form.querySelectorAll('.adm-settings-bar button').forEach(b => { b.disabled = !sd.dirty; });
  const prev = form.querySelector('.adm-maint-preview');
  prev.hidden = !(sd.values.maintenanceEnabled && sd.values.maintenanceMessage.trim());
  document.getElementById('maint-preview-text').textContent = sd.values.maintenanceMessage;
}

function settingsConfirm() {
  const changes = settingsChanges();
  modal(`
    <h2>Salvezi setările?</h2>
    <p>Se aplică imediat pentru toți utilizatorii. Modificarea apare în jurnalul de audit, cu valorile de mai jos.</p>
    ${diffHtml(changes)}
    <div class="form-alert error" id="settings-error" role="alert" hidden></div>
    <div class="field-row">
      <button type="button" class="btn outline" data-action="close">Renunță</button>
      <button type="button" class="btn dark" data-action="settingsSave">Confirmă și salvează</button>
    </div>`);
}

// ==================== Înregistrare în panou ====================

RENDER.abonamente = renderSubscriptions;
RENDER.plati = renderPayments;
RENDER.audit = renderAuditLog;
RENDER.administratori = renderStaff;
RENDER.setari = renderSettings;

const staffById = id => staffList.find(s => String(s.id) === String(id));

Object.assign(actions, {
  subsState: b => { state.subs.state = state.subs.state === b.dataset.state ? 'all' : b.dataset.state; state.subs.page = 1; render({ focus: false }); },
  subsReset: () => { state.subs = { ...SUBS_DEFAULT }; render({ focus: false }); },
  subsPage: b => { state.subs.page = Number(b.dataset.page); render(); },
  payReset: () => { state.pay = { ...PAY_DEFAULT }; render({ focus: false }); },
  payPage: b => { state.pay.page = Number(b.dataset.page); render(); },
  auditReset: () => { state.audit = { ...AUDIT_DEFAULT }; render({ focus: false }); },
  auditLogPage: b => { state.audit.page = Number(b.dataset.page); render(); },
  staffInvite: () => staffInviteDialog(),
  staffRoleAsk: b => staffRoleDialog(staffById(b.dataset.id)),
  staffResendAsk: b => {
    const s = staffById(b.dataset.id);
    confirmDialog({ title: 'Retrimiți invitația?', text: `${esc(s.name)} primește la ${esc(s.email)} un link nou, valabil 72 de ore. Linkul trimis anterior nu mai funcționează.`, action: 'staffResend', id: s.id, button: 'Retrimite' });
  },
  staffResend: async b => { await api('POST', `/api/admin/staff/${b.dataset.id}/invite`); closeDialog(); toast('Invitația a fost retrimisă.'); },
  staffDisableAsk: b => {
    const s = staffById(b.dataset.id);
    confirmDialog({ title: 'Dezactivezi contul?', text: `${esc(s.name)} (${esc(s.email)}) va fi deconectat imediat și nu se va mai putea conecta în panou până la reactivare. Istoricul acțiunilor rămâne în jurnal.`, action: 'staffDisable', id: s.id, button: 'Dezactivează', danger: true });
  },
  staffDisable: async b => { await api('POST', `/api/admin/staff/${b.dataset.id}/disable`); closeDialog(); toast('Contul a fost dezactivat.'); render({ focus: false }); },
  staffEnableAsk: b => {
    const s = staffById(b.dataset.id);
    confirmDialog({ title: 'Reactivezi contul?', text: `${esc(s.name)} se va putea conecta din nou în panou, cu rolul ${ROLE_LABEL[s.role]}.`, action: 'staffEnable', id: s.id, button: 'Reactivează' });
  },
  staffEnable: async b => { await api('POST', `/api/admin/staff/${b.dataset.id}/enable`); closeDialog(); toast('Contul a fost reactivat.'); render({ focus: false }); },
  settingsReset: () => { state.settingsDraft = null; render({ focus: false }); },
  settingsSave: async () => {
    try {
      await api('PUT', '/api/admin/settings', { values: state.settingsDraft.values });
    } catch (err) {
      if (err.status === 401 || err.status === 403) throw err;
      const box = document.getElementById('settings-error');
      box.textContent = Object.keys(err.fields || {}).length ? Object.entries(err.fields).map(([k, m]) => `${DIFF_LABELS[k] || k}: ${m}`).join(' ') : err.message;
      box.hidden = false;
      return;
    }
    closeDialog();
    state.settingsDraft = null;
    toast('Setările au fost salvate și se aplică imediat.');
    render({ focus: false });
  },
});

// ---------- Evenimente ----------

document.addEventListener('submit', async e => {
  const form = e.target;
  const filters = { 'subs-filter': ['subs', SUBS_DEFAULT], 'pay-filter': ['pay', PAY_DEFAULT], 'audit-filter': ['audit', AUDIT_DEFAULT] };
  if (filters[form.id]) {
    const [key, defaults] = filters[form.id];
    const f = Object.fromEntries(new FormData(form));
    if (f.q !== undefined) f.q = String(f.q).trim();
    if (form.id === 'audit-filter' && f.from && f.to && f.from > f.to) { showFieldError(form, 'to', 'Data de sfârșit este înaintea celei de început.'); return; }
    state[key] = { ...defaults, ...f, page: 1 };
    render({ focus: false });
    return;
  }
  if (form.id === 'settings-form') {
    if (!validateForm(form)) return;
    if (state.settingsDraft?.dirty) settingsConfirm();
    return;
  }
  if (form.id !== 'staff-invite-form' && form.id !== 'staff-role-form') return;
  if (!validateForm(form)) return;
  const f = new FormData(form);
  try {
    await withBusy(form.querySelector('[type=submit]'), async () => {
      if (form.id === 'staff-invite-form') {
        const r = await api('POST', '/api/admin/staff', { name: String(f.get('name')).trim(), email: String(f.get('email')).trim(), role: f.get('role') });
        closeDialog();
        toast(`Invitația a fost trimisă la ${r.email}.`);
      } else {
        if (f.get('role') === form.dataset.current) { closeDialog(); return; }
        await api('POST', `/api/admin/staff/${form.dataset.id}/role`, { role: f.get('role') });
        closeDialog();
        toast(`Rolul a fost schimbat în ${ROLE_LABEL[f.get('role')]}.`);
      }
      await render({ focus: false });
    }, 'Se trimite…');
  } catch (err) {
    formError(form, err);
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  const sd = state.settingsDraft;
  if (!sd || !t.closest?.('#settings-form') || !(t.name in sd.values)) return;
  const meta = sd.meta[t.name];
  sd.values[t.name] = meta.type === 'bool' ? t.checked : meta.type === 'int' ? (t.value === '' ? '' : Number(t.value)) : t.value;
  clearFieldError(t);
  settingsSync();
});
