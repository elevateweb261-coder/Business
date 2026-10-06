# Metamorf — viziunea finală

> Documentul descrie **punctul final** al aplicației: ce face, pentru cine și cum funcționează când e completă.
> Starea curentă a lucrului și pașii tehnici sunt în [TASKS.md](TASKS.md). Cerințele inițiale sunt în [PROJECT_SPEC.md](PROJECT_SPEC.md).

**Legendă stare:** ✅ funcționează · 🟡 parțial (demo sau versiune simplificată) · ⏳ planificat · 💡 propunere (de confirmat de proprietară)

---

## 1. Viziunea pe scurt

Metamorf este **spațiul personal de nutriție și mișcare** al unei persoane: un loc în care primește un plan alimentar și de antrenament potrivit ei, notează ușor ce mănâncă și cât se mișcă și își vede progresul în timp.

Aplicația e **caldă, simplă și sigură**:
- **personalizată** prin AI, dar fără să înlocuiască medicul sau nutriționistul;
- **onestă**: valorile nutriționale vin din surse verificate, iar estimările sunt marcate ca estimări;
- **respectuoasă cu datele**: utilizatorul își controlează informațiile, le poate exporta și șterge;
- **accesibilă** pe telefon, tabletă și calculator, în limba română.

**Promisiunea pentru utilizator:** *„Obiceiuri mici. O transformare pe termen lung.”*

---

## 2. Pentru cine

| Profil | Ce caută | Ce primește în Metamorf |
|---|---|---|
| Persoana care vrea să slăbească | Un plan clar, fără diete extreme | Plan alimentar pe 28 de zile, jurnal, progres la greutate |
| Persoana care vrea echilibru | Obiceiuri sănătoase, fără presiune | Idei de mese, hidratare, mișcare ușoară, ritm săptămânal |
| Persoana care vrea masă musculară | Proteine suficiente, antrenament structurat | Plan cu macronutrienți, antrenamente la sală, progresie |
| Începătorul acasă | Exerciții simple, fără echipament | Antrenamente acasă, instrucțiuni pas cu pas, cronometru |
| Avansatul la sală | Program pe zile, serii, pauze | Plan pe grupe musculare, cu echipament de sală |
| Minori, persoane cu alergii sau condiții medicale | Siguranță | **Flux separat**: obiceiuri sănătoase și îndrumare spre specialist, **fără plan generat automat** |

---

## 3. Parcursul utilizatorului (fluxul final)

```
Descoperă Metamorf  →  Creează cont  →  Chestionar (6 pași)
        ↓                                       ↓
   Mod demo (opțional)            Verificare de siguranță (vârstă, alergii, limitări)
                                      ↓                          ↓
                           Eligibil: plan generat AI      Neeligibil: flux separat
                                      ↓                     (fără plan automat)
                     Explorare gratuită: săptămâna 1 de mese, ziua 1 de antrenament,
                                    1 scanare pe zi, jurnal și progres
                                      ↓
                        Abonament Premium (1, 3 sau 6 luni)
                                      ↓
              Acces complet: 28 de zile de mese, toate antrenamentele,
                       3 scanări pe zi, progres pe termen lung
```

O zi obișnuită în aplicație:
1. **Dimineața**: deschide panoul și vede masa următoare, antrenamentul zilei și apa.
2. **La fiecare masă**: bifează masa din plan sau o scanează, apoi confirmă porția.
3. **Peste zi**: adaugă pahare de apă și primește mementouri discrete.
4. **Seara**: face antrenamentul cu cronometrul și îl marchează finalizat.
5. **Săptămânal**: se cântărește și vede graficul și ritmul săptămânii.

---

## 4. Funcțiile aplicației

### 4.1 Cont, securitate și confidențialitate
| Funcție | Stare |
|---|---|
| Înregistrare, conectare, deconectare | ✅ |
| Recuperarea parolei prin link pe email | 🟡 linkul funcționează; trimiterea reală a emailului necesită un furnizor |
| Schimbarea parolei (deconectează celelalte dispozitive) | ✅ |
| Parole protejate prin hashing, sesiuni securizate, protecție CSRF, limitare încercări | ✅ |
| Fiecare utilizator vede doar datele proprii | ✅ (testat automat) |
| Export date (JSON) și ștergerea contului cu toate datele | ✅ |
| Acord separat pentru date de sănătate, retras oricând | ✅ |
| Confirmarea adresei de email la înregistrare | ⏳ |
| Conectare cu Google / Apple | 💡 |
| Autentificare în doi pași (2FA) | 💡 |
| Politică de confidențialitate, termeni, consimțământ cookie — texte finale | ⏳ necesită redactare juridică |

