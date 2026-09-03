// background.js — Service Worker dell'estensione.
//  - intercetta le navigazioni verso i siti configurati e reindirizza alla pagina di blocco;
//  - applica i limiti giornalieri per sito;
//  - traccia il tempo speso su qualsiasi sito web http/https (statistiche): il dominio
//    registrato è quello del sito configurato se la navigazione lo riguarda, altrimenti
//    il dominio della pagina; le pagine dell'estensione non vengono conteggiate;
//    il tracker è persistito in storage.session e un alarm ogni 30 s salva l'accumulo;
//  - al superamento del limite giornaliero blocca automaticamente le schede aperte;
//  - gestisce il "periodo di grazia" dopo uno sblocco.
"use strict";

importScripts("common.js", "i18n.js", "ExtPay.js");

let settings = null;   // cache in memoria delle impostazioni
let stats = null;      // cache in memoria delle statistiche
let tracker = null;    // { tabId, domain, since } — tab attualmente monitorato
let grace = {};        // tabId → timestamp di scadenza del periodo di grazia (storage.session)
let listenersReady = false;

/* ============================================================
   ExtensionPay (pagamenti PRO — sezione 7 del TODO)
   ------------------------------------------------------------
   Il flag locale (_aT) serve solo all'interfaccia; le azioni critiche
   passano SEMPRE da verifyProLive(), che interroga il server di
   ExtensionPay (extpay.getUser). extpay.startBackground() deve essere
   chiamato una sola volta per esecuzione del worker: abilita la
   comunicazione tra le pagine dell'estensione (options) ed ExtPay.
   ============================================================ */
let extpay = null; // istanza lazy: creata solo se EXT_PAY_ID è configurato
function ensureExtPay() {
  if (!extpay && extpayConfigured()) extpay = ExtPay(EXT_PAY_ID);
  return extpay;
}
if (extpayConfigured()) {
  try { ensureExtPay().startBackground(); } catch { /* ExtPay assente o non registrato */ }
}

// Dev toggle (Info → "PRO — solo sviluppo"): da rimuovere prima della pubblicazione.
async function devProOn() {
  try { const d = await chrome.storage.local.get("_devPro"); return d._devPro === true; }
  catch { return false; }
}

// Imposta/rimuove la firma UI (_aT) in settings, persistendo solo se cambia.
async function setProSig(on) {
  if (!settings || (settings[_PRO_SIG] === _PRO_OK) === !!on) return;
  settings[_PRO_SIG] = on ? _PRO_OK : null;
  await storageSet("settings", settings);
}

// Interroga ExtensionPay e allinea la firma UI. Usata all'avvio/installazione
// e alla richiesta esplicita delle pagine ("proRefresh", es. dopo il pagamento).
async function refreshProStatus() {
  if (!extpayConfigured()) return false;
  try {
    const user = await ensureExtPay().getUser();
    const paid = !!(user && user.paid);
    await setProSig(paid || (await devProOn()));
    return paid;
  } catch {
    return false; // errore di rete/account: non si tocca l'ultimo stato noto
  }
}

/* ============================================================
   Inizializzazione
   ============================================================ */
async function init() {
  const data = await chrome.storage.local.get(["settings", "stats"]);
  settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...(data.settings || {}), sites: (data.settings || {}).sites || [] };
  if (migrateCustomThemes(settings)) await storageSet("settings", settings); // vecchio tema Custom → tema nominato
  stats = data.stats || emptyStats();
  grace = (await chrome.storage.session.get("grace"))?.grace || {};
  pruneGrace();
  ensureListeners();
  // 30 s per le estensioni non pacchettizzate (Chrome 120+ alza a 1 min per quelle pacchettizzate).
  await chrome.alarms.create("minimalista-tick", { periodInMinutes: 0.5 });
  await resumeTracking(); // riparte subito a contare la scheda attiva, senza aspettare un evento
  enforceLimits();        // e blocca subito eventuali siti già oltre il limite
  sweepBlocked();         // e recupera le navigazioni sfuggite a onBeforeNavigate (SW freddo, SPA…)
  refreshProStatus();     // allinea la firma UI allo stato reale su ExtensionPay
}

