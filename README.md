# Minimalista — Estensione Chrome

Estensione Chrome ispirata all'app Android **Minimalista** (launcher anti-distrazione).
Il concetto portante è identico: quando provi ad aprire un sito che ti distrae, un
messaggio ti ferma e ti chiede un gesto **intenzionale** prima di lasciarti passare.

## Come si installa

1. Apri `chrome://extensions`
2. Attiva la **Modalità sviluppatore** (in alto a destra)
3. Clicca **Carica estensione non pacchettizzata** e seleziona questa cartella

La nuova scheda di Chrome diventa la dashboard di Minimalista.

## Cosa fa

### Modalità Focus (il cuore dell'app)
- Ogni sito della lista viene **intercettato** prima di aprirsi.
- Per i siti in modalità **"Tieni premuto"** appare una schermata minimalista con un
  anello di avanzamento: per entrare devi tenere premuto per i secondi configurati
  (1–30 s). Un gesto deliberato, come nell'app Android.
- Per i siti in modalità **"Blocca"** l'accesso è negato del tutto.
- Per ogni sito puoi impostare un **limite giornaliero** (es. 30 min/giorno su Instagram):
  superato il limite, il sito non si apre più per oggi.
- Dopo uno sblocco scatta un **periodo di grazia** (default 5 min) durante il quale puoi
  navigare liberamente nella stessa scheda senza nuovi blocchi.

### Dashboard (nuova scheda)
- Grande orologio digitale (opzionale con i secondi) e data.
- **ToDo** con priorità (alta/media/bassa) e scadenza (oggi/domani/data), ordinati
  automaticamente.
- **Preferiti**: solo testo, in stile launcher minimalista, con modalità modifica.
- Stato del Focus e riepilogo del giorno (tempo sui siti distraenti, tentativi bloccati,
  aperture deliberate).

### Statistiche
- Grafico a barre degli ultimi 7 giorni con confronto con la settimana precedente.
- Top siti del giorno con percentuali.
- Contatori di **tentativi bloccati** e **aperture deliberate** (le volte in cui hai
  tenuto premuto e sei entrato).

### Personalizzazione
- **Temi**: Midnight, E-Ink, Neon, Warm, Ocean, Sunset e **Custom** con slider RGB
  per sfondo e testo.
- Dimensione e stile del font globali.
- **Lingua dell'interfaccia**: automatica (lingua del browser) oppure Italiano, English,
  Español, Français, Deutsch o Português — selettore nella sezione Aspetto.
- Interruttore globale della Modalità Focus (anche dal popup dell'estensione).

### Sicurezza
- **PIN facoltativo** per proteggere le impostazioni: senza PIN non si possono rimuovere
  i siti, cambiare i tempi o disattivare i blocchi.
- Se dimentichi il PIN: `chrome://extensions` → Minimalista → **Ispeziona**
  (sotto *Servizi in background*) → nella console digita `chrome.storage.local.clear()`.

## Privacy

Tutto resta **sul tuo dispositivo** (`chrome.storage.local`). Nessun dato viene inviato
a nessun server. Le statistiche coprono solo i siti che hai configurato.

## Struttura dei file

| File | Ruolo |
|---|---|
| `manifest.json` | Manifest MV3 |
| `background.js` | Service worker: intercettazione, limiti, tracciamento tempo |
| `common.js` | Funzioni condivise (temi, storage, utilità) |
| `block.html/css/js` | Pagina di blocco con "tieni premuto" |
| `dashboard.html/css/js` | Nuova scheda (home minimalista) |
| `options.html/css/js` | Impostazioni |
| `popup.html/css/js` | Popup dell'estensione |
| `i18n.js` | Traduzioni dell'interfaccia (it/en/es/fr/de/pt) e helper |
| `_locales/` | Nome e descrizione localizzati del manifest |
| `icons/` | Icone generate da `m.png` |
| `tools/resize-icons.js` | Script per rigenerare le icone da `m.png` |
| `tools/setup-cft.cjs` | Scarica Chrome for Testing (cache in `~/.cache/minimalista-cft`) |
| `e2e-test.js` | Test end-to-end (vedi sotto) |

## Test

```
node e2e-test.js
```

Nota: Chrome 137+ ("branded") ha rimosso il flag `--load-extension`; per questo lo script
scarica automaticamente **Chrome for Testing** (Chromium non brandizzato) al primo avvio
(~200 MB, poi riusato) e lo lancia in una piccola finestra visibile. Verifica: caricamento
dell'estensione, intercettazione di un sito di prova, il flusso "tieni premuto" con eventi
mouse reali, il limite giornaliero e il rendering di dashboard e popup. Richiede Node ≥ 22.

Per l'architettura completa (flussi, modello dati, scelte tecniche) vedi **[ARCHITETTURA.md](ARCHITETTURA.md)**.

Sviluppatore: **Daniele Terracciano**
