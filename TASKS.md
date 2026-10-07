# Metamorf — plan de implementare

Legendă: ✅ gata și verificat · 🔄 în lucru · ⏳ planificat · ⛔ blocat (lipsește o informație externă)

## Decizie de arhitectură (6 octombrie 2026)
Proiectul continuă pe structura actuală: server Node.js + SQLite și aplicația web din `public/`. Arhitectura Laravel + Next.js + Expo descrisă în `docs/VIZIUNE.md` **nu a fost adoptată**; o aplicație mobilă se poate adăuga ulterior, folosind același API. Funcțiile și principiile din `docs/VIZIUNE.md` rămân valabile ca viziune de produs.

## Etapa 0 — Analiză și restructurare ✅
- ✅ Frontendul mutat în `public/`, servit de backend (fișierele serverului nu sunt publice).
- ✅ Copii de siguranță locale ale versiunilor anterioare (în afara proiectului, nu fac parte din repository).
- ✅ Pregătit pentru GitHub: `.gitignore` (secrete, `.env`, bază de date, `node_modules`, fișiere temporare), `.gitattributes`.

## Etapa 1 — Fundație: backend, bază de date, conturi ✅
- ✅ Server Node.js fără dependențe externe (`node:http`, `node:sqlite`, `node:crypto`).
- ✅ Configurare prin variabile de mediu (`.env`, `.env.example` fără secrete).
- ✅ Bază de date SQLite cu migrații versionate (`server/migrations`).
- ✅ Conturi: înregistrare, conectare, deconectare, recuperarea parolei (link cu token unic, valabil 1 oră).
- ✅ Parole cu scrypt + sare; sesiuni în cookie HttpOnly, SameSite=Lax, Secure în producție; token stocat doar ca hash.
- ✅ Protecție CSRF (antet obligatoriu + verificare Origin), limitare încercări de conectare.
- ✅ Izolarea datelor: fiecare interogare filtrează după `user_id` din sesiune.
- ✅ API pentru profil, ținte, jurnal alimentar, hidratare, antrenamente, greutate (cu dată și oră), abonament (stare).
- ✅ Jurnal fără duplicate: o masă din plan o singură dată pe zi (index unic în baza de date).
- ✅ Export date (JSON) și ștergerea contului (cu parola).
- ✅ Consimțământ separat pentru date de sănătate (alergii, limitări); fără el, serverul nu le salvează. Retragerea îl șterge.
- ✅ Teste automate API (`npm test`): autentificare, izolare, duplicate, CSRF, export, ștergere.
- ⛔ Trimiterea reală a emailului de resetare: lipsește un furnizor SMTP. Până atunci, în dezvoltare linkul apare în consola serverului și în `data/outbox/`.

## Etapa 2 — Frontend conectat la conturi ✅
- ✅ Ecran de bun venit: cont / conectare / mod demo separat și etichetat.
- ✅ Mod demo păstrat local (localStorage), cu date exemplu marcate; contul real pornește gol.
- ✅ Panou gol pentru utilizatori noi, cu „Primii pași”.
- ✅ Chestionar extins în 6 pași, salvat pe server la fiecare pas, cu revenire.
- ✅ Validare formulare cu mesaje în română, stări de încărcare, eroare, succes și lipsă de date.
- ✅ Dialoguri accesibile: focus inițial, revenirea focusului, titlu asociat; meniul mobil inaccesibil când e închis.
- ✅ Profil: editare, ținte, export, schimbarea parolei, deconectare, ștergerea contului.

### Verificare etapele 1–2 (1 oct. 2026)
- `npm test`: 18/18 teste API trec (autentificare, sesiuni, limitare încercări, resetare parolă, CSRF, fișiere private nepublice, izolare între utilizatori, jurnal fără duplicate, consimțământ sănătate, chestionar, export, ștergere).
- Test în browser (Edge fără interfață, server real): înregistrare cu validare → panou gol cu „Primii pași” → chestionar 6 pași (inclusiv eroarea pentru alergii fără acord, reluare după reîncărcare, „Înapoi”) → ținte, masă din exemple (dublu clic = o singură intrare), aliment manual, editare, apă, antrenament, greutate cu oră → reîncărcare (datele vin de pe server) → focus în dialog și revenire după Escape → deconectare, parolă greșită, resetare prin link (token eliminat din adresă) → meniu mobil (focus, Escape) → mod demo separat (nu conține date din cont) → ștergerea contului. Fără erori în consolă; fără derulare orizontală la 390 și 768 px.
- Modul demo deschis direct din fișier: mesaj clar că serverul nu rulează, demo funcțional.