chrome.runtime.onInstalled.addListener(async () => {
  const s = await storageGet("settings");
  if (!s) await storageSet("settings", JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  await chrome.alarms.create("minimalista-tick", { periodInMinutes: 0.5 });
  refreshProStatus(); // utente già pagato su extensionpay.com → sblocca subito la UI
});

chrome.runtime.onStartup.addListener(() => {
  refreshProStatus(); // riallinea la firma UI a ogni avvio del browser
});

init();

/* ============================================================
   Regole di blocco (siti singoli + categorie precompilate)
   ------------------------------------------------------------
   Per ogni dominio si applica al più una regola: se il sito è configurato
   singolarmente (settings.sites) la sua configurazione ha la precedenza su
   un'eventuale categoria di cui il dominio fa parte; altrimenti si usa la
   configurazione della categoria attiva che lo contiene. Il dominio può essere
   sia in un sito singolo sia in una categoria (es. instagram.com è un default
   ed è anche in "Social"): in quel caso il singolo sito governa l'intercettazione
   e il budget aggregato della categoria continua a conteggiarlo nelle statistiche.
   ============================================================ */
function resolveHit(url) {
  const host = bareDomain(hostOf(url));
  if (!host) return null;
  const now = Date.now();
  const site = siteFor(url, settings.sites);
  if (site) {
    if (site.active || (site.ctUntil || 0) > now) return { site, domain: site.domain };
    // sito singolo presente ma inattivo (senza cold turkey): si ricade sulla categoria
  }
  const hc = hostCategory(host, settings);
  if (!hc) return null;
  const conf = categoryConf(settings, hc.cat.id);
  if (conf.active || (conf.ctUntil || 0) > now) return { conf, reg: hc.cat, domain: hc.domain };
  return null;
}

function ensureListeners() {
  if (listenersReady) return;
  listenersReady = true;

  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;                  // solo il frame principale
    const url = details.url;
    if (!/^https?:\/\//i.test(url)) return;             // ignora chrome://, about:, estensione, ecc.
    const now = Date.now();
    const hit = resolveHit(url);
    if (!hit) return;

    // 0) cold turkey (PRO): blocco totale e irreversibile, vince su tutto
    //    (anche su Focus spento e sul periodo di grazia)
    const ctUntil = hit.site ? (hit.site.ctUntil || 0) : (hit.conf.ctUntil || 0);
    if (ctUntil > now) return intercept(details.tabId, url, "ct");

    if (!settings.focusEnabled) return;                 // Focus spento → nessun blocco

    // 1) fascia oraria (PRO): il blocco è attivo solo nelle finestre configurate
    const sched = hit.site ? hit.site.schedule : (hit.conf.schedule || null);
    if (sched && !scheduleActive(sched)) return;

    // 2) limite giornaliero: singolo sito oppure budget aggregato di categoria
    const limit = hit.site ? hit.site.limitMinutes : (hit.conf.limitMinutes || 0);
    if (limit > 0) {
      const used = hit.site
        ? ((stats.byDay[dayKey()] || {})[hit.site.domain] || 0)
        : categoryUsedSeconds(hit.conf.id, stats, null, settings);
      if (used >= limit * 60) {
        return intercept(details.tabId, url, "limit", hit.site ? null : hit.conf.id);
      }
    }

    // 3) periodo di grazia: dopo uno sblocco il tab naviga libero per un po'
    if (grace[details.tabId] && grace[details.tabId] > now) return;
    // 4) modalità "blocco totale" → niente sblocco
    const mode = hit.site ? hit.site.mode : (hit.conf.mode || "hold");
    if (mode === "block") return intercept(details.tabId, url, "block");
    // 5) default: tieni premuto per continuare
    return intercept(details.tabId, url, "hold");
  }, { url: [{ schemes: ["http", "https"] }] });

  /* ---------- tracciamento del tempo ---------- */
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    await reconcileTracker(); // recupera il tracker persistito se il SW era stato ucciso
    endTracker();
    startTracker(tabId, await domainOfTab(tabId));
  });

  chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (!info.url) return;
    await reconcileTracker();
    if (tracker && tracker.tabId === tabId) endTracker();
    // cambio URL (anche "pagina di blocco → sito" dopo lo sblocco): se il tab è
    // attivo e non c'è altro tracciamento, riparte il conteggio sul nuovo dominio.
    if (tab && tab.active && !tracker) {
      startTracker(tabId, domainForUrl(info.url));
    }
  });

  chrome.tabs.onRemoved.addListener(async (tabId) => {
    await reconcileTracker();
    if (tracker && tracker.tabId === tabId) endTracker();
  });

  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    await reconcileTracker();
    endTracker();
    if (windowId === chrome.windows.WINDOW_ID_NONE) return; // finestra non a fuoco
    try {
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (tab) startTracker(tab.id, await domainOfTab(tab.id));
    } catch { /* ignora */ }
  });

  chrome.alarms.onAlarm.addListener(async (al) => {
    if (al.name !== "minimalista-tick") return;
    // endTracker salva il tempo accumulato ma azzera anche `tracker`: lo si
    // cattura prima e lo si riavvia, così il conteggio non si ferma mai al tick.
    const current = tracker;
    endTracker();
    if (current) startTracker(current.tabId, current.domain); // riparte da zero
    pruneGrace();
    pruneStats();
    await saveStats();
    enforceLimits(); // limite giornaliero superato → blocco automatico anche a pagina aperta
    sweepBlocked();  // navigazioni sfuggite (SW freddo, SPA, siti aperti prima del blocco)
  });

  /* ---------- sincronizzazione cache con storage ---------- */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) {
      const s = changes.settings.newValue;
      settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...s, sites: (s && s.sites) || [] };
    }
    if (changes.stats) stats = changes.stats.newValue || emptyStats();
  });

  /* ---------- messaggi dalle pagine ---------- */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      switch (msg.type) {
        case "getState":
          sendResponse({ settings, stats });
          break;

        case "saveSettings": {
          settings = sanitizeSettings(msg.settings);
          await storageSet("settings", settings);
          sendResponse({ ok: true });
          break;
        }

        case "setFocus": {
          settings.focusEnabled = !!msg.value;
          await storageSet("settings", settings);
          sendResponse({ ok: true });
          break;
        }

        case "proTest": {
          // Toggle di sviluppo: marca l'interfaccia come PRO (solo segnale UI).
          settings[_PRO_SIG] = msg.on ? _PRO_OK : null;
          await storageSet("settings", settings);
          sendResponse({ ok: true });
          break;
        }

        case "proRefresh": {
          // Richiesta delle pagine (es. dopo il ritorno dalla pagina di pagamento
          // ExtensionPay): interroga il server e allinea la firma UI.
          const paid = await refreshProStatus();
          sendResponse({ ok: true, paid: !!paid });
          break;
        }

        case "coldTurkey": {
          // Blocco ferreo su un singolo sito o su una categoria (PRO).
          // Verifica "live" prima di attivare: il flag locale da solo non basta.
          // verifyProLive() rimuove da sola la firma UI se il pagamento non risulta.
          if (!(await verifyProLive())) {
            sendResponse({ ok: false, reason: "pro" });
            break;
          }
          const hours = Math.max(0, Math.round(Number(msg.hours) || 0));
          const days = Math.max(0, Math.round(Number(msg.days) || 0));
          const ms = hours * 3600000 + days * 86400000;
          if (ms < 60000) { sendResponse({ ok: false, reason: "invalid" }); break; }
          const until = Date.now() + ms;
          let found = false;
          if (msg.kind === "site") {
            const site = settings.sites.find(s => String(s.id) === String(msg.id));
            if (site) { site.ctUntil = until; found = true; }
          } else if (msg.kind === "cat") {
            const conf = settings.categories.find(c => c.id === msg.id);
            if (conf) { conf.ctUntil = until; found = true; }
          }
          if (!found) { sendResponse({ ok: false, reason: "invalid" }); break; }
          settings = sanitizeSettings(settings);
          await storageSet("settings", settings);
          sendResponse({ ok: true, ctUntil: until });
          break;
        }

        case "proSchedule": {
          // Fasce orarie settimanali su sito/categoria (PRO): anche qui verifica live.
          if (!(await verifyProLive())) {
            sendResponse({ ok: false, reason: "pro" });
            break;
          }
          let found = false;
          if (msg.kind === "site") {
            const site = settings.sites.find(s => String(s.id) === String(msg.id));
            if (site) { site.schedule = sanitizeSchedule(msg.schedule); found = true; }
          } else if (msg.kind === "cat") {
            const conf = settings.categories.find(c => c.id === msg.id);
            if (conf) { conf.schedule = sanitizeSchedule(msg.schedule); found = true; }
          }
          if (!found) { sendResponse({ ok: false, reason: "invalid" }); break; }
          settings = sanitizeSettings(settings);
          await storageSet("settings", settings);
          sendResponse({ ok: true });
          break;
        }

        case "proSaveCategories": {
          // Lista personalizzata dei domini di una categoria (PRO). La verifica
          // live impedisce di sbloccare la modifica falsificando lo storage.
          if (!(await verifyProLive())) {
            sendResponse({ ok: false, reason: "pro" });
            break;
          }
          const conf = settings.categories.find(c => c.id === msg.id);
          if (!conf) { sendResponse({ ok: false, reason: "invalid" }); break; }
          conf.domains = Array.isArray(msg.domains)
            ? [...new Set(msg.domains.map(normalizeDomain).filter(Boolean))]
            : [];
          settings = sanitizeSettings(settings);
          await storageSet("settings", settings);
          sendResponse({ ok: true, domains: conf.domains });
          break;
        }

        case "unlock": {
          // Lo sblocco arriva dalla pagina di blocco dopo il "tieni premuto".
          const tabId = msg.tabId;
          if (tabId != null) {
            grace[tabId] = Date.now() + settings.graceMinutes * 60000;
            await chrome.storage.session.set({ grace });
          }
          bumpCounter("unlocks");
          sendResponse({ ok: true });
          break;
        }

        case "resetStats": {
          stats = emptyStats();
          await saveStats();
          sendResponse({ ok: true });
          break;
        }

        default:
          sendResponse({ ok: false });
      }
    })();
    return true; // risposta asincrona
  });
}

