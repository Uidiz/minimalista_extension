# TODO Minimalista — stato di avanzamento

> Documento di lavoro: ogni sezione riporta le istruzioni originali (in sintesi) e
> **cosa è stato effettivamente implementato** (✅), con le differenze rispetto allo
> spec. Il riferimento architetturale aggiornato è `ARCHITETTURA.md`.

## Riepilogo

| Sezione | Stato | Verifiche e2e |
|---|---|---|
| 1–5. Personalizzazione avanzata (immagine di sfondo + arrotondamento bordi) | ✅ implementato | sezione 11 |
| 6A. Categorie di siti (per tutti i piani) | ✅ implementato | sezione 12 |
| 6B. Funzioni PRO (Cold Turkey + fasce orarie) | ✅ implementato | sezione 12 |
| 6C. Banner modalità incognito (categoria Adulti) | ✅ implementato (non coperto da e2e) | — |
| 7. Pagamenti PRO (ExtensionPay) | ✅ integrato — manca la registrazione dell'ID su extensionpay.com | sezione 12 (parziale) |
| 8. Elenco e modifica dei siti delle categorie | ✅ implementato (elenco per tutti, modifica PRO) | sezione 12 |
| 9. Card PRO premium (design) | ✅ implementato | sezione 12 (parziale) |
| 10. Temi PRO con gradienti + anteprima gratuita | ✅ implementato (anteprima per tutti, persistenza PRO) | sezione 12 |

Suite e2e: **72/72 controlli** (`node e2e-test.js`).

---

## 1–5. Personalizzazione avanzata — ✅ implementato

**Obiettivo:** immagine di sfondo via URL e arrotondamento dei bordi regolabile, con reset.

- **Modello dati**: `DEFAULT_SETTINGS` (`common.js`) include `bgImage: ""` e `borderRadius: 8`.
- **Validazione**: in `sanitizeSettings()` di `background.js` (il sanitizzatore vive lì, non in
  `common.js` come suggeriva lo spec): `bgImage` stringa trimmata, max 2048 caratteri → `""`
  altrimenti; `borderRadius` fallback **8** se mancante/invalido, altrimenti **clamp 0–24**.
