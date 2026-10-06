'use strict';
// Planul personalizat (doar în cont): afișare, dialoguri și acțiuni.
// Regulile (eligibilitate, gratuit/Premium, calcul nutrițional, fără duplicate) sunt aplicate pe server;
// aici doar afișăm ce trimite serverul.

const SLOT_TIME = { mic_dejun: '08:00', pranz: '13:00', cina: '19:00', gustare: '16:30' };
const TASK_ICON = { apa: 'drop', antrenament: 'dumbbell', miscare: 'heart', obicei: 'sparkles', cantarire: 'chart' };
const PORTIONS = [0.5, 0.75, 1, 1.25, 1.5];

const nutritionLine = n => `${format(n.protein, 1)} g proteine · ${format(n.carbs, 1)} g carbo · ${format(n.fat, 1)} g grăsimi`;

const planSourceTag = plan => plan.source === 'ai'
  ? `<span class="tag green">Generat de AI</span>`
  : `<span class="tag warn">Plan de test · fără AI</span>`;

/** Fotografiile existente, potrivite după numele mesei (doar când ingredientul principal coincide). */
const PLAN_PHOTOS = [
  [/somon/, 'meal.jpg'],
  [/iaurt.*granola|granola.*iaurt/, 'img/meal-iaurt-granola.jpg'],
  [/chili/, 'img/meal-chili.jpg'],
];
const planPhoto = m => PLAN_PHOTOS.find(([re]) => re.test(normalize(m.name)))?.[1] || null;

function planMealCover(m) {
  const photo = planPhoto(m);
  if (photo) return `<img src="${photo}" alt="${esc(m.name)}" loading="lazy">`;
  return `<span>${esc(m.label)}.</span><small>${esc(m.ingredients.slice(0, 3).map(i => i.name).join(' · '))}</small><i class="cover-icon" aria-hidden="true">${icon(m.slot === 'mic_dejun' ? 'sparkles' : 'leaf')}</i>`;
}

function planEatButton(key, m) {
  if (slotLogged(key, m.slotIndex)) return `<button class="btn lime full" disabled>${label('Înregistrată în jurnal', 'În jurnal')}</button>`;
  if (isFuture(key)) return `<button class="btn dark full" disabled>${label('Disponibil în ziua respectivă', 'Mai târziu')}</button>`;
  return `<button class="btn dark full" data-action="planEat" data-date="${key}" data-slot="${m.slot}">${label('Am mâncat această masă', 'Am mâncat')}</button>`;
}

// ---------- Invitația de a genera planul / motivul pentru care nu se poate ----------

function planSetupCard() {
  const p = db.plan;
  if (ui.generating) {
    return `
    <section class="card plan-cta" role="status">
      <span class="spinner big" aria-hidden="true"></span>
      <div><h3>Se generează planul tău…</h3><p>Alegem mesele și sarcinile, apoi serverul verifică dieta, alimentele evitate și caloriile. Durează de obicei sub un minut.</p></div>
    </section>`;
  }
  if (!p) {
    return ui.planError
      ? `<div class="notice-card">${icon('info')}<div><strong>Nu am putut încărca planul.</strong><p>${esc(ui.planError)}</p></div><button class="btn outline small" data-action="planReload">Reîncearcă</button></div>`
      : '';
  }
  if (p.blocked) {
    const action = {
      profile_incomplete: '<button class="btn outline small" data-view="chestionar">Completează</button>',
      targets_missing: '<button class="btn outline small" data-action="targets">Setează țintele</button>',
    }[p.blockedCode] || '';
    return `
    <div class="notice-card">
      ${icon('info')}
      <div><strong>Planul personalizat nu poate fi generat încă.</strong><p>${esc(p.blocked)} Mai jos sunt exemple generale.</p></div>
      ${action}
    </div>`;
  }
  return `
  <section class="card plan-cta">
    <span class="plan-cta-icon">${icon('sparkles')}</span>
    <div>
      <h3>Planul tău personalizat pentru această săptămână</h3>
      <p>Mese cu gramaje și sarcini zilnice, după profilul, preferințele și țintele tale. Caloriile sunt calculate din catalogul nutrițional, nu estimate de AI.</p>
      ${p.provider === 'test' ? '<p class="muted small-note">Mod de dezvoltare: fără cheie AI pe server, planul se generează local, ca test.</p>' : ''}
    </div>
    <button class="btn dark" data-action="generatePlan">Generează planul</button>
  </section>`;
}

