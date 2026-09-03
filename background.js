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

importScripts("common.js", "i18n.js");

let settings = null;   // cache in memoria delle impostazioni
let stats = null;      // cache in memoria delle statistiche
let tracker = null;    // { tabId, domain, since } — tab attualmente monitorato
let grace = {};        // tabId → timestamp di scadenza del periodo di grazia (storage.session)
let listenersReady = false;

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
}

chrome.runtime.onInstalled.addListener(async () => {
  const s = await storageGet("settings");
  if (!s) await storageSet("settings", JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  await chrome.alarms.create("minimalista-tick", { periodInMinutes: 0.5 });
});

init();

/* ============================================================
   Intercettazione delle navigazioni
   ============================================================ */
function ensureListeners() {
  if (listenersReady) return;
  listenersReady = true;

  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;                  // solo il frame principale
    const url = details.url;
    if (!/^https?:\/\//i.test(url)) return;             // ignora chrome://, about:, estensione, ecc.
    if (!settings.focusEnabled) return;                 // Focus spento → nessun blocco
    const site = siteFor(url, settings.sites);
    if (!site || !site.active) return;

    const today = dayKey();
    const used = (stats.byDay[today] && stats.byDay[today][site.domain]) || 0;

    // 1) limite giornaliero: vince su tutto
    if (site.limitMinutes > 0 && used >= site.limitMinutes * 60) {
      return intercept(details.tabId, url, "limit");
    }
    // 2) periodo di grazia: dopo uno sblocco il tab naviga libero per un po'
    if (grace[details.tabId] && grace[details.tabId] > Date.now()) return;
    // 3) modalità "blocco totale" → niente sblocco
    if (site.mode === "block") {
      return intercept(details.tabId, url, "block");
    }
    // 4) default: tieni premuto per continuare
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
async function intercept(tabId, url, reason) {
  bumpCounter("blocked");
  const blockUrl = chrome.runtime.getURL("block.html") +
    "?u=" + encodeURIComponent(url) + "&r=" + reason;
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
  const site = siteFor(url, settings.sites);
  return (site && site.domain) || bareDomain(hostOf(url)) || null;
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

// Se un sito configurato ha superato il limite giornaliero, blocca subito le
// schede ancora aperte su quel sito (anche senza una nuova navigazione).
async function enforceLimits() {
  if (!settings || !settings.focusEnabled) return;
  const today = dayKey();
  for (const site of settings.sites) {
    if (!site.active || !(site.limitMinutes > 0)) continue;
    const used = (stats.byDay[today] && stats.byDay[today][site.domain]) || 0;
    if (used < site.limitMinutes * 60) continue;
    try {
      const tabs = await chrome.tabs.query({ url: ["*://" + site.domain + "/*", "*://*." + site.domain + "/*"] });
      for (const t of tabs) {
        if (t.url && /^https?:/i.test(t.url)) intercept(t.id, t.url, "limit");
      }
    } catch { /* il tab può sparire durante la query: nessun problema */ }
  }
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
      active: x.active !== false
    }))
    .filter(x => x.domain);
  out.graceMinutes = Math.min(120, Math.max(0, Math.round(Number(out.graceMinutes) || 5)));
  out.fontScale = Math.min(1.2, Math.max(0.6, Number(out.fontScale) || 1));
  out.fontFamily = ["sans", "serif", "mono", "cursive"].includes(out.fontFamily) ? out.fontFamily : "sans";
  out.searchEngine = SEARCH_ENGINES[out.searchEngine] ? out.searchEngine : "google";
  out.showSearch = out.showSearch !== false;

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
  out.theme = FIXED_THEMES.includes(out.theme) || customIds.has(out.theme) ? out.theme : "midnight";

  out.pinHash = typeof out.pinHash === "string" ? out.pinHash : null;
  out.lang = LANGUAGES[out.lang] ? out.lang : "auto";
  return out;
}