### 4.2 Chestionar și profil
Chestionarul are 6 pași; progresul se salvează la fiecare pas, iar utilizatorul poate reveni la pașii anteriori.

| Pas | Informații | Stare |
|---|---|---|
| 1. Despre tine | prenume, vârstă, sex, înălțime, greutate | ✅ |
| 2. Obiectiv | echilibru / slăbire / masă musculară, nivel de activitate | ✅ |
| 3. Alimentație | tip (cu carne, fără porc, vegetarian, vegan), alimente preferate și evitate | ✅ |
| 4. Alergii și intoleranțe | doar cu acord pentru date de sănătate | ✅ |
| 5. Antrenament | locație, echipament, experiență, zile și minute disponibile | ✅ |
| 6. Limitări fizice | doar cu acord; confirmarea caracterului orientativ | ✅ |

**Regula de siguranță** (✅ implementată pe server): planul AI se generează **doar pentru adulți fără alergii și fără limitări declarate**. Pentru celelalte profiluri aplicația oferă obiceiuri sănătoase, jurnal și progres și recomandă un specialist.

💡 *Propunere:* un flux dedicat pentru minori, cu acordul unui părinte, și un mod „plan de la specialist”, în care un nutriționist încarcă planul în contul clientului.

### 4.3 Panoul zilnic
| Funcție | Stare |
|---|---|
| Salut personalizat, data reală | ✅ |
| „Primii pași” pentru conturi noi (chestionar, ținte, prima masă, greutate) | ✅ |
| Calorii consumate față de ținta zilnică (inel de progres) | ✅ |
| Macronutrienți: proteine, carbohidrați, grăsimi | ✅ |
| Hidratare: pahare de 250 ml, plus/minus | ✅ |
| Masa următoare, cu fotografie și rețetă | ✅ (exemple; din planul AI la final) |
| Antrenamentul zilei | 🟡 sesiune exemplu |
| Ritmul săptămânii: zile active și calorii pe zi | ✅ |
| Calendarul anului: zile active, detalii pe zi | ✅ |
| Ținte calculate automat (calorii, macro) din profil | ⏳ doar pentru profiluri eligibile, cu formulă validată și explicată |

### 4.4 Plan alimentar (AI, 28 de zile)
**Ținta finală:**
- plan pe **4 săptămâni**, cu 3–5 mese pe zi, adaptat obiectivului, tipului de alimentație și alimentelor evitate;
- fiecare masă are **ingrediente cu gramaje, preparare, timp, calorii și macronutrienți**;
- valorile nutriționale sunt **calculate din baza de date nutrițională verificată** (nu preluate direct de la AI);
- **alternative** pentru fiecare masă și **înlocuirea** unei mese cu un clic;
- **porția efectiv consumată** se înregistrează în jurnal (de exemplu „am mâncat 70%”), fără dubluri;
- **lista de cumpărături** săptămânală 💡;
- **fotografii** pentru fiecare rețetă.

| Funcție | Stare |
|---|---|
| Plan pe zilele săptămânii curente, selectarea zilei | ✅ |
| Meniu diferit pe zile, după tipul de alimentație | ✅ (exemple) |
| Ocolirea alimentelor evitate | ✅ |
| Rețetă cu ingrediente și preparare | ✅ |
| „Am mâncat această masă” → jurnal, fără dubluri | ✅ |
| Săptămâna 1 gratuită, săptămânile 2–4 Premium | 🟡 blocare vizuală; protecția pe server e planificată |
| Generare AI, răspuns structurat validat, salvat în cont | ⏳ necesită cheie API |
| Calcul nutrițional din bază verificată | ⏳ necesită alegerea sursei de date |
| Alternative și înlocuirea unei mese | ⏳ |
| Porția efectiv consumată | ⏳ |
| Fotografii pentru toate rețetele | 🟡 3 din 26 de mese au fotografie |
| Lista de cumpărături | 💡 |

### 4.5 Antrenamente
**Ținta finală:** programe adaptate **obiectivului, experienței, locației, echipamentului, zilelor și minutelor disponibile**, alcătuite dintr-un **catalog verificat de exerciții**.

