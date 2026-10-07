# Metamorf

Aplicație web pentru nutriție și fitness: jurnal alimentar, hidratare, antrenamente, greutate și progres, cu conturi reale. Planurile AI și plățile sunt în lucru (vezi [TASKS.md](TASKS.md)).

Viziunea completă, cu toate funcțiile aplicației finale: [VISION.md](VISION.md).

## Rulare locală (Windows, macOS, Linux)

Cerință: **Node.js 22.13 sau mai nou** (recomandat 24).

```bash
# 1. Configurare (o singură dată)
copy .env.example .env        # Windows (pe macOS/Linux: cp .env.example .env)
npm install                   # o singură dependență: SDK-ul oficial Anthropic, pentru planurile AI

# 2. Pornire
npm start                     # sau: npm run dev (repornește la modificări)
```

Deschide **http://localhost:3000**. Baza de date se creează automat în `data/metamorf.db`, iar migrațiile rulează la pornire (sau separat: `npm run migrate`).

**Recuperarea parolei în dezvoltare:** emailurile nu sunt trimise încă. Linkul de resetare apare în consola serverului și în `data/outbox/`.

**Teste:** `npm test` — API (autentificare, izolarea datelor, duplicate, CSRF, export, ștergere) și planuri (eligibilitate, dietă și alimente evitate, calorii, gratuit/Premium, porții, reîncercarea la răspunsuri AI invalide, limite). Testele nu fac apeluri reale la AI.

## Planul personalizat (AI)

1. Creează o cheie pe [console.anthropic.com](https://console.anthropic.com) → API Keys și setează o limită lunară de cheltuieli.
2. Pune cheia în `.env`, pe rândul `ANTHROPIC_API_KEY=` (doar acolo — niciodată în chat, cod sau git) și repornește serverul.
3. În aplicație: chestionar complet + ținte zilnice → Plan alimentar → **Generează planul**.

Fără cheie, în dezvoltare, planul este generat local de un **generator de test** (fără AI), etichetat „Plan de test · fără AI”. În producție, fără cheie, aplicația afișează un mesaj clar.

Cum funcționează: serverul trimite profilul, preferințele și țintele către Claude (`claude-opus-5-5`, răspuns structurat după schemă JSON). Modelul alege **doar** alimente și exerciții din cataloagele din `server/plan/`, cu gramaje, serii și repetări. Serverul **calculează caloriile din catalog**, ajustează porțiile spre țintă și respinge planul dacă încalcă dieta, alimentele evitate sau țintele (cu o reîncercare). Minorii, alergiile și limitările fizice nu primesc plan automat.

**Fără server:** `public/index.html` deschis direct în browser pornește doar **modul demo** (date exemplu, salvate în browser).

## Panoul de administrare

Pagina **`/admin.html`** (de exemplu http://localhost:3000/admin.html): statistici, utilizatori (căutare, detalii, export, deconectare forțată, link de resetare, ștergere cu confirmare), utilizarea și costul estimat al AI-ului, cataloagele de alimente și exerciții, jurnalul de audit.

**Conectarea în panou** are doi pași: email + parolă, apoi codul de 6 cifre dintr-o aplicație de autentificare (Google Authenticator, Microsoft Authenticator, Authy, 1Password). La prima conectare, panoul afișează un cod QR pentru configurare. După 5 parole greșite, conectarea se blochează 15 minute; după 5 coduri greșite, se reia de la parolă. Sesiunea din aplicație nu ajunge pentru panou, iar sesiunile de administrare expiră după 12 ore.

Rolul de administrator se acordă **doar din linia de comandă de pe server**, pentru un cont deja creat în aplicație:

```bash
npm run admin -- grant nume@exemplu.ro    # acordă rolul (contul trebuie să se reconecteze)
npm run admin -- revoke nume@exemplu.ro   # retrage rolul
npm run admin -- list                     # administratorii existenți
npm run admin -- reset-2fa nume@exemplu.ro  # telefon pierdut: la următoarea conectare se configurează din nou
```

Protecții: toate verificările se fac pe server; administratorul nu vede alergii, limitări fizice, parole sau conținutul jurnalului; fiecare acțiune (inclusiv deschiderea detaliilor unui cont) intră în jurnalul de audit; abonamentele nu se modifică manual.

## Arhitectură — de ce așa

- **Node.js aproape fără dependențe** (`node:http`, `node:sqlite`, `node:crypto`); singura dependență este SDK-ul oficial Anthropic, încărcat doar când se generează un plan. Pornește oriunde există Node, fără compilatoare pe Windows.
- **SQLite**, un singur fișier. Este potrivit pentru lansare și pentru primii mii de utilizatori. Migrațiile SQL sunt simple (`server/migrations`). Dacă va fi nevoie, schema se poate muta pe PostgreSQL fără schimbări în frontend.
- **Frontendul rămâne HTML/CSS/JS fără compilare**, servit de același server. Așa, cookie-urile de sesiune funcționează fără CORS.
- **Securitate:**
  - parolele sunt protejate cu scrypt (N = 2¹⁷);
  - sesiunile folosesc cookie HttpOnly și SameSite=Lax, iar în baza de date se păstrează doar hash-ul tokenului;
  - cererile care modifică date sunt protejate CSRF (antet propriu și verificarea Origin);
  - încercările de conectare sunt limitate;
  - antetele CSP sunt stricte;
  - fiecare interogare filtrează după utilizatorul conectat.

## Structură

```
public/                 frontend (servit static)
  index.html, style.css, metamorf-logo.png, meal.jpg
  admin.html            panoul de administrare (js/admin.js)
  js/  utils · icons · data · api · forms · store · views · dialogs · events · main
server/
  server.js             pornire
  app.js                sesiuni, CSRF, rutare
  routes/auth.js        cont: înregistrare, conectare, resetare, parolă, ștergere
  routes/data.js        profil, ținte, jurnal, apă, antrenamente, greutate, export
  routes/plan.js        plan: generare, citire (gratuit/Premium), înlocuire masă, porție, sarcini
  routes/admin.js       panoul de administrare (doar rol admin, cu jurnal de audit)
  admin-cli.js          acordarea / retragerea rolului de administrator (npm run admin)
  plan/                 cataloage (alimente, exerciții), generatori (Claude / test), validare, serviciu
  migrations/           schema bazei de date
test/api.test.js        teste API
.env.example            variabile de mediu (fără secrete)
```

## Moduri

- **Cont:** datele se păstrează pe server. Un cont nou pornește gol și afișează „Primii pași”.
- **Demo:** exemple fictive, etichetate „Mod demo”, păstrate doar în browser. Modul demo nu are legătură cu niciun cont.

## Ce nu este încă real

Codul de bare, analiza foto și plățile. Valorile din catalogul de alimente și instrucțiunile exercițiilor trebuie verificate cu sursele oficiale / un antrenor înainte de lansare. Toate sunt marcate clar în interfață. Detalii și informațiile necesare de la proprietară se găsesc în [TASKS.md](TASKS.md).
