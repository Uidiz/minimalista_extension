# TODO Minimalista — stato di avanzamento

> Documento di lavoro: ogni sezione riporta le istruzioni originali (in sintesi) e
> **cosa è stato effettivamente implementato** (✅), con le differenze rispetto allo
> spec. Il riferimento architetturale aggiornato è `ARCHITETTURA.md`.


## Animazioni hover sulle card + card PRO con gradiente animato — ✅ implementato

**Richiesta utente:** hover moderno e curato sulle card di ogni pagina; card PRO con il
gradiente attorno che si muove in modo animato (tocco premium). In un secondo giro: hover
(ingrandimento) anche sulle card dei sottotemi dentro la card Temi, stesso gradiente
multicolore animato per i temi PRO nel selettore, e un interruttore per disattivare le
animazioni hover.

- **Hover sulle card (tutte le pagine)** — `common.css`: le card `.card` si sollevano
  (`translateY(-3px)`) con transizione morbida (0.28s, cubic-bezier), bordo tinto con
  l'accent e alone glow accent; stessa resa per la card delle statistiche del popup
  (`.stat`, `popup.css`).
- **Card PRO con gradiente animato attorno** — `options.css`: il bordo di `#proCard` è
  un gradiente **conico che ruota in continuazione** (5s lineare, `@property --pro-angle`
  + `@keyframes proCardSpin`) al posto del vecchio scorrimento lento a 9s; bordo portato
  a 2px perché il movimento si veda. Il gradiente viola→azzurro→oro è invariato.
- **Card dei temi** — `options.css`: ogni sottotema (Midnight, E-Ink, Neon, Warm, Ocean,
  Sunset, custom, "+ Nuovo tema") è trattato come card singola: al passaggio del mouse si
  **ingrandisce** (`scale(1.06)`) con bordo accent e ombra morbida.
- **Temi PRO nel selettore** — `options.css`: le card dei 4 temi PRO (`.theme-card.pro`)
  hanno lo stesso bordo conico animato della card PRO. Solo nel selettore della card Temi:
  l'anteprima gratuita e i gradienti applicati alle altre pagine non cambiano.
- **Interruttore "Anima le card al passaggio del mouse"** (Aspetto → Avanzate): nuova
  impostazione `settings.cardHover` (default **true**), con default in `common.js` e
  sanitizzazione in `background.js`; `applyTheme()` aggiunge/rimuove la classe
  `body.no-hover`, quindi le animazioni hover si spengono **all'istante** su impostazioni,
  dashboard e popup (la propagazione è quella standard via `storage.onChanged`, senza
  ricaricamenti). Con `no-hover` restano spenti anche i colori di hover e le transition.
  Chiave i18n `card_hover` aggiunta in tutte e sei le lingue.
- **Accessibilità**: `prefers-reduced-motion` ferma sollevamento/ingrandimento/rotazione
  (restano solo i cambi di colore), per ogni pagina nel suo CSS (common, popup, options).
- **e2e**: modifiche solo CSS/i18n + un campo nuovo di settings (i selettori verificati non
  cambiano): suite **72/72** invariata.

## Conferma del blocco ferreo (Cold Turkey) + riorganizzazione Aspetto — ✅ implementato

**Richiesta utente:** quando si clicca "Attiva blocco" (Cold Turkey PRO) deve uscire un popup di
conferma che spieghi per bene cosa si sta per fare, per sicurezza (il blocco è irreversibile). In
secondo luogo: riorganizzare le impostazioni — in Aspetto il motore di ricerca e l'opzione "Mostra
la barra di ricerca web" (Nuova scheda) dovevano stare nella stessa card, perché senza barra
visibile il motore di ricerca è inutile.

- **Popup di conferma Cold Turkey** — `options.html`/`options.css`: nuovo `<dialog id="ctConfirm">`
  con riepilogo dinamico ("Stai per attivare un blocco ferreo su {label} per {dur}", durata es.
  "2 giorni, 3 ore" con componenti a zero omessi via `ctDurationLabel()`) e un avviso in evidenza
  che spiega l'**irreversibilità**: niente aperture per tutta la durata, anche con Focus spento o
  col PIN, impossibile annullare o ridurre prima della scadenza. Pulsanti Annulla /
  "Sì, attiva il blocco" (rosso pieno); ESC o Annulla chiudono senza fare nulla.
- **Flusso** (`options.js`): `onCtStart()` ora valida e poi **apre il dialog** (niente più azione
  diretta); la conferma passa da `onCtConfirm()`, che spedisce il messaggio `coldTurkey` e applica
  l'esito come prima (`applyProResponse`). `ctPending` conserva il candidato e viene azzerato alla
  chiusura (bottone, click fuori/Esc). Binding dei pulsanti in `bindStatic()` (una volta sola).
- **Riorganizzazione Aspetto** — `options.html`: le due card "Motore di ricerca" e "Nuova scheda"
  sono fuse in **una sola card "Nuova scheda"**: checkbox "Mostra la barra di ricerca web" +
  sotto il motore di ricerca (con label visibile). La card "Orologio" resta tra Lingua e Nuova
  scheda.
- **Motore legato alla barra**: `applySearchEngineState()` (`options.js`) disabilita il select del
  motore e attenua la riga (`.search-engine-row.dimmed` in `options.css`) quando la barra di
  ricerca è nascosta — senza barra il motore non serve; si riattiva ri-mostrando la barra.
- **i18n**: chiavi `ct_confirm_title`, `ct_confirm_body` (con {label}/{dur}), `ct_confirm_warn`
  (con markup), `ct_confirm_ok` aggiunte in tutte e sei le lingue.
- **e2e**: il test "cold turkey attivato dall'interfaccia" ora passa dalla conferma (attende il
  dialog aperto, clicca su "Sì, attiva il blocco" e attende il `ctUntil` nello storage): suite
  **72/72** invariata.

## Checklist per la pubblicazione

- [ ] Registrare l'estensione su extensionpay.com e impostare il suo ID in `EXT_PAY_ID`
      (`common.js`) — oggi vuoto: in produzione senza ID le funzioni PRO restano bloccate.
- [ ] Rimuovere il toggle di sviluppo: UI in Info (`proTestToggle`), chiave `_devPro`, messaggio
      `proTest` e il ramo di sviluppo in `verifyProLive()`.
- [ ] Valutare l'impatto della licenza **AGPL-3.0** di `ExtPay.js` sul progetto.
- [ ] Verifica manuale su Chrome reale del banner incognito (categoria Adulti).
- [ ] (Facoltativo) dashboard/popup non caricano ExtPay: nessuna superficie PRO, per ora.