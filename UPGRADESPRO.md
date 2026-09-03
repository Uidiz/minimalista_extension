# Minimalista Pro — idee per la versione a pagamento

> **Principio guida:** la versione gratuita resta completa e utilizzabile per sempre.
> Pro non "sblocca" funzioni di base (bloccare i siti, il tieni-premuto, i limiti
> giornalieri, i 7 temi, il PIN) ma aggiunge **potenziamenti** per chi vuole di più:
> statistiche profonde, sincronizzazione tra dispositivi, strumenti motivazionali
> e personalizzazione spinta.
>
> **Nota tecnica:** alcune funzioni richiedono un piccolo **backend esterno**
> (sincronizzazione cloud, report via email, intelligenza artificiale). Dove serve,
> è indicato con `☁ richiede server`. Tutto il resto resta 100% su dispositivo,
> in linea con la filosofia privacy dell'app.
>
> **Stato implementazione (v1.0.0):** le idee marcate **✅** sono già implementate
> nell'estensione (vedi `ARCHITETTURA.md`). Le funzioni PRO sono sbloccate con un
> acquisto **Lifetime** gestito da **ExtensionPay**; il resto del documento resta una
> raccolta di idee per il futuro.

---

## 1. Tema e personalizzazione Pro

- **Temi Pro esclusivi**: una collezione di temi aggiuntivi (Amoled, Gruvbox, Dracula,
  Tokyo Night, Forest, Nord…) aggiornata periodicamente, con anteprime animate.
- **Temi sfumati**: palette con gradienti (2–3 colori) per sfondo e accenti, con slider
  dedicati e calcolo automatico del testo a contrasto.
- **Personalizzazione dello sfondo**: ✅ l'immagine di sfondo dell'utente (URL) è già
  disponibile per tutti in Aspetto → Avanzate (con arrotondamento dei bordi regolabile).
  Restano idee Pro: overlay di opacità per la leggibilità e tema "wallpaper adattivo" che
  estrae i colori dall'immagine.
- **Font personalizzati**: caricare i propri font (TTF/OTF, salvati localmente) oltre
  ai 4 stili base; regolazione fine di spaziatura e altezza riga.
- **Layout dashboard Pro**: ordinamento libero delle sezioni (Orologio, ToDo, Preferiti,
  Focus), opzioni widget (7 giorni a colpo d'occhio, obiettivo del giorno, citazione
  personalizzata).
- **Preset di configurazione**: salvare/condividere interi setup (tema + font + elenco
  siti + limiti) come preset importabile/esportabile — anche tramite link firmato.

## 2. Statistiche e report avanzati

- **Cronologia illimitata**: la versione gratuita mantiene ~70 giorni; Pro conserva
  tutto il tempo (a costo di qualche MB di `chrome.storage` o del cloud).
- **Report settimanali e mensili**: riepilogo automatico (minuti per sito, trend,
  confronto, best/worst day) generato come pagina stampabile/PDF e, con il cloud,
  inviato via email ogni lunedì.
- **Esportazione dati**: export completo in **CSV** e **JSON** (per foglio di calcolo
  o per la propria analisi), con filtri per intervallo di date e sito.
- **Analisi per fasce orarie**: in quale momento della giornata cadi di più in
  tentazione (heatmap per ora/giorno) per programmare meglio i blocchi.
- **Metriche "forza di volontà"**: indice di resilienza (sblocchi evitati / tentativi
  totali), giorni "puliti", sequenze massime senza cedimenti.
- **Insight automatici**: messaggi semplici tipo *"Il venerdì sera è il tuo momento
  critico: vuoi un blocco orario?"* (generati localmente dalle regole).

## 3. Controllo del tempo avanzato

- **Blocco orario**: ✅ implementato come **fasce orarie settimanali** (funzione PRO):
  finestre con giorni + orario (es. niente Instagram lun–ven 9:00–18:00); fuori fascia
  nessun blocco. Idea aperta: ore consentite inverse ("solo dalle 20:00").
