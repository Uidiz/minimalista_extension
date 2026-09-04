// common.js — funzioni e costanti condivise tra tutte le pagine dell'estensione.
"use strict";

/* ============================================================
   Impostazioni di default
   ============================================================ */

// Macro-categorie precompilate di siti (per tutti i piani). I domini non si
// sovrappongono tra categorie diverse; un dominio può comunque essere presente
// anche come singolo sito in `settings.sites`.
const CATEGORIES = [
  { id: "social",   labelKey: "cat_social",   domains: ["facebook.com", "instagram.com", "x.com", "twitter.com", "tiktok.com", "snapchat.com", "pinterest.com", "t.me", "web.whatsapp.com", "discord.com", "reddit.com"] },
  { id: "video",    labelKey: "cat_video",    domains: ["youtube.com", "netflix.com", "primevideo.com", "disneyplus.com", "dailymotion.com", "vimeo.com"] },
  { id: "news",     labelKey: "cat_news",     domains: ["repubblica.it", "corriere.it", "ansa.it", "bbc.com", "cnn.com", "nytimes.com", "theguardian.com", "wired.it"] },
  { id: "adulti",   labelKey: "cat_adulti",   domains: ["pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "redtube.com", "youporn.com", "onlyfans.com"] },
  { id: "gaming",   labelKey: "cat_gaming",   domains: ["twitch.tv", "steamcommunity.com", "epicgames.com", "roblox.com", "chess.com", "lichess.org"] },
  { id: "shopping", labelKey: "cat_shopping", domains: ["amazon.com", "ebay.com", "zalando.it", "subito.it", "etsy.com", "aliexpress.com", "wish.com"] }
];

/* ============================================================
   Configurazione ExtensionPay (pagamenti PRO — sezione 7)
   ============================================================ */

// ID dell'estensione registrata su extensionpay.com (sezione "Extensions" del
// sito). Vuoto = ExtensionPay disabilitato: in sviluppo le funzioni PRO si
// sbloccano solo col toggle in Info (da rimuovere prima della pubblicazione).
// NB: è l'ID registrato su extensionpay.com, NON necessariamente chrome.runtime.id.
const EXT_PAY_ID = "";

// La libreria ExtPay.js (in fondo al progetto) è caricata e l'ID è configurato?
function extpayConfigured() {
  return EXT_PAY_ID !== "" && typeof ExtPay === "function";
}

const DEFAULT_SETTINGS = {
  focusEnabled: true,        // interruttore globale della Modalità Focus
  graceMinutes: 5,           // dopo un "sblocco" il sito resta aperto per N minuti
  sites: [
    { id: 1,  domain: "instagram.com", delay: 5, limitMinutes: 0, mode: "hold",  active: true },
    { id: 2,  domain: "tiktok.com",    delay: 5, limitMinutes: 0, mode: "hold",  active: true },
    { id: 3,  domain: "youtube.com",   delay: 3, limitMinutes: 0, mode: "hold",  active: true },
    { id: 4,  domain: "x.com",         delay: 5, limitMinutes: 0, mode: "hold",  active: true },
    { id: 5,  domain: "facebook.com",  delay: 5, limitMinutes: 0, mode: "hold",  active: true },
    { id: 6,  domain: "reddit.com",    delay: 5, limitMinutes: 0, mode: "hold",  active: true },
    { id: 7,  domain: "netflix.com",   delay: 5, limitMinutes: 0, mode: "hold",  active: true }
  ],
  // configurazione utente delle categorie precompilate (una per id di CATEGORIES)
  categories: CATEGORIES.map(c => ({
    id: c.id, active: false, mode: "hold", delay: 5, limitMinutes: 0,
    ctUntil: 0,        // PRO: epoch ms di fine del blocco "cold turkey" (0 = nessuno)
    schedule: null     // PRO: { days:[1..7], start, end } minuti da mezzanotte
  })),
  theme: "midnight",         // tema fisso (midnight | eink | neon | warm | ocean | sunset) oppure id di un customTheme
  customThemes: [],          // temi salvati dall'utente: [{ id, name, bg, fg, accent }]
  searchEngine: "google",    // motore di ricerca della barra in nuova scheda (chiave di SEARCH_ENGINES)
  showSearch: true,          // mostra/nascondi la barra di ricerca nella nuova scheda
  fontScale: 1.0,            // 0.6 – 1.2
  fontFamily: "sans",        // sans | serif | mono | cursive
  bgImage: "",               // URL di un'immagine di sfondo ("" = nessuna)
  borderRadius: 8,            // arrotondamento dei bordi dell'interfaccia in px (0 – 24)
  cardHover: true,            // animazioni hover sulle card (sollevamento/ingrandimento + alone)
  showSeconds: false,
  lang: "auto",              // lingua dell'interfaccia: "auto" (browser) o codice da LANGUAGES
  pinHash: null,              // SHA-256 del PIN di blocco impostazioni (null = nessun PIN)
  _aT: null                   // firma PRO opaca: solo per disegnare l'interfaccia (vedi isPro)
};

const SUGGESTED_SITES = [
  "instagram.com", "tiktok.com", "youtube.com", "x.com", "twitter.com",
  "facebook.com", "reddit.com", "netflix.com", "twitch.tv", "linkedin.com",
  "pinterest.com", "discord.com", "web.whatsapp.com", "t.me", "snapchat.com",
  "medium.com", "news.ycombinator.com", "9gag.com", "imgur.com", "spotify.com"
];

/* ============================================================
   Storage
   ============================================================ */
async function storageGet(key) {
  const o = await chrome.storage.local.get(key);
  return o[key];
}
async function storageSet(key, val) {
  await chrome.storage.local.set({ [key]: val });
}

async function getSettings() {
  const s = await storageGet("settings");
  if (!s) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const out = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...s, sites: s.sites || [] };
  migrateCustomThemes(out); // aggiorna i dati del vecchio tema Custom, se presenti
  return out;
}
async function setSettings(settings) {
  await storageSet("settings", settings);
}
async function getTodo()    { return (await storageGet("todo")) || []; }
async function setTodo(t)   { await storageSet("todo", t); }
async function getFavorites(){ return (await storageGet("favorites")) || []; }
async function setFavorites(f){ await storageSet("favorites", f); }
async function getStats()   { return (await storageGet("stats")) || emptyStats(); }
function emptyStats()       { return { byDay: {}, blocked: {}, unlocks: {} }; }

function onStorageChange(fn) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") fn(changes);
  });
}