- **`applyTheme()`** (`common.js`): inietta `--bg-img` come `url("…")` — escaping di `"` e `\` e
  rimozione dei caratteri di controllo, così un URL malevolo non esce dalla `url()` (niente
  CSS injection); la proprietà viene rimossa quando l'URL è vuoto. Inietta
  `--border-radius: Npx` (lo `0` è ammesso e rispettato).
- **CSS**:
  - `common.css`: `body` passa a `background-color` + `background-image: var(--bg-img, none)`
    con `cover/center/fixed`; radius fissi sostituiti — `.card` → `calc(var(--border-radius, 8px) + 6px)`,
    input/bottoni → `var(--border-radius, 8px)`.
  - `dashboard.css`: `body` usa `background-color` (lo shorthand `background:` azzererebbe
    l'immagine); radius derivati dalla variabile (input/bottoni `+2px`, `dialog` `+6px`).
  - `popup.css`: radius parametrizzati con la stessa variabile (`.stat` `+2px`, `.link-btn`
    `var()`) — estensione richiesta in un secondo momento.
  - `block.css`: volutamente invariato — i suoi radius sono forme (cerchi 50%, pillola 999px),
    non angoli da regolare.
- **UI** (`options.html`/`options.css`/`options.js`): card **"Avanzate"** in fondo alla sezione
  Aspetto — input testuale URL sfondo, slider 0–24 con lettura live in `px` e bottone Reset.
  `renderAdvanced()` (stesso pattern di `renderTypography`): anteprima live su `input`
  (immagine e raggio via `applyTheme` in memoria), persistenza su `change`, reset a 8 + save.
- **i18n**: chiavi `advanced_title`, `bg_image`, `bg_image_ph`, `border_radius`,
  `reset_advanced` in tutte e sei le lingue (it/en/es/fr/de/pt).
- **e2e — sezione 11**: card/controlli renderizzati e tradotti, anteprima live del raggio
  (variabile 20px → card 26px), persistenza, propagazione alla dashboard già aperta, reset a 8,
  anteprima/persistenza dello sfondo, **sicurezza CSS-injection** (URL con doppi apici) e
  sanitizzazione (clamp/trim).

---

## 6A. Categorie di siti (per tutti i piani) — ✅ implementato

**Obiettivo:** macro-categorie precompilate selezionabili accanto ai singoli domini, con
modalità e limite giornaliero.

- **Registry** `CATEGORIES` in `common.js`: Social, Video, News, **Adulti**, Giochi, Shopping —
  domini **disgiunti** tra categorie (un dominio può però essere anche un singolo sito).
- **Configurazione** in `settings.categories` (una voce per categoria, fusa col registry in
  `sanitizeSettings`): `active`, `mode: "hold"|"block"`, `delay` (1–30), `limitMinutes`.
- **Intercettazione** (`resolveHit` in `background.js`): per ogni dominio si applica **una sola
  regola** — il sito singolo configurato ha **precedenza** sulla categoria; altrimenti conta la
  categoria attiva che contiene il dominio. Un sito singolo inattivo non oscura la categoria.
- **Limite giornaliero di categoria = budget aggregato** (scelta confermata dall'utente):
  `categoryUsedSeconds()` somma i secondi spesi su *tutti* i domini della categoria (registrati
  sul dominio canonico dal tracker); superato il budget la navigazione viene bloccata con
  `r=limit&c=<id>` e la pagina di blocco mostra il totale della categoria. `enforceLimits()`
  blocca automaticamente anche le schede già aperte oltre budget.
- **UI**: card "Categorie di siti" nella sezione Focus, righe analoghe ai siti
  (toggle/modalità/ritardo/limite) con `renderCategories()`.
- **e2e**: 6 categorie renderizzate e presenti nello storage sanitizzato, attivazione
  dall'interfaccia, dominio membro intercettato (tieni premuto), **budget aggregato superato** →
  blocco `limit` con `c=video`.

---

## 6B. Funzioni PRO (Cold Turkey + fasce orarie) — ✅ implementato

**Obiettivo:** blocco ferreo irreversibile e automazione per fasce orarie, esclusive PRO.

### Cold Turkey (blocco ferreo)
- Per **singolo sito o intera categoria**: `ctUntil` (timestamp di scadenza) salvato su
  `sites[]`/`categories[]`; durata in ore/giorni (min 1 minuto).
- **Vince su tutto**: anche con Focus spento, limite superato o periodo di grazia attivo il
  target viene bloccato (`r=ct`, messaggio dedicato). Nessuna possibilità di annullare o
  ridurre la durata (nemmeno col PIN): l'interfaccia disabilita le righe coinvolte e mostra un
  countdown ⛓ fino alla scadenza.
- Attivazione via messaggio `coldTurkey` (site|cat), **sempre dietro la verifica live** (sotto).

### Fasce orarie settimanali (scheduling)
- `schedule = { days: [1..7], start, end }` (minuti da mezzanotte, `end` escluso), sanitizzato
  (`sanitizeSchedule`); configurabile per sito o categoria.
- Fuori fascia il target **non viene intercettato**; dentro fascia si applica la modalità di
  base (hold/block + limite). Attivazione/rimozione via messaggio `proSchedule` (sempre dietro
  la verifica live).

### Gating PRO (requisiti discussi con l'utente)
- Nello storage c'è solo una **firma opaca** (`_aT === "x8f9q"` in `settings`, nome e valore non
  ovvi da cercare) usata **solo per l'interfaccia** (sparire i lucchetti, mostrare gli
  strumenti). Nessun `isPro: true` banale.
- Le **azioni critiche non si fidano mai della firma**: `coldTurkey`/`proSchedule` chiamano
  `verifyProLive()` nel background. Oggi (senza ExtensionPay configurata) approva solo il
  **toggle di sviluppo** (Info → "PRO — solo sviluppo", chiave `_devPro`); dalla sezione 7 la
  verifica passa da ExtensionPay. Un "no" definitivo rimuove anche la firma locale
  falsificata; errore di rete → **fail-closed**.
- Il codice è pronto per la minificazione in pubblicazione; il toggle di sviluppo va rimosso
  prima del rilascio.
- **UI**: card "Funzioni PRO" bloccata (lucchetto) → editor per cold turkey (target + ore/giorni
  + lista attivi) e fasce (target + giorni + orari + lista con rimozione), messaggi di errore
  specifici (`pro_denied`, `pro_action_failed`).
- **i18n**: ~30 chiavi nuove per lingua (le etichette dei giorni si generano dal locale).
- **e2e**: strumenti bloccati senza abbonamento, firma falsificata rifiutata e **revocata**,
  toggle di sviluppo (on/off), cold turkey attivato dall'interfaccia con riga disabilitata +
  chip ⛓ e override del periodo di grazia (`r=ct`), fasce dentro/fuori finestra.

---

## 6C. Modalità in incognito (siti per adulti) — ✅ implementato (non e2e)

- **Le estensioni non agiscono in incognito di default**: senza "Consenti in incognito"
  l'estensione è completamente inerte in incognito (verificato: il sito si apre libero).
- **`"incognito": "split"` nel manifest** (fix del bug reale): con "spanning" (default)
  l'intercettazione scatta in incognito ma Chrome blocca la navigazione verso `block.html`
  nel frame principale di una scheda incognito → ERR_BLOCKED_BY_CLIENT
  ("<id-estensione> è bloccato / Questa pagina è stata bloccata da Chrome") al posto della
  pagina di blocco. Documentato in developer.chrome.com (manifest incognito + web-accessible
  resources). Con "split" le pagine dell'estensione si caricano in incognito e
  `chrome.storage.local` resta condivisa tra normale e incognito.
- **Banner easter egg**: attivando la categoria **Adulti**, `options.js` controlla
  `chrome.extension.isAllowedIncognitoAccess()`; se `false` mostra un banner con bottone che apre
  `chrome://extensions/?id=<id-estensione>` (spunta "Consenti in incognito"). Scelta voluta:
  compare **solo** con la categoria Adulti attiva — una "chicca" per chi blocca i siti per adulti.
