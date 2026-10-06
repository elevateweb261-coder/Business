# Metamorf — plan de implementare

Legendă: ✅ gata și verificat · 🔄 în lucru · ⏳ planificat · ⛔ blocat (lipsește o informație externă)

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