function sendMessage(msg) {
  return chrome.runtime.sendMessage(msg).catch(() => null);
}

/* ============================================================
   Categorie di siti + PRO
   ============================================================ */

// Stato PRO. Il flag locale serve SOLO all'interfaccia (sparire i lucchetti):
// le azioni critiche vengono verificate "live" dal background (verifyProLive,
// con ExtensionPay dalla sezione 7 del TODO). Nome e valore sono opachi di
// proposito e il codice verrà minificato in produzione.
const _PRO_SIG = "_aT";
const _PRO_OK = "x8f9q";

function isPro(settings) {
  return !!(settings && settings[_PRO_SIG] === _PRO_OK);
}

// Configurazione utente di una categoria (default se mai salvata).
function categoryConf(settings, id) {
  const s = settings || {};
  const found = (s.categories || []).find(c => c && c.id === id);
  const def = (CATEGORIES.map(c => ({ id: c.id, active: false, mode: "hold", delay: 5, limitMinutes: 0, ctUntil: 0, schedule: null }))).find(c => c.id === id) || {};
  return { ...def, ...(found || {}) };
}

// Domini EFFETTIVI di una categoria: la lista personalizzata dell'utente (PRO)
// se presente, altrimenti quelli precompilati del registry.
function categoryDomains(settings, catId) {
  const conf = ((settings || {}).categories || []).find(c => c && c.id === catId);
  if (conf && Array.isArray(conf.domains) && conf.domains.length) return conf.domains;
  const reg = CATEGORIES.find(c => c.id === catId);
  return reg ? reg.domains.slice() : [];
}

