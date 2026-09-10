# DONE — Resoconto attività completate

> Riferimento architetturale aggiornato: `ARCHITETTURA.md`. Checklist di avanzamento: `TODO.md`.

## 1. Frasi motivazionali nella pagina di blocco

- ✅ Aggiunte **22 nuove frasi motivazionali per ognuna delle 6 lingue** (`it`, `en`,
  `es`, `fr`, `de`, `pt`) nell'array `quotes` di `i18n.js`: da 8 a **30 frasi per lingua**.
- Le frasi seguono lo stile minimalista del progetto (focus, disciplina, attenzione,
  tempo, forza di volontà, futuro) e sono visualizzate a caso dalla pagina di blocco
  tramite `randomQuote()` (`common.js`).
- Verifiche: `node --check` ok, 30 frasi per lingua, dizionari caricabili (test con `vm`).

## 2. Versione PRO con ExtensionPay reale

- ✅ **`EXT_PAY_ID = "minimalista"`** in `common.js` (estensione registrata su
  extensionpay.com, pagamenti via Stripe). Il codice `ExtPay('minimalista')` è già
  quello eseguito da `background.js` e `options.js` tramite la costante.
- ✅ **Toggle di sviluppo PRO rimosso** (`proDevToggle` / `_devPro`):
  - `background.js`: eliminato da `refreshProStatus()`, `verifyProLive()` e
    `sanitizeSettings()` — la verifica PRO ora è **solo live** contro extensionpay.com
    (fail-closed);
  - `options.js`: rimossa `renderProDev()` e la sua chiamata in `renderAll()`;
  - `options.html`: rimossa la card "PRO — solo sviluppo";
  - `i18n.js`: rimossi i testi `pro_dev_*` in tutte e 6 le lingue.