- Fiecare exercițiu are **instrucțiuni, serii, repetări, pauze** și greșeli frecvente.
- **Cronometru pe exercițiu și pe pauză**, cu trecere automată la exercițiul următor.
- **Înregistrarea sesiunii**: durată, exerciții finalizate și, opțional, greutăți folosite.
- **Progresie** de la o săptămână la alta 💡.
- **Demonstrații video** reale, doar din surse proprii sau licențiate (fără linkuri inventate).

| Funcție | Stare |
|---|---|
| Sesiune exemplu „Tot corpul”, 5 exerciții, instrucțiuni | ✅ |
| Cronometru, pauză, sesiune înregistrată în cont | ✅ |
| Ziua 1 gratuită, de la ziua 2 Premium | 🟡 blocare vizuală |
| Catalog verificat și planuri adaptate | ⏳ |
| Cronometru pe exercițiu și pe pauză | ⏳ |
| Video demonstrativ | ⏳ necesită conținut propriu sau licențiat |

### 4.6 Scanner și jurnal alimentar
| Funcție | Stare |
|---|---|
| Introducere manuală (valori la 100 g × porție) | ✅ |
| Editare și ștergere, cu „Anulează” | ✅ |
| Cod de bare → produs dintr-o bază publică (Open Food Facts) → confirmarea porției | ⏳ fără cheie API necesară |
| Fotografie → estimare AI a ingredientelor și gramajelor, **corectabilă** de utilizator | ⏳ necesită serviciul AI și acordul pentru fotografii |
| Limite de scanare pe server, pe cont și pe zi, în fusul orar al utilizatorului; cererile eșuate nu se numără | ⏳ structura bazei de date există |
| Alimente favorite și mese recente, pentru adăugare rapidă | 💡 |

### 4.7 Progres
| Funcție | Stare |
|---|---|
| Greutate cu dată și oră, grafic, ultimele înregistrări | ✅ |
| Schimbarea în perioadă, sesiuni în ultimele 30 de zile | ✅ |
| Grafice pe perioade (săptămână / lună / an) pentru calorii, apă, antrenamente | ⏳ |
| Circumferințe (talie, șold etc.) | 💡 |
| Fotografii de progres private | ⏳ doar după stocare privată, control de acces și ștergere |
| Obiective intermediare și insigne pentru constanță | 💡 |

### 4.8 Abonamente și plăți
| Funcție | Stare |
|---|---|
| Pagina de abonamente (1, 3 și 6 luni) și comparația gratuit / Premium | ✅ fără prețuri inventate |
| Starea abonamentului în cont (gratuit / Premium, valabil până la…) | ✅ structura există |
| Plata prin procesator (de exemplu Stripe), întâi în mod test | ⏳ necesită cont și chei |
| Activare **doar** prin notificări verificate de la procesator (webhook semnat) | ⏳ |
| Reînnoire, anulare, expirare, facturi | ⏳ |
| Conținutul Premium **nu este trimis** în browser fără abonament | ⏳ |
| Perioadă de probă, coduri de reducere | 💡 |

### 4.9 Notificări și mementouri
| Funcție | Stare |
|---|---|
| Notificări în aplicație (pașii rămași) | ✅ |
| Mementouri: apă, mese, antrenament, cântărire, alese și programate de utilizator | ⏳ |
| Notificări pe telefon (PWA / push) | 💡 |
| Emailuri: bun venit, resetare parolă, abonament | ⏳ necesită furnizor email |

### 4.10 Mod demo
| Funcție | Stare |
|---|---|
| Explorarea aplicației fără cont, cu date exemplu etichetate | ✅ |
| Datele demo rămân doar în browser, separate de orice cont | ✅ |
| Funcționează și fără server (deschis direct din fișier) | ✅ |

### 4.11 Administrare (pentru proprietară) 💡
- Panou cu statistici: utilizatori, abonamente active, venituri, retenție.
- Gestionarea conținutului: rețete, fotografii, exerciții și catalogul nutrițional.
- Suport: căutarea unui cont, istoricul abonamentului, cereri de export sau ștergere.
- Jurnal de audit pentru acțiunile administrative.

### 4.12 Platforme 💡
- **Aplicație web** responsivă (✅ acum).
- **PWA**: instalabilă pe telefon, cu funcționare parțial offline și notificări.
- Aplicații native iOS / Android, doar dacă PWA nu este suficientă.