// Dominio (host spogliato) che corrisponde a una categoria (con i suoi domini
// effettivi), oppure null. `settings` serve per le liste personalizzate (PRO).
function hostCategory(host, settings) {
  const h = bareDomain(String(host || "").toLowerCase());
  if (!h) return null;
  for (const cat of CATEGORIES) {
    const dom = categoryDomains(settings, cat.id).find(d => h === d || h.endsWith("." + d));
    if (dom) return { cat, domain: dom };
  }
  return null;
}

// Secondi accumulati oggi (o nel giorno `key`) su TUTTI i domini effettivi di una
// categoria: il limite giornaliero di categoria è un budget aggregato condiviso.
function categoryUsedSeconds(catId, stats, key, settings) {
  const doms = categoryDomains(settings, catId);
  if (!doms.length || !stats || !stats.byDay) return 0;
  const day = stats.byDay[key || dayKey()] || {};
  return doms.reduce((a, d) => a + (day[d] || 0), 0);
}

// Fascia oraria settimanale attiva adesso? days: 1=lunedì … 7=domenica;
// start/end = minuti da mezzanotte (end escluso, start incluso).
function scheduleActive(sched, d = new Date()) {
  if (!sched || !Array.isArray(sched.days) || !sched.days.length) return false;
  const iso = d.getDay() === 0 ? 7 : d.getDay();
  if (!sched.days.includes(iso)) return false;
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= (Number(sched.start) || 0) && m < (Number(sched.end) || 1440);
}

/* ============================================================
   Temi
   ============================================================ */
const THEMES = {
  midnight: { label: "Midnight", bg: "#232326", fg: "#f2f2f0", accent: "#9db8ff", card: "#2e2e33", muted: "#9a9aa2", border: "#3a3a41" },
  eink:     { label: "E-Ink",    bg: "#f4f1e8", fg: "#1a1a1a", accent: "#1a1a1a", card: "#eae6da", muted: "#6f6a5e", border: "#d8d2c2" },
  neon:     { label: "Neon",     bg: "#0b0320", fg: "#e8e6ff", accent: "#39ff14", card: "#160a33", muted: "#8f8ac2", border: "#2a1a55" },
  warm:     { label: "Warm",     bg: "#241a10", fg: "#f6e7d2", accent: "#e8966a", card: "#32251a", muted: "#b39a7d", border: "#453526" },
  ocean:    { label: "Ocean",    bg: "#0a1c28", fg: "#e3f2fa", accent: "#4fc3f7", card: "#12293a", muted: "#86a7bd", border: "#1d3a4f" },
  sunset:   { label: "Sunset",   bg: "#241421", fg: "#ffe9d6", accent: "#ff8a65", card: "#331c2d", muted: "#c09aa4", border: "#472739" }
};

// Nomi dei temi fissi: i temi custom (salvati dall'utente) vivono in settings.customThemes.
const FIXED_THEMES = ["midnight", "eink", "neon", "warm", "ocean", "sunset"];

// Temi PRO: sfondo in gradiente (due colori) + colori coerenti. Riservati agli
// utenti PRO: i non-PRO possono solo vederli in anteprima (mai persistiti).
// `bg` è il primo stop del gradiente (fallback solido per i componenti).
const PRO_THEMES = {
  "pr-aurora": { label: "Aurora",   bg: "#0b1d3a", grad: ["#0b1d3a", "#4a2a8a"], fg: "#eef2ff", accent: "#9db8ff", card: "#152144", muted: "#97a3c8", border: "#2b3b66" },
  "pr-ember":  { label: "Ember",    bg: "#2a0d0a", grad: ["#2a0d0a", "#8a3412"], fg: "#ffe9d6", accent: "#ffab73", card: "#3d1810", muted: "#c99f88", border: "#5e2f20" },
  "pr-lagoon": { label: "Lagoon",   bg: "#03262e", grad: ["#03262e", "#0a665a"], fg: "#e0fbf4", accent: "#6fe3c1", card: "#0b3038", muted: "#7fbdb2", border: "#1d4a52" },
  "pr-royal":  { label: "Royal",    bg: "#1a0d2e", grad: ["#1a0d2e", "#6a1d56"], fg: "#f6eefb", accent: "#f5c76a", card: "#2a1440", muted: "#c2a8d4", border: "#4a3163" }
};
const PRO_THEME_IDS = Object.keys(PRO_THEMES);