- **Categorie di siti**: ✅ implementate per tutti i piani (Social, Video, News, Adulti,
  Giochi, Shopping) con **budget aggregato** ("max 45 min/giorno su tutti i social messi
  insieme"): ogni categoria ha toggle, modalità, ritardo e limite di categoria.
- **Budget settimanale/mensile**: il limite giornaliero diventa anche settimanale o
  mensile (es. 3 ore/settimana su YouTube, da spalmare come si vuole).
- **Pausa programmata ricorrente**: sospensione automatica del Focus in fasce
  prestabilite ("ogni domenica niente blocchi") o pause di recupero dopo N sblocchi.
- **Pattern URL avanzati**: oltre al dominio, regole su percorso (es. bloccare
  `/shorts` ma non il resto di YouTube) e parole chiave nel titolo/URL.
- **Sottodomini separati**: `www.youtube.com` e `music.youtube.com` trattati come siti
  distinti, con limiti propri.
- **Blocco "cold turkey"** 🔥: ✅ implementato come funzione PRO — bloccare un sito o
  un'intera categoria per X ore/giorni **senza possibilità di override** (nemmeno dal PIN);
  la scelta è irreversibile fino alla scadenza.

## 4. Motivazione e sfide

- **Streak e badge**: contatore di giorni consecutivi senza sblocchi impulsivi,
  badge per traguardi (7, 30, 100 giorni), record personali.
- **Obiettivi settimanali**: definire un bersaglio ("max 5 ore di distrazione" o
  "zero tentativi su Instagram") con barra di avanzamento in dashboard.
- **Sfide (anche tra amici)**: challenge a punti su chi accumula più giorni puliti;
  classifiche opzionali e condivise solo se l'utente sceglie di partecipare.
- **Notifiche di incoraggiamento**: messaggi motivazionali contestuali (non spam):
  a fine settimana, dopo un cedimento, quando si raggiunge un record.
- **Celebrazioni a sblocco avvenuto**: varianti premium della pagina di blocco con
  anelli e palette personalizzati e cronologia dei propri "tempi migliori".

## 5. Sincronizzazione e backup

- **Sincronizzazione tra dispositivi** ☁: impostazioni, siti, limiti, ToDo e preferiti
  allineati tra computer (account utente, crittografati end-to-end prima di lasciare
  il dispositivo).
- **Backup automatici versionati** ☁: copie cloud a ogni modifica importante con
  ripristino in un clic (utile anche dopo un `chrome.storage.local.clear()` di
  emergenza…).
- **Export/import manuale**: incluso anche in Pro la possibilità di trasferire il
  proprio setup su un altro browser via file.
- **Reimpostazione da remoto**: da un altro tuo dispositivo, pausa o sblocco di
  emergenza (utile se stai per cedere ma hai il telefono lontano… e coraggio).

## 6. Profili e famiglia

- **Profili multipli**: "Lavoro" (blocchi severi, niente social) e "Personale"
  (limiti morbidi), con passaggio rapido da popup e dashboard.
- **Modalità famiglia** ☁ (condivisione opzionale): un account "genitore" configura
  i limiti dei dispositivi dei figli; il PIN dell'adulto è necessario per modifiche,
  e i report di utilizzo arrivano al genitore. Privacy: nessun contenuto, solo tempi.
- **Regole condivise**: elenchi di siti e preset creati dalla community o dall'account
  famiglia, importabili con un tocco.

## 7. Focus assistito

- **Modalità sessione (Pomodoro integrato)**: timer di deep work nella dashboard che
  interagisce col Focus — durante la sessione i blocchi diventano più severi e il
  pulsante "tieni premuto" richiede più tempo.
- **Musica e suoni ambientali**: loop di sottofondo (lo-fi, bianco, pioggia,
  silence) generati localmente o riprodotti in streaming ☁ — direttamente nella
  nuova scheda, senza altre app.
- **Coach IA** ☁: analisi dei propri pattern con suggerimenti personalizzati in
  linguaggio naturale ("vedo che cedi alle 23: cerca di impostare un blocco orario").
  Nessun dato personale sale senza consenso esplicito e può essere disattivato.
- **Transizione dolce**: dopo lo sblocco, il sito appare inizialmente in scala di
  grigi/leggermente offuscato per i primi secondi, come "atterraggio consapevole".

## 8. Contenuti e supporto

- **Nuovi temi ogni mese** in anteprima per gli abbonati.
- **Supporto prioritario**: risposte rapide e canale diretto (email/Slack) per
  segnalazioni e richieste di feature.
- **Beta privata**: accesso anticipato alle versioni in sviluppo.
- **Badge Pro**: nessun vantaggio funzionale, solo un piccolo segno di riconoscimento
  discreto nelle impostazioni (e la soddisfazione di sostenere lo sviluppo).

---

## 9. Impatto tecnico e requisiti (per lo sviluppatore)

| Funzione | Dove vive | Permessi/risorse aggiuntivi |
|---|---|---|
| Temi Pro, font, layout, preset | `chrome.storage.local` | nessuno |
| Cronologia illimitata, export CSV/JSON | `chrome.storage.local` + download | `downloads` |
| Blocco orario ✅, categorie ✅, budget, pattern URL | `background.js` | nessuno (già `webNavigation`) |
| Pomodoro, suoni locali, cold turkey ✅ | `background.js` + `alarms` | nessuno (già `alarms`) |
| Verifica/acquisto PRO (ExtensionPay) | `background.js` + `options` + `ExtPay.js` | `storage` (già presente) + rete verso extensionpay.com |
| Report via email, sync cloud, famiglia, IA | **backend esterno** | dominio/API esterno, crittografia |
| Notifiche | `chrome.notifications` | nuovo permesso |

Linee guida da tenere a mente:
- mantenere la versione gratuita **completa**: Pro deve aggiungere, non togliere;
- ogni funzione ☁ deve avere un **equivalente locale** o un'opzione "solo dispositivo";
- il cloud va progettato **end-to-end encrypted** per non tradire la filosofia privacy;
- Chrome Web Store non offre acquisti in-app nativi: ✅ i pagamenti PRO sono gestiti con
  **ExtensionPay** (licenza/verifica esterna su extensionpay.com, già integrata — vedi
  `ARCHITETTURA.md` §5.9).

## 10. Modelli di prezzo possibili

- **Canone mensile/trimestrale** con tutti i vantaggi e i temi mensili
  (es. €1,99/mese, €4,99/trimestre).
- **Canone annuale** con sconto (es. €12,99/anno — ~2 caffè).
- **Lifetime** come alternativa "compro una volta, tengo per sempre"
  (es. €29,99): per chi odia gli abbonamenti.
- **Family pack** (5 dispositivi/manutenti) a metà strada.
- In ogni caso: **periodo di prova gratuito** (es. 14 giorni) e downgrade immediato
  senza perdita dei dati gratuiti.

---

*Documento di visione — raccoglie idee per la versione Pro. Le idee marcate **✅** sono
ora implementate (categorie per tutti, cold turkey e fasce orarie come funzioni PRO con
acquisto Lifetime via ExtensionPay); le altre non sono ancora implementate né promesse.
Priorità suggerita per il futuro: sezione 3 (controllo del tempo) e 2 (statistiche), poi
1 e 4, infine quelle ☁.*