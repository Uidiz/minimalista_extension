# Minimalista — Estensione Chrome: documentazione e architettura

> Estensione Chrome ispirata all'app Android **Minimalista** (launcher anti-distrazione).
> Concetto portante: quando tenti di aprire un sito distraente, l'estensione ti ferma e
> ti chiede un gesto **intenzionale** (tenere premuto) prima di lasciarti passare; in più
> puoi imporre un **limite giornaliero** di utilizzo per sito.
> Tutti i dati restano **solo sul dispositivo** (`chrome.storage.local`): nessun dato viene
> inviato a nessun server.

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
- **Preferiti**: solo testo, in stile launcher minimalista, con modalità "modifica" per
  aggiungere/rimuovere.
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

### 2.5 Sicurezza
- **PIN facoltativo** che protegge la pagina delle impostazioni (SHA-256 locale): senza PIN non si
  possono rimuovere siti, cambiare tempi o disattivare i blocchi. La dashboard e il popup restano liberi.
- Recupero PIN dimenticato: console del Service Worker → `chrome.storage.local.clear()` (vedi sezione 8).

### 2.6 Popup (icona nella barra)
- Interruttore Focus + riepilogo del giorno + link a dashboard e impostazioni.

---

## 3. Struttura dei file

| File | Ruolo |
|---|---|
| `manifest.json` | Manifest MV3 |
| `background.js` | Service worker: intercettazione, limiti, tracciamento, messaggi |
| `common.js` | Modulo condiviso: impostazioni, temi, utilità domini/dati |
| `block.html` / `block.css` / `block.js` | Pagina di blocco con "tieni premuto" |
| `dashboard.html` / `dashboard.css` / `dashboard.js` | Nuova scheda (home minimalista) |
| `options.html` / `options.css` / `options.js` | Pagina impostazioni |
| `popup.html` / `popup.css` / `popup.js` | Popup dell'estensione |
| `common.css` | Stili base condivisi (variabili di tema, card, switch, input) |
| `i18n.js` | Modulo di localizzazione: registro lingue, dizionari (it/en/es/fr/de/pt), `t()`, `applyI18n()` |
| `_locales/<lang>/messages.json` | Nome e descrizione localizzati del manifest (`default_locale: it`) |
| `icons/` | Icone 16/32/48/128 derivate da `m.png` |
| `m.png` | Icona originale dell'app (512×512) |
| `tools/resize-icons.js` | Script Node puro per rigenerare le icone da `m.png` |
| `tools/setup-cft.cjs` | Scarica Chrome for Testing per i test (cache in `~/.cache/minimalista-cft`) |
| `e2e-test.js` | Test end-to-end (17 verifiche) |

### Manifest (`manifest.json`)
- **MV3**, service worker in background, nessuna pagina `background.html`.
- **Permissions**: `storage`, `tabs`, `webNavigation`, `alarms`.
  - Nessun `host_permissions`: l'intercettazione avviene tramite l'API `webNavigation`
    (evento `onBeforeNavigate`), che non richiede accesso agli host.
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
  // (``customBg``/``customText`` del vecchio tema "Custom" vengono migrati automaticamente
  //   al primo avvio in un customTheme nominato "Custom")
  fontScale: number,              // 0.6 – 1.2
  fontFamily: "sans" | "serif" | "mono" | "cursive",
  showSeconds: boolean,
  lang: "auto" | "it" | "en" | "es" | "fr" | "de" | "pt",  // lingua UI; "auto" = lingua del browser
  pinHash: string | null          // SHA-256 del PIN (null = nessun PIN)
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
   navigazioni ──▶ onBeforeNavigate ──▶ verifica sito/limite ──▶ tabs.update → block.html
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
   messaggi ────▶ onMessage: getState | saveSettings | setFocus   │
                 │            | unlock | resetStats               │
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

### 5.2 Flusso di intercettazione

```
1. Utente naviga verso https://instagram.com (indirizzo digitato, link, redirect…)
2. webNavigation.onBeforeNavigate (solo frameId === 0, schemi http/https)
3. focusEnabled?  se no → lascia passare
4. siteFor(url) → corrisponde a un sito configurato e attivo?  se no → lascia passare
5. Controlli in ordine:
   a. limite giornaliero superato?            → block.html?r=limit
   b. scheda nel periodo di grazia?           → lascia passare
   c. modalità "block"?                        → block.html?r=block
   d. altrimenti                               → block.html?r=hold
6. tabs.update(tabId, { url: block.html?u=<url originale>&r=<motivo> })
   e contatore "blocked" += 1
```