/* ============================================================
   Blocco
   ============================================================ */
async function intercept(tabId, url, reason, categoryId) {
  bumpCounter("blocked");
  let blockUrl = chrome.runtime.getURL("block.html") +
    "?u=" + encodeURIComponent(url) + "&r=" + reason;
  // per il limite di una categoria la pagina di blocco mostra il totale del budget
  if (categoryId) blockUrl += "&c=" + encodeURIComponent(categoryId);
  try {
    await chrome.tabs.update(tabId, { url: blockUrl });
  } catch { /* il tab può essere già sparito: nessun problema */ }
}

/* ============================================================
   Tracciamento del tempo
   ============================================================ */
// Dominio da conteggiare per un URL: il dominio del sito configurato se la
// navigazione riguarda uno dei siti del Focus, altrimenti il dominio di
// qualsiasi sito http/https. Le pagine non web (chrome://, about:, estensione
// stessa, file://…) non vengono mai conteggiate.
function domainForUrl(url) {
  if (!/^https?:\/\//i.test(url || "")) return null;
  const host = bareDomain(hostOf(url));
  if (!host) return null;
  const site = siteFor(url, settings.sites);
  if (site) return site.domain;                 // dominio canonico del sito configurato
  const hc = hostCategory(host, settings);      // dominio canonico della categoria
  return (hc && hc.domain) || host;
}

async function domainOfTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return domainForUrl(tab.url || "");
  } catch { return null; }
}