// ---------- Pagina „Plan alimentar” cu planul generat ----------

function planMealCard(key, m) {
  return `
  <article class="card meal-card">
    <div class="meal-card-top">${planMealCover(m)}<span class="photo-label">${SLOT_TIME[m.slot]}</span></div>
    <div class="meal-card-body">
      <span class="eyebrow">${esc(m.label.toUpperCase())}</span>
      <h3>${esc(m.name)}</h3>
      <div class="meal-meta"><span>${icon('fire')}${format(m.nutrition.kcal)} kcal</span><span>${icon('clock')}${m.minutes} min</span></div>
      <p>${nutritionLine(m.nutrition)}</p>
      <div class="meal-actions">
        <button class="btn outline full" data-action="planRecipe" data-date="${key}" data-slot="${m.slot}">${label('Rețetă & ingrediente', 'Rețetă')}</button>
        ${planEatButton(key, m)}
      </div>
    </div>
  </article>`;
}

function planFoodPage() {
  const p = db.plan;
  const now = today();
  if (!weekDates().some(d => dateKey(d) === ui.selectedDate)) ui.selectedDate = now;
  const key = ui.selectedDate;
  const sel = parseKey(key);
  const day = planDay(key);
  const t = p.plan.targets;
  return `
  ${heading('Planul tău alimentar', 'Generat pentru profilul, preferințele și țintele tale.', `<button class="btn outline" data-view="chestionar">${icon('settings')}Preferințe</button>`)}
  ${ui.generating ? planSetupCard() : ''}
  <div class="week-tabs">${[1, 2, 3, 4].map(w => {
    const active = w === p.weekIndex;
    const locked = !p.premium && w > 1;
    return `<button class="week-tab ${active ? 'active' : ''}" data-action="week" data-week="${locked ? w : 1}" ${active ? 'aria-current="true"' : ''}>${locked ? icon('lock') : icon('calendar')}Săptămâna ${w}${w === 1 ? ' · Gratuit' : ''}</button>`;
  }).join('')}</div>
  <div class="day-picker" role="group" aria-label="Alege ziua">${weekDates().map((date, i) => {
    const k = dateKey(date);
    return `<button class="day-btn ${k === key ? 'active' : ''} ${k === now ? 'today' : ''}" data-action="day" data-date="${k}" aria-pressed="${k === key}" aria-label="${WEEKDAYS_LONG[i]}, ${shortDate(date)}${k === now ? ', astăzi' : ''}">${WEEKDAYS[i]}<strong>${date.getDate()}</strong>${k === now ? 'Astăzi' : shortMonth(date)}</button>`;
  }).join('')}</div>
  <div class="section-label"><h2>Meniul pentru ${WEEKDAYS_LONG[weekdayIndex(sel)]}, ${shortDate(sel)}</h2>${planSourceTag(p.plan)}</div>
  ${day ? `
  <div class="plan-totals">
    <div><strong>${format(day.nutrition.kcal)}</strong><small>din ${format(t.kcal)} kcal</small></div>
    <div><strong>${format(day.nutrition.protein)} g</strong><small>proteine</small></div>
    <div><strong>${format(day.nutrition.carbs)} g</strong><small>carbohidrați</small></div>
    <div><strong>${format(day.nutrition.fat)} g</strong><small>grăsimi</small></div>
  </div>
  <div class="meal-list">${day.meals.map(m => planMealCard(key, m)).join('')}</div>
  ${day.note ? `<p class="plan-note">${icon('heart')}${esc(day.note)}</p>` : ''}
  <div class="section-label"><h2>Sarcinile zilei</h2><span class="tag">${day.tasks.filter(x => x.done).length}/${day.tasks.length}</span></div>
  <section class="card">${tasksList(key, day.tasks)}</section>`
  : `<div class="empty-log">${icon('calendar')}<p>Nu există plan pentru această zi.</p></div>`}
  <div class="info-strip">${icon('info')}Caloriile și macronutrienții sunt calculați pe server din catalogul nutrițional. Planul nu ține loc de sfat medical; oprește-te dacă apare disconfort.</div>
  <div class="actions-row"><button class="btn outline small" data-action="planRegenerateAsk">${icon('sparkles')}Regenerează planul</button></div>`;
}

