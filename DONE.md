# Done — Riepilogo modifiche

Tutte le modifiche implementate e verificate in questa sessione sull'estensione **Minimalista** (nuova scheda anti-distrazione con temi PRO, blocco siti e funzioni PRO).

Verifica complessiva: **72/72 controlli e2e passati** + verifiche live via CDP (Chrome for Testing) per ogni funzionalità nuova.

---

## 1. Temi PRO più ricchi sulla home

- Lo sfondo di un tema PRO non è più un semplice gradiente a due colori: `--bg-grad` ora è composto da **due bagliori radiali** (uno tinto dell'accento, uno del secondo colore del gradiente) sopra il gradiente diagonale (`common.js` → `applyTheme`).
- Con un tema PRO attivo (`html.theme-grad`) le card della nuova scheda diventano **vetro satinato**: semitrasparenti con `backdrop-filter: blur(18px) saturate(1.35)`, così il gradiente traspare. Il pill dello stato Focus riceve lo stesso trattamento (`dashboard.css`).
- Le altre pagine (impostazioni, blocco…) mantengono l'aspetto normale.

## 2. Collegamenti rapidi in alto a destra (PRO)

- Riga di **link di testo in alto a destra** nella nuova scheda (come i link *Gmail / Immagini* della home di Google): ogni link si apre in una nuova scheda, la dashboard resta dov'è.
- **Impostazioni → Home → "Collegamenti rapidi"** (card con badge PRO):
  - catalogo suggerito (Gmail, Immagini, Maps, YouTube, Calendar, Drive, Notizie, Traduttore) — click su un chip per aggiungerlo, ✕ per rimuoverlo;
  - voci personalizzate con nome + URL (come l'editor dei Preferiti).
- **Default per i PRO: Gmail + Immagini**, esattamente come la home di Google.
- **Gated come PRO**: per i non-PRO la card mostra lucchetto + "Sblocca PRO", nulla viene renderizzato sulla dashboard e la sanitizzazione in `background.js` scarta `settings.shortcuts` senza la firma PRO.
- Persistenza, sanitizzazione (solo URL http/https, deduplicazione, nomi max 24 caratteri), ri-render live sulle pagine aperte, traduzioni in 6 lingue.

## 3. Aurora PRO animata (sfondo)

- Nuovo layer `.bg-aurora` nella dashboard, visibile solo con tema PRO: **tre blob radiali sfocati** (accento, secondo colore `--bg-grad-c2` e un bagliore caldo centrale) che **derivano lentamente** incrociandosi sul gradiente.
- Solo `transform`/`opacità` (compositor-friendly, niente repaint a schermo intero); `mix-blend-mode: screen` per un bagliore più ricco; rispetta `prefers-reduced-motion`.
- Resa **chiaramente visibile** (era troppo sottile): opacità fino a 0.95, deriva fino a ~26vmax, tempi 12s/17s/22s, scala fino a 1.4×. Misurato live: **~25.000 px cambiati in 3.5 s** (prima erano 13).
- **Prestazioni**: rimosso `filter: blur(46px)` dai blob (era il costo GPU principale su layer da ~70vmax); la morbidezza viene dai radial-gradient stessi. In più **3 modalità di sfondo** selezionabili:
  - **Aurora animata** (default) — leggera, solo transform;
  - **Bagliore statico** — zero costo per frame (`animation: none`);
  - **Solo gradiente** — nessun layer di bagliori.
  - Impostazione `settings.bgMotion` (sanitizzata), selettore in **Impostazioni → Home → "Sfondo dei temi PRO"**, applicazione live tramite `data-bg-motion` su `<html>`. La card è visibile **solo per gli utenti PRO**.

## 4. Card Preferiti: icone del sito + fix del pulsante ADD

- I Preferiti ora sono **tile-launcher**: icona del sito in alto e nome sotto.
- Le icone arrivano dalla **cache favicon di Chrome** via l'endpoint `_favicon` (nuovo permesso `"favicon"` nel manifest): **zero richieste di rete**. Se il sito non è mai stato visitato / icona rotta → fallback con l'iniziale del nome. Nessun servizio esterno viene contattato.
- **Fix overflow**: il form ADD in modalità modifica non esce più dalla card (input con `flex-wrap` + `min-width: 0`, bottone con `flex-shrink: 0`), verificato geometricamente dentro la card.

## 5. Nuova sezione Impostazioni "Home"

- Nuova voce **Home** nella sidebar delle impostazioni, che raccoglie tutto ciò che riguarda la nuova scheda:
  - **Sezioni della nuova scheda**: checkbox/interruttori per mostrare/nascondere barra di ricerca, card ToDo, card Preferiti, card Focus (default tutte visibili; nascondere non disattiva nulla — il Focus continua a bloccare). Nuovi flag `showTodo` / `showFavorites` / `showFocus` sanitizzati nel background.
  - Il selettore del motore di ricerca, il toggle dei secondi dell'orologio e la card dei collegamenti rapidi PRO sono stati spostati qui da Aspetto (stessi ID, nessuna logica rotta). Aspetto tiene Tema/Tipografia/Lingua/Avanzate.
- **Interruttori moderni**: le quattro sezioni non sono più checkbox semplici ma righe-card con **icona SVG monocroma professionale** (lente, check, stella, mirino — niente emoji) e interruttore `switch` con stato accent.

## 6. Hover sulle card PRO: feedback di selezione

- Al passaggio del mouse la **rotazione del bordo a gradiente conico accelera** (5s → **1.5s**) su `#proCard`, sulla card "Collegamenti rapidi" (`#shortcutsCard`) e sui temi PRO: feedback chiaro che la card sta per essere selezionata.
- **Fix**: sui temi PRO l'hover non copre più il gradiente animato con un bordo pieno (`border-color: transparent` sul hover), quindi la rotazione resta visibile anche sotto il mouse.
- La card "Collegamenti rapidi" ora ha anche lei il **bordo premium a gradiente animato** (come la card PRO), spento con `prefers-reduced-motion: reduce`.

## 7. Blocco ferreo (Cold Turkey): emoji 🔒

- L'icona del blocco ferreo passa da **catene ⛓ a lucchetto 🔒** ovunque: icone nelle impostazioni (feature PRO e tool), chip del countdown accanto a siti/categorie bloccati, lista dei blocchi attivi, aggiornamento live del countdown e **pagina di blocco** (`block.js`). Il codice non contiene più alcun `⛓`.

## 8. Altre migliorie

- Traduzioni aggiunte in **it, en, es, fr, de, pt** per tutte le nuove stringhe (sezioni Home, modalità sfondo, collegamenti rapidi, ecc.).
- `manifest.json`: nuovo permesso `"favicon"`.
- Documentazione aggiornata (`ARCHITETTURA.md`): data model (`bgMotion`, sezioni nascoste, collegamenti), permessi, aurora animata, hover PRO, card PRO-only.

## File modificati

| File | Cosa |
|---|---|
| `common.js` | temi PRO stratificati, catalogo/default collegamenti, `bgMotion`, `applyTheme` con `data-bg-motion` |
| `dashboard.html` | layer aurora (3 blob), riga collegamenti rapidi, id sezioni |
| `dashboard.css` | aurora animata + modalità, vetro, tile Preferiti, collegamenti rapidi, fix ADD |
| `dashboard.js` | sezioni nascondibili, Preferiti con favicon, render collegamenti |
| `options.html` | sezione Home, card sfondo PRO, card collegamenti, icone SVG, emoji 🔒 |
| `options.js` | render Home, modalità sfondo, collegamenti, gating PRO, emoji 🔒 |
| `options.css` | interruttori moderni, card PRO animate, hover 1.5s, stili collegamenti |
| `background.js` | sanitizzazione: collegamenti PRO-only, `showTodo/showFavorites/showFocus`, `bgMotion` |
| `manifest.json` | permesso `favicon` |
| `block.js` | emoji 🔒 per il blocco ferreo |
| `i18n.js` | nuove chiavi in 6 lingue |
| `e2e-test.js` | aggiornato il messaggio di un check (chip 🔒) |
| `ARCHITETTURA.md` | documentazione aggiornata |
| `Images/` | screenshot di verifica: `pro-home-shortcuts.png`, `pro-home-aurora.png`, `pro-home-v3.png`, `options-home-toggles.png` |

## Verifica

- `node e2e-test.js` → **72/72 passati** dopo ogni batch di modifiche (nessuna regressione).
- Verifiche live via CDP (script temporanei in `tools/`, rimossi dopo l'uso):
  - aurora presente e in movimento (rAF attivo, pixel che cambiano), disattivata da `prefers-reduced-motion`;
  - modalità sfondo: `static` spegne l'animazione, `plain` nasconde il layer, `aurora` la riattiva — live su dashboard già aperta;
  - hover sulle card PRO: `animation-duration` = `1.5s` e gradiente visibile sui temi PRO;
  - card "Sfondo dei temi PRO" nascosta per i non-PRO, visibile da PRO;
  - interruttori: 4 icone SVG, zero emoji;
  - collegamenti rapidi con `conic-gradient` animato e sbloccati da PRO;
  - tile Preferiti con URL `_favicon/`, form ADD dentro la card.
- Sintassi JS verificata con `node --check` su tutti i file modificati.

Nota: `git status/diff` non è disponibile in questo ambiente (repository su condivisione di rete segnalato come "dubious ownership"); non è stato toccato il config git e non è stato creato alcun commit.