// Recupera il tracker persistito in storage.session se il service worker è stato
// ucciso tra un evento e l'altro: così l'intervallo "morto" non va mai perso.
async function reconcileTracker() {
  if (tracker) return;
  try {
    const s = await chrome.storage.session.get("tracker");
    if (s && s.tracker && typeof s.tracker.since === "number" && s.tracker.domain) {
      tracker = s.tracker;
    }
  } catch { /* ignora */ }
}

async function resumeTracking() {
  await reconcileTracker();
  endTracker(); // conteggia l'eventuale intervallo residuo del tracker persistito
  try {
    const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
    for (const w of wins) {
      if (w.focused) {
        const [tab] = await chrome.tabs.query({ active: true, windowId: w.id });
        if (tab) startTracker(tab.id, await domainOfTab(tab.id));
        break;
      }
    }
  } catch { /* finestra chiusa nel frattempo: nessun problema */ }
}

// Se un sito (o una categoria) ha superato il limite giornaliero o è in cold
// turkey, blocca subito le schede ancora aperte sul dominio (anche senza una
// nuova navigazione). Il cold turkey vale anche con Focus spento.
async function enforceLimits() {
  if (!settings) return;
  const now = Date.now();
  const today = dayKey();
  const targets = new Map(); // dominio → "ct" | "limit"

  const add = (domain, conf, limitUsed) => {
    if ((conf.ctUntil || 0) > now) { targets.set(domain, "ct"); return; }
    if (conf.schedule && !scheduleActive(conf.schedule)) return; // fuori fascia → nessun blocco
    if (settings.focusEnabled && conf.limitMinutes > 0 && limitUsed() >= conf.limitMinutes * 60) {
      targets.set(domain, "limit");
    }
  };

  for (const site of settings.sites) {
    if (!site.active) {
      if ((site.ctUntil || 0) > now) targets.set(site.domain, "ct");
      continue;
    }
    add(site.domain, site, () => (stats.byDay[today] || {})[site.domain] || 0);
  }
  for (const conf of (settings.categories || [])) {
    if (!conf.active) continue;
    for (const domain of categoryDomains(settings, conf.id)) {
      const site = settings.sites.find(s => s.domain === domain);
      if (site && site.active) continue; // dominio governato dal singolo sito
      add(domain, conf, () => categoryUsedSeconds(conf.id, stats, today, settings));
    }
  }

  for (const [domain, kind] of targets) {
    try {
      const tabs = await chrome.tabs.query({ url: ["*://" + domain + "/*", "*://*." + domain + "/*"] });
      for (const t of tabs) {
        if (t.url && /^https?:/i.test(t.url)) intercept(t.id, t.url, kind === "ct" ? "ct" : "limit");
      }
    } catch { /* il tab può sparire durante la query: nessun problema */ }
  }
}

