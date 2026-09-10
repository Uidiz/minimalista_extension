# TODO Minimalista — stato di avanzamento

> Documento di lavoro: ogni sezione riporta le istruzioni originali (in sintesi) e
> **cosa è stato effettivamente implementato** (✅), con le differenze rispetto allo
> spec. Il riferimento architetturale aggiornato è `ARCHITETTURA.md`; il resoconto
> delle attività completate è in `DONE.md`.

## Checklist per la pubblicazione

- [x] ~~Rimuovere il toggle di sviluppo PRO~~ → **fatto**: `proDevToggle` / `_devPro`
      rimossi da `background.js`, `options.js`, `options.html` e `i18n.js` (6 lingue).
- [x] ~~Registrare l'estensione su extensionpay.com e impostare il suo ID in `EXT_PAY_ID`~~
      → **fatto**: `EXT_PAY_ID = "minimalista"` in `common.js`.
- [x] ~~Valutare formalmente l'impatto della licenza **AGPL-3.0** di `ExtPay.js`~~ →
      **fatto**: nota preliminare in `DONE.md`.
- [x] ~~Creare il file `LICENSE` con il testo AGPL-3.0~~ → **fatto**: testo integrale
      ufficiale scaricato verbatim da https://www.gnu.org/licenses/agpl-3.0.txt.
- [ ] **Testare il flusso di pagamento PRO con le carte Stripe di test (carte false)**
      prima di pubblicare — procedura nella sezione sotto.
- [ ] **Inserire il link al codice sorgente nella scheda dello store** (obbligo AGPL,
      sezione "Sito web / sorgente" del listing).
- [ ] **Pubblicare l'estensione sul Chrome Web Store** — procedura completa sotto.

## Test del pagamento con carte Stripe di test (da fare PRIMA della pubblicazione)

Il test mode di ExtensionPay lascia simulare sia l'utente gratis sia quello pagante,
senza muovere soldi veri.

