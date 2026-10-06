'use strict';
// Evenimente: un handler pentru clic (data-view / data-action) și unul pentru formulare.
// Acțiunile care ajung la server sunt asincrone: butonul intră în starea „se încarcă”, iar erorile apar în toast.

const menuButton = () => document.querySelector('[data-action="menu"]');

function openMenu() {
  document.body.classList.add('menu-open');
  menuButton().setAttribute('aria-expanded', 'true');
  // Forțăm recalcularea stilului, ca meniul să fie deja vizibil (și focusabil) când mutăm focusul.
  void document.getElementById('sidebar').offsetWidth;
  (document.querySelector('#nav .nav-item.active') || document.querySelector('#nav .nav-item'))?.focus();
}

function closeMenu() {
  if (!document.body.classList.contains('menu-open')) return;
  document.body.classList.remove('menu-open');
  menuButton().setAttribute('aria-expanded', 'false');
}

async function logPlanMeal(key, slot) {
  const result = await addPlanMeal(key, slot);
  if (result === 'duplicate') { refresh(); return toast('Masa este deja înregistrată pentru această zi.'); }
  if (result === 'future') return toast('Poți înregistra masa în ziua respectivă.');
  refresh();
  toast(key === today() ? 'Masa a fost adăugată în jurnalul de azi.' : `Masa a fost adăugată în jurnalul din ${shortDate(parseKey(key))}.`);
}

function useDemoScan(kind) {
  if (!scansLeft()) return lockedDialog('Scanarea demo de azi a fost folosită.');
  ensureDay().scans++;
  save();
  ui.scanResult = { ...DEMO_SCAN[kind] };
  refresh();
  toast('Rezultat demonstrativ. Alimentul nu a fost identificat automat.');
}

async function logout() {
  try { await API.post('/api/auth/logout'); } catch { /* deconectăm local oricum */ }
  enterGuest();
  ui.authTab = 'login';
  closeDialog();
  navigate('bun-venit');
  toast('Te-ai deconectat.');
}

function onSessionExpired() {
  enterGuest();
  ui.authTab = 'login';
  closeDialog();
  navigate('bun-venit');
  toast('Sesiunea a expirat. Conectează-te din nou.', null, 'error');
}