// Motori di ricerca disponibili per la barra di ricerca della nuova scheda.
const SEARCH_ENGINES = {
  google:     { name: "Google",     url: (q) => "https://www.google.com/search?q=" + encodeURIComponent(q) },
  duckduckgo: { name: "DuckDuckGo", url: (q) => "https://duckduckgo.com/?q=" + encodeURIComponent(q) },
  bing:       { name: "Bing",       url: (q) => "https://www.bing.com/search?q=" + encodeURIComponent(q) },
  brave:      { name: "Brave",      url: (q) => "https://search.brave.com/search?q=" + encodeURIComponent(q) }
};

const FONT_FAMILIES = {
  sans:    '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif',
  serif:   'Georgia, "Times New Roman", serif',
  mono:    '"Cascadia Mono", Consolas, "Courier New", monospace',
  cursive: '"Segoe Script", "Comic Sans MS", cursive'
};

function cssRgb(c) { return `rgb(${c.r}, ${c.g}, ${c.b})`; }

// Luminanza (0–1) di un colore CSS "#rrggbb" oppure "rgb(r, g, b)".
function cssLuminance(str) {
  const s = String(str || "").trim();
  let r = 0, g = 0, b = 0;
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const n = parseInt(hex[1], 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(s);
    if (rgb) { r = +rgb[1]; g = +rgb[2]; b = +rgb[3]; }
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function mixColors(a, b, t) {
  // t = 0 → a, t = 1 → b
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t)
  };
}

// Cerca il tema custom attualmente selezionato (se settings.theme è un id custom).
function findCustomTheme(settings) {
  return ((settings && settings.customThemes) || []).find(t => t.id === settings.theme) || null;
}

// Temi custom: card/border/muted derivati per interpolazione tra sfondo e testo.
function customThemeColors(ct) {
  const bg = ct.bg || { r: 43, g: 43, b: 46 };
  const fg = ct.fg || { r: 242, g: 242, b: 240 };
  const accent = ct.accent || fg;
  return {
    bg: cssRgb(bg),
    fg: cssRgb(fg),
    accent: cssRgb(accent),
    card: cssRgb(mixColors(bg, fg, 0.07)),
    muted: cssRgb(mixColors(bg, fg, 0.45)),
    border: cssRgb(mixColors(bg, fg, 0.22)),
    light: cssLuminance(cssRgb(bg)) > 0.55
  };
}

// Solo per dati non ancora migrati: vecchio tema "custom" a due colori (accento = testo).
function legacyCustomThemeColors(settings) {
  const bg = settings.customBg || { r: 43, g: 43, b: 46 };
  const tx = settings.customText || { r: 242, g: 242, b: 240 };
  const lum = (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) / 255;
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const mixRef = lum > 0.55 ? black : white; // testo di contrasto automatico
  return {
    bg: cssRgb(bg),
    fg: cssRgb(tx),
    accent: cssRgb(tx),
    card: cssRgb(mixColors(bg, mixRef, 0.07)),
    muted: cssRgb(mixColors(bg, tx, 0.45)),
    border: cssRgb(mixColors(bg, tx, 0.22)),
    light: lum > 0.55
  };
}

// Colori di un tema PRO (gradiente): --bg resta il primo stop, il gradiente
// completo va in --bg-grad (consumato dal body).
function proThemeColors(t) {
  return { ...t, gradient: true, light: cssLuminance(t.bg) > 0.55 };
}