1. Su **extensionpay.com** (dashboard dell'estensione `minimalista`), attiva la modalità
   di test / imposta lo stato "pagato" per lo sviluppo (test mode). Verifica anche che il
   piano Lifetime sia collegato a Stripe.
2. Carica l'estensione in Chrome (chrome://extensions → Modalità sviluppatore → "Carica
   estensione non pacchettizzata") e apri Impostazioni → Membership.
3. Clicca **"Sblocca PRO (Lifetime)"**: deve aprirsi la pagina di pagamento
   ExtensionPay → Stripe Checkout.
4. Inserisci una **carta di test Stripe** (numeri "finti", mai una carta reale):
   - `4242 4242 4242 4242` — pagamento riuscito (qualsiasi data futura, CVC qualsiasi);
   - `4000 0000 0000 0002` — pagamento rifiutato (test del fallimento);
   - altre carte e scenari: https://docs.stripe.com/testing.
5. Dopo il pagamento con `4242...`, tornando alle impostazioni i **lucchetti devono
   sparire all'istante** (polling + `proRefresh`): verifica che si sblocchino cold
   turkey, fasce orarie, categorie personalizzate, temi PRO, sfondo e collegamenti rapidi.
6. Verifica il caso "rifiutato" (`4000...`): nessuno sblocco, messaggio di errore.
7. Rilancia i test e2e (`node e2e-test.js`): con l'account di sviluppo pagante i test
   di attivazione PRO (sezione 12 e 14) ora girano davvero.

## Pubblicazione sul Chrome Web Store — guida passo passo

### 0. Prerequisiti
- Account Google + registrazione come sviluppatore Chrome Web Store
  (https://chrome.google.com/webstore/devconsole) — **costo una tantum di 5 $**.
- Progetto pronto (questa repo), testato localmente (e2e verdi), pagamento PRO testato
  con carte Stripe di test (sezione sopra).

### 1. Preparare il pacchetto (.zip)
- **Script pronto**: `node tools/package-zip.js` crea `dist/minimalista.zip` con
  **solo i file runtime** (allowlist esplicita: manifest, js/html/css, `icons/`,
  `_locales/`; esclude `.git/`, `tools/`, `e2e-test.js`, `m.png`, `*.md`, `Images/`)
  e lo **verifica da solo** (central directory, CRC e dimensioni di ogni file).
  `node tools/package-zip.js --list` mostra l'elenco senza creare lo zip.
  Se aggiungi un file runtime al progetto, aggiungilo all'allowlist nello script.
- Il sorgente completo resta comunque pubblico nel repository (obbligo AGPL) e va
  linkato nella scheda (vedi `STORE_LISTING.md`).
- Verificare che il manifest sia valido (niente riferimenti a file esclusi).

### 2. Caricare il pacchetto
- Chrome Web Store Developer Dashboard → "Nuovo elemento" → carica il `.zip`.
- Chrome valida manifest, icone (128×128) e dimensioni.

### 3. Compilare la scheda dello store (listing)
- **Testi pronti da copiare-incollare** (summary, descrizione IT/EN, single purpose,
  giustificazione permessi, privacy, screenshot): file **`STORE_LISTING.md`**
  (sostituire `[URL_DEL_REPOSITORIO]` con il link al sorgente).

Campi da compilare (nome inglese dei campi tra parentesi):

- **Nome estensione (Name)**: `Minimalista` (max 75 caratteri).
- **Riepilogo (Summary)**: max 132 caratteri, es.:
  `Anti-distraction new tab: distracting sites open only if you hold, with a daily time limit.`
- **Descrizione (Detailed description)**: max 16.000 caratteri. Suggerimenti:
  - descrivere Focus (tieni premuto / blocca / limite giornaliero / periodo di grazia),
    dashboard (ricerca, ToDo, preferiti, statistiche), categorie, personalizzazione
    (temi, font, lingua) e funzioni PRO (cold turkey, fasce orarie, categorie custom,
    temi/aurora/sfondo, collegamenti rapidi);
  - indicare le 6 lingue supportate;
  - **includere il link al codice sorgente** (obbligo AGPL): es.
    `This extension is open source under AGPL-3.0: <URL del repository>`.
- **Categoria (Category)**: `Productivity`.
- **Lingua (Language)**: Italiano (+ le altre supportate se si vogliono localizzare
  anche scheda e recensioni).
- **Screenshot**: almeno 1 (max 5), formato 1280×800 o 640×400 (PNG/JPEG, max 2 MB
  ciascuno). Mostrare dashboard, pagina di blocco, impostazioni, sezione PRO.
- **Piccola immagine promozionale (Small promo tile)**: 440×280 (consigliata).
- **Icona**: 128×128 (già in `icons/icon128.png`).
- **URL sito web (Website)**: eventuale pagina del progetto.
- **URL del codice sorgente (Source code)**: link al repository pubblico (obbligo AGPL).

### 4. Sezione "Privacy"
- **Single purpose**: una frase chiara, es. *"Bloccare i siti distraenti e mostrare una
  dashboard minimalista nella nuova scheda, con limite di tempo giornaliero per sito."*
- **Permissions justification**: dichiarare perché servono i permessi:
  - `storage` → impostazioni, ToDo, preferiti e statistiche salvate solo sul dispositivo;
  - `tabs` / `webNavigation` → intercettare i siti della lista prima che si aprano e
    reindirizzare alla pagina di blocco;
  - `alarms` → tick periodici (limite giornaliero, blocco a pagina aperta, conteggio tempo);
  - `favicon` → icone dei preferiti dalla cache di Chrome (nessuna richiesta di rete).
- **Data usage**: nessun dato personale raccolto o inviato; l'unica comunicazione
  esterna è la **verifica dello stato di pagamento** verso extensionpay.com (nessun
  contenuto personale). Se richiesto: "No data collected" / "Does not transmit personal data".
- **Remote code**: nessun codice remoto eseguito (tutto è nel pacchetto).

### 5. Inviare per la revisione (Submit)
- Il primo review dura tipicamente da qualche ora a qualche giorno (a volte più).
- Gli **aggiornamenti successivi** sono più rapidi; il numero di versione nel manifest
  va incrementato a ogni upload.
- **Dopo la pubblicazione** il payment flow in produzione richiede che l'utente paghi
  davvero (in dev mode serve la password dell'account del developer).

## Link utili

- **Licenza AGPL-3.0** (testo e link da citare):
  - Testo ufficiale: https://www.gnu.org/licenses/agpl-3.0.txt
  - Pagina informativa: https://www.gnu.org/licenses/agpl-3.0.html
- **ExtensionPay**: https://extensionpay.com (dashboard estensione + test mode)
- **Chrome Web Store Developer Dashboard**: https://chrome.google.com/webstore/devconsole
- **Carte di test Stripe**: https://docs.stripe.com/testing
- **Checklist pubblicazione Chrome**: https://developer.chrome.com/docs/webstore/

## Evoluzioni possibili (non bloccanti)

- Pausa temporanea del Focus (es. "sblocca per 30 minuti") dal popup.
- Altre lingue (il sistema di dizionari in `i18n.js` rende l'aggiunta immediata).
- Sincronizzazione impostazioni tra dispositivi (richiederebbe `chrome.storage.sync`).
- Prova gratuita / trial dei piani PRO (`extpay.openTrialPage()`, `user.trialStartedAt`).
- Esportazione delle statistiche (CSV/JSON).