// Spazza le schede già aperte: se una pagina web aperta dovrebbe essere bloccata
// (hold / block / limite / cold turkey) viene reindirizzata alla pagina di blocco.
// Copre i casi in cui onBeforeNavigate non è scattato: service worker in cold start
// (tipico della prima navigazione di una sessione incognito), navigazioni SPA senza
// reload, siti aperti prima dell'attivazione del blocco. Rispetta il periodo di grazia.
async function sweepBlocked() {
  if (!settings) return;
  const now = Date.now();
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (!t.url || !/^https?:/i.test(t.url)) continue; // solo pagine web
      if (grace[t.id] && grace[t.id] > now) continue;   // periodo di grazia attivo
      const hit = resolveHit(t.url);
      if (!hit) continue;
      // stesso ordine di priorità dell'intercettazione alla navigazione:
      // cold turkey > Focus spento > fascia oraria > limite > grazia > modalità
      const ctUntil = hit.site ? (hit.site.ctUntil || 0) : (hit.conf.ctUntil || 0);
      if (ctUntil > now) { intercept(t.id, t.url, "ct"); continue; }
      if (!settings.focusEnabled) continue;
      const sched = hit.site ? hit.site.schedule : (hit.conf.schedule || null);
      if (sched && !scheduleActive(sched)) continue;
      const limit = hit.site ? hit.site.limitMinutes : (hit.conf.limitMinutes || 0);
      if (limit > 0) {
        const used = hit.site
          ? ((stats.byDay[dayKey()] || {})[hit.site.domain] || 0)
          : categoryUsedSeconds(hit.conf.id, stats, null, settings);
        if (used >= limit * 60) {
          intercept(t.id, t.url, "limit", hit.site ? null : hit.conf.id);
          continue;
        }
      }
      const mode = hit.site ? hit.site.mode : (hit.conf.mode || "hold");
      intercept(t.id, t.url, mode === "block" ? "block" : "hold");
    }  } catch { /* il tab può sparire durante la query: nessun problema */ }
}