- **Recupero navigazioni sfuggite** (`sweepBlocked()` in `background.js`): con l'accesso
  incognito attivo, la prima navigazione di una sessione può sfuggire perché il service worker
  parte freddo e `onBeforeNavigate` non è garantito. La sweep blocca le schede aperte che
  dovrebbero essere bloccate a ogni avvio del worker e a ogni tick dell'alarm (30 s), rispettando
  il periodo di grazia.
- Non coperto dalla suite e2e: forzare `isAllowedIncognitoAccess() === false` non è fattibile in
  Chrome for Testing (verifica manuale su Chrome reale prima della pubblicazione).
  `tools/incognito-repro.js` copre lo stato "accesso spento" e il recupero via sweep.

---

## 7. Integrazione pagamenti PRO (ExtensionPay) — ✅ integrato

**Obiettivo:** sblocco delle funzioni PRO via ExtensionPay (acquisto Lifetime), con verifica
live sul server per le azioni critiche.

### A. Setup e configurazione
- **`ExtPay.js` vendored** nel progetto (pacchetto npm `extpay` **v3.1.2**, con header di
  provenienza). ⚠️ Licenza della libreria: **AGPL-3.0-or-later**.
- Caricata nel service worker via `importScripts("common.js", "i18n.js", "ExtPay.js")` e nelle
  impostazioni (`options.html`) come `<script src="ExtPay.js">`. **Nessuna modifica al
  `manifest.json`**: ExtensionPay richiede solo `storage` (già presente).
- `EXT_PAY_ID` in `common.js` = ID registrato su extensionpay.com; **vuoto = ExtensionPay
  disabilitato** (in sviluppo le funzioni PRO si testano col toggle in Info). `extpay` è
  istanziato lazy (`ensureExtPay`) e `extpay.startBackground()` è chiamato una sola volta per
  esecuzione del worker.

### B. Gestione dello stato utente (background)
- `refreshProStatus()`: interroga `extpay.getUser()` e riallinea la firma UI (`_aT`) allo stato
  reale. Chiamata all'**avvio del worker**, su `onInstalled` e `onStartup`; le pagine possono
  richiederla col messaggio **`proRefresh`** (es. dopo il pagamento).