// Risolve i colori del tema selezionato. `allowProTheme` forza l'uso di un tema
// PRO anche per i non-PRO: serve SOLO all'anteprima nelle impostazioni (nessun
// tema PRO viene mai persistito senza la firma).
function themeColors(settings, allowProTheme) {
  const s = settings || {};
  const ct = findCustomTheme(s);
  if (ct) return customThemeColors(ct);
  const t = THEMES[s.theme];
  if (s.theme === "custom" && !t) return legacyCustomThemeColors(s);
  if (t) return { ...t, light: cssLuminance(t.bg) > 0.55 };
  const tp = PRO_THEMES[s.theme];
  if (tp && (allowProTheme || isPro(s))) return proThemeColors(tp);
  return { ...THEMES.midnight, light: false };
}

function applyTheme(root, settings, allowProTheme) {
  const c = themeColors(settings, allowProTheme);
  const st = root.style;
  st.setProperty("--bg", c.bg);
  st.setProperty("--fg", c.fg);
  st.setProperty("--accent", c.accent);
  st.setProperty("--card", c.card);
  st.setProperty("--muted", c.muted);
  st.setProperty("--border", c.border);

  // tema PRO in gradiente: --bg-grad alimenta il body (sotto l'eventuale --bg-img).
  if (c.gradient && Array.isArray(c.grad) && c.grad.length >= 2) {
    st.setProperty("--bg-grad", `linear-gradient(160deg, ${c.grad[0]}, ${c.grad[1]})`);
  } else {
    st.removeProperty("--bg-grad");
  }

  // immagine di sfondo: l'URL vive dentro url("..."), quindi doppi apici e
  // backslash vengono escapati (e i caratteri di controllo rimossi) per evitare
  // CSS injection; assente/vuoto → nessuna immagine.
  const bgImg = settings && typeof settings.bgImage === "string" ? settings.bgImage.trim() : "";
  if (bgImg) {
    const safe = bgImg.replace(/[\\"]/g, "\\$&").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
    st.setProperty("--bg-img", `url("${safe}")`);
  } else {
    st.removeProperty("--bg-img");
  }

  // arrotondamento dei bordi dell'interfaccia (0 – 24 px; mancante/invalido → 8)
  const rawBr = settings && settings.borderRadius;
  const br = (rawBr == null || rawBr === "") ? NaN : Number(rawBr);
  const radius = Number.isFinite(br) ? Math.min(24, Math.max(0, Math.round(br))) : 8;
  st.setProperty("--border-radius", radius + "px");

  const family = FONT_FAMILIES[settings.fontFamily] || FONT_FAMILIES.sans;
  root.style.setProperty("--app-font", family); // consumato da body: senza, body sovrascriverebbe il font
  root.style.fontFamily = family;
  root.style.fontSize = (16 * (settings.fontScale || 1)) + "px";
  root.style.colorScheme = c.light ? "light" : "dark"; // controlli nativi coerenti col tema

  // animazioni hover sulle card: il toggle (Aspetto → Avanzate) aggiunge/rimuove
  // la classe no-hover su <body>; ogni pagina la riapplica via applyTheme.
  if (document.body) document.body.classList.toggle("no-hover", settings.cardHover === false);
}

/* ============================================================
   Utilità domini / date / testo
   ============================================================ */
function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}
function bareDomain(host) { return host.replace(/^www\./, ""); }
function displayDomain(url) { return bareDomain(hostOf(url)); }

// Normalizza un input libero ("https://www.Instagram.com/p/xyz") → "instagram.com".
// Restituisce "" se non è un dominio valido.
function normalizeDomain(input) {
  let s = String(input || "").trim().toLowerCase();
  if (!s) return "";
  if (!/^https?:\/\//.test(s)) s = "https://" + s;
  let h;
  try { h = new URL(s).hostname; } catch { return ""; }
  h = bareDomain(h);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) return "";
  return h;
}

// Trova la configurazione del sito che corrisponde all'URL (dominio o sottodominio).
function siteFor(url, sites) {
  const host = bareDomain(hostOf(url));
  if (!host) return null;
  return sites.find(s => host === s.domain || host.endsWith("." + s.domain)) || null;
}

// Id univoco per un tema custom (prefisso "ct-").
function newThemeId() {
  return "ct-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Migrazione del vecchio tema "Custom" (due colori: bg + text, accento = testo)
// verso i temi custom con nome e tre colori. Idempotente: non tocca nulla se
// non serve. Muta l'oggetto passato.
function migrateCustomThemes(s) {
  if (!s || s.theme !== "custom" || (Array.isArray(s.customThemes) && s.customThemes.length)) return false;
  const bg = s.customBg || { r: 43, g: 43, b: 46 };
  const tx = s.customText || { r: 242, g: 242, b: 240 };
  const id = newThemeId();
  s.customThemes = [{ id, name: "Custom", bg: { ...bg }, fg: { ...tx }, accent: { ...tx } }];
  s.theme = id;
  delete s.customBg;
  delete s.customText;
  return true;
}

function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function fmtDuration(secs) {
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

function fmtDayLabel(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(localeTag(), { weekday: "short", day: "numeric", month: "numeric" });
}

function fmtShortDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(localeTag(), { day: "numeric", month: "short" });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function randomQuote() {
  const dict = (typeof I18N !== "undefined" && (I18N[uiLang()] || I18N.it)) || {};
  const q = dict.quotes || [];
  return q[Math.floor(Math.random() * q.length)] || "";
}

/* ============================================================
   ToDo
   ============================================================ */
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

function priorityLabel(p) { return t("prio_" + p); }

function dueRank(t) {
  if (!t.due || t.due === "none") return 1e9;
  const today0 = new Date(new Date().toDateString());
  if (t.due === "today") return 0;
  if (t.due === "tomorrow") return 1;
  return (new Date(t.due) - today0) / 86400000;
}

function sortTodo(list) {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const pa = PRIORITY_ORDER[a.priority] ?? 1, pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return dueRank(a) - dueRank(b);
  });
}

function dueLabel(item) {
  if (!item.due || item.due === "none") return "";
  if (item.due === "today") return t("due_label_today");
  if (item.due === "tomorrow") return t("due_label_tomorrow");
  return fmtShortDate(item.due);
}

function isOverdue(t) {
  if (t.done || !t.due || t.due === "none" || t.due === "today" || t.due === "tomorrow") return false;
  return new Date(t.due) < new Date(new Date().toDateString());
}

/* ============================================================
   Statistiche
   ============================================================ */
function addToDay(stats, key, domain, seconds) {
  if (!stats.byDay[key]) stats.byDay[key] = {};
  stats.byDay[key][domain] = (stats.byDay[key][domain] || 0) + seconds;
}
function dayTotalMinutes(stats, key) {
  return totalSeconds(stats.byDay[key] || {}) / 60;
}

// Divide le statistiche di un giorno in due categorie: i siti del Focus
// ("distraenti") e tutto il resto (altri siti web).
function splitByCategory(dayMap, settings) {
  const set = new Set(((settings && settings.sites) || []).map(s => s.domain));
  const distracting = {};
  const other = {};
  for (const k in (dayMap || {})) {
    (set.has(k) ? distracting : other)[k] = dayMap[k];
  }
  return { distracting, other };
}

function totalSeconds(map) {
  let t = 0;
  for (const k in (map || {})) t += (map[k] || 0);
  return t;
}
function sumCounter(stats, counter, startKey, endKey) {
  // somma dei valori del contatore tra due date (incluse)
  let total = 0;
  const cur = new Date(startKey + "T00:00:00");
  const end = new Date(endKey + "T00:00:00");
  while (cur <= end) {
    const k = dayKey(cur);
    total += stats[counter][k] || 0;
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}
