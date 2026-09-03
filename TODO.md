# TODO per Agente AI: Personalizzazione Avanzata

Questo documento descrive le istruzioni per implementare la "Personalizzazione Avanzata" (Immagine di Sfondo e Arrotondamento Bordi) all'interno dell'estensione Minimalista.

**Obiettivo:**
Aggiungere la possibilità di impostare un'immagine di sfondo tramite URL e di regolare dinamicamente l'arrotondamento dei bordi dell'interfaccia, includendo un pulsante per il reset ai valori di default.

## 1. Modifiche ai Modelli Dati e Storage (`common.js`)
- Aggiungi `bgImage: ""` e `borderRadius: 8` (oppure il valore che si intende usare di base) all'oggetto `DEFAULT_SETTINGS`.
- Nella funzione `sanitizeSettings`, aggiungi la logica per validare i nuovi campi:
  - `bgImage` deve essere una stringa (eventualmente fare `.trim()`).
  - `borderRadius` deve essere un numero compreso in un range (es. 0 - 24). Prevedi un fallback a `8` se il dato è mancante o invalido.
- Nella funzione `applyTheme`, inietta le nuove variabili CSS in `root.style`:
  - Se `bgImage` è presente, setta `--bg-img: url("...")` (attenzione ad escapare eventuali doppi apici nell'URL), altrimenti rimuovi la proprietà.
  - Setta `--border-radius: Xpx` usando il valore di `settings.borderRadius`.

## 2. Modifiche agli Stili Globali (`common.css` e `dashboard.css`)
- In `common.css`, aggiorna la regola per `body`:
  - Mantenendo `background-color` (oppure `background`), aggiungi `background-image: var(--bg-img, none)`.
  - Aggiungi regole complementari come `background-size: cover`, `background-position: center`, `background-attachment: fixed` per adattare lo sfondo.
- In `common.css` e `dashboard.css`, sostituisci i valori fissi di `border-radius` (es. `8px`, `10px`, `14px`) con `var(--border-radius, 8px)`.
  - *Nota*: Per mantenere le proporzioni (ad esempio, le card potrebbero dover essere leggermente più arrotondate degli input), puoi usare `calc()` come: `border-radius: calc(var(--border-radius, 8px) + 6px)` per le `.card` e `dialog`.

## 3. Modifiche all'Interfaccia Impostazioni (`options.html`)
- Trova la sezione "Aspetto" e crea una nuova card o aggiungi alla fine della sezione esistente un'area intitolata "Avanzate".
- Aggiungi un campo di input testuale (es. `<input type="text" id="bgImage">`) per l'URL dell'immagine di sfondo.
- Aggiungi uno slider (es. `<input type="range" id="borderRadius" min="0" max="24" step="1">`) per il controllo dell'arrotondamento.
- Aggiungi uno span per mostrare il valore corrente in pixel (es. `<span id="borderRadiusVal"></span>`).
- Aggiungi un pulsante `<button id="borderRadiusReset">Reset</button>` di fianco allo slider.

## 4. Binding JS nelle Impostazioni (`options.js`)
- All'interno della funzione di init o dove vengono agganciati gli eventi (`bindStatic` o simili), lega i nuovi elementi UI ai `settings`:
  - Al caricamento, setta i valori iniziali di `bgImage` e `borderRadius` leggendoli da `settings`.
  - Aggiungi un listener `change` (o `input`) sul campo `bgImage` che salvi in `settings.bgImage`.
  - Aggiungi un listener `input` sullo slider `borderRadius` per mostrare un'anteprima live:
    - Aggiorna il testo in `borderRadiusVal`.
    - Richiama `applyTheme` passando i nuovi settings (solo in memoria) per l'anteprima.
  - Aggiungi un listener `change` sullo slider per chiamare la funzione di salvataggio definitiva (`save()`).
  - Aggiungi un click listener al bottone `borderRadiusReset` che:
    - Imposti `settings.borderRadius = 8`.
    - Resetti il valore visivo dello slider e del testo.
    - Chiami il salvataggio (`save()`).

## 5. Localizzazione (`i18n.js`)
- Aggiungi le nuove chiavi per tutte le lingue supportate (it, en, es, fr, de, pt). Esempi:
  - Titolo sezione: "Avanzate" (Avanzate / Advanced / Avanzado...).
  - Input immagine: "Immagine di sfondo (URL)" (Immagine di sfondo / Background Image...).
  - Slider arrotondamento: "Arrotondamento bordi" (Arrotondamento / Corner Radius...).
  - Bottone reset: "Reset" (Reset / Réinitialiser...).
  - Placeholder: "https://...".

## Note Importanti per l'Agente
- Controlla la sanificazione dell'URL per lo sfondo in `applyTheme` per evitare *CSS injection*.
- Verifica che il layout generale delle card e degli input resista visivamente sia con arrotondamento `0px` sia con il valore massimo `24px`.
- Esegui le modifiche in modo incrementale per assicurarti di non introdurre bug nelle funzionalità correnti.

## 6. Minimalista Pro e Blocco per Categorie (Nuove Feature)

**Obiettivo:**
Introdurre macro-categorie precompilate (Social, Adulti, News, ecc.) disponibili per tutti gli utenti, e implementare le nuove funzionalità "Hardcore" esclusive per il piano PRO. Le funzioni devono integrarsi perfettamente tra loro.

### A. Categorie di siti (Per Tutti i piani)
- Modificare il modello dati per supportare la selezione rapida di "Categorie" precompilate in aggiunta ai singoli domini.
- Un utente Free potrà scegliere la categoria (es. Adulti) e decidere se applicare il "Tieni premuto" con timer o il Blocco Standard, con un limite di tempo giornaliero.

### B. Funzionalità PRO 
- **Cold Turkey Mode (Blocco Ferreo):** Applicabile a singoli domini o a intere categorie. L'utente imposta un blocco totale irreversibile per X ore o X giorni. Durante questo periodo, l'interfaccia delle opzioni impedirà in ogni modo di disattivare il blocco o ridurre il timer.
- **Automazione per Fasce Orarie (Scheduling):** Permettere la programmazione dell'attivazione dei blocchi su base settimanale (es. dal lunedì al venerdì dalle 09:00 alle 18:00).

### C. Gestione della Modalità in Incognito (Problema Siti per Adulti)
Le estensioni di Chrome non sono attive in incognito di default. Per aggirare il problema in modo trasparente:
- Nella sezione delle categorie (specialmente se viene selezionata la categoria "Adulti"), usare l'API `chrome.extension.isAllowedIncognitoAccess()`.
- Se restituisce `false`, mostrare un banner di avviso chiaro: *"Per rendere effettivo il blocco anche in incognito, devi abilitare il permesso nelle impostazioni di Chrome"*.
- Fornire istruzioni o un bottone che mandi l'utente direttamente a `chrome://extensions/?id=[ID_ESTENSIONE]` per attivare la spunta "Consenti in incognito".

## 7. Integrazione Pagamenti PRO (ExtensionPay)

**Obiettivo:**
Implementare il sistema di sblocco delle funzioni PRO utilizzando ExtensionPay, sfruttando la sua libreria nativa per Chrome MV3.

### A. Setup e Configurazione
- Includere la libreria `ExtPay.js` nel progetto.
- Aggiornare il `manifest.json` caricando lo script all'interno del Service Worker (`background.js`) e delle pagine UI (`options.html`, `dashboard.html`).
- Inizializzare l'istanza `ExtPay('nome-estensione-id')` nei file necessari.

### B. Gestione dello Stato Utente
- In `background.js`, implementare la verifica all'avvio o tramite listener: `extpay.getUser().then(user => ... )`.
- Se `user.paid` è `true`, aggiornare il `chrome.storage.local` impostando un flag `isPro: true`.
- Assicurarsi che le funzionalità bloccate (Cold Turkey, Categorie PRO, Automazioni) verifichino questo flag nel local storage prima di essere applicate.

### C. Interfaccia di Pagamento (UI)
- Nelle Impostazioni (`options.html`) inserire un bottone "Sblocca PRO (Lifetime)" vicino alle funzioni Premium disabilitate.
- Al click del bottone, lanciare `extpay.openPaymentPage()`.
- Gestire il callback di avvenuto pagamento per aggiornare l'interfaccia in tempo reale (rimuovere i lucchetti dalle feature PRO e mostrare un messaggio di ringraziamento).