---

## 5. Gratuit și Premium

| Serviciu | Gratuit | Premium |
|---|---|---|
| Plan alimentar | Săptămâna 1 | Săptămânile 1–4 (28 de zile) |
| Antrenamente | Ziua 1 | Toate zilele |
| Scanner | 1 scanare / zi | 3 scanări / zi |
| Jurnal, hidratare, greutate, calendar | ✅ | ✅ |
| Grafice pe termen lung | Ultimele 30 de zile 💡 | Tot istoricul 💡 |
| Abonament | — | 1, 3 sau 6 luni (prețuri de stabilit) |

Limitele se aplică **pe server**. Interfața doar le afișează.

---

## 6. Siguranță și etică (non-negociabil)

1. Metamorf **nu oferă sfat medical** și o spune clar.
2. Planul automat se generează doar pentru **adulți fără alergii sau condiții declarate**.
3. Valorile nutriționale vin din **date verificate**; estimările din fotografii sunt marcate ca **estimări** și pot fi corectate.
4. Fără prețuri, rezultate AI, plăți sau videoclipuri **inventate**.
5. Datele de sănătate se păstrează **doar cu acord explicit** și se șterg la retragerea acordului.
6. Utilizatorul poate **exporta** și **șterge** totul, oricând.
7. Fără limbaj care culpabilizează: progresul „are mai multe forme”, nu doar cifra de pe cântar.

---

## 7. Arhitectura tehnică țintă

| Componentă | Acum | La final |
|---|---|---|
| Frontend | HTML/CSS/JS fără compilare, responsiv | La fel, plus PWA 💡 |
| Backend | Node.js fără dependențe | La fel, plus integrări (AI, plăți, email) |
| Bază de date | SQLite, cu migrații | SQLite sau PostgreSQL, cu backup zilnic |
| AI | — | API apelat doar din server, cheie în `.env`, răspuns validat |
| Date nutriționale | Exemple | Bază verificată (USDA / CIQUAL / Open Food Facts) |
| Plăți | — | Stripe (sau alt procesator), webhook semnat |
| Email | Mod dezvoltare (fișiere locale) | Furnizor tranzacțional (Resend, Postmark, SMTP) |
| Găzduire | Local | Server cu HTTPS, monitorizare și backup |
| Teste | 18 teste API + teste în browser | Teste pentru fiecare modul, rulate automat la fiecare push |

---

## 8. Decizii care așteaptă proprietara

1. **Prețurile** pentru 1, 3 și 6 luni și moneda.
2. **Procesatorul de plăți** (recomandat: Stripe) și datele firmei pentru facturare.
3. **Furnizorul AI** (recomandat: Claude, prin backend) și bugetul lunar.
4. **Sursa datelor nutriționale.**
5. **Furnizorul de email.**
6. **Găzduirea** și **domeniul**.
7. Ce **propuneri 💡** din acest document intră în prima lansare.
8. Textele juridice: confidențialitate, termeni, anulare și rambursare.

---

## 9. Ce înseamnă „gata de lansare”

- [ ] Planul AI pe 28 de zile se generează, se validează și se salvează pentru profilurile eligibile.
- [ ] Valorile nutriționale provin din baza verificată.
- [ ] Antrenamentele adaptate folosesc catalogul verificat.
- [ ] Codul de bare funcționează; analiza foto funcționează sau e ascunsă.
- [ ] Plățile funcționează în mod real, iar conținutul Premium e protejat pe server.
- [ ] Emailurile reale funcționează (resetare parolă, abonament).
- [ ] Politicile juridice sunt publicate, iar consimțămintele sunt înregistrate.
- [ ] HTTPS, backup automat, monitorizare erori.
- [ ] Teste automate trec; verificare manuală pe telefon, tabletă și calculator.
- [ ] Repository-ul privat; secretele doar pe server.

---

## 10. Drumul până acolo

Etapele detaliate, cu stare și verificări, sunt în [TASKS.md](TASKS.md):

0. ✅ Analiză și restructurare
1. ✅ Fundație: backend, bază de date, conturi
2. ✅ Frontend conectat la conturi
3. ⏳ Gratuit / Premium și plăți
4. ⏳ Plan alimentar AI (28 de zile)
5. ⏳ Antrenamente adaptate
6. ⏳ Scanner (cod de bare, fotografie)
7. ⏳ Progres extins
8. ⏳ Lansare