// ---------- Sarcini ----------

function taskDetail(key, t) {
  if (t.locked) return t.detail;
  if (t.type === 'apa') return `${format(getDay(key).water)} din ${format(t.waterMl)} ml · ${t.detail}`;
  if (t.type === 'antrenament') return `${t.exercises.length} exerciții · ${t.minutes} min`;
  if (t.type === 'miscare' && t.minutes) return `${t.minutes} min · ${t.detail}`;
  return t.detail;
}

function tasksList(key, tasks) {
  return `<ul class="task-list">${tasks.map(t => `
    <li class="task ${t.done ? 'done' : ''} ${t.locked ? 'locked' : ''}">
      ${t.locked
        ? `<span class="task-check" aria-hidden="true">${icon('lock')}</span>`
        : `<button class="task-check" data-action="planTask" data-date="${key}" data-task="${t.id}" aria-pressed="${!!t.done}" aria-label="${t.done ? 'Debifează' : 'Bifează'}: ${esc(t.title)}">${t.done ? icon('check') : ''}</button>`}
      <span class="task-icon" aria-hidden="true">${icon(TASK_ICON[t.type] || 'check')}</span>
      <div class="task-text"><strong>${esc(t.title)}</strong><small>${esc(taskDetail(key, t))}</small></div>
      ${t.locked ? '<button class="btn outline small" data-view="abonamente">Premium</button>'
        : t.type === 'antrenament' ? `<button class="btn outline small" data-action="planWorkout" data-date="${key}">Vezi</button>` : ''}
    </li>`).join('')}
  </ul>`;
}

function todayTasksCard() {
  const day = planDay();
  if (!day) return '';
  const done = day.tasks.filter(t => t.done).length;
  return `
  <section class="card tasks-card">
    <div class="card-heading"><h3>Sarcinile de azi</h3><span class="tag green">${done}/${day.tasks.length}</span></div>
    ${tasksList(today(), day.tasks)}
  </section>`;
}

// ---------- Masa următoare din plan (panou) ----------

function planFeature() {
  const key = today();
  const day = planDay(key);
  const next = day.meals.find(m => !slotLogged(key, m.slotIndex));
  const m = next || day.meals.at(-1);
  return `
  <article class="card meal-feature">
    <div class="meal-photo"><div class="meal-card-top">${planMealCover(m)}</div><span class="photo-label">${SLOT_TIME[m.slot]} · ${esc(m.label)}</span></div>
    <div class="meal-copy">
      <span class="eyebrow">${next ? 'URMĂTOAREA TA MASĂ' : 'TOATE MESELE DE AZI SUNT ÎN JURNAL'}</span>
      <h3>${esc(m.name)}</h3>
      <div class="meal-meta"><span>${icon('fire')}${format(m.nutrition.kcal)} kcal</span><span>${icon('clock')}${m.minutes} min</span></div>
      <div class="meal-macros">${nutritionLine(m.nutrition)}</div>
      <button class="btn outline" data-action="planRecipe" data-date="${key}" data-slot="${m.slot}">Vezi rețeta</button>
    </div>
  </article>`;
}