const actions = {
  menu: () => (document.body.classList.contains('menu-open') ? closeMenu() : openMenu()),
  close: closeDialog,
  toastAction: async () => { const run = toastUndo; hideToast(); await run?.(); },

  // Conturi și moduri
  authTab: b => { ui.authTab = b.dataset.tab; refresh(); document.querySelector('#auth-panel input, #content form input')?.focus(); },
  goForgot: () => { ui.authTab = 'forgot'; navigate('bun-venit'); },
  enterDemo: () => { enterDemo(); navigate('acasa'); toast('Ești în modul demo. Datele sunt exemple și rămân doar în acest browser.'); },
  exitDemo: () => { closeDialog(); enterGuest(); ui.authTab = 'register'; navigate('bun-venit'); },
  logout,
  retryLoad: () => boot(),

  // Panou
  water: () => changeWater(250).then(() => { refresh(); toast('250 ml adăugați.'); }),
  waterMinus: () => changeWater(-250).then(refresh),
  targets: targetsDialog,
  targetsClear: async () => { await saveTargets(null); closeDialog(); refresh(); toast(isDemo() ? 'Țintele au revenit la valorile exemplu.' : 'Țintele au fost șterse.'); },

  // Dialoguri generale
  notifications: notificationsDialog,
  profile: profileDialog,
  privacy: privacyDialog,
  terms: termsDialog,
  goProfile: () => { closeDialog(); ui.step = 1; navigate('chestionar'); },
  resetAsk: resetDemoDialog,
  resetConfirm: () => { resetDemo(); closeDialog(); navigate('acasa'); toast('Modul demo a fost resetat.'); },
  changePassword: changePasswordDialog,
  healthData: healthDataDialog,
  withdrawHealth: async () => { await saveProfile({ healthConsent: false }); closeDialog(); refresh(); toast('Acordul a fost retras, iar datele de sănătate au fost șterse.'); },
  deleteAccountAsk: deleteAccountDialog,
  goPrices: () => { closeDialog(); navigate('abonamente'); },
  resultPlan: () => { closeDialog(); navigate('alimentatie'); },
  backDashboard: () => { closeDialog(); navigate('acasa'); },
  subscription: b => subscriptionDialog(b.dataset.period),

  // Calendarul anului (datele se reîncarcă la fiecare deschidere, ca să includă ultimele înregistrări)
  yearCalendar: () => { calendar.year = null; calendar.selected = null; return yearCalendarDialog(); },
  calYear: async b => {
    const year = Number(b.dataset.year);
    const arrow = b.textContent.trim(); // '‹', '›' sau „Anul curent”
    await yearCalendarDialog(year);
    // Focusul rămâne pe aceeași săgeată, ca anii să poată fi parcurși rapid de la tastatură.
    const target = arrow === '‹' ? year - 1 : arrow === '›' ? year + 1 : null;
    const same = target && document.querySelector(`#dialog [data-action="calYear"][data-year="${target}"]`);
    (same && !same.disabled ? same : document.querySelector('#dialog .cal-day.selected'))?.focus();
  },
  calDay: b => selectCalendarDay(b.dataset.date),
  calOpenDay: b => { ui.selectedDate = b.dataset.date; closeDialog(); navigate('alimentatie'); },

  // Plan alimentar
  week: b => (Number(b.dataset.week) > 1 ? lockedDialog('Deblochează planul pentru toată luna.') : null),
  day: b => { ui.selectedDate = b.dataset.date; refresh(); document.querySelector(`[data-action="day"][data-date="${b.dataset.date}"]`)?.focus(); },
  recipe: b => recipeDialog(b.dataset.date, Number(b.dataset.slot)),
  mealDone: b => logPlanMeal(b.dataset.date, Number(b.dataset.slot)),
  recipeDone: async b => { await logPlanMeal(b.dataset.date, Number(b.dataset.slot)); closeDialog(); },

  // Antrenamente
  trainingDay: b => (Number(b.dataset.day) > 1 ? lockedDialog('Continuă de la ziua 2 cu Premium.') : toast('Ești în prima zi, disponibilă gratuit.')),
  exercise: b => exerciseDialog(Number(b.dataset.index)),
  trainingSettings: trainingSettingsDialog,
  startWorkout: workoutDialog,
  pauseWorkout: b => {
    ui.workoutRunning = !ui.workoutRunning;
    b.textContent = ui.workoutRunning ? 'Pauză' : 'Continuă';
    b.setAttribute('aria-pressed', String(!ui.workoutRunning));
  },
  finishWorkout: async () => {
    ui.workoutRunning = false;
    await addWorkout(ui.seconds);
    closeDialog();
    refresh();
    toast('Sesiune înregistrată. Fiecare pas contează.');
  },

  // Scanner & jurnal
  scanMode: b => { ui.scanMode = b.dataset.mode; ui.scanResult = null; refresh(); },
  upload: () => document.getElementById('food-file').click(),
  demoScan: () => useDemoScan('photo'),
  saveScan: async () => {
    if (!ui.scanResult) return;
    await addLogEntry(today(), { ...ui.scanResult, source: 'scan' });
    ui.scanResult = null;
    refresh();
    toast('Exemplul a fost adăugat în jurnal.');
  },
  editEntry: b => entryDialog(b.dataset.id),
  deleteEntry: async b => {
    const removed = await removeEntry(b.dataset.id);
    if (!removed) return;
    refresh();
    toast(`„${removed.entry.name}” a fost șters.`, { label: 'Anulează', run: () => restoreEntry(removed).then(refresh).catch(toastError) });
  },

  // Progres
  addWeight: weightDialog,
  deleteWeight: async b => {
    const w = await removeWeight(b.dataset.id);
    if (!w) return;
    refresh();
    toast('Înregistrarea a fost ștearsă.', { label: 'Anulează', run: () => restoreWeight(w).then(refresh).catch(toastError) });
  },
  clearDemoWeights: () => { clearDemoWeights(); refresh(); toast('Datele exemplu au fost șterse.'); },

  // Chestionar
  previousStep: () => { keepStepValues(document.getElementById('profile-form')); ui.step--; render(); document.querySelector('#profile-form input, #profile-form select')?.focus(); },
};

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-view],[data-action]');
  if (!b || b.disabled || b.getAttribute('aria-busy') === 'true') return;
  if (b.dataset.view) {
    if (document.getElementById('dialog').open) closeDialog();
    navigate(b.dataset.view);
    return;
  }
  const action = actions[b.dataset.action];
  if (!action) return;
  try {
    const result = action(b);
    if (result instanceof Promise) await withBusy(b, () => result, 'Se încarcă…');
  } catch (err) {
    toastError(err);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('menu-open')) {
    closeMenu();
    menuButton().focus();
  }
});

