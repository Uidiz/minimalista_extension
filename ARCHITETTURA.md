# Minimalista — Estensione Chrome: documentazione e architettura

> Estensione Chrome ispirata all'app Android **Minimalista** (launcher anti-distrazione).
> Concetto portante: quando tenti di aprire un sito distraente, l'estensione ti ferma e
> ti chiede un gesto **intenzionale** (tenere premuto) prima di lasciarti passare; in più
> puoi imporre un **limite giornaliero** di utilizzo per sito.
> Tutti i dati restano **solo sul dispositivo** (`chrome.storage.local`). L'unica comunicazione
> esterna è la verifica dello stato PRO (pagamento) tramite **ExtensionPay**: nessun contenuto
> personale lascia il dispositivo.

---

## 1. Installazione

1. Apri `chrome://extensions`
2. Attiva la **Modalità sviluppatore** (in alto a destra)
3. Clicca **Carica estensione non pacchettizzata** e seleziona la cartella del progetto

La nuova scheda di Chrome diventa la dashboard di Minimalista. L'estensione viene caricata
con i siti di default (Instagram, TikTok, YouTube, X, Facebook, Reddit, Netflix) e Focus
attivo: se non vuoi blocchi immediati, spegni l'interruttore Focus dal popup o dalla dashboard.

---

## 2. Funzionalità

### 2.1 Modalità Focus (il cuore dell'estensione)
- Ogni sito della lista viene **intercettato** prima di aprirsi (solo frame principale, solo http/https).
- Modalità **"Tieni premuto"**: appare una pagina di blocco minimalista con un **anello di avanzamento**;
  per entrare bisogna tenere premuto il pulsante per i secondi configurati (1–30 s). Un gesto deliberato,
  identico a quello dell'app Android.
- Modalità **"Blocca"**: il sito non si apre mai (nessun sblocco).
- **Limite giornaliero** per sito (0 = nessun limite): superato il limite, il sito resta bloccato
  per il resto della giornata (la pagina di blocco mostra il tempo già speso). Il blocco scatta
  anche **a pagina già aperta**: a ogni tick dell'alarm, se il limite è superato la scheda viene
  reindirizzata automaticamente alla pagina di blocco (nessun ricaricamento manuale).
- **Periodo di grazia** (default 5 min): dopo uno sblocco, la scheda può navigare liberamente
  (anche tra pagine diverse del sito) senza nuovi blocchi, fino a scadenza.

### 2.2 Dashboard (nuova scheda)
- **Ricerca web**: barra di ricerca in alto; il motore (Google, DuckDuckGo, Bing, Brave) è
  configurabile in Aspetto.
- **ToDo**: priorità (alta/media/bassa) e scadenza (nessuna/oggi/domani/data), ordinamento
  automatico (non completate → priorità → scadenza), modifica in un dialog, pulizia completate.
- **Preferiti**: griglia launcher con l'**icona del sito** sopra e il nome sotto; l'icona
  arriva dalla cache di Chrome (`_favicon`, permesso "favicon": nessuna richiesta di rete),
  con l'iniziale del nome come fallback se il sito non è mai stato visitato. Modalità
  "modifica" per aggiungere/rimuovere.
- Le **sezioni della nuova scheda** (barra di ricerca, ToDo, Preferiti, Focus) si possono
  nascondere singolarmente da Impostazioni → Home (`showSearch`/`showTodo`/`showFavorites`/
  `showFocus`): nascondere non disattiva nulla, il Focus continua a bloccare.
- Riepilogo **Focus**: siti limitati con i relativi tempi, interruttore globale, statistiche del giorno.

### 2.3 Statistiche
- Il tempo viene tracciato su **ogni sito web** (http/https attivo nella finestra a fuoco) e
  suddiviso in due categorie: **siti distraenti** (quelli del Focus) e **altri siti**.
- Grafico a barre degli **ultimi 7 giorni** con due serie per giorno (distraenti vs altri siti)
  e confronto dei soli siti distraenti con la settimana precedente (trend %).
- **Top siti del giorno** con percentuali (i siti del Focus sono evidenziati con un pallino).
- Contatori di **tentativi bloccati** e **aperture deliberate** (sblocchi avvenuti), giornalieri e settimanali.
- Comando di azzeramento.

### 2.4 Personalizzazione
- **Temi**: 6 temi fissi (Midnight, E-Ink, Neon, Warm, Ocean, Sunset) più **temi custom salvati**
  con nome personalizzato. Ogni tema custom ha **tre colori principali** (sfondo, testo, accento)
  scelti con `<input type="color">` nativo oppure digitando l'**hex** esatto; card, muted e border
  sono derivati per interpolazione. I temi custom si possono creare, rinominare, modificare ed eliminare.
- Dimensione globale del font (60–120%) e stile (Sans Serif, Serif, Monospace, Corsivo).
- Mostra/nascondi i secondi sull'orologio.
- **Lingua dell'interfaccia**: automatica (lingua del browser se supportata) oppure manuale tra
  Italiano, English, Español, Français, Deutsch e Português. Il selettore è in Aspetto;
  il cambio lingua aggiorna all'istante tutte le pagine aperte.