// ---------- Mișcarea de azi (panou) ----------

function planWorkoutCard() {
  const day = planDay();
  const w = day.tasks.find(t => t.type === 'antrenament');
  const move = day.tasks.find(t => t.type === 'miscare');
  const done = w ? w.done : move?.done;
  const title = w ? w.title : move ? move.title : 'Zi de odihnă';
  const text = w?.locked ? 'Antrenamentele de după ziua 1 sunt incluse în Premium.'
    : done ? 'Ai bifat mișcarea de azi. Bravo!'
    : w ? esc(w.detail) : 'Azi e zi de refacere: mișcare ușoară, fără efort mare.';
  const meta = w && !w.locked ? `${w.minutes} min · ${w.exercises.length} exerciții` : move?.minutes ? `${move.minutes} min` : '';
  return `
  <article class="card workout-card">
    <div class="workout-top"><span class="workout-symbol">${icon(w ? 'dumbbell' : 'heart')}</span><span class="tag">${esc(db.form.location || '')} · ${esc(db.form.experience || '')}</span></div>
    <h3>${esc(title)}</h3>
    <p>${text}</p>
    <div class="workout-actions"><span>${meta}</span>${w?.locked
      ? '<button class="btn dark" data-view="abonamente">Vezi Premium</button>'
      : w ? `<button class="btn dark" data-action="planWorkout" data-date="${day.date}">${done ? 'Vezi antrenamentul' : 'Începe sesiunea'}</button>` : ''}</div>
  </article>`;
}

// ---------- Antrenamentele din plan ----------

function planWorkoutPage() {
  const days = db.plan.plan.days.filter(d => d.tasks.some(t => t.type === 'antrenament'));
  const workoutOf = d => d.tasks.find(t => t.type === 'antrenament');
  if (!ui.workoutDate || !days.some(d => d.date === ui.workoutDate)) {
    ui.workoutDate = (days.find(d => d.date >= today()) || days[0])?.date;
  }
  const day = days.find(d => d.date === ui.workoutDate);
  const w = day && workoutOf(day);
  const head = heading('Mișcare care se potrivește cu tine.', 'Antrenamentele din planul tău, după echipament, experiență și timpul disponibil.', `<button class="btn outline" data-action="trainingSettings">${icon('settings')}Configurează</button>`);
  if (!w) return `${head}<div class="empty-log">${icon('dumbbell')}<p>Planul acestei săptămâni nu are antrenamente.</p></div>`;
  const tabs = `<div class="week-tabs">${days.map(d => {
    const date = parseKey(d.date);
    const t = workoutOf(d);
    return `<button class="week-tab ${d.date === ui.workoutDate ? 'active' : ''}" data-action="planWorkoutDay" data-date="${d.date}" ${d.date === ui.workoutDate ? 'aria-current="true"' : ''}>${t.locked ? icon('lock') : t.done ? icon('check') : icon('dumbbell')}${WEEKDAYS[weekdayIndex(date)]} ${date.getDate()}</button>`;
  }).join('')}</div>`;
  if (w.locked) {
    return `${head}${tabs}
    <section class="card plan-cta">
      <span class="plan-cta-icon">${icon('lock')}</span>
      <div><h3>Antrenament Premium</h3><p>Prima zi de antrenament este gratuită. Antrenamentele următoare sunt incluse în Premium.</p></div>
      <button class="btn dark" data-view="abonamente">Vezi abonamentele</button>
    </section>`;
  }
  const isToday = day.date === today();
  return `${head}${tabs}
  <div class="two-col">
    <section class="card">
      <div class="card-heading"><h3>${esc(w.title)}</h3>${planSourceTag(db.plan.plan)}</div>
      <div class="exercise-list">${w.exercises.map((e, i) => `
        <div class="exercise">
          <span class="exercise-num">${String(i + 1).padStart(2, '0')}</span>
          <div><h3>${esc(e.name)}</h3><p>${e.sets} × ${e.mode === 'reps' ? `${e.reps} repetări` : `${e.seconds} s`} · pauză ${e.restSec} s</p></div>
          <button class="icon-button" data-action="planExercise" data-date="${day.date}" data-i="${i}" aria-label="Instrucțiuni pentru ${esc(e.name)}">${icon('info')}</button>
        </div>`).join('')}
      </div>
    </section>
    <section class="card workout-overview">
      <span class="hero-tag">${icon('dumbbell')}${esc(db.form.location || '').toUpperCase()} · ${esc(db.form.experience || '').toUpperCase()}</span>
      <h2>${esc(w.title)}</h2>
      <p>${esc(w.detail)}</p>
      <div class="workout-stats">
        <div><strong>${w.minutes}</strong><small>minute</small></div>
        <div><strong>${w.exercises.length}</strong><small>exerciții</small></div>
        <div><strong>${days.length}</strong><small>zile / săptămână</small></div>
      </div>
      ${w.done ? `<button class="btn lime full" disabled>${icon('check')}Antrenament finalizat</button>`
        : isToday ? `<button class="btn lime full" data-action="planStartWorkout" data-date="${day.date}" data-task="${w.id}">${icon('play')}Începe antrenamentul</button>`
        : `<button class="btn lime full" disabled>${day.date > today() ? 'Disponibil în ziua respectivă' : 'Zi trecută'}</button>`}
    </section>
  </div>
  <div class="info-strip">${icon('info')}Exerciții din catalogul Metamorf. Oprește-te dacă apare durere sau disconfort.</div>`;
}