function endTracker(now = Date.now()) {
  if (!tracker) return;
  const secs = Math.round((now - tracker.since) / 1000);
  if (secs > 0) {
    addToDay(stats, dayKey(), tracker.domain, secs);
    saveStats(); // fire-and-forget
  }
  tracker = null;
  chrome.storage.session.set({ tracker: null }).catch(() => {});
}

function startTracker(tabId, domain, now = Date.now()) {
  if (!domain) return;
  tracker = { tabId, domain, since: now };
  // persistito: se il SW viene ucciso, al risveglio il conteggio riparte da `since`
  chrome.storage.session.set({ tracker: { tabId, domain, since: now } }).catch(() => {});
}

function bumpCounter(key) {
  const today = dayKey();
  stats[key][today] = (stats[key][today] || 0) + 1;
  saveStats();
}

function saveStats() {
  return storageSet("stats", stats);
}

/* ============================================================
   Pulizia
   ============================================================ */
function pruneGrace() {
  const now = Date.now();
  let changed = false;
  for (const id in grace) {
    if (grace[id] <= now) { delete grace[id]; changed = true; }
  }
  if (changed) chrome.storage.session.set({ grace }).catch(() => {});
}

function pruneStats() {
  // mantiene solo ~70 giorni di cronologia
  const keys = Object.keys(stats.byDay);
  if (keys.length <= 70) return;
  keys.sort();
  const keep = new Set(keys.slice(-70));
  for (const k of keys) {
    if (!keep.has(k)) {
      delete stats.byDay[k];
      delete stats.blocked[k];
      delete stats.unlocks[k];
    }
  }
}

/* ============================================================
   Sanitizzazione delle impostazioni (arrivano dalle pagine)
   ============================================================ */
function sanitizeThemeColor(c) {
  const o = c || {};
  return {
    r: Math.max(0, Math.min(255, Math.round(Number(o.r) || 0))),
    g: Math.max(0, Math.min(255, Math.round(Number(o.g) || 0))),
    b: Math.max(0, Math.min(255, Math.round(Number(o.b) || 0)))
  };
}

// Fascia oraria settimanale: { days: [1..7], start, end } con start/end in minuti.
function sanitizeSchedule(s) {
  if (!s || typeof s !== "object") return null;
  const days = Array.isArray(s.days)
    ? [...new Set(s.days.map(Number).filter(n => n >= 1 && n <= 7))].sort((a, b) => a - b)
    : [];
  const start = Math.min(1439, Math.max(0, Math.round(Number(s.start) || 0)));
  const end = Math.min(1440, Math.max(1, Math.round(Number(s.end) || 1440)));
  if (!days.length || end <= start) return null;
  return { days, start, end };
}

// Verifica "live" dello stato PRO per le azioni critiche (cold turkey, fasce
// orarie): NON ci si fida mai della sola firma locale. Con ExtensionPay
// configurato si interroga il server (extpay.getUser → user.paid); in sviluppo
// (o finché EXT_PAY_ID è vuoto) l'unica fonte che approva è il toggle in Info.
// Fallisce in modo conservativo (fail-closed): un errore di rete non sblocca
// nulla; ogni "no" definitivo (non pagato, o ExtensionPay assente) rimuove
// anche la firma UI, così una firma falsificata da sola non sblocca mai nulla.
async function verifyProLive() {
  if (await devProOn()) return true;
  const ep = ensureExtPay();
  if (!ep) {
    await setProSig(false); // build senza ExtensionPay: la firma da sola non basta
    return false;
  }
  try {
    const user = await ep.getUser();
    if (user && user.paid) {
      await setProSig(true); // mantiene la UI sbloccata
      return true;
    }
    await setProSig(false); // risposta netta "non pagato" → revoca la firma
    return false;
  } catch {
    return false; // errore di rete: fail-closed, si conserva l'ultimo stato noto
  }
}

