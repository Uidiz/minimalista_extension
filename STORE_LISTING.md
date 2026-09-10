# Scheda Chrome Web Store — testi pronti da copiare

> Compila il listing su https://chrome.google.com/webstore/devconsole usando i testi
> sotto. Sostituisci `[URL_DEL_REPOSITORIO]` con il link pubblico del codice sorgente
> (obbligo AGPL-3.0: il sorgente va reso disponibile agli utenti).
> Lo zip di pubblicazione si genera con: `node tools/package-zip.js`.

## Campi base

| Campo | Valore |
|---|---|
| **Name** | `Minimalista` |
| **Category** | `Productivity` |
| **Language** | Italiano (+ English, Español, Français, Deutsch, Português) |

---

## Summary (max 132 caratteri)

**EN** (consigliato, il form è in inglese):
```
Anti-distraction new tab: distracting sites open only if you hold, with a daily time limit per site.
```

**IT**:
```
Nuova scheda anti-distrazione: i siti distraenti si aprono solo tenendo premuto, con limite giornaliero per sito.
```

---

## Detailed description

### EN (consigliato)

```
Minimalista turns your new tab into a calm, focused home page — and when you're
about to open a distracting site, it stops you and asks for a deliberate gesture.

★ FOCUS MODE
When Focus is on, the sites in your list are intercepted before they open:
• Hold: the site opens only after you hold the button for the configured seconds
  (a deliberate, intentional gesture).
• Block: the site never opens.
• Daily limit per site: once exceeded, the site stays blocked for the rest of the
  day — even if the tab is already open, it's redirected to the block page
  automatically (no manual reload).
• Grace period: after a successful hold, you can browse the site freely for N
  minutes without new interruptions.

★ MINIMALIST NEW TAB
• Web search (Google, DuckDuckGo, Bing, Brave).
• ToDo list with priorities and due dates, auto-sorted.
• Favorites grid with website icons (from Chrome's own cache, no network requests).
• Focus summary with usage times and daily stats.

★ SITE CATEGORIES
Six ready-made categories (Social, Video, News, Adult, Gaming, Shopping) with
disjoint domains and an aggregated daily budget for the whole category.

★ STATISTICS
Time tracked on every website and split into distracting vs. other sites: 7-day
bar chart with weekly comparison, top sites of the day, blocked attempts and
deliberate unlocks (daily and weekly). Reset anytime.

★ CUSTOMIZATION
6 fixed themes (Midnight, E-Ink, Neon, Warm, Ocean, Sunset) plus fully custom
themes with your own colors, font size and style, UI language (Italian, English,
Español, Français, Deutsch, Português), search engine and more.

★ PRO (one-time Lifetime purchase)
• Cold Turkey: total, irreversible blocking for X hours/days — it wins over
  everything and cannot be undone.
• Weekly time slots: the block activates only in the windows you choose.
• Custom category domains.
• PRO themes with the animated Aurora background, background image and quick
  links (Gmail, Images, Maps…) on the new tab.

🔒 PRIVACY
All data stays on your device (chrome.storage.local). The only external
communication is the PRO payment verification with ExtensionPay — no personal
content ever leaves your device.

Minimalista is open source under the GNU AGPL-3.0 license.
Source code: [URL_DEL_REPOSITORIO]
```

### IT