// ---------- Dialoguri ----------

function planRecipeDialog(key, slot) {
  const m = planMeal(key, slot);
  if (!m) return;
  const logged = slotLogged(key, m.slotIndex);
  modal(`
    <span class="tag">${esc(m.label.toUpperCase())} · DIN PLANUL TĂU</span>
    <h2>${esc(m.name)}</h2>
    <div class="recipe-facts">
      <div><strong>${format(m.nutrition.kcal)}</strong><small>kcal</small></div>
      <div><strong>${m.minutes}</strong><small>minute</small></div>
      <div><strong>${format(m.nutrition.protein)} g</strong><small>proteine</small></div>
    </div>
    <h3 style="font-size:16px">Ingrediente</h3>
    <ul class="ingredient-list">${m.ingredients.map(i => `<li><span>${esc(i.name)}</span><span>${format(i.grams)} g · <small>${format(i.kcal)} kcal</small></span></li>`).join('')}</ul>
    <h3 style="font-size:16px">Preparare</h3>
    <ol>${m.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="small-note">Valori calculate din catalogul nutrițional al aplicației; pot varia în funcție de produse.</p>
    ${logged ? '<button class="btn lime full" disabled>Masa este deja în jurnal</button>'
      : isFuture(key) ? '<button class="btn dark full" disabled>Poți înregistra masa în ziua respectivă</button>'
      : `<button class="btn dark full" data-action="planEat" data-date="${key}" data-slot="${slot}">Am mâncat această masă</button>`}
    ${logged ? '' : `<button class="btn outline full" style="margin-top:10px" data-action="planReplace" data-date="${key}" data-slot="${slot}">${icon('sparkles')}Înlocuiește masa</button>`}`);
}

function portionDialog(key, slot) {
  const m = planMeal(key, slot);
  if (!m) return;
  modal(`
    <h2>Cât ai mâncat?</h2>
    <p>${esc(m.label)} · ${esc(m.name)}</p>
    <form id="plan-portion-form" data-date="${key}" data-slot="${slot}">
      <fieldset class="portion-grid"><legend class="sr-only">Porția consumată</legend>
        ${PORTIONS.map(p => `
        <label class="choice portion"><input type="radio" name="portion" value="${p}" required ${p === 1 ? 'checked' : ''}><strong>${p === 1 ? 'Toată porția' : `${Math.round(p * 100)}%`}</strong><small>${format(Math.round(m.nutrition.kcal * p))} kcal</small></label>`).join('')}
      </fieldset>
      <button class="btn dark full" type="submit" style="margin-top:16px">Adaugă în jurnal</button>
    </form>`);
}