### Rămas din etapele 1–2
- ⏳ Mementouri/notificări programate (acum: notificări în aplicație despre pașii rămași).
- ⏳ Confirmare email la înregistrare (necesită furnizor de email).

## Etapa 3 — Acces gratuit / Premium și plăți ⏳
- ⏳ Prețuri configurabile (fără valori inventate) — necesită decizia proprietarei.
- ⏳ Stripe în mod test: checkout, webhook verificat prin semnătură, expirare și anulare. ⛔ necesită cont Stripe și chei de test.
- ⏳ Filtrarea conținutului blocat pe server (săptămânile 2–4, zilele 2+).

## Etapa 4 — Plan personalizat AI (mese + sarcini zilnice) 🔄
- ✅ Integrare Claude pe server (`@anthropic-ai/sdk`, `claude-opus-5-5`), cheia doar în `.env`; răspuns structurat (schemă JSON), streaming, rezervă automată la refuz.
- ✅ Catalog de ~75 de alimente (valori la 100 g) și ~34 de exerciții; AI-ul alege doar din cataloage.
- ✅ Validare pe server: dietă, alimente evitate, structura zilei, exerciții compatibile cu echipamentul, număr de zile de antrenament; caloriile calculate din catalog, porții ajustate spre țintă (±10%), proteine minime; o reîncercare cu feedback; nimic salvat dacă rămâne invalid.
- ✅ Plan pe săptămână (7 zile), salvat în cont; sarcini zilnice (apă, antrenament, mișcare, cântărire, obiceiuri) bifabile.
- ✅ Înlocuirea unei mese; porția efectiv consumată (50–150%) în jurnal, fără duplicate.
- ✅ Gratuit: săptămâna 1 + primul antrenament; Premium: săptămânile următoare și toate antrenamentele — aplicat pe server, conținutul blocat nu e trimis.
- ✅ Eligibilitate: fără plan automat pentru minori, alergii și limitări; ținte obligatorii.
- ✅ Limite zilnice (3 planuri, 10 înlocuiri), jurnal de utilizare AI (tokeni, erori).
- ✅ Generator local de test pentru dezvoltare (etichetat „Plan de test · fără AI”).
- ✅ Teste: `test/plan.test.js` (9 teste).
- ⛔ Generare reală cu Claude: necesită `ANTHROPIC_API_KEY` în `.env`.
- ⏳ Verificarea valorilor din catalogul de alimente cu sursa oficială (USDA / CIQUAL) și revizuirea exercițiilor de un antrenor.
- ⏳ Săptămânile 2–4 generate automat la începutul fiecărei săptămâni (acum: la cerere, pentru săptămâna curentă sau următoare).
- ⏳ Lista de cumpărături 💡.

