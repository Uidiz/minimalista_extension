// common.js — funzioni e costanti condivise tra tutte le pagine dell'estensione.
"use strict";

/* ============================================================
   Impostazioni di default
   ============================================================ */
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
  theme: "midnight",         // tema fisso (midnight | eink | neon | warm | ocean | sunset) oppure id di un customTheme
  customThemes: [],          // temi salvati dall'utente: [{ id, name, bg, fg, accent }]
  searchEngine: "google",    // motore di ricerca della barra in nuova scheda (chiave di SEARCH_ENGINES)
  showSearch: true,          // mostra/nascondi la barra di ricerca nella nuova scheda
  fontScale: 1.0,            // 0.6 – 1.2
  fontFamily: "sans",        // sans | serif | mono | cursive
  showSeconds: false,
  lang: "auto",              // lingua dell'interfaccia: "auto" (browser) o codice da LANGUAGES
  pinHash: null              // SHA-256 del PIN di blocco impostazioni (null = nessun PIN)
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

function themeColors(settings) {
  const ct = findCustomTheme(settings);
  if (ct) return customThemeColors(ct);
  const t = THEMES[settings.theme];
  if (settings && settings.theme === "custom" && !t) return legacyCustomThemeColors(settings);
  return t ? { ...t, light: cssLuminance(t.bg) > 0.55 } : { ...THEMES.midnight, light: false };
}

function applyTheme(root, settings) {
  const c = themeColors(settings);
  const st = root.style;
  st.setProperty("--bg", c.bg);
  st.setProperty("--fg", c.fg);
  st.setProperty("--accent", c.accent);
  st.setProperty("--card", c.card);
  st.setProperty("--muted", c.muted);
  st.setProperty("--border", c.border);
  const family = FONT_FAMILIES[settings.fontFamily] || FONT_FAMILIES.sans;
  root.style.setProperty("--app-font", family); // consumato da body: senza, body sovrascriverebbe il font
  root.style.fontFamily = family;
  root.style.fontSize = (16 * (settings.fontScale || 1)) + "px";
  root.style.colorScheme = c.light ? "light" : "dark"; // controlli nativi coerenti col tema
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