- ✅ **Test e2e adattati** (`e2e-test.js`):
  - le attivazioni PRO reali (tema gradiente, sfondo, categorie, cold turkey, fasce
    orarie) girano solo con un **account realmente pagante** (`proActive`, rilevato via
    `proRefresh`), altrimenti vengono saltate con un messaggio esplicativo;
  - il pulsante "Sblocca PRO": senza `EXT_PAY_ID` mostra l'avviso di build non
    configurata; con l'ID apre la pagina di pagamento ExtensionPay (verificato);
  - `proRefresh`: verifica `ok`, `paid` coerente col server e firma allineata allo stato;
  - firma falsificata (`_aT = "x8f9q"`): cold turkey rifiutato (`reason: "pro"`) e firma
    rimossa (verificato).
  - **Esito suite: 69/69 verifica superata** (con `EXT_PAY_ID` configurato; i test PRO
    attivi si sbloccano quando l'account di sviluppo risulta pagante).

## 3. Audit di sicurezza PRO

Risultato: **la sicurezza PRO regge per costruzione** — non perché la firma sia
infalsificabile (è client-side), ma perché non c'è nulla di prezioso da rubare.

- La firma UI `_aT === "x8f9q"` è **solo un segnale d'interfaccia** (`isPro()`):
  mostra/nasconde lucchetti e strumenti, non concede nulla.
- Le **azioni critiche** (`coldTurkey`, `proSchedule`, `proSaveCategories`) passano
  SEMPRE da `verifyProLive()` → `getUser()` su extensionpay.com: fail-closed (un errore
  di rete rifiuta) e su "non pagato" rimuove anche la firma falsificata.
- `setProSig(true)` è chiamato in un **unico punto** (dopo la conferma del server).
- I `settings` passano da un **unico scrittore** (il background); nessuna pagina li
  scrive direttamente.
- Chi falsifica la firma ottiene solo **cosmetici** (temi gradiente, aurora, sfondo,
  collegamenti rapidi) e **auto-restrizioni** (cold turkey su se stesso, fasce orarie,
  più domini bloccati): non esiste alcuna feature PRO che rimuova blocchi o dia un
  vantaggio reale (il blocco completo è gratis).
- I **pagamenti** passano da extensionpay.com → Stripe del developer, legati all'ID
  `minimalista`: un fork non può deviare i ricavi (se usa lo stesso ID i suoi utenti
  pagano il developer; se ne registra uno proprio è un prodotto diverso).

## 4. Strumenti di pubblicazione

- ✅ **`tools/package-zip.js`** — crea `dist/minimalista.zip` con **solo i file
  runtime** (allowlist esplicita: manifest, js/html/css, `icons/`, `_locales/`;
  esclusi `.git/`, `tools/`, `e2e-test.js`, `m.png`, `*.md`, `Images/`).
  - Nessuna dipendenza: zip in puro Node (`zlib` per deflate + CRC32).
  - **Auto-verifica**: dopo la creazione rilegge lo zip e controlla EOCD/central
    directory, CRC e dimensioni di ogni file (inflate + confronto).
  - **Check di sicurezza della versione**: confronta `manifest.json` version con
    l'ultima pubblicata (`dist/.last-version`) e si **blocca se non è aumentata**
    (il Chrome Web Store rifiuta upload con la stessa versione), suggerendo la
    versione successiva. Alla creazione riuscita registra la nuova versione.
  - `node tools/package-zip.js` (build + verifica) · `--list` (solo elenco,
    non blocca né scrive). `dist/` è nel `.gitignore`.
- ✅ **`STORE_LISTING.md`** — testi pronti da copiare-incollare per la scheda del
  Chrome Web Store: summary (≤132 char, verificati), descrizione completa IT/EN,
  single purpose, giustificazione permessi, testo privacy/data usage, guida agli
  screenshot e campi secondari, con il placeholder `[URL_DEL_REPOSITORIO]` per il
  link al sorgente (obbligo AGPL).

## 5. Licenza AGPL-3.0

- ✅ Creato il file **`LICENSE`** con il testo integrale ufficiale della
  **GNU Affero General Public License v3.0** (scarica verbatim da
  https://www.gnu.org/licenses/agpl-3.0.txt).
- Scelta: si mantiene **AGPL-3.0** sul progetto (gestire account/pagamenti in proprio
  sarebbe più complesso; la verifica server-side rende sostenibile l'open source).

## Nota preliminare: impatto della licenza AGPL-3.0 di ExtPay.js

`ExtPay.js` (vendored dal pacchetto npm `extpay` v3.1.2, **AGPL-3.0-or-later**, autore
Glench) è un componente **copyleft forte**: chi distribuisce un'opera che incorpora o
deriva da codice AGPL deve rilasciare l'**intera opera** sotto AGPL-3.0 e rendere
disponibile il **codice sorgente** agli utenti.

Punti di valutazione:

1. **Distribuzione**: pubblicare l'estensione sul Chrome Web Store è una
   "distribuzione" ai sensi della licenza, quindi gli obblighi AGPL si applicano alla
   copia distribuita.
2. **Derivato vs aggregazione**: `ExtPay.js` non è un file "passivo": l'estensione lo
   carica e ne chiama l'API, quindi è un'**opera derivata** dell'AGPL (il confine
   "aggregazione" sarebbe debole da sostenere).
3. **Obblighi pratici** (soddisfatti): progetto sotto AGPL-3.0, file `LICENSE` con il
   testo integrale, sorgente pubblico, **link al sorgente nella scheda dello store**
   (da inserire al momento della pubblicazione, vedi `TODO.md`).
4. **Alternative** se in futuro non si volesse più AGPL: sostituire `ExtPay.js` con una
   libreria/license-server a licenza permissiva (costo: reimplementare login
   multi-dispositivo, gestione utenti, trial).

**Nota**: la valutazione è preliminare e non costituisce consulenza legale; per la
pubblicazione conviene una verifica con un avvocato o la FSF (FAQ AGPL).