Le URL `chrome-extension://`, `chrome://`, `about:` ecc. vengono ignorate (controllo di schema),
quindi la pagina di blocco stessa e la dashboard non vengono mai re-intercettate.

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
  ├─ PIN impostato? → schermata di blocco → sha256(pin) === settings.pinHash → sblocco
  ├─ ogni modifica (siti, tempi, temi, PIN…) muta l'oggetto settings locale
  └─ chrome.runtime.sendMessage({ type: "saveSettings", settings })
       → background: sanitizeSettings() (normalizza domini, clamp 1–30s, filtra invalidi)
       → storage.local.set("settings")
       → chrome.storage.onChanged aggiorna la cache del background e le altre pagine
```

Il background è l'unico scrittore di `settings` (tramite messaggi): la cache in memoria e
lo storage non vanno mai in disaccordo. `todo` e `favorites` invece sono scritti direttamente
dalle pagine (il background non ne ha bisogno).

### 5.6 Limite giornaliero

Il limite è **approssimato a livello di navigazione**: si confronta il tempo accumulato
(`stats.byDay[oggi][dominio]`) con `limitMinutes * 60` a ogni `onBeforeNavigate`. Superato
il limite, la navigazione viene bloccata con `r=limit` anche se la scheda è in periodo di
grazia (il limite ha priorità su tutto). Il tempo continua comunque a essere tracciato.

- **Blocco automatico a pagina aperta**: a ogni tick dell'alarm `enforceLimits()` controlla i
  siti configurati con limite attivo; se il tempo accumulato supera il limite, le schede ancora
  aperte sul sito vengono reindirizzate subito alla pagina di blocco (`r=limit`), senza
  aspettare una nuova navigazione (al massimo un tick di ritardo).

### 5.7 Temi

- 6 temi fissi in `common.js` (`THEMES`, costante `FIXED_THEMES`) + **temi custom** salvati in
  `settings.customThemes` (ognuno con `id`, `name` e tre colori RGB: `bg`, `fg`, `accent`).
- Il tema applicato è quello selezionato da `settings.theme` (nome fisso oppure `id` custom):
  `themeColors()` risolve il tema custom via `findCustomTheme()` e deriva `card`, `muted` e
  `border` per interpolazione tra sfondo e testo; `applyTheme()` imposta le CSS custom properties
  (`--bg`, `--fg`, `--accent`, `--card`, `--muted`, `--border`), il font e la dimensione base:
  ogni pagina si ricolora all'istante.
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

---

## 6. Scelte tecniche e limiti noti

- **Intercettazione via `webNavigation` invece di `declarativeNetRequest`**: nessuna
  `host_permissions`, nessuna gestione di regole dinamiche; il prezzo è che la navigazione
  viene reindirizzata con `tabs.update` (un lampo di pagina in casi rari).
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

---

## 7. Test end-to-end

```
node e2e-test.js
```

- Scarica automaticamente **Chrome for Testing** al primo avvio (~200 MB, poi in cache in
  `~/.cache/minimalista-cft`) perché supporta `--load-extension` (rimosso da Chrome 137+ branded).
- Lancia Chrome in una **piccola finestra visibile**: gli eventi mouse via CDP richiedono
  hit-testing reale (con la finestra fuori schermo i click non arrivano).
- Verifica (36 controlli):
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
     e anche nelle pagine già aperte (dashboard).
- Richiede Node ≥ 22 (fetch + WebSocket globali).
- Se `CHROME_BIN` è impostato, usa quel binario invece di Chrome for Testing.

---

## 8. Note operative

- **Recupero PIN dimenticato**: `chrome://extensions` → Minimalista → **Ispeziona**
  (sotto *Servizi in background*) → nella console: `chrome.storage.local.clear()`.
  Attenzione: azzera anche ToDo, preferiti e statistiche.
- **Rigenerare le icone**: `node tools/resize-icons.js` (legge `m.png`, scrive `icons/`).
- **Dati**: tutto in `chrome.storage.local`; disinstallando l'estensione i dati vengono rimossi.

---

## 9. Possibili evoluzioni

- Pausa temporanea del Focus (es. "sblocca per 30 minuti") dal popup.
- Altre lingue (il sistema di dizionari in `i18n.js` rende l'aggiunta immediata).
- Sincronizzazione impostazioni tra dispositivi (richiederebbe `chrome.storage.sync` e una
  scelta consapevole sulla privacy).
- Blocco orario (es. niente Instagram dalle 9:00 alle 18:00).
- Esportazione delle statistiche (CSV/JSON) per analisi più profonde.