## Panou de administrare ✅
- ✅ `/admin.html`, în HTML/CSS/JS, cu identitatea Metamorf; responsiv.
- ✅ Rol `admin` acordat doar din linia de comandă (`npm run admin -- grant email`); verificat pe server la fiecare cerere.
- ✅ Prezentare: utilizatori, conturi noi, activi, chestionar completat, Premium, planuri, cereri și cost AI estimat; grafic al conturilor noi (30 de zile) cu tabel; eligibilitate.
- ✅ Utilizatori: căutare, filtre, detalii (fără date de sănătate, parole sau jurnal), export JSON, deconectare forțată, link de resetare, ștergere cu confirmarea emailului (nu și pentru administratori sau propriul cont).
- ✅ AI: cereri pe zile și ultimele 100, tokeni, cost estimat, erori.
- ✅ Cataloage (doar citire) și jurnal de audit pentru toate acțiunile.
- ✅ Conectare în doi pași (ecranul 1): email + parolă, apoi cod TOTP de 6 cifre (RFC 6238, verificat cu vectorii oficiali); configurare cu cod QR la prima conectare; cheile 2FA criptate (AES-256-GCM, `SECRET_KEY`); coduri nerefolosibile; blocare temporară (5 parole greșite / 15 min; 5 coduri greșite anulează pasul); sesiuni de administrare de 12 ore; fără înregistrare; resetare doar din terminal (`npm run admin -- reset-2fa`).
- ✅ Teste: `test/admin.test.js` (9 teste, inclusiv 2FA).
- ✅ Panou (ecranul 2): carduri (utilizatori total, noi azi / 7 zile, Premium active, venituri luna curentă), grafic conturi noi cu selector săptămână / lună / an, distribuția abonamentelor pe 1 / 3 / 6 luni, retenție la 7 și 30 de zile; „azi” după ora României (ADMIN_TIMEZONE); fără conturile de administrare; venitul trimis de server doar rolului admin.
- ⛔ Venituri reale: lipsesc plățile (etapa 3); panoul afișează un spațiu gol explicat, fără cifre inventate.
- ✅ Utilizatori (ecranul 3): listă cu căutare, filtre (gratuit / Premium, eligibil pentru plan AI / flux separat / chestionar necompletat, interval de înregistrare), paginare, coloanele cerute; pagină de detalii (`#utilizatori/ID`) cu date cont, email confirmat, abonament + istoric, scanări folosite azi (fusul clientului), activitate.
- ✅ Acțiuni cu confirmare: link de resetare a parolei, deconectare de pe toate dispozitivele, Premium manual (1 / 3 / 6 luni, motiv obligatoriu, în istoric și audit, adăugat la perioada existentă), export, ștergere.
- ✅ Date de sănătate protejate: alergii, limitări, greutate, înălțime și vârstă nu se trimit spre panou; „Solicită acces” doar pentru rolul admin, cu motiv (min. 15 caractere) și confirmare; accesul și motivul intră în jurnalul de audit; datele rămân afișate doar în pagina curentă.
- ✅ Cereri de date (ecranul 4): listă cu utilizator, tip (export / ștergere), data cererii, stare (în așteptare / în procesare / finalizată / eșuată), contoare pe stări, filtre, căutare; exporturile și ștergerile făcute de client din aplicație (și ștergerile din pagina clientului) se înregistrează automat; cereri primite pe email se înregistrează manual, cu notă; detalii cu cronologie (`#cereri/ID`); preluare, export JSON, eșec cu motiv; ștergere în doi pași (avertizare, apoi tastarea emailului clientului, verificat și pe server); cererea rămâne după ștergerea contului. Migrarea 006.
- ✅ Rețete (ecranul 5): listă cu fotografie mică, nume, tip masă, tipuri de alimentație compatibile, calorii / porție, stare, indicator „fără fotografie”, filtre pe toate; editor (`#retete/ID`, `#retete/nou`) cu nume, descriere, fotografie (previzualizare; JPEG / PNG / WebP verificate după conținut, max. 5 MB, servite din `data/uploads`), timp, porții, pași reordonabili (tragere + săgeți), ingrediente din catalog cu autocompletare și gramaj; calorii, macronutrienți, alergeni (14 alergeni UE) și diete calculate automat din catalog, live în panoul lateral, recalculate pe server (nu se pot trimite manual); salvează ciornă / publică / retrage / duplică / șterge; avertizare la ieșirea cu modificări nesalvate. Teste: `test/admin-content.test.js` (7).
- ✅ Bara laterală pe grupuri: Panou; Conținut (Rețete, Catalog nutrițional); Suport (Utilizatori, Cereri date); Sistem (Utilizare AI, Jurnal audit). Secțiunile pe care rolul nu le poate accesa sunt ascunse.
- ⏳ Rețetele publicate nu apar încă în aplicația clientului (următorul pas: folosirea lor în planuri și în rețetele recomandate).
- ⏳ Confirmarea emailului (câmpul există; fluxul necesită furnizor de email).
- ✅ Roluri (migrarea 008): admin (tot), editor (conținut), support (utilizatori fără date de sănătate + cereri de date, fără ștergere de conturi); verificate pe server la fiecare rută; secțiunile și butoanele inaccesibile sunt ascunse.
- ✅ Abonamente (ecranul 9): utilizator, perioadă, platformă, stare (activ / anulat / expirat), valabil până la, filtre; doar citire.
- ✅ Evenimente de plată (ecranul 9): tabel `payment_events` și ecran cu semnătură, rezultat, JSON expandabil, filtre. ⛔ Procesatorul de plăți nu este integrat: nu există încă endpoint de webhook, deci lista rămâne goală (fără plăți simulate).
- ✅ Jurnal de audit (ecranul 10): cronologie pe zile, filtre pe administrator / acțiune / perioadă (fusul ADMIN_TIMEZONE), IP pentru fiecare acțiune (de acum înainte), diferențe colorate vechi → nou la rețete, exerciții, alimente, media, roluri, setări.
- ✅ Administratori (ecranul 11): rol, 2FA, ultima conectare, stare; invitare (cont nou + link de setare a parolei valabil 72 h, emailul în data/outbox în dezvoltare), schimbarea rolului, dezactivare / reactivare cu confirmare; nu îți poți modifica propriul cont; conturile de client nu devin conturi de echipă.
- ✅ Setări (ecranul 11): limite de scanare gratuit / Premium, comutatoare (generarea planurilor cu AI — oprită și pe server; scanarea foto / cod de bare), mesaj de mentenanță afișat ca banner în aplicație; confirmare cu diferențele și audit. Teste: `test/admin-system.test.js` (7).
- ⏳ Lista de cumpărături nu există încă în aplicație; comutatorul ei se adaugă odată cu funcția.
- ✅ Cataloagele în baza de date (migrarea 007): exercițiile și alimentele din cod sunt copiate o singură dată în tabelele `exercises` și `foods` (server/catalog.js); planurile AI, validarea și rețetele folosesc catalogul activ din baza de date. Doar exercițiile publicate intră în planuri; nivelul exercițiului se compară cu experiența utilizatorului, locația și echipamentul cu preferințele lui.
- ✅ Exerciții (ecranul 6): listă cu grupă musculară, locație, echipament, nivel, video, stare și filtre; editor cu instrucțiuni pas cu pas și greșeli frecvente (reordonabile), serii / repetări sau secunde / pauză recomandate, echipament (selectare multiplă, „fără echipament” exclusiv), grupe musculare, nivel, imagine, video (fișier propriu sau link https, cu „sursă / licență” obligatorie); previzualizare live cu aceeași componentă folosită în aplicație (`public/js/exercise-view.js`); aplicația afișează acum pașii, greșelile, imaginea și videoclipul exercițiilor din plan.
- ⏳ Cele 34 de exerciții din catalogul inițial nu au nivel, recomandări și greșeli frecvente: de completat (de preferat de un antrenor) — panoul le arată cu „Arată-le”.
- ✅ Catalog nutrițional (ecranul 7): tabel cu sursă (USDA / CIQUAL / Open Food Facts / manual), valori la 100 g, alergeni, numărul de rețete care folosesc alimentul; căutare live și filtru pe sursă; sursele verificate sunt doar pentru citire (și pe server), alimentele manuale se adaugă și se editează; import CSV / JSON pe loturi, cu progres și rezumat (adăugate / actualizate / neschimbate / erori pe linii).
- ⏳ Importul folosește fișiere descărcate din surse; preluarea automată prin API (USDA FoodData Central necesită cheie) nu este implementată. Valorile inițiale sunt marcate USDA, dar sunt valori de referință de verificat rând cu rând înainte de lansare.
- ✅ Media (ecranul 8): grilă cu fotografii și videoclipuri, filtre pe tip și „nefolosit”, detalii (dimensiune, rezoluție, unde e folosit, sursă / licență editabilă), încărcare prin tragere cu progres, sursă / licență obligatorie la încărcare; ștergere blocată (și pe server) cât timp fișierul e folosit; tipul fișierului verificat după conținut; videoclipuri servite cu Range. Fotografiile rețetelor se pot alege și din bibliotecă. Teste: `test/admin-library.test.js` (9).
- ⏳ Gestionarea abonamentelor — doar după integrarea plăților (etapa 3), tot prin procesatorul de plăți.