- `verifyProLive()` (azioni critiche): toggle di sviluppo → altrimenti `getUser()`; se
  `user.paid` approva e riallinea la firma; un "non pagato" (o ExtensionPay assente) **revoca
  la firma**; un errore di rete è **fail-closed** (non sblocca nulla e non tocca l'ultimo stato
  noto). Falsificare lo storage locale non concede nulla.
- Gestione firma centralizzata in `setProSig()` (persiste solo se cambia).

### C. Interfaccia di pagamento (UI)
- Dietro il lucchetto PRO: **"Sblocca PRO (Lifetime)"** → `extpay.openPaymentPage()` e
  **"Ho già pagato? Accedi"** → `extpay.openLoginPage()`.
- **Real-time post-pagamento senza content script**: mentre la scheda di pagamento è aperta la
  pagina impostazioni fa un polling breve di `getUser()`; appena risulta pagato invia
  `proRefresh`, i lucchetti spariscono e compare il messaggio di ringraziamento. Scelta
  consapevole e documentata: niente `content_scripts` su `extensionpay.com` (che avrebbe
  abilitato i callback push `onPaid` ma aggiunto un permesso all'installazione).
- La pagina reagisce anche ai cambi della sola firma nello storage (`storage.onChanged`):
  revoche/assegnazioni esterne aggiornano i lucchetti all'istante.
- In una build senza `EXT_PAY_ID` il click sul bottone mostra l'avviso "ExtensionPay non è
  configurato" (nessuna apertura di pagine).
- **Privacy**: l'unica comunicazione esterna è la verifica dello stato di pagamento; i testi
  delle Info (6 lingue) sono stati aggiornati di conseguenza.
- **i18n**: chiavi `pro_unlock`, `pro_login`, `pro_thanks`, `pro_pay_error`,
  `pro_not_configured`; testi `pro_locked_hint`/`pro_denied` aggiornati (6 lingue).
- **e2e (sezione 12)**: UI di sblocco presente (acquisto + login), avviso in build non
  configurata, `proRefresh` senza ExtensionPay → `ok, paid:false` e firma invariata. Il flusso
  di pagamento reale non è testabile senza un account/ID registrato su extensionpay.com.

---

## 8. Elenco e modifica dei siti delle categorie — ✅ implementato

**Richiesta utente:** vedere la lista reale dei siti di ogni categoria (per tutti) e poterla
modificare (solo PRO).

- **Elenco (per tutti)**: ogni riga categoria è ora espandibile (freccia ▶): mostra i domini
  della categoria come chip, con conteggio aggiornato. Nessun blocco per la sola visualizzazione.
- **Modifica (PRO)**: nella riga espansa compare "✎ Modifica siti" (aggiungi dominio con input,
  ✕ per rimuovere dai chip, "Fatto" per uscire). Per i non-PRO compare invece un bottone
  "🔒 PRO · Modifica siti" che mostra l'avviso `cat_edit_pro` senza cambiare nulla.
- **Modello dati**: lista personalizzata in `settings.categories[].domains`; se assente si usano
  i domini precompilati del registry. Nuovo helper `categoryDomains(settings, id)` usato ovunque
  (`hostCategory` e `categoryUsedSeconds` ora accettano `settings`): intercettazione, budget
  aggregato, `enforceLimits()` e pagina di blocco lavorano sui **domini effettivi**.
- **Gating**: la sanitizzazione mantiene `domains` personalizzati **solo con la firma PRO**
  (altrimenti registry); il salvataggio passa dal nuovo messaggio **`proSaveCategories`**, che
  chiama `verifyProLive()` — stessa protezione anti-forgery di cold turkey/fasce (rifiuto +
  revoca della firma UI se falsificata).
- **UI/UX**: stato riga (espansa/modifica) e messaggi di esito mantenuti in memoria per riga
  (`catUi`), messaggi inline temporanei.
- **i18n**: chiavi `cat_view_title`, `cat_edit`, `cat_add`, `cat_add_ph`, `cat_done`,
  `cat_del_title`, `cat_no_domains`, `cat_dup`, `cat_saved_ok`, `cat_edit_pro` (6 lingue).
- **e2e**: lista dei siti visibile per tutti (es. `instagram.com` in Social), modifica bloccata
  per i free (avviso, nessuna lista custom), aggiunta di un dominio personalizzato a una
  categoria dall'interfaccia come PRO (persistita nello storage).

---

## 9. Card PRO premium — ✅ implementato

**Richiesta utente:** dare alla card delle funzioni PRO un aspetto "premium" per invogliare
all'acquisto.

- **Design**: bordo con gradiente (viola→azzurro→oro) su sfondo card, badge **PRO**, tagline e
  lista di 4 funzioni con icone (⛓ Cold Turkey, 🕒 Fasce orarie, 🎨 Temi PRO in gradiente,
  ✏️ Categorie personalizzate).
- **Pannello pagamento**: bottone principale con gradiente "Sblocca PRO (Lifetime)" +
  secondario "Ho già pagato? Accedi" (stile ghost), più messaggi di errore dedicati.
- **Compatibilità**: modifica solo visiva — id e struttura esistenti (`proLocked`, `proTools`,
  `proUnlock`, `proLogin`, `proMsg`, `proPayRow`) invariati, così JS e test continuano a
  funzionare senza modifiche.

---

## 10. Temi PRO con gradienti + anteprima gratuita — ✅ implementato

**Richiesta utente:** temi custom per PRO con sfondi in gradiente, e possibilità per i non-PRO
 di vederli in anteprima (per invogliare all'acquisto).

- **Registry**: `PRO_THEMES` in `common.js` con 4 temi — Aurora, Ember, Lagoon, Royal — ognuno
  con due colori di gradiente (`grad`) + `fg`/`accent`/`card`/`muted`/`border` coerenti.
- **Rendering**: `applyTheme()` inietta `--bg-grad` (gradiente a 160°); il `body` in
  `common.css` impila **immagine utente sopra gradiente sopra colore** (layer "none" = assenti).
  Vale per impostazioni, dashboard e popup (la pagina di blocco non carica `common.css`).
- **Gating**: `sanitizeSettings()` conserva un tema PRO in `settings.theme` **solo con la firma**
  (`_aT`); `themeColors()` per i non-PRO ripiega su Midnight. Un utente free non può mai
  **persistere** un tema PRO (solo vederlo in anteprima).
- **Anteprima gratuita**: griglia dedicata "👑 Temi PRO" sotto i temi normali, con card
  bloccate 🔒. Il click su una card (non-PRO) applica il gradiente **solo in memoria**
  (`applyTheme(..., allowProTheme)`), mostra la barra "Anteprima del tema PRO: <nome>" con
  "Sblocca PRO" (porta alla card di pagamento in Focus) e "Chiudi anteprima"; scegliere un
  tema normale chiude l'anteprima. Con PRO attivo il click applica e salva come un tema normale.
- **i18n**: chiavi `pro_tagline`, `pro_feat_*` (4 voci della card premium), `pro_theme_section`,
  `pro_theme_hint`, `pro_preview_label`, `pro_preview_close` (6 lingue).
- **e2e**: card PRO renderizzate come nel registry, anteprima per i free (barra visibile +
  `--bg-grad` applicato, tema NON salvato nello storage), chiusura anteprima (barra nascosta +
  gradiente rimosso), con PRO attivo il tema gradiente si applica e si salva (`pr-lagoon`).

---

## Checklist per la pubblicazione

- [ ] Registrare l'estensione su extensionpay.com e impostare il suo ID in `EXT_PAY_ID`
      (`common.js`) — oggi vuoto: in produzione senza ID le funzioni PRO restano bloccate.
- [ ] Rimuovere il toggle di sviluppo: UI in Info (`proTestToggle`), chiave `_devPro`, messaggio
      `proTest` e il ramo di sviluppo in `verifyProLive()`.
- [ ] Valutare l'impatto della licenza **AGPL-3.0** di `ExtPay.js` sul progetto.
- [ ] Verifica manuale su Chrome reale del banner incognito (categoria Adulti).
- [ ] (Facoltativo) dashboard/popup non caricano ExtPay: nessuna superficie PRO, per ora.