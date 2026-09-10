# DONE — Minimalista: cosa è stato implementato

> Riepilogo di tutto ciò che è stato fatto a partire da `TODO.md`. Il riferimento
> architetturale aggiornato è `ARCHITETTURA.md`; gli item ancora aperti restano in
> `TODO.md`. Tutte le modifiche sono verificate dal test end-to-end (`node e2e-test.js`:
> **76 verifiche passate, 0 fallite**).

---

## Checklist per la pubblicazione

### ✅ Rimosso il toggle di sviluppo PRO

> **Nota**: successivamente riaggiunto su richiesta per la fase di development
> (vedi "Toggle PRO di sviluppo" più sotto) — da rimuovere di nuovo prima della
> pubblicazione (checklist in `TODO.md`).

- Rimossa la card "PRO — solo sviluppo" dalla sezione Info di `options.html`
  (`proTestToggle`) e tutte le sue traduzioni (`pro_dev_title`, `pro_dev_label`).
- Rimosso il messaggio `proTest` dal service worker (`background.js`), la chiave
  `_devPro` e la funzione `devProOn()`.
- `verifyProLive()` e `refreshProStatus()` non hanno più il ramo di sviluppo:
  l'unica fonte di verifica è ExtensionPay (`extpay.getUser()` → `user.paid`), con
  comportamento fail-closed invariato (errore di rete → nessuna approvazione, nessuna
  revoca dello stato UI noto).
- Aggiornato il testo di `pro_not_configured` (6 lingue): ora spiega che senza
  `EXT_PAY_ID` le funzioni PRO restano bloccate (niente più rimando al toggle in Info).
- Aggiornati i test e2e: i test di **attivazione** PRO (cold turkey, fasce orarie,
  categorie personalizzate, tema PRO applicato, sfondo PRO) sono ora eseguiti solo se
  ExtensionPay è configurato (`EXT_PAY_ID` valorizzato); senza ID vengono saltati con
  un messaggio esplicito. Restano coperti per tutti: stato bloccato, UI di sblocco
  (Membership), preview dei tempi PRO, firma falsificata rifiutata e revocata,
  `proRefresh` e avvisi di build non configurata.

### ➖ Non eseguibili in questo ambiente (restano in TODO.md)