function planExerciseDialog(key, i) {
  const w = planDay(key)?.tasks.find(t => t.type === 'antrenament');
  const e = w?.exercises?.[i];
  if (!e) return;
  modal(`
    <h2>${esc(e.name)}</h2>
    <span class="tag green">${e.sets} × ${e.mode === 'reps' ? `${e.reps} repetări` : `${e.seconds} s`} · pauză ${e.restSec} s</span>
    <p>${esc(e.instructions)}</p>
    <p class="small-note">Mișcă-te controlat și oprește-te dacă apare durere.</p>`);
}

function regenerateDialog() {
  modal(`
    <h2>Regenerezi planul săptămânii?</h2>
    <p>Primești mese și sarcini noi pentru toată săptămâna. Bifările sarcinilor din această săptămână se resetează; mesele deja înregistrate rămân în jurnal.</p>
    <div class="field-row">
      <button class="btn outline" data-action="close">Renunță</button>
      <button class="btn dark" data-action="generatePlan" data-force="1">Regenerează</button>
    </div>`);
}

// ---------- Acțiuni și formulare ----------

Object.assign(actions, {
  generatePlan: async b => {
    const force = b.dataset.force === '1';
    closeDialog();
    ui.generating = true;
    navigate('alimentatie', { focus: false });
    try {
      await generatePlan(force);
      ui.selectedDate = today();
      toast(db.plan?.plan?.source === 'ai' ? 'Planul tău personalizat este gata.' : 'Planul de test este gata (generat local, fără AI).');
    } finally {
      ui.generating = false;
      refresh();
    }
  },
  planReload: async () => { await loadPlan(); refresh(); },
  planRegenerateAsk: regenerateDialog,
  planRecipe: b => planRecipeDialog(b.dataset.date, b.dataset.slot),
  planEat: b => portionDialog(b.dataset.date, b.dataset.slot),
  planReplace: async b => {
    const meal = await replacePlanMeal(b.dataset.date, b.dataset.slot);
    refresh();
    planRecipeDialog(b.dataset.date, b.dataset.slot);
    toast(`Masa nouă: ${meal.name}.`);
  },
  planTask: async b => {
    const done = b.getAttribute('aria-pressed') !== 'true';
    await setPlanTask(b.dataset.date, b.dataset.task, done);
    refresh();
    document.querySelector(`[data-action="planTask"][data-task="${b.dataset.task}"]`)?.focus();
  },
  planWorkout: b => { ui.workoutDate = b.dataset.date; closeDialog(); navigate('antrenamente'); },
  planWorkoutDay: b => { ui.workoutDate = b.dataset.date; refresh(); },
  planExercise: b => planExerciseDialog(b.dataset.date, Number(b.dataset.i)),
  planStartWorkout: b => { ui.activeTask = { day: b.dataset.date, taskId: b.dataset.task }; workoutDialog(); },
});

// La finalizarea unui antrenament din plan, bifăm și sarcina corespunzătoare.
const finishWorkoutBase = actions.finishWorkout;
actions.finishWorkout = async b => {
  const task = ui.activeTask;
  ui.activeTask = null;
  await finishWorkoutBase(b);
  if (task && planDay(task.day)) {
    try { await setPlanTask(task.day, task.taskId, true); refresh(); } catch (err) { toastError(err); }
  }
};

Object.assign(submits, {
  'plan-portion-form': async (form, f) => {
    const portion = Number(f.get('portion'));
    await logPlanPortion(form.dataset.date, form.dataset.slot, portion);
    closeDialog();
    refresh();
    toast(portion === 1 ? 'Masa a fost adăugată în jurnal.' : `Am adăugat ${Math.round(portion * 100)}% din porție în jurnal.`);
  },
});
