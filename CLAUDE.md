# Metamorf — instrucțiuni pentru continuarea proiectului

Citește PROJECT_SPEC.md, README.md și TASKS.md înainte de modificări. TASKS.md e sursa pentru ce e gata și ce urmează.

## Decizie de arhitectură (6 octombrie 2026)
Proiectul continuă pe structura actuală: server Node.js + SQLite și aplicația web din `public/`. Arhitectura Laravel + Next.js + Expo descrisă în `docs/VIZIUNE.md` **nu a fost adoptată**; o aplicație mobilă se poate adăuga ulterior, folosind același API. Funcțiile și principiile din `docs/VIZIUNE.md` rămân valabile ca viziune de produs.

## Structură
- `public/` — frontend fără compilare: scripturi clasice (nu module ES, ca demo-ul să meargă și din fișier), încărcate în ordine din index.html.
  - `store.js`: `session` (guest/demo/account), `db` (date afișate), `ui`. Toate modificările trec prin funcțiile async de aici, care aleg localStorage (demo) sau API (cont).
  - `api.js` (fetch + antet CSRF `X-Metamorf: 1`), `forms.js` (validare cu mesaje în română, `withBusy`), `views.js`, `dialogs.js` (focus gestionat), `events.js` (`actions`, `submits`).
- `server/` — Node.js fără dependențe (`node:http`, `node:sqlite`, `node:crypto`). Rute în `server/routes`, migrații SQL numerotate în `server/migrations` (nu modifica o migrație aplicată; adaugă una nouă).
- `server/plan/` — planul personalizat: `foods.js` / `exercises.js` (cataloage; AI-ul alege doar de aici), `providers.js` (Claude prin `@anthropic-ai/sdk` + generator local de test), `validate.js` (validare + nutriție calculată pe server), `service.js` (generare, acces gratuit/Premium, porții, sarcini). Frontend: `public/js/plan.js`.
- `public/admin.html` + `public/js/admin.js` (navigare, panou, utilizatori) + `public/js/admin-content.js` (cereri de date, rețete) + `public/js/admin-library.js` (exerciții, catalog nutrițional, media) + `public/js/admin-system.js` (facturare, audit, echipă, setări) + `server/routes/admin*.js` — panoul de administrare; rolul se acordă doar cu `npm run admin -- grant email` (`server/admin-cli.js`).
- `test/api.test.js`, `test/plan.test.js`, `test/admin.test.js`, `test/admin-content.test.js`, `test/admin-library.test.js`, `test/admin-system.test.js` — `npm test` (fără apeluri reale la AI).
- `metamorf-logo.png` (de la proprietară, păstrează-l), `meal.jpg`.

## Reguli
- Fiecare interogare cu date personale filtrează după `ctx.user.id`. Adaugă un test de izolare pentru orice rută nouă.
- Alergiile și limitările fizice se salvează doar cu `health_consent_at`; minori/alergii/limitări → fără plan automat (`planEligibility`).
- Sursele `plan`, `barcode`, `photo` din jurnal sunt rezervate serverului.
- Panoul de administrare cere sesiune cu 2FA (`ctx.mfa`), deschisă prin `/api/admin/auth/*`; orice rută nouă se declară cu `on()` din `server/admin-common.js` (rol + 2FA), orice acțiune se scrie în `admin_audit`, iar datele de sănătate, parolele și conținutul jurnalului nu se trimit spre panou.
- Caloriile/macronutrienții planurilor se calculează din catalog pe server; nu accepta niciodată numere nutriționale de la model. Orice câmp nou din răspunsul AI se validează în `plan/validate.js`.
- Nu inventa prețuri, rezultate AI, plăți reușite sau linkuri video. Cheile API stau doar în `.env` pe server.
- Identitate vizuală: negru și auriu (#0c0e0c, #e8cc7c), verde închis (#153d32). Texte în română, cu diacritice.

## Verificare
`node --check` pe fișierele JS, `npm test`, apoi verificare vizuală la 390, 768 și 1440 px (cont nou, demo, deschis din fișier). Nu publica online fără cererea utilizatorului.

- Exercițiile și alimentele stau în baza de date (`exercises`, `foods`); `server/plan/exercises.js` și `foods.js` conțin doar catalogul inițial și catalogul activ (`EXERCISES`, `FOODS`), reîncărcat cu `reloadExercises` / `reloadFoods` din `server/catalog.js` după orice modificare din panou.
- Echipa: `users.role = 'admin'` = cont de echipă; rolul din panou este `users.admin_role` (admin / editor / support), expus ca `ctx.user.role`. Rutele noi declară rolurile cu `on(..., { roles })`; modificările se auditează cu `details.changes` (`diffValues`). Setările aplicației: `server/settings.js` (`GET /api/settings` pentru aplicație).