- Registrare l'estensione su extensionpay.com e valorizzare `EXT_PAY_ID`
  (azione manuale dell'autore).
- Verifica manuale del banner incognito su Chrome reale.
- Item facoltativo (dashboard/popup senza ExtPay).

### 📝 Nota sulla licenza AGPL-3.0 di `ExtPay.js`

`ExtPay.js` è vendored dal pacchetto npm `extpay` v3.1.2 (licenza AGPL-3.0) e viene
distribuito dentro l'estensione. Impatto pratico atteso: l'AGPL riguarda la
distribuzione del codice (il sorgente dell'estensione è comunque pubblico in questo
repo, quindi gli obblighi di fonte sono già rispettati); non c'è un servizio di rete
AGPL coinvolto (l'estensione è client-side). Resta però da fare una valutazione
formale (ideale col supporto legale) prima della pubblicazione sullo store: se si
volesse evitare la copyleft si può sostituire la libreria con un client
ExtensionPay scritto da zero (la verifica è una semplice `fetch` verso
`extensionpay.com`).

---

## Riorganizzazione Sezione PRO / Membership

### ✅ Nuova sezione laterale "Membership"

- Aggiunta la tab **Membership** nel menu a sinistra delle impostazioni, tra "Home"
  e "Info" (`nav_membership`, tradotta in 6 lingue).
- La sezione consolidata gestisce: **stato del piano** (Free / Lifetime), i pulsanti
  **"Sblocca PRO (Lifetime)"** e **"Ho già pagato? Accedi"** (ExtensionPay) e
  l'elenco pulito delle funzioni PRO.
- La card PRO nella sezione Focus ora è un rimando compatto ("Gestisci la tua
  Membership") che porta alla nuova sezione: l'upsell non inquina più l'interfaccia.

### ✅ Look Premium e Minimalista (niente emoji nelle funzioni PRO)

- Rimosse le emoji dalle descrizioni delle funzioni PRO e dalla UI PRO in generale:
  - lista funzioni (era 🔒 🕒 🎨 ✏️) → **icone SVG monocromatiche a tratto sottile**
    (fiamma per Cold Turkey, orologio per le fasce orarie, stelle per l'Aurora,
    catena per i collegamenti rapidi);
  - icone dei pannelli "Blocco ferreo" e "Fasce orarie" (era 🔒 / 🕒) → SVG;
  - lucchetti sulle card dei temi PRO, chip dei blocchi ferrei, fasce attive e
    avvisi "PRO · Modifica siti" → SVG lock/clock;
  - rimosso anche l'emoji 🎉 dal messaggio di ringraziamento PRO.
- Le icone sono condivise via costante `ICO` in `options.js` (nessuna ripetizione).

### ✅ Pannello di riepilogo (stato Free/Lifetime + acquisto/login + funzioni PRO)

- All'interno di "Membership": riquadro `plan-box` con nome piano e descrizione,
  pulsanti di acquisto/login ExtensionPay (con messaggi dedicati `mMsg`) ed elenco
  delle funzioni PRO (Cold Turkey, Fasce orarie, Sfondo Aurora, Collegamenti rapidi).

### ✅ Richiamo Premium (gradiente)

- Il riquadro del piano attivo usa il **bordo a gradiente conico animato** (come la
  card PRO), con `prefers-reduced-motion` rispettato.
- La voce di menu "Membership" ha un sottile **sottolineato a gradiente animato**.

---

## Ulteriori Modifiche e Funzionalità

### ✅ Card PRO in Focus: badge centrato + respiro per il pulsante

- Il **tag PRO** accanto al titolo "Funzioni PRO" era disallineato perché l'`h2` ha un
  `margin-bottom` globale di 14px che spostava il centro del box: azzerato dentro
  `.pro-head`, ora il badge è perfettamente centrato con la scritta.
- Il pulsante **"Gestisci la tua Membership"** era attaccato alla descrizione: ora ha
  `margin-top: 14px`.

### ✅ Membership: rifiniture + pulsante Unlock + dialog confronto settimanale

- **Corona del piano attuale** ora neutra (`--muted`): non è più uguale alla corona
  dorata del riquadro PRO qui sotto (la differenza segnala "stato attuale" vs "offerta").
- Rimosso l'hint "Account status, upgrade and PRO feature overview…" dalla card
  Membership (`membership_hint`, suono da descrizione per sviluppatori) e le relative
  traduzioni.
- **Pulsante "Sblocca PRO"**: scritta sempre `#140a24` (colore fisso) — prima l'hover
  globale dei bottoni (`button:hover { color: var(--accent) }`) sovrascriveva il colore
  con l'accento del tema, illeggibile quando accent ≈ gradiente. Al passaggio: leggero
  sollevamento, ombra e **riflesso animato** che attraversa il bottone
  (`prefers-reduced-motion` rispettato).
- **Dialog "Confronto settimanale"**: si chiude cliccando fuori (backdrop), niente più
  bottone "Annulla" in basso: una **crocetta in alto a destra** (stile finestra di
  sistema) lo chiude; nuova chiave i18n `dlg_close_aria` (6 lingue).

### ✅ Toggle PRO di sviluppo (solo fase di development) — Impostazioni → Info

- Riaggiunta in Info la card **"PRO — solo sviluppo"** con checkbox (rimossa in precedenza
  su richiesta, ora richiesta di nuovo per testare in locale): attiva il flag `_devPro` +
  la firma `_aT`, e il background (`verifyProLive` / `refreshProStatus`) risponde true
  senza interrogare ExtensionPay — le azioni PRO funzionano in locale senza pagamento.
- `sanitizeSettings` conserva `_devPro`; la checkbox è persistita e disattivabile in
  qualsiasi momento. **Da rimuovere prima della pubblicazione** (checklist in `TODO.md`).

### ✅ Card "Avanzate" con bordo PRO

- La card Aspetto → Avanzate (contiene l'immagine di sfondo URL, funzione PRO) ora usa lo
  stesso **bordo a gradiente conico animato** delle card PRO (`#advancedCard`).

### ✅ Membership ridisegnata (più chiara e professionale)

- Il **piano attuale** (Free/Lifetime) vive in un pannello neutro separato ("Piano attuale");
  il riquadro a gradiente è riservato alle cose PRO: offerta (header "Funzioni PRO" +
  elenco + acquisto/login) oppure conferma (header "PRO Lifetime attivo" + grazie). Niente
  più "Free" dentro il riquadro multicolore.
- Campo orario delle fasce: cifre più grandi (1.02rem), font tabulare e caret discreto per
  leggere meglio l'ora selezionata.

### ✅ Fasce orarie: campo orario tematizzato + selezione dei giorni stabile

- Il campo orario delle fasce ("dalle … alle …") non usa più i nativi `input[type=time]`,
  che con i temi diversi da Midnight stonavano (non erano nemmeno nella lista dei
  controlli tematizzati di `common.css`): ora sono due **"pill" tematizzate** con
  selettori `ora : minuti` (select 00–23 / 00–59) che seguono i colori del tema e
  l'arrotondamento dell'app.
- **Fix del bug dei giorni deselezionati**: la selezione dell'editor vive in una bozza
  non persistita (`schedDraft`) che sopravvive ai ri-render della pagina; inoltre il tick
  dei countdown **ripulisce una sola volta** i blocchi ferrei scaduti (prima, ogni secondo
  ri-renderizzava le sezioni PRO, azzerando la selezione dei giorni appena fatta).
- Nuove chiavi i18n per gli aria-label del campo orario (4 × 6 lingue); aggiornati
  `ARCHITETTURA.md` e i test e2e (2 nuove verifiche).

### ✅ Voce di menu "Membership" senza decorazioni

- Rimossa la coroncina multicolore aggiunta in precedenza: la voce di menu resta pulita
  (nessun sottolineato né corona). Il richiamo premium vive nel bordo a gradiente del
  riquadro del piano nella sezione Membership.

### ✅ Confronto settimanale con grafici + coroncina Membership

- Il dialog **"Confronto settimanale"** è ora graficamente allo stesso livello della card
  "ultimi 7 giorni": un **grafico riassuntivo** confronta le 4 settimane (barre
  accatastate distraenti/altri con totale e data per settimana, legenda) e ogni settimana
  mostra il **mini grafico dei suoi 7 giorni** (stesse barre della card principale, in
  scala ridotta, con etichette dei giorni della settimana).
- La voce di menu **"Membership"** ha sostituito il sottolineato a gradiente animato con
  una piccola **coroncina multicolore** appoggiata sul bordo superiore, leggermente
  inclinata — rimossa poco dopo su richiesta (vedi sezione successiva: la voce resta
  senza decorazioni).
- Nuova chiave i18n `week_cmp_summary` (6 lingue); aggiornati `ARCHITETTURA.md` e i test
  e2e (3 nuove verifiche: grafici del confronto, chiusura dialog, decorazione voce menu).

### ✅ Immagine di sfondo personalizzata (URL) → PRO

- Il campo "Immagine di sfondo (URL)" in Aspetto → Avanzate è ora una funzione PRO:
  - per i non-PRO il campo è **disabilitato** con un avviso con lucchetto;
  - la sanitizzazione del background (`sanitizeSettings`) **scarta** `bgImage` senza
    la firma PRO (non basta falsificare lo storage);
  - per i PRO l'URL resta trimmato (max 2048 caratteri).
- I test e2e aggiornati verificano il blocco per i free e (nel blocco PRO) il
  salvataggio trimmato.

### ✅ Internazionalizzazione dei domini predefiniti delle categorie

- Rimossi i siti prettamente italiani dal registry `CATEGORIES` in `common.js`:
  - **News**: `repubblica.it`, `corriere.it`, `ansa.it`, `wired.it` → `bbc.com`,
    `cnn.com`, `nytimes.com`, `theguardian.com`, `reuters.com`, `wired.com`;
  - **Shopping**: `zalando.it`, `subito.it` → `zalando.com` (variante globale),
    rimosso `subito.it` (senza equivalente internazionale).

### ✅ Preview interattiva dei Temi PRO → dashboard

- Il click su un tema PRO da non-PRO (Aspetto) non tiene più l'utente nella pagina
  impostazioni: apre la **dashboard in una nuova scheda** con
  `dashboard.html?preview=<id>`, dove il tema è visibile in azione (gradiente +
  aurora + effetto vetro) con un banner "Anteprima tema PRO".
- Chiudendo il banner si torna al tema normale (il parametro viene rimosso
  dall'URL). Il tema non viene mai persistito senza firma PRO.
- Rimossa la vecchia barra di anteprima in-place (`proPreviewBar`) e le relative
  traduzioni; aggiornati i test e2e (apertura scheda, gradiente applicato, banner,
  chiusura, non-persistenza).

### ✅ Navigazione Storico Statistiche (frecce ‹ ›)

- **Dashboard** (card Focus): frecce ‹ › ai lati dell'etichetta del giorno
  ("Oggi", "Ieri", data). Cliccandole, tempi distraenti/altri e contatori
  blocchi/sblocchi si aggiornano al giorno selezionato (offset fino a 69 giorni).
- **Statistiche delle impostazioni**: la stessa navigazione sposta l'intera vista
  nel passato — il grafico a barre mostra i 7 giorni che terminano nel giorno
  selezionato, "Top siti" e i contatori mostrano quel giorno; la freccia › è
  disabilitata su "Oggi".
- Etichette localizzate (`day_today`, `day_yesterday`) in 6 lingue.

### ✅ Espansione Statistiche (Confronto Settimanale)

- La card "Tempo di navigazione — ultimi 7 giorni" è ora **cliccabile** (più un
  bottone esplicito "Confronta le settimane") e apre un **dialog** con le ultime
  4 settimane.
- Ogni settimana mostra lo stesso livello di dettaglio della vista giornaliera:
  tempo sui siti distraenti vs altri, **top siti con percentuali** e contatori
  di blocchi/sblocchi.
- Nota (documentata anche in ARCHITETTURA): il modello dati traccia solo i totali
  per giorno, non le ore della giornata — quindi il confronto copre il tempo per
  sito e i contatori settimanali, non la distribuzione oraria.

### ✅ Nascondere i Siti Distraenti dai Preferiti

- Con la **Modalità Focus attiva**, la griglia dei Preferiti nella dashboard
  nasconde dinamicamente i siti che fanno parte della lista Focus; un hint segnala
  quanti sono stati nascosti.
- In modalità modifica i siti nascosti riappaiono, così si possono comunque
  rimuovere. Il filtro usa `siteFor()` (domini e sottodomini).

### ✅ Immagine di Sfondo (URL) nei Temi Custom

- L'editor dei temi custom ha un nuovo campo **"Immagine di sfondo (URL)"**.
- Il campo è **sbloccato solo per i PRO** (per i free resta disabilitato con
  avviso e la sanitizzazione scarta il valore): il salvataggio avviene solo con la
  firma PRO.
- L'immagine viene salvata dentro il tema (`customThemes[].bgImage`) e `applyTheme()`
  le dà la **precedenza** sull'immagine globale di Aspetto → Avanzate.

---

## File modificati

| File | Modifiche principali |
|---|---|
| `common.js` | Domini categorie internazionalizzati; `bgImage` nei temi custom; `applyTheme` usa l'immagine del tema prima di quella globale |
| `background.js` | Rimosso toggle di sviluppo (`_devPro`, `proTest`, ramo in `verifyProLive`); PRO-gate su `bgImage` globale e dei temi custom in `sanitizeSettings` |
| `options.html` | Sezione Membership; gate compatto nella card PRO di Focus; campo immagine nei temi custom; avviso PRO su sfondo; navigazione giorno + dialog confronto settimane; icone SVG; rimosso toggle di sviluppo e barra anteprima |
| `options.js` | Rendering Membership; sfondo PRO gated; preview temi PRO → dashboard; navigazione storico + confronto settimanale; emoji → SVG (`ICO`); rimosso codice dev/preview in-place; fix binding bottone sblocco collegamenti rapidi |
| `options.css` | Stili Membership (gradiente piano + voce menu), day-nav, dialog settimanale, note blocco, icone SVG nei chip |
| `dashboard.html` | Day-nav nelle statistiche; banner anteprima tema PRO; hint preferiti nascosti |
| `dashboard.js` | Navigazione storico (frecce); filtro preferiti con Focus attivo; anteprima tema PRO via `?preview=` |
| `dashboard.css` | Stili day-nav, hint preferiti nascosti, banner anteprima |
| `i18n.js` | Rimosse chiavi dev/preview; nuove chiavi Membership, navigazione giorno, confronto settimanale, sfondo PRO, preferiti nascosti, banner anteprima (6 lingue); testi `pro_not_configured`/`pro_thanks` aggiornati |
| `e2e-test.js` | Aggiornato al nuovo comportamento (sfondo PRO, preview in dashboard, UI Membership, niente toggle di sviluppo; test di attivazione PRO gated su EXT_PAY_ID) |
| `ARCHITETTURA.md` | Documentazione allineata (Membership, sfondo PRO, preview dashboard, storico statistiche, confronto settimanale, preferiti nascosti, domini internazionali, rimozione dev toggle) |

---

## Verifica

- `node --check` su tutti i file JS modificati: OK.
- `node e2e-test.js` (Chrome for Testing): **76 verifiche passate, 0 fallite**.
  La sezione 14 ora usa il toggle di sviluppo reale (attivazione/disattivazione, sblocco
  PRO, salvataggio fascia dalla UI, gradiente Avanzate, stabilità della selezione).
  I test di attivazione PRO sono saltati perché `EXT_PAY_ID` è vuoto (senza
  ExtensionPay configurato non esiste più alcun modo di attivare PRO — è il
  comportamento voluto dalla rimozione del toggle di sviluppo).