- **Motore di ricerca** della barra in nuova scheda (Google, DuckDuckGo, Bing, Brave), in Aspetto.
- Mostra/nascondi la **barra di ricerca web** sulla nuova scheda (Aspetto → Nuova scheda).
- **Collegamenti rapidi (PRO)** in alto a destra della nuova scheda (come i link Gmail/Immagini della home di Google): scelti in Aspetto → Collegamenti rapidi tra un catalogo preselezionato (Gmail, Immagini, Maps, YouTube, Calendar, Drive, News, Traduttore) oppure voci personalizzate nome + URL; si aprono in una nuova scheda. Mostrati solo con la firma PRO (`settings.shortcuts`, default: Gmail + Immagini).
- **Immagine di sfondo e arrotondamento bordi** (Aspetto → Avanzate): URL di un'immagine di
  sfondo in copertura fissa (tutte le pagine tranne la pagina di blocco, che non carica
  `common.css`) e raggio degli angoli dell'interfaccia (0–24 px) esposto come CSS variable
  `--border-radius`; card e dialog lo derivano con `calc()` per mantenere le proporzioni.
  L'URL viene sanificato contro la CSS injection prima di essere iniettato in `--bg-img`.
- **Sezione Impostazioni "Home"**: raccoglie tutto ciò che riguarda la nuova scheda — sezioni
  visibili/nascoste (ricerca, ToDo, Preferiti, Focus), motore di ricerca, secondi
  dell'orologio e i collegamenti rapidi PRO (in precedenza in Aspetto).
- **Aurora PRO animata**: con i temi PRO la nuova scheda ha un livello `bg-aurora` con tre
  blob radiali sfocati e luminosi (accento, secondo colore `--bg-grad-c2` e un bagliore
  caldo centrale) in `mix-blend-mode: screen`, con deriva ampia e continua (12–22 s,
  traslazioni fino a ~26vmax) così il movimento si nota subito pur restando lento ed
  elegante; solo `transform` (compositor-friendly, niente repaint a schermo intero) e
  rispetta `prefers-reduced-motion`.
- **Sezioni nuova scheda → interruttori moderni**: nelle impostazioni Home le quattro
  sezioni sono righe-card con icona SVG monocroma (lente, check, stella, mirino) e
  interruttore (`switch`), non più checkbox semplici né emoji.
- **Aurora leggera + modalità di sfondo**: i blob dell'aurora non usano più `filter: blur`
  (era il costo GPU principale su layer da ~70vmax): la morbidezza viene dai radial-gradient
  stessi, il movimento resta solo `transform`. In più si può scegliere la modalità
  (`settings.bgMotion`, Impostazioni → Home → Sfondo dei temi PRO; la card è nascosta
  per i non-PRO, visto che senza un tema PRO non ha effetto): `aurora` (animata,
  default), `static` (bagliori fermi, animazione spenta via `data-bg-motion="static"`)
  o `plain` (solo il gradiente del tema, layer nascosto).
- **Hover sulle card PRO**: al passaggio del mouse la rotazione del bordo a gradiente
  accelera (5s → 1.5s) su `#proCard`, `#shortcutsCard` e sui temi PRO, come feedback di
  selezione; sui temi PRO il hover non copre più il gradiente con un bordo pieno.
- **Card PRO con bordo animato**: oltre a `#proCard` e ai temi PRO, anche la card
  "Collegamenti rapidi" (`#shortcutsCard`) usa il bordo a gradiente conico rotante
  (`proCardSpin`), spento con `prefers-reduced-motion: reduce`.

### 2.5 Sicurezza
- ~~PIN facoltativo sulle impostazioni~~: **rimosso** (ritenuto inutile: il blocco ferreo PRO è
  irreversibile e copre già i momenti di debolezza). La pagina impostazioni è accessibile
  liberamente, senza schermata di blocco.

### 2.6 Popup (icona nella barra)
- Interruttore Focus + riepilogo del giorno + link a dashboard e impostazioni.

### 2.7 Categorie di siti (per tutti i piani)
- Sei macro-categorie precompilate (Social, Video, News, Adulti, Giochi, Shopping) con domini
  **disgiunti** tra loro: registry `CATEGORIES` in `common.js`, configurazione per categoria in
  `settings.categories`. Ogni categoria ha toggle attivo/inattivo, modalità "tieni premuto"/
  "blocca", ritardo e limite giornaliero, come i singoli siti.
- Il limite di categoria è un **budget aggregato**: conta i minuti spesi su *tutti* i domini
  della categoria (il tracker li registra sul dominio canonico, così il calcolo è immediato).
  Superato il budget, i domini della categoria restano bloccati per il resto della giornata;
  la pagina di blocco riceve `r=limit&c=<id>` e mostra il tempo totale già speso.
- Un dominio può stare sia in un sito singolo sia in una categoria (es. `instagram.com` è un
  default ed è in "Social"): la configurazione del **singolo sito ha precedenza**
  sull'intercettazione, ma il suo tempo continua a confluire nel budget aggregato della
  categoria (il tracker registra sempre il dominio canonico del sito configurato).

### 2.8 Funzioni PRO (Cold Turkey + fasce orarie)
- **Cold Turkey** 🔥 (per sito o categoria): blocco totale e irreversibile per X ore/giorni.
  Vince su tutto — anche su Focus spento, sul limite e sul periodo di grazia — e non si può
  annullare né ridurre; l'interfaccia disabilita le righe coinvolte con un
  countdown 🔒 fino alla scadenza (il lucchetto è l'icona del blocco ferreo, in
  UI e nella pagina di blocco).
- **Fasce orarie settimanali** (per sito o categoria): finestre di attivazione del blocco
  (giorni della settimana + orario, es. lun–ven 09:00–18:00). Fuori fascia il target non
  viene intercettato; dentro fascia si comporta secondo la sua modalità di base.
- L'attivazione di entrambe passa da una **verifica live** dello stato PRO (sezione 5.9).

### 2.9 Modalità in incognito
- **Le estensioni non agiscono in incognito di default**: va abilitato manualmente
  "Consenti in incognito" (chrome://extensions → Minimalista → Dettagli). Senza, l'estensione
  è completamente inerte in incognito: nessun blocco, nessuna pagina di blocco.
- **Il manifest dichiara `"incognito": "split"`** (obbligatorio per far funzionare la pagina
  di blocco in incognito): con la modalità "spanning" (default) Chrome blocca la navigazione
  verso le pagine dell'estensione nel frame principale di una scheda incognito
  (ERR_BLOCKED_BY_CLIENT: "Questa pagina è stata bloccata da Chrome"). L'intercettazione
  scatta comunque, ma al posto della pagina di blocco minimalista compare l'errore di Chrome.
  Con "split" le pagine dell'estensione si caricano in incognito e
  `chrome.storage.local`/`sync` restano **condivise** tra normale e incognito (le impostazioni
  e le statistiche sono le stesse; `storage.session`, memoria-only, è separato ma coerente:
  la pagina di blocco e il suo background sono nello stesso contesto).
- **Banner easter egg**: quando si attiva la categoria **Adulti**, le impostazioni controllano
  `chrome.extension.isAllowedIncognitoAccess()`; se l'accesso in incognito è disabilitato
  mostrano un banner con un bottone che apre `chrome://extensions/?id=<id-estensione>`
  (spunta "Consenti in incognito"). Scelta voluta: il banner compare **solo** con la categoria
  Adulti attiva (chi blocca siti per adulti è chi più spesso naviga in incognito).

### 2.10 Pagamenti PRO (ExtensionPay)
- L'acquisto (piano **Lifetime**) è gestito da **ExtensionPay**: la libreria `ExtPay.js` è
  inclusa nel progetto (vendored dal pacchetto npm `extpay` v3.1.2, licenza AGPL-3.0) e
  inizializzata nel service worker (`startBackground`) e nelle impostazioni con l'ID
  registrato su extensionpay.com (`EXT_PAY_ID` in `common.js`).
- Dietro il lucchetto PRO: bottone **"Sblocca PRO (Lifetime)"** → `extpay.openPaymentPage()`
  e **"Ho già pagato? Accedi"** → `extpay.openLoginPage()`. Dopo il pagamento la pagina
  impostazioni interroga lo stato con un polling breve: i lucchetti spariscono all'istante
  e compare il messaggio di ringraziamento.
- Viene verificato **solo lo stato di pagamento** (nessun contenuto personale). Nessun
  `content_scripts` su extensionpay.com: niente permessi aggiuntivi in fase di installazione
  (il real-time usa polling, non push).

---

## 3. Struttura dei file

| File | Ruolo |
|---|---|
| `manifest.json` | Manifest MV3 |
| `background.js` | Service worker: intercettazione (siti + categorie), limiti, tracciamento, messaggi, verifica live PRO (ExtensionPay) |
| `common.js` | Modulo condiviso: impostazioni, temi, registry categorie, configurazione PRO/ExtensionPay, utilità domini/dati |
| `block.html` / `block.css` / `block.js` | Pagina di blocco con "tieni premuto" |
| `dashboard.html` / `dashboard.css` / `dashboard.js` | Nuova scheda (home minimalista) |
| `options.html` / `options.css` / `options.js` | Pagina impostazioni |
| `popup.html` / `popup.css` / `popup.js` | Popup dell'estensione |
| `common.css` | Stili base condivisi (variabili di tema, card, switch, input) |
| `i18n.js` | Modulo di localizzazione: registro lingue, dizionari (it/en/es/fr/de/pt), `t()`, `applyI18n()` |
| `ExtPay.js` | Libreria vendored di ExtensionPay v3.1.2 (pagamenti PRO) — **licenza AGPL-3.0** |
| `_locales/<lang>/messages.json` | Nome e descrizione localizzati del manifest (`default_locale: it`) |
| `icons/` | Icone 16/32/48/128 derivate da `m.png` |
| `m.png` | Icona originale dell'app (512×512) |
| `tools/resize-icons.js` | Script Node puro per rigenerare le icone da `m.png` |
| `tools/setup-cft.cjs` | Scarica Chrome for Testing per i test (cache in `~/.cache/minimalista-cft`) |
| `e2e-test.js` | Test end-to-end (64 verifiche) |

### Manifest (`manifest.json`)
- **MV3**, service worker in background, nessuna pagina `background.html`.
- **`incognito: "split"`**: necessaria perché la pagina di blocco possa essere caricata nel
  frame principale di una scheda in incognito (con "spanning" Chrome la blocca con
  ERR_BLOCKED_BY_CLIENT; le impostazioni restano condivise via `chrome.storage.local`).
- **Permissions**: `storage`, `tabs`, `webNavigation`, `alarms`, `favicon`.
  - `favicon` serve SOLO per le icone dei Preferiti (`chrome-extension://<id>/_favicon/`):
    usa la cache di Chrome, nessuna richiesta di rete verso i siti o servizi esterni.
  - Nessun `host_permissions`: l'intercettazione avviene tramite l'API `webNavigation`
    (evento `onBeforeNavigate`), che non richiede accesso agli host.
- **ExtensionPay non aggiunge permessi**: la verifica dello stato PRO è una `fetch` verso
  `https://extensionpay.com` dal service worker e dalle pagine (nessun `content_scripts`, il
  real-time post-pagamento usa polling; `ExtPay.js` è caricato via `importScripts` nel worker
  e come `<script>` nelle impostazioni).
- `chrome_url_overrides.newtab` → `dashboard.html`: la nuova scheda diventa la dashboard.
- `options_ui.open_in_tab` → la pagina impostazioni si apre in una scheda.
- `action.default_popup` → `popup.html`.

---

## 4. Modello dei dati (`chrome.storage.local`)

```js
settings: {
  focusEnabled: boolean,          // interruttore globale della Modalità Focus
  graceMinutes: number,           // periodo di grazia dopo uno sblocco (minuti)
  sites: [{
    id: number,
    domain: string,               // es. "instagram.com" (normalizzato, senza www)
    delay: number,                // secondi di "tieni premuto" (1–30)
    limitMinutes: number,         // limite giornaliero (0 = nessuno)
    mode: "hold" | "block",       // tieni premuto oppure blocco totale
    active: boolean               // toggle per-sito
  }],
  theme: "midnight" | "eink" | "neon" | "warm" | "ocean" | "sunset" | idCustomTheme,
  customThemes: [{ id, name, bg, fg, accent }],  // temi custom salvati (3 colori ognuno)
  searchEngine: "google" | "duckduckgo" | "bing" | "brave",  // motore di ricerca della barra
  showSearch: boolean,            // mostra/nascondi la barra di ricerca nella nuova scheda
  showTodo: boolean,              // mostra/nascondi la card ToDo nella nuova scheda (default true)
  showFavorites: boolean,         // mostra/nascondi la card Preferiti nella nuova scheda (default true)
  showFocus: boolean,             // mostra/nascondi la card Focus nella nuova scheda (default true)
  bgMotion: "aurora" | "static" | "plain", // sfondo dei temi PRO (Home): aurora animata (default),
              // bagliore statico (zero costo per frame) o solo gradiente
  shortcuts: [{ id, preset|null, name, url }],  // PRO: collegamenti rapidi in alto a destra
              // nella nuova scheda. preset = id del catalogo SHORTCUT_PRESETS (label localizzata)
              // oppure null per le voci personalizzate (name = nome digitato). Default: Gmail + Immagini.
  // (``customBg``/``customText`` del vecchio tema "Custom" vengono migrati automaticamente
  //   al primo avvio in un customTheme nominato "Custom")
  fontScale: number,              // 0.6 – 1.2
  fontFamily: "sans" | "serif" | "mono" | "cursive",
  showSeconds: boolean,
  lang: "auto" | "it" | "en" | "es" | "fr" | "de" | "pt",  // lingua UI; "auto" = lingua del browser
  bgImage: string,                // URL immagine di sfondo ("" = nessuna) — Aspetto → Avanzate
  borderRadius: number,           // arrotondamento UI in px (0–24, default 8)
  categories: [{                  // configurazione per categoria (fusa col registry CATEGORIES)
    id: "social"|"video"|"news"|"adulti"|"gaming"|"shopping",
    active: boolean,              // toggle attivo/inattivo
    mode: "hold" | "block",
    delay: number,                // secondi di "tieni premuto" (1–30)
    limitMinutes: number,         // budget giornaliero AGGREGATO di categoria (0 = nessuno)
    ctUntil: number,              // PRO cold turkey: timestamp di scadenza (0 = nessuno)
    schedule: null | { days: number[], start: number, end: number }  // PRO fasce orarie settimanali
  }],
  _aT: "x8f9q" | null             // firma PRO per la UI (vedi 5.9): SOLO segnale d'interfaccia
}

todo: [{ id, text, done, priority: "high"|"medium"|"low", due: "none"|"today"|"tomorrow"|"YYYY-MM-DD" }]
favorites: [{ id, name, url }]

stats: {
  byDay:   { "YYYY-MM-DD": { [domain]: seconds } },  // tempo per sito per giorno
          // tutti i siti http/https, non solo i configurati: i domini del Focus
          // sono aggregati sul dominio canonico configurato, gli altri restano
          // il dominio della pagina (es. "mail.google.com")
  blocked: { "YYYY-MM-DD": count },                   // tentativi intercettati
  unlocks: { "YYYY-MM-DD": count }                    // sblocchi completati
}
```

Altre chiavi di `chrome.storage.local`:
```js
_devPro: boolean   // toggle di sviluppo PRO (Info → "PRO — solo sviluppo"): da rimuovere prima della pubblicazione
```

Stato volatile (`chrome.storage.session`):
```js
grace: { [tabId]: timestampScadenza }   // periodi di grazia attivi per scheda
```

---

## 5. Architettura e flussi

### 5.1 Panoramica dei componenti

```
                 ┌──────────────────────────────────────────────┐
                 │              background.js (SW)               │
                 │                                                │
   navigazioni ──▶ onBeforeNavigate ──▶ verifica sito/categoria/ ──▶ tabs.update → block.html
                 │                         limite (budget aggregato)
                 │                                                │
   attivazione ─▶ tabs.onActivated / onUpdated / onRemoved        │
   finestre  ───▶ windows.onFocusChanged                          │
                 │        │                                       │
                 │        ▼                                       │
                 │   tracker {tabId, domain, since}               │
                 │        │  (alarm ogni 30 s; tracker persistito │
                 │        │   in storage.session)                 │
                 │        ▼                                       │
                 │   stats.byDay[data][dominio] += secondi        │
                 │                                                │
   messaggi ────▶ onMessage: getState | saveSettings | setFocus |  │
                 │            unlock | resetStats | proTest |      │
                 │            coldTurkey | proSchedule | proRefresh│
                 └──────────────────────────────────────────────┘
                        ▲                        ▲
       chrome.storage   │                        │   chrome.storage.session
       (settings,       │                        │   (grace)
        todo, favorites,│                        │
        stats)          │                        │
                        │                        │
   ┌───────────┬────────┴───────┬───────────┐    │
   ▼           ▼                ▼           ▼    │
 dashboard  options          popup       block ─┘
 (new tab)  (impostazioni)   (barra)   (blocco, legge grace? no:
                                          manda il messaggio unlock)
```

Tutte le pagine condividono `common.js`; applicano il tema con `applyTheme()` e reagiscono
ai cambi di storage tramite `chrome.storage.onChanged` (così, per esempio, modificando un sito
dalle impostazioni la dashboard si aggiorna da sola).

### 5.2 Flusso di intercettazione (siti singoli + categorie)

```
1. Utente naviga verso https://instagram.com (indirizzo digitato, link, redirect…)
2. webNavigation.onBeforeNavigate (solo frameId === 0, schemi http/https)
3. resolveHit(url) → un'unica regola applicabile:
   a. il SITO singolo configurato che contiene il dominio, se attivo o in cold
      turkey (ha SEMPRE precedenza su un'eventuale categoria);
   b. altrimenti la CATEGORIA attiva (o in cold turkey) che contiene il dominio.
   Nessuna regola → lascia passare.
4. Controlli in ordine di priorità:
   0. cold turkey (PRO) attivo sul target?      → block.html?r=ct (vince su tutto,
                                                   anche su Focus spento e grazia)
   1. focusEnabled? se no                       → lascia passare
   2. fascia oraria (PRO) configurata e NON
      attiva adesso?                            → lascia passare
   3. limite superato? (sito singolo, oppure
      budget aggregato della categoria)         → block.html?r=limit[&c=<id categoria>]
   4. scheda nel periodo di grazia?             → lascia passare
   5. modalità "block"?                         → block.html?r=block
   6. altrimenti                                → block.html?r=hold
5. tabs.update(tabId, { url: block.html?u=<url originale>&r=<motivo>[&c=<id>] })
   e contatore "blocked" += 1
```

Le URL `chrome-extension://`, `chrome://`, `about:` ecc. vengono ignorate (controllo di schema),
quindi la pagina di blocco stessa e la dashboard non vengono mai re-intercettate. Il parametro
`c=<id>` accompagna `r=limit` per i blocchi di categoria: la pagina di blocco lo usa per
mostrare il totale del budget aggregato già consumato.

### 5.3 Flusso "tieni premuto" (la feature portante)

```
block.html?u=...&r=hold
  ├─ legge impostazioni → delay = secondi del sito
  ├─ anello SVG: stroke-dashoffset animato via requestAnimationFrame (timestamp-based,
  │   non frame-based: robusto anche se i frame vengono saltati)
  └─ pointerdown sul pulsante → parte l'animazione (setPointerCapture: puoi anche
     rilasciare fuori dal pulsante senza perdere l'evento)
        │
        ├─ pointerup/cancel prima del tempo → reset (anello torna vuoto)
        │
        └─ p >= 1 (tempo trascorso >= delay)
             ├─ chrome.runtime.sendMessage({ type: "unlock", tabId })
             │    → background: grace[tabId] = now + graceMinutes; unlocks += 1
             └─ location.replace(url originale)
                  └─ onBeforeNavigate vede la scheda in grazia → lascia passare
```

Il periodo di grazia impedisce il loop di re-intercettazione e permette di navigare
normalmente tra le pagine del sito per i minuti configurati.

### 5.4 Tracciamento del tempo (statistiche)

- Il background mantiene un solo `tracker` attivo: la scheda **attiva nella finestra a fuoco**
  la cui URL è http/https. Viene conteggiato **qualsiasi sito web**, non solo quelli configurati.
- Il dominio registrato è quello del sito configurato se la navigazione lo riguarda
  (`siteFor` → dominio canonico, sottodomini inclusi), altrimenti il dominio della pagina.
  Le pagine dell'estensione (dashboard, blocco, impostazioni, popup), `chrome://`, `about:`
  e `file://` **non vengono mai conteggiate**.
- Eventi: `tabs.onActivated`, `tabs.onUpdated` (cambio URL, inclusa la navigazione
  "pagina di blocco → sito" dopo lo sblocco), `tabs.onRemoved`,
  `windows.onFocusChanged` (finestra non a fuoco → si ferma il conteggio): ogni handler esegue
  prima `reconcileTracker()` per recuperare il tracker persistito.
- Un **alarm ogni 30 s** (Chrome 120+ lo alza a 1 minuto per le estensioni pacchettizzate)
  salva il tempo accumulato in `stats.byDay[oggi][dominio]` e **riavvia il contatore sulla
  stessa scheda**. Il tracker è **persistito in `storage.session`**: se il service worker viene
  ucciso, al risveglio il tempo "morto" viene comunque conteggiato (nessuna perdita al
  kill/restart).
- La suddivisione **distraenti vs altri siti** è calcolata al rendering confrontando i domini
  delle statistiche con la lista dei siti configurati (le categorie sono "a vista", nessun
  dato aggiuntivo in archivio).
- Pulizia automatica: la cronologia mantiene ~70 giorni.

### 5.5 Flusso delle impostazioni

```
options.js
  ├─ ogni modifica (siti, categorie, tempi, temi, aspetto…) muta l'oggetto settings locale
  └─ chrome.runtime.sendMessage({ type: "saveSettings", settings })
       → background: sanitizeSettings() (normalizza domini, clamp 1–30s, filtra invalidi)
       → storage.local.set("settings")
       → chrome.storage.onChanged aggiorna la cache del background e le altre pagine
```

Il background è l'unico scrittore di `settings` (tramite messaggi): la cache in memoria e
lo storage non vanno mai in disaccordo. `todo` e `favorites` invece sono scritti direttamente
dalle pagine (il background non ne ha bisogno).

### 5.6 Limite giornaliero

Il limite è **approssimato a livello di navigazione**: a ogni `onBeforeNavigate` si confronta
il tempo accumulato con `limitMinutes * 60`. Per i **singoli siti** il confronto usa
`stats.byDay[oggi][dominio]`; per le **categorie** usa `categoryUsedSeconds()` — un **budget
aggregato** che somma i secondi spesi su tutti i domini della categoria (vedi 2.7). Superato
il limite, la navigazione viene bloccata con `r=limit` anche se la scheda è in periodo di
grazia (il limite ha priorità su tutto). Il tempo continua comunque a essere tracciato.

- **Blocco automatico a pagina aperta**: a ogni tick dell'alarm `enforceLimits()` controlla i
  siti singoli e le categorie attive con limite/budget superato; se il tempo accumulato supera
  il limite, le schede ancora aperte sul sito vengono reindirizzate subito alla pagina di
  blocco (`r=limit`, con `c=<id>` per le categorie), senza aspettare una nuova navigazione
  (al massimo un tick di ritardo).

### 5.7 Temi

- 6 temi fissi in `common.js` (`THEMES`, costante `FIXED_THEMES`) + **temi custom** salvati in
  `settings.customThemes` (ognuno con `id`, `name` e tre colori RGB: `bg`, `fg`, `accent`).
- Il tema applicato è quello selezionato da `settings.theme` (nome fisso oppure `id` custom):
  `themeColors()` risolve il tema custom via `findCustomTheme()` e deriva `card`, `muted` e
  `border` per interpolazione tra sfondo e testo; `applyTheme()` imposta le CSS custom properties
  (`--bg`, `--fg`, `--accent`, `--card`, `--muted`, `--border`), il font e la dimensione base:
  ogni pagina si ricolora all'istante.
- **Sfondo PRO a più strati**: con i temi PRO `applyTheme()` scrive in `--bg-grad` un gradiente
  composto (due bagliori radiali — uno tinto dell'accento, uno del secondo colore — sopra il
  gradiente diagonale) invece del semplice sfumato a due colori, e aggiunge la classe `theme-grad`
  su `<html>`: la dashboard la usa per l'**effetto vetro** (card semi-trasparenti con
  `backdrop-filter`, così lo sfondo PRO traspare dalle card).
