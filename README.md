# Metamorf

Aplicație web pentru nutriție și fitness: jurnal alimentar, hidratare, antrenamente, greutate și progres, cu conturi reale. Planurile AI și plățile sunt în lucru (vezi [TASKS.md](TASKS.md)).

## Rulare locală (Windows, macOS, Linux)

Cerință: **Node.js 22.13 sau mai nou** (recomandat 24). Nu este nevoie de `npm install`: proiectul nu are dependențe externe.

```bash
# 1. Configurare (o singură dată)
copy .env.example .env        # Windows (pe macOS/Linux: cp .env.example .env)

# 2. Pornire
npm start                     # sau: npm run dev (repornește la modificări)
```

Deschide **http://localhost:3000**. Baza de date se creează automat în `data/metamorf.db`, iar migrațiile rulează la pornire (sau separat: `npm run migrate`).

**Recuperarea parolei în dezvoltare:** emailurile nu sunt trimise încă. Linkul de resetare apare în consola serverului și în `data/outbox/`.

**Teste:** `npm test` (autentificare, izolarea datelor, duplicate, CSRF, export, ștergere).

**Fără server:** `public/index.html` deschis direct în browser pornește doar **modul demo** (date exemplu, salvate în browser).

## Arhitectură — de ce așa

- **Node.js fără dependențe** (`node:http`, `node:sqlite`, `node:crypto`). Pornește oriunde există Node, fără compilatoare pe Windows și fără pachete de actualizat. Codul e mic și ușor de citit.
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
  js/  utils · icons · data · api · forms · store · views · dialogs · events · main
server/
  server.js             pornire
  app.js                sesiuni, CSRF, rutare
  routes/auth.js        cont: înregistrare, conectare, resetare, parolă, ștergere
  routes/data.js        profil, ținte, jurnal, apă, antrenamente, greutate, export
  migrations/           schema bazei de date
test/api.test.js        teste API
.env.example            variabile de mediu (fără secrete)
```

## Moduri

- **Cont:** datele se păstrează pe server. Un cont nou pornește gol și afișează „Primii pași”.
- **Demo:** exemple fictive, etichetate „Mod demo”, păstrate doar în browser. Modul demo nu are legătură cu niciun cont.

## Ce nu este încă real

Generarea planului AI, catalogul verificat de exerciții, codul de bare, analiza foto și plățile. Toate sunt marcate clar în interfață. Detalii și informațiile necesare de la proprietară se găsesc în [TASKS.md](TASKS.md).
