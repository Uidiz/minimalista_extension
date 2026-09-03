// block.js — pagina di blocco: gestisce il "tieni premuto", il limite raggiunto
// e il blocco totale. Dopo lo sblocco reindirizza al sito originale.
"use strict";

const params = new URLSearchParams(location.search);
const TARGET_URL = params.get("u") || "";
const REASON = params.get("r") || "hold"; // hold | limit | block

const RING_C = 2 * Math.PI * 54;

let settings = null;
let delay = 5;
let holding = false;
let rafId = 0;
let startTs = 0;

const el = (id) => document.getElementById(id);

async function init() {
  settings = await getSettings();
  setUILang(settings.lang);
  applyI18n(document);
  applyTheme(document.documentElement, settings);

  const domain = displayDomain(TARGET_URL) || t("block_domain_fallback");
  el("domain").textContent = domain;
  el("avatar").textContent = domain.charAt(0).toUpperCase();
  el("quote").textContent = randomQuote();
  el("backBtn").addEventListener("click", goBack);

  const site = siteFor(TARGET_URL, settings.sites);
  if (site && site.delay >= 1) delay = site.delay;

  const ring = el("ringProgress");
  ring.style.strokeDasharray = `${RING_C} ${RING_C}`;
  ring.style.strokeDashoffset = RING_C;

  if (REASON === "limit") {
    const used = await usageToday(site ? site.domain : null);
    el("message").textContent = t("block_limit_msg", { time: fmtDuration(used) });
    showLocked("⏳");
  } else if (REASON === "block") {
    el("message").textContent = t("block_blocked_msg");
    showLocked("🔒");
  } else {
    const word = delay === 1 ? t("hold_second") : t("hold_seconds");
    el("message").textContent = t("block_hold_msg", { n: delay, word });
    setupHold();
  }
}

async function usageToday(domain) {
  if (!domain) return 0;
  const stats = await getStats();
  return (stats.byDay[dayKey()] && stats.byDay[dayKey()][domain]) || 0;
}

function showLocked(icon) {
  el("holdBtn").hidden = true;
  const li = el("lockedIcon");
  li.hidden = false;
  li.textContent = icon;
  el("ringProgress").style.strokeDasharray = "0 0"; // niente anello di avanzamento
}

/* ============================================================
   "Tieni premuto" — anello di avanzamento
   ============================================================ */
function setupHold() {
  const btn = el("holdBtn");
  const secsEl = el("holdSecs");
  const ring = el("ringProgress");
  secsEl.textContent = delay; // mostra subito il numero giusto, non il placeholder

  const frame = (ts) => {
    if (!holding) return;
    if (!startTs) startTs = ts;
    const p = Math.min(1, (ts - startTs) / (delay * 1000));
    ring.style.strokeDashoffset = RING_C * (1 - p);
    secsEl.textContent = Math.max(0, Math.ceil(delay * (1 - p)));
    if (p >= 1) { unlock(); return; }
    rafId = requestAnimationFrame(frame);
  };

  const start = (e) => {
    if (REASON !== "hold") return;
    holding = true;
    startTs = 0;
    btn.classList.add("holding");
    rafId = requestAnimationFrame(frame);
  };

  const cancel = () => {
    if (!holding) return;
    holding = false;
    cancelAnimationFrame(rafId);
    ring.style.strokeDashoffset = RING_C;
    secsEl.textContent = delay;
    btn.classList.remove("holding");
  };

  btn.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return; // solo tasto sinistro / tocco
    try { btn.setPointerCapture(e.pointerId); } catch {}
    start(e);
  });
  btn.addEventListener("pointerup", () => { if (!holding) return; cancel(); });
  btn.addEventListener("pointercancel", cancel);
  btn.addEventListener("lostpointercapture", cancel);

  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}

async function unlock() {
  holding = false;
  cancelAnimationFrame(rafId);
  const btn = el("holdBtn");
  btn.classList.remove("holding");
  btn.classList.add("done");
  el("holdLabel").textContent = t("open");
  el("ringProgress").style.strokeDashoffset = 0;

  let tabId = null;
  try {
    const tab = await chrome.tabs.getCurrent();
    tabId = tab ? tab.id : null;
  } catch { /* ignora */ }

  if (tabId != null) await sendMessage({ type: "unlock", tabId });
  // dopo la risposta il background ha già concesso il periodo di grazia,
  // quindi questa navigazione non verrà re-intercettata.
  location.replace(TARGET_URL);
}

function goBack() {
  if (history.length > 1) history.back();
  else location.href = chrome.runtime.getURL("dashboard.html");
}

init();