// ---------- Formulare ----------

const numberOf = (f, name) => Number(String(f.get(name)).replace(',', '.'));

/** Valorile pasului curent din chestionar, convertite pentru server. */
function stepValues(form) {
  const f = new FormData(form);
  const out = {};
  for (const [k, v] of f.entries()) {
    if (k === 'ack' || k === 'healthConsent') continue;
    const s = String(v).trim();
    out[k] = ['age', 'height', 'weight', 'days', 'minutes'].includes(k) ? (s === '' ? null : Number(s.replace(',', '.'))) : s;
  }
  const consent = form.elements.healthConsent;
  if (consent) out.healthConsent = consent.checked;
  return out;
}

/** Păstrează local valorile când utilizatorul se întoarce un pas (fără validare). */
function keepStepValues(form) {
  if (!form) return;
  const v = stepValues(form);
  for (const [k, val] of Object.entries(v)) db.form[k] = val ?? '';
}

const submits = {
  'login-form': async (form, f) => {
    const me = await API.post('/api/auth/login', { email: f.get('email'), password: f.get('password') });
    await enterAccount(me);
    navigate('acasa');
    toast(`Bine ai revenit, ${me.user.name}!`);
  },

  'register-form': async (form, f) => {
    const me = await API.post('/api/auth/register', {
      name: f.get('name'), email: f.get('email'), password: f.get('password'), terms: form.elements.terms.checked,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    await enterAccount(me);
    navigate('acasa');
    toast('Contul a fost creat. Bun venit în Metamorf!');
  },

  'forgot-form': async (form, f) => {
    const r = await API.post('/api/auth/forgot', { email: f.get('email') });
    setFormAlert(form, r.message, 'success');
    form.querySelector('button[type=submit]').disabled = true;
  },

  'reset-form': async (form, f) => {
    if (f.get('password') !== f.get('confirm')) {
      showFieldError(form, 'confirm', 'Parolele nu coincid.');
      form.elements.confirm.focus();
      return;
    }
    const me = await API.post('/api/auth/reset', { token: ui.resetToken, password: f.get('password') });
    ui.resetToken = '';
    await enterAccount(me);
    navigate('acasa');
    toast('Parola a fost schimbată. Ești conectat.');
  },

  'password-form': async (form, f) => {
    await API.post('/api/account/password', { current: f.get('current'), next: f.get('next') });
    closeDialog();
    toast('Parola a fost schimbată. Celelalte dispozitive au fost deconectate.');
  },

  'delete-account-form': async (form, f) => {
    await API.del('/api/account', { password: f.get('password') });
    closeDialog();
    enterGuest();
    navigate('bun-venit');
    toast('Contul și toate datele au fost șterse.');
  },

  'profile-form': async form => {
    const values = stepValues(form);
    const isLast = ui.step === QUESTION_STEPS;
    await saveProfile({ ...values, step: ui.step, ...(isLast ? { done: true } : {}) });
    if (!isLast) {
      ui.step++;
      render();
      document.querySelector('#profile-form input, #profile-form select')?.focus();
      return;
    }
    renderNav();
    profileResultDialog();
  },

  'training-form': async form => { await saveProfile(stepValues(form)); closeDialog(); refresh(); toast('Preferințele de antrenament au fost salvate.'); },

  'barcode-form': () => useDemoScan('barcode'),

  'manual-form': async (form, f) => {
    const grams = numberOf(f, 'portion');
    const ratio = grams / 100;
    const per = (name, digits = 1) => Math.round(numberOf(f, name) * ratio * 10 ** digits) / 10 ** digits;
    await addLogEntry(today(), { name: String(f.get('name')).trim(), grams, kcal: per('kcal', 0), protein: per('protein'), carbs: per('carbs'), fat: per('fat'), source: 'manual' });
    refresh();
    toast('Alimentul a fost adăugat în jurnal.');
  },

  'entry-form': async (form, f) => {
    await updateEntry(form.dataset.id, {
      name: String(f.get('name')).trim(),
      kcal: Math.round(numberOf(f, 'kcal')), protein: numberOf(f, 'protein'), carbs: numberOf(f, 'carbs'), fat: numberOf(f, 'fat'),
    });
    closeDialog();
    refresh();
    toast('Intrarea a fost actualizată.');
  },

  'targets-form': async (form, f) => {
    const t = {};
    for (const k of Object.keys(DEFAULT_TARGETS)) t[k] = numberOf(f, k);
    await saveTargets(t);
    closeDialog();
    refresh();
    toast('Țintele zilnice au fost salvate.');
  },

  'weight-form': async (form, f) => {
    const date = String(f.get('date')), time = String(f.get('time'));
    if (date > today() || (date === today() && time > clockTime())) {
      showFieldError(form, 'time', 'Data și ora nu pot fi în viitor.');
      return;
    }
    await addWeight(date, time, Math.round(numberOf(f, 'weight') * 10) / 10);
    closeDialog();
    refresh();
    toast('Greutatea a fost înregistrată.');
  },
};

document.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const handler = submits[form.id];
  if (!handler || !validateForm(form)) return;
  const button = form.querySelector('button[type=submit]');
  try {
    await withBusy(button, () => handler(form, new FormData(form)));
  } catch (err) {
    if (form.isConnected) showServerError(form, err);
    else toastError(err);
  }
});