```
Minimalista trasforma la tua nuova scheda in una home page calma e concentrata —
e quando stai per aprire un sito distraente, ti ferma e ti chiede un gesto
intenzionale.

★ MODALITÀ FOCUS
Con Focus attivo i siti della tua lista vengono intercettati prima di aprirsi:
• Tieni premuto: il sito si apre solo dopo aver tenuto premuto il pulsante per i
  secondi configurati (un gesto deliberato e consapevole).
• Blocca: il sito non si apre mai.
• Limite giornaliero per sito: una volta superato, il sito resta bloccato per il
  resto della giornata — anche se la scheda è già aperta, viene reindirizzata
  automaticamente alla pagina di blocco (nessun ricaricamento manuale).
• Periodo di grazia: dopo uno sblocco riuscito, navighi liberamente per N minuti
  senza nuovi blocchi.

★ NUOVA SCHEDA MINIMALISTA
• Ricerca web (Google, DuckDuckGo, Bing, Brave).
• ToDo con priorità e scadenze, ordinamento automatico.
• Preferiti con le icone dei siti (dalla cache di Chrome, nessuna richiesta di rete).
• Riepilogo Focus con tempi di utilizzo e statistiche del giorno.

★ CATEGORIE DI SITI
Sei categorie pronte (Social, Video, News, Adulti, Giochi, Shopping) con domini
disgiunti e budget giornaliero aggregato per l'intera categoria.

★ STATISTICHE
Tempo tracciato su ogni sito e suddiviso in distraenti vs. altri: grafico a barre
degli ultimi 7 giorni con confronto settimanale, top siti del giorno, tentativi
bloccati e aperture deliberate (giornaliere e settimanali). Azzeramento in un clic.

★ PERSONALIZZAZIONE
6 temi fissi (Midnight, E-Ink, Neon, Warm, Ocean, Sunset) più temi custom con i
tuoi colori, dimensione e stile del font, lingua dell'interfaccia (Italiano,
English, Español, Français, Deutsch, Português), motore di ricerca e altro.

★ PRO (acquisto una tantum Lifetime)
• Cold Turkey: blocco totale e irreversibile per X ore/giorni — vince su tutto e
  non si può annullare.
• Fasce orarie settimanali: il blocco si attiva solo nelle finestre che scegli.
• Domini personalizzati per le categorie.
• Temi PRO con sfondo Aurora animato, immagine di sfondo e collegamenti rapidi
  (Gmail, Immagini, Maps…) nella nuova scheda.

🔒 PRIVACY
Tutti i dati restano sul tuo dispositivo (chrome.storage.local). L'unica
comunicazione esterna è la verifica del pagamento PRO con ExtensionPay — nessun
contenuto personale lascia mai il dispositivo.

Minimalista è open source con licenza GNU AGPL-3.0.
Codice sorgente: [URL_DEL_REPOSITORIO]
```

---

## Single purpose (campo obbligatorio dello store)

**EN**:
```
Block distracting websites and provide a minimalist new-tab dashboard with daily
per-site time limits, so users browse with intention.
```

**IT**:
```
Bloccare i siti distraenti e offrire una dashboard minimalista nella nuova scheda,
con limiti di tempo giornalieri per sito, per una navigazione intenzionale.
```

---

## Justification of permissions (form in inglese)

```
storage — Settings, to-do items, favorites and usage statistics are saved only on
the device via chrome.storage.

tabs — Used to redirect an already-open tab to the block page when the daily limit
is exceeded while the page is open.

webNavigation — Used to intercept navigation toward the sites in the focus list
before they load and show the block page (no host permissions are requested).

alarms — Periodic ticks (~30 s) to enforce the daily limit on open tabs, track
usage time and recover blocks missed during service-worker cold starts.

favicon — Loads website icons for the favorites grid from Chrome's own cache; no
network requests are made.
```

---

## Privacy / data usage (sezione "Privacy practices" del form)

**EN**:
```
This extension does not collect or transmit any personal data. Everything
(settings, to-do, favorites, statistics) is stored locally on the device via
chrome.storage.local. The only external communication is a payment-status check
to extensionpay.com when the user opens the PRO membership section; no personal
content leaves the device. No remote code is executed.
```

**IT**:
```
Questa estensione non raccoglie né invia dati personali. Tutto (impostazioni,
ToDo, preferiti, statistiche) è salvato localmente sul dispositivo tramite
chrome.storage.local. L'unica comunicazione esterna è la verifica dello stato di
pagamento verso extensionpay.com quando l'utente apre la sezione Membership PRO;
nessun contenuto personale lascia il dispositivo. Nessun codice remoto viene
eseguito.
```

---

## Screenshot (consigliati: 5, formato 1280×800 o 640×400, PNG/JPEG ≤ 2 MB)

1. **Dashboard** (nuova scheda): orologio, ricerca, ToDo, preferiti, riepilogo Focus.
2. **Pagina di blocco**: anello di avanzamento "tieni premuto" con una frase motivazionale.
3. **Impostazioni → Focus**: lista siti con modalità, ritardo e limite giornaliero.
4. **Statistiche**: grafico 7 giorni, top siti, confronto settimanale.
5. **Sezione PRO / tema**: Membership (o un tema PRO con Aurora).

## Altri campi

- **Small promo tile** (440×280): consigliata — logo su sfondo del tema Midnight.
- **Website**: eventuale pagina del progetto.
- **Source code**: `[URL_DEL_REPOSITORIO]` (obbligo AGPL-3.0).
- **Version**: già nel manifest (`1.0.0`) — incrementarla a ogni aggiornamento.