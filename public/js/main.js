'use strict';
// Pornirea aplicației: verificăm sesiunea pe server, apoi alegem modul (cont, demo sau ecranul de bun venit).

async function boot() {
  hydrateIcons();
  const hash = location.hash.slice(1);
  ui.view = 'incarcare';
  render();

  let me = null;
  session.serverAvailable = location.protocol.startsWith('http');
  if (session.serverAvailable) {
    try { Object.assign(appSettings, await API.get('/api/settings')); } catch { /* rămân valorile implicite */ }
    showMaintenance();
    try {
      me = await API.get('/api/me');
    } catch (err) {
      if (err.status !== 401) session.serverAvailable = false;
    }
  }

  try {
    if (me) await enterAccount(me);
    else if (preferredMode() === 'demo') enterDemo();
    else enterGuest(); // ecranul de bun venit explică dacă serverul nu e disponibil
  } catch (err) {
    ui.loadError = err.message;
    ui.view = 'eroare';
    render();
    return;
  }
  navigate(hash || (session.mode === 'guest' ? 'bun-venit' : 'acasa'), { focus: false });
}

/** Mesajul de mentenanță setat de echipă (nu blochează aplicația). */
function showMaintenance() {
  document.getElementById('maintenance')?.remove();
  if (!appSettings.maintenance?.message) return;
  const el = document.createElement('div');
  el.id = 'maintenance';
  el.className = 'maintenance-banner';
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon('info')}<span>${esc(appSettings.maintenance.message)}</span>`;
  document.body.prepend(el);
}

boot();

// Instrumente opționale pentru asistenți AI din browser (WebMCP), dacă browserul le suportă.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const register = tool => {
    try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* nesuportat */ }
  };
  register({
    name: 'navigate_metamorf',
    title: 'Deschide o secțiune Metamorf',
    description: 'Navighează la o secțiune a aplicației Metamorf.',
    inputSchema: { type: 'object', properties: { section: { type: 'string', enum: Object.keys(VIEWS) } }, required: ['section'], additionalProperties: false },
    annotations: { readOnlyHint: false },
    execute(input) {
      if (!input || !Object.hasOwn(VIEWS, input.section)) throw new Error('Secțiune invalidă');
      navigate(input.section);
      return { section: ui.view };
    },
  });
  register({
    name: 'read_daily_journal',
    title: 'Citește jurnalul de azi',
    description: 'Returnează alimentele și apa înregistrate astăzi.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute() {
      const d = getDay();
      return { date: today(), mode: session.mode, foods: d.log.map(({ name, kcal, protein, carbs, fat, time }) => ({ name, kcal, protein, carbs, fat, time })), calories: totals().kcal, waterMl: d.water };
    },
  });
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