## Etapa 5 — Antrenamente ⏳
- ⏳ Catalog de exerciții verificat (fără linkuri video inventate), planuri după obiectiv, experiență, locație, echipament, zile și timp.
- ⏳ Serii, repetări, pauze, cronometru pe exercițiu, sesiuni înregistrate.

## Etapa 6 — Scanner ⏳
- ⏳ Cod de bare prin Open Food Facts (date publice), confirmarea porției înainte de salvare.
- ⏳ Analiză foto prin AI (când e configurat), cu ingrediente și gramaje corectabile.
- ⏳ Limite de scanare pe server, pe cont și zi, în fusul orar al utilizatorului; cererile eșuate nu consumă scanări.

## Etapa 7 — Progres ⏳
- ⏳ Grafice pe perioade din datele reale (greutate, calorii, hidratare, antrenamente).
- ⏳ Fotografii de progres — doar după stocare privată, control de acces și ștergere.

## Etapa 8 — Lansare ⏳
- ⏳ Politici reale (date, consimțământ, anulare, rambursare), furnizor email, găzduire, backup.

---

## Informații necesare de la proprietară
1. **Furnizor email** (SMTP sau serviciu precum Resend/Postmark) pentru resetarea parolei.
2. **Prețurile** pentru 1, 3 și 6 luni și moneda.
3. **Cont Stripe** (sau alt procesator) cu chei de test.
4. **Cheia API Anthropic** în `.env` (integrarea e gata).
5. **Sursa datelor nutriționale** verificate.