- **Migrazione**: il vecchio tema "Custom" a due colori (`customBg`/`customText`) viene convertito
  al primo avvio (in `background.js` e `getSettings()`, in modo idempotente) in un tema custom
  nominato "Custom" con `accent = testo`.
- In impostazioni ogni card tema ha la classe `selected` quando corrisponde a `settings.theme`;
  `updateThemeSelection()` aggiorna l'evidenziazione a ogni salvataggio e apre l'editor quando è
  attivo un tema custom (selezionando un tema fisso l'editor si chiude). I colori si modificano con
  il selettore colore nativo o digitando l'hex; "+ Nuovo tema" crea un tema partendo dai colori del
  tema corrente, il pulsante ✕ sulle card elimina il tema custom.

### 5.8 Localizzazione

- Tutte le pagine caricano `common.js` + `i18n.js`; `i18n.js` definisce `LANGUAGES`, i dizionari
  `I18N` (it, en, es, fr, de, pt), `t(key, vars)` e `applyI18n()`.
- **Stringhe statiche** nell'HTML: attributi `data-i18n` (testo), `data-i18n-html` (markup),
  `data-i18n-ph` (placeholder), `data-i18n-title`, `data-i18n-aria`; `applyI18n()` le traduce
  dopo aver chiamato `setUILang(settings.lang)`.
- **Stringhe dinamiche** nel JS (messaggi, conferme, statistiche, pagina di blocco): passano
  da `t("chiave", { variabili })`. Anche le frasi della pagina di blocco, le citazioni,
  le etichette delle priorità e la formattazione delle date (`localeTag()`) sono localizzate.
- **Scelta della lingua**: `settings.lang` vale `"auto"` (default) o un codice di `LANGUAGES`;
  con `"auto"` si usa `navigator.language` se supportata, altrimenti italiano. Il selettore
  è nella sezione Aspetto delle impostazioni; il cambio si propaga alle altre pagine aperte
  tramite `chrome.storage.onChanged` (che ri-esegue `setUILang` + `applyI18n` + i render).
- `background.js` importa `i18n.js` solo per sanitizzare `settings.lang` (`sanitizeSettings`);
  il manifest usa `default_locale: "it"` e `__MSG_*__` per nome/descrizione in `_locales/`.

### 5.9 Stato PRO e pagamenti (ExtensionPay)

- **La UI legge solo la firma locale**: `isPro(settings)` controlla che
  `settings._aT === "x8f9q"`. La firma fa sparire i lucchetti e mostra gli strumenti PRO,
  ma **non concede nulla**: chi la falsifica nello storage non ottiene poteri.
- **Le azioni critiche passano da `verifyProLive()`** nel background (`coldTurkey` e
  `proSchedule` la invocano prima di scrivere):
  1. il toggle di sviluppo `_devPro` (Info, da rimuovere prima della pubblicazione) approva;
  2. altrimenti `ExtPay(EXT_PAY_ID).getUser()` interroga extensionpay.com: se `user.paid` è
     true l'azione parte e la firma viene riallineata a `_aT = "x8f9q"`;
  3. ogni "no" definitivo (non pagato, oppure ExtensionPay non configurato) **rimuove la
     firma** (revoca della UI) e rifiuta l'operazione con `reason: "pro"`;
  4. un errore di rete è **fail-closed**: l'operazione è rifiutata ma l'ultimo stato noto
     della UI non viene toccato (un utente pagato non viene "sloggato" per un calo di rete).
- **Allineamento automatico**: `refreshProStatus()` interroga ExtensionPay all'avvio del
  service worker, all'installazione e all'avvio del browser, riallineando la firma UI allo
  stato reale; la pagina impostazioni può richiederlo esplicitamente col messaggio
  `proRefresh` (es. dopo il pagamento).
- **Flusso di acquisto**: "Sblocca PRO (Lifetime)" → `extpay.openPaymentPage()`;
  "Ho già pagato? Accedi" → `extpay.openLoginPage()`. Mentre la scheda di pagamento è
  aperta la pagina impostazioni fa un polling breve di `getUser()`; appena risulta pagato
  invia `proRefresh`, aggiorna la UI (lucchetti rimossi) e mostra il ringraziamento.
- **Messaggi**: `proTest` (toggle di sviluppo), `proRefresh` (riallineamento richiesto),
  `coldTurkey` e `proSchedule` (azioni critiche, sempre dietro `verifyProLive`).

---

## 6. Scelte tecniche e limiti noti

- **Intercettazione via `webNavigation` invece di `declarativeNetRequest`**: nessuna
  `host_permissions`, nessuna gestione di regole dinamiche; il prezzo è che la navigazione
  viene reindirizzata con `tabs.update` (un lampo di pagina in casi rari). Limite noto del
  `webNavigation`: con il service worker addormentato (tipico della prima navigazione di una
  sessione incognito) l'evento `onBeforeNavigate` può non essere consegnato e la navigazione
  sfuggire. Per questo c'è **`sweepBlocked()`**: a ogni avvio del worker e a ogni tick
  dell'alarm (30 s) le schede web aperte che dovrebbero essere bloccate vengono reindirizzate
  alla pagina di blocco (rispettando il periodo di grazia), recuperando così le navigazioni
  sfuggite e coprendo anche le navigazioni SPA senza reload.
- **Pagina di blocco in incognito**: con "spanning" Chrome rifiuta la navigazione verso
  `block.html` nel frame principale di una scheda incognito (ERR_BLOCKED_BY_CLIENT);
  `"incognito": "split"` nel manifest risolve (vedi 2.9).
- **SPA e navigazioni interne**: la navigazione interna ai siti (es. scrolling infinito o
  cambio pagina senza reload) non genera nuovi `onBeforeNavigate`; il periodo di grazia copre
  le navigazioni successive, dopodiché si torna al blocco — fedele alla filosofia "ogni accesso
  richiede intenzione".
- **Precisione del tempo**: ~1 minuto (tick dell'alarm); il limite giornaliero è quindi
  "a meno di un minuto".
- **Chrome 137+**: il Chrome "branded" ha rimosso `--load-extension`; i test usano
  **Chrome for Testing** (vedi sezione 7).
- **`hidden` CSS**: regola globale `[hidden] { display: none !important; }` in `common.css`
  e `block.css` per evitare che `display: flex` dei componenti annulli l'attributo `hidden`
  (bug reale trovato dal test e2e).
- **ExtensionPay (pagamenti PRO)**: nessun server proprio; la libreria `ExtPay.js`
  (vendored dal pacchetto npm `extpay` v3.1.2, **licenza AGPL-3.0**) comunica solo con
  `extensionpay.com`. Chrome Web Store non offre acquisti in-app nativi, quindi l'acquisto
  Lifetime avviene sulla pagina di pagamento ExtensionPay/Stripe. `EXT_PAY_ID` vuoto
  (= non ancora registrati su extensionpay.com) disabilita ExtensionPay: in sviluppo le
  funzioni PRO si testano col toggle in Info.
- **Verifica PRO fail-closed**: un errore di rete non approva mai un'azione critica e non
  tocca lo stato UI; un "non pagato" (o ExtensionPay assente) rimuove anche la firma
  locale falsificata. Falsificare `chrome.storage.local` non sblocca nulla.
- **Privacy**: la sola comunicazione esterna è la verifica dello stato di pagamento (nessun
  contenuto personale). Scelta consapevole: NON si usa il content script su
  `extensionpay.com` (che abiliterebbe i callback push `onPaid` ma aggiungerebbe un
  permesso all'installazione); il post-pagamento è gestito con polling breve + `proRefresh`.

---

## 7. Test end-to-end

```
node e2e-test.js
```

- Scarica automaticamente **Chrome for Testing** al primo avvio (~200 MB, poi in cache in
  `~/.cache/minimalista-cft`) perché supporta `--load-extension` (rimosso da Chrome 137+ branded).
- Lancia Chrome in una **piccola finestra visibile**: gli eventi mouse via CDP richiedono
  hit-testing reale (con la finestra fuori schermo i click non arrivano).
- Verifica (72 controlli):
  1. caricamento dell'estensione e id registrato;
  2. pagina impostazioni con API estensione, righe dei siti e 7 temi;
  3. salvataggio impostazioni via messaggio (con sanitizzazione);
  4. **intercettazione** di un sito di prova (example.com) → pagina di blocco;
  5. **"tieni premuto"** con eventi mouse reali (premi 2 s, rilascia) → il sito si apre;
  6. **limite giornaliero**: superato alla navigazione → blocco con motivo `limit`, messaggio
     dedicato, nessun pulsante di sblocco; **superato a pagina aperta** → blocco automatico
     senza ricaricare (entro un tick dell'alarm);
  7. dashboard (orologio, toggle Focus, statistiche, **padding reale delle textbox** della
     ricerca e del ToDo, **todo scaduto** renderizzato senza crash, **dialog di modifica**
     centrato nello schermo) e popup; il widget di
     ricerca si può nascondere/mostrare dalle impostazioni;
  8. **selezione tema**: il click su una card sposta l'evidenziazione e persiste nello storage;
     **cambio lingua**: impostata `en`, le pagine aperte si traducono (nav e dashboard);
  9. **temi custom**: creazione dall'editor con nome e tre colori, card nella griglia con
     tema selezionato ed editor aperto, eliminazione (il tema torna a Midnight);
 10. **tipografia**: il cambio di stile font (monospace) si applica subito nelle impostazioni
     e anche nelle pagine già aperte (dashboard);
 11. **personalizzazione avanzata**: card "Avanzate" (URL sfondo + slider 0–24 + reset),
     anteprima live del raggio (variabile CSS e card derivate), persistenza, propagazione
     alla dashboard già aperta, sicurezza dell'URL (niente CSS injection) e sanitizzazione;
 12. **categorie**: 6 categorie renderizzate e sanitizzate, attivazione dall'interfaccia,
     intercettazione di un dominio membro, **budget aggregato superato** → blocco
     `r=limit&c=video`;
 13. **PRO**: strumenti bloccati senza abbonamento, UI di sblocco (bottone acquisto + login),
     firma falsificata rifiutata e revocata, avviso in build senza `EXT_PAY_ID`, `proRefresh`
     senza ExtensionPay, toggle di sviluppo, cold turkey dall'interfaccia (riga disabilitata
     + chip 🔒, override del periodo di grazia con `r=ct`), fasce orarie dentro/fuori finestra.
     (Il banner incognito non è coperto: non è simulabile in Chrome for Testing.)
- Richiede Node ≥ 22 (fetch + WebSocket globali).
- Se `CHROME_BIN` è impostato, usa quel binario invece di Chrome for Testing.
- **Incognito** (verifica manuale): `node tools/incognito-repro.js` testa i due stati su Chrome
  for Testing — accesso incognito spento (default) → estensione inerte in incognito, blocco OK
  in normale; toggle "Consenti in incognito" da chrome://extensions (persiste in Secure
  Preferences, si applica al riavvio dell'estensione); recupero delle navigazioni sfuggite
  tramite `sweepBlocked()`.

---

## 8. Note operative

- **Rigenerare le icone**: `node tools/resize-icons.js` (legge `m.png`, scrive `icons/`).
- **Dati**: tutto in `chrome.storage.local`; disinstallando l'estensione i dati vengono rimossi.

---

## 9. Possibili evoluzioni

- Pausa temporanea del Focus (es. "sblocca per 30 minuti") dal popup.
- Altre lingue (il sistema di dizionari in `i18n.js` rende l'aggiunta immediata).
- Sincronizzazione impostazioni tra dispositivi (richiederebbe `chrome.storage.sync` e una
  scelta consapevole sulla privacy).
- Prova gratuita / trial dei piani PRO tramite ExtensionPay (`extpay.openTrialPage()`,
  `user.trialStartedAt`); il gating live è già predisposto in `verifyProLive`.
- Esportazione delle statistiche (CSV/JSON) per analisi più profonde.