document.addEventListener('change', e => {
  if (e.target.id !== 'food-file') return;
  const file = e.target.files[0];
  if (!file) return;
  if (!/^image\//.test(file.type)) return toast('Alege un fișier imagine.', null, 'error');
  if (file.size > 10 * 1024 * 1024) return toast('Fotografia trebuie să fie mai mică de 10 MB.', null, 'error');
  if (ui.scanImage) URL.revokeObjectURL(ui.scanImage);
  ui.scanImage = URL.createObjectURL(file);
  ui.scanFileName = file.name;
  ui.scanResult = null;
  refresh();
});

const dialogEl = document.getElementById('dialog');
dialogEl.addEventListener('close', () => { stopWorkoutTimer(); restoreDialogFocus(); });
dialogEl.addEventListener('click', e => {
  if (e.target !== e.currentTarget) return;
  const r = e.currentTarget.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog();
});

window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  if (v !== ui.view) navigate(v);
});

// La revenirea în tab: zi nouă → reîmprospătăm; în cont, reîncărcăm datele (pot fi modificate de pe alt dispozitiv).
let renderedDay = today();
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || document.getElementById('dialog').open) return;
  if (today() !== renderedDay) { renderedDay = today(); ui.selectedDate = today(); }
  if (isAccount()) {
    try { await loadAccountData(); await loadPlan(); } catch { return; }
  }
  if (session.mode !== 'guest' && !document.querySelector('#content form')) refresh();
});
window.addEventListener('storage', e => {
  if (e.key !== STORAGE_KEY || !isDemo()) return;
  replaceDb(readDemoDb());
  if (!document.getElementById('dialog').open) refresh();
});