function sanitizeSettings(s) {
  const out = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...(s || {}) };
  if (!Array.isArray(out.sites)) out.sites = [];
  out.sites = out.sites
    .filter(x => x && typeof x.domain === "string" && x.domain)
    .map(x => ({
      id: Number.isFinite(x.id) ? x.id : Date.now() + Math.random(),
      domain: normalizeDomain(x.domain),
      delay: Math.min(30, Math.max(1, Math.round(Number(x.delay) || 5))),
      limitMinutes: Math.max(0, Math.round(Number(x.limitMinutes) || 0)),
      mode: x.mode === "block" ? "block" : "hold",
      active: x.active !== false,
      ctUntil: Math.max(0, Math.round(Number(x.ctUntil) || 0)),   // PRO cold turkey
      schedule: sanitizeSchedule(x.schedule)                       // PRO fasce orarie
    }))
    .filter(x => x.domain);
  // categorie precompilate: la configurazione è fusa per id con il registry.
  // `domains` (lista personalizzata, PRO) vuota = si usano i domini del registry.
  const pro = out[_PRO_SIG] === _PRO_OK;
  out.categories = CATEGORIES.map(cat => {
    const conf = (out.categories || []).find(c => c && c.id === cat.id) || {};
    const customDoms = pro && Array.isArray(conf.domains)
      ? [...new Set(conf.domains.map(normalizeDomain).filter(Boolean))]
      : [];
    return {
      id: cat.id,
      active: conf.active === true,
      mode: conf.mode === "block" ? "block" : "hold",
      delay: Math.min(30, Math.max(1, Math.round(Number(conf.delay) || 5))),
      limitMinutes: Math.max(0, Math.round(Number(conf.limitMinutes) || 0)),
      ctUntil: Math.max(0, Math.round(Number(conf.ctUntil) || 0)),
      schedule: sanitizeSchedule(conf.schedule),
      domains: customDoms
    };
  });
  out.graceMinutes = Math.min(120, Math.max(0, Math.round(Number(out.graceMinutes) || 5)));
  out.fontScale = Math.min(1.2, Math.max(0.6, Number(out.fontScale) || 1));
  out.fontFamily = ["sans", "serif", "mono", "cursive"].includes(out.fontFamily) ? out.fontFamily : "sans";
  out.searchEngine = SEARCH_ENGINES[out.searchEngine] ? out.searchEngine : "google";
  out.showSearch = out.showSearch !== false;

  // personalizzazione avanzata (immagine di sfondo + arrotondamento bordi)
  out.bgImage = typeof out.bgImage === "string" ? out.bgImage.trim().slice(0, 2048) : "";
  // mancante (null/"") o non numerico → fallback 8; altrimenti clamp 0 – 24
  const borderRadiusNum = (out.borderRadius == null || out.borderRadius === "") ? NaN : Number(out.borderRadius);
  out.borderRadius = Number.isFinite(borderRadiusNum)
    ? Math.min(24, Math.max(0, Math.round(borderRadiusNum)))
    : 8;

  // temi custom: nome libero (max 24 caratteri), tre colori RGB 0–255, id stabile
  out.customThemes = (Array.isArray(out.customThemes) ? out.customThemes : [])
    .filter(x => x && typeof x === "object")
    .map(x => ({
      id: (typeof x.id === "string" && x.id.indexOf("ct-") === 0) ? x.id : newThemeId(),
      name: (String(x.name || "").trim() || "Custom").slice(0, 24),
      bg: sanitizeThemeColor(x.bg),
      fg: sanitizeThemeColor(x.fg),
      accent: sanitizeThemeColor(x.accent)
    }));
  const customIds = new Set(out.customThemes.map(t => t.id));
  // un tema PRO è ammesso solo con la firma (le anteprime dei non-PRO non vengono
  // mai persistite: vivono solo in memoria nelle impostazioni)
  const proThemeOk = PRO_THEME_IDS.includes(out.theme) && pro;
  out.theme = FIXED_THEMES.includes(out.theme) || customIds.has(out.theme) || proThemeOk
    ? out.theme
    : "midnight";

  out.pinHash = typeof out.pinHash === "string" ? out.pinHash : null;
  out.lang = LANGUAGES[out.lang] ? out.lang : "auto";
  // firma PRO opaca (solo segnale UI: le azioni critiche passano da verifyProLive)
  out[_PRO_SIG] = out[_PRO_SIG] === _PRO_OK ? _PRO_OK : null;
  return out;
}
