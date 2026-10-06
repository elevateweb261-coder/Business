# Metamorf — instrucțiuni pentru continuarea proiectului

Citește PROJECT_SPEC.md, README.md și TASKS.md înainte de modificări. TASKS.md e sursa pentru ce e gata și ce urmează.

## Structură
- `public/` — frontend fără compilare: scripturi clasice (nu module ES, ca demo-ul să meargă și din fișier), încărcate în ordine din index.html.
  - `store.js`: `session` (guest/demo/account), `db` (date afișate), `ui`. Toate modificările trec prin funcțiile async de aici, care aleg localStorage (demo) sau API (cont).
  - `api.js` (fetch + antet CSRF `X-Metamorf: 1`), `forms.js` (validare cu mesaje în română, `withBusy`), `views.js`, `dialogs.js` (focus gestionat), `events.js` (`actions`, `submits`).
- `server/` — Node.js fără dependențe (`node:http`, `node:sqlite`, `node:crypto`). Rute în `server/routes`, migrații SQL numerotate în `server/migrations` (nu modifica o migrație aplicată; adaugă una nouă).
- `server/plan/` — planul personalizat: `foods.js` / `exercises.js` (cataloage; AI-ul alege doar de aici), `providers.js` (Claude prin `@anthropic-ai/sdk` + generator local de test), `validate.js` (validare + nutriție calculată pe server), `service.js` (generare, acces gratuit/Premium, porții, sarcini). Frontend: `public/js/plan.js`.
- `test/api.test.js`, `test/plan.test.js` — `npm test` (fără apeluri reale la AI).
- `metamorf-logo.png` (de la proprietară, păstrează-l), `meal.jpg`.

## Reguli
- Fiecare interogare cu date personale filtrează după `ctx.user.id`. Adaugă un test de izolare pentru orice rută nouă.
- Alergiile și limitările fizice se salvează doar cu `health_consent_at`; minori/alergii/limitări → fără plan automat (`planEligibility`).
- Sursele `plan`, `barcode`, `photo` din jurnal sunt rezervate serverului.
- Caloriile/macronutrienții planurilor se calculează din catalog pe server; nu accepta niciodată numere nutriționale de la model. Orice câmp nou din răspunsul AI se validează în `plan/validate.js`.
- Nu inventa prețuri, rezultate AI, plăți reușite sau linkuri video. Cheile API stau doar în `.env` pe server.
- Identitate vizuală: negru și auriu (#0c0e0c, #e8cc7c), verde închis (#153d32). Texte în română, cu diacritice.

## Verificare
`node --check` pe fișierele JS, `npm test`, apoi verificare vizuală la 390, 768 și 1440 px (cont nou, demo, deschis din fișier). Nu publica online fără cererea utilizatorului.
