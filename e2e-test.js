// e2e-test.js — test end-to-end dell'estensione.
// Chrome 137+ ha rimosso --load-extension dal Chrome "branded", quindi l'estensione
// viene caricata tramite la vera interfaccia chrome://extensions (modalità sviluppatore
// → "Carica estensione non pacchettizzata"), come farebbe un utente.
//
// Verifica: 1) caricamento, 2) intercettazione di un sito configurato,
// 3) il flusso "tieni premuto" con mouse reale, 4) il limite giornaliero (alla navigazione
//    e, a pagina aperta, il blocco automatico), 5) il rendering della dashboard,
//    6) i temi custom (creazione/eliminazione).
// Richiede Node >= 22 (fetch + WebSocket globali).
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ensureCfT } = require("./tools/setup-cft.cjs");

const CHROME = process.env.CHROME_BIN; // eventuale override
const EXT = path.resolve(__dirname);
const PORT = 9333;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "minimalista-test-"));

let chromeProc = null;
let ws = null;
let seq = 0;
const pending = new Map();
const sessions = new Map(); // targetId -> sessionId
const eventHandlers = [];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJson(p) {
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`);
  return res.json();
}

function cdp(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout: ${method}`));
    }, 25000);
    pending.set(id, { resolve, reject, timer });
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    ws.send(JSON.stringify(msg));
  });
}

function onWsMessage(ev) {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    clearTimeout(pending.get(m.id).timer);
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(`${m.error.message} (${m.error.code})`));
    else resolve(m.result);
    return;
  }
  if (m.method) {
    for (const h of eventHandlers) {
      try { h(m.method, m.params); } catch { /* ignora */ }
    }
  }
}

async function attach(targetId) {
  const { sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true });
  sessions.set(targetId, sessionId);
  await cdp("Runtime.enable", {}, sessionId);
  await cdp("Page.enable", {}, sessionId).catch(() => {});
  return sessionId;
}

async function evaluate(sessionId, expression) {
  const res = await cdp("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  }, sessionId);
  if (res.exceptionDetails) {
    throw new Error("evaluate: " + JSON.stringify(res.exceptionDetails.exception || res.exceptionDetails.text));
  }
  return res.result.value;
}

async function createTarget(url) {
  const { targetId } = await cdp("Target.createTarget", { url });
  return targetId;
}

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

async function waitFor(fn, timeoutMs = 15000, step = 400) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch { /* riprova */ }
    if (Date.now() - start > timeoutMs) return null;
    await sleep(step);
  }
}

/* ============================================================
   Test
   ============================================================ */
async function findExtensionId() {
  // l'id è esposto come attributo di <extensions-item> in chrome://extensions
  const extTarget = await createTarget("chrome://extensions/");
  const extSess = await attach(extTarget);
  const id = await waitFor(async () => {
    const r = await evaluate(extSess, `(() => {
      const walk = root => {
        for (const el of root.querySelectorAll('*')) {
          if (el.tagName === 'EXTENSIONS-ITEM' && el.getAttribute('id')) return el.getAttribute('id');
        }
        for (const el of root.querySelectorAll('*')) if (el.shadowRoot) {
          const r = walk(el.shadowRoot);
          if (r) return r;
        }
        return null;
      };
      return walk(document);
    })()`);
    return r || null;
  }, 15000);
  // fallback: registrazione in Preferences
  if (!id) {
    return waitFor(async () => {
      const prefPath = path.join(PROFILE, "Default", "Preferences");
      try {
        const prefs = JSON.parse(fs.readFileSync(prefPath, "utf8"));
        const settings = (prefs.extensions && prefs.extensions.settings) || {};
        for (const [eid, info] of Object.entries(settings)) {
          if ((info.path || "").replace(/\\/g, "/").toLowerCase().includes("minimalista")) return eid;
        }
      } catch { /* Preferences non ancora scritto */ }
      return null;
    }, 10000);
  }
  return id;
}

async function main() {
  // Chrome for Testing (unbranded) supporta --load-extension anche con Chrome 137+
  const chromeBin = CHROME || await ensureCfT();
  console.log("Avvio Chrome di test (finestra piccola visibile):", chromeBin);
  chromeProc = spawn(chromeBin, [
    "--no-first-run", "--no-default-browser-check",
    // finestra piccola e visibile: gli eventi mouse via CDP (e il hit-testing)
    // non funzionano con la finestra fuori schermo
    "--window-position=0,0", "--window-size=1000,700",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    `--user-data-dir=${PROFILE}`,
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    `--remote-debugging-port=${PORT}`,
    "about:blank"
  ], { stdio: "ignore" });

  let version;
  for (let i = 0; i < 60 && !version; i++) {
    try { version = await fetchJson("/json/version"); } catch { await sleep(500); }
  }
  if (!version) throw new Error("CDP non raggiungibile: Chrome non è partito");

  ws = new WebSocket(version.webSocketDebuggerUrl);
  ws.onmessage = onWsMessage;
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws error")); });

  /* ---------- 1. carica l'estensione via --load-extension ---------- */
  console.log("1. Caricamento estensione (--load-extension)");
  const extId = await findExtensionId();
  check("estensione caricata e registrata (id: " + (extId || "?") + ")", !!extId);
  if (!extId) {
    throw new Error(
      "estensione non caricata: questo Chrome non supporta --load-extension. " +
      "Installa Chrome for Testing (o imposta CHROME_BIN) e riprova."
    );
  }
  const pageUrl = (p) => `chrome-extension://${extId}/${p}`;

  /* ---------- 2. configura un sito di test ---------- */
  console.log("2. Configurazione sito di test (example.com, tieni premuto 2s)");
  const opt = await createTarget(pageUrl("options.html"));
  const optSess = await attach(opt);
  const extReady = await waitFor(async () => {
    const ok = await evaluate(optSess, "typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined' && location.href.includes('options.html')");
    return ok || null;
  });
  check("pagina impostazioni caricata con API estensione", !!extReady);
  if (!extReady) throw new Error("la pagina options non è diventata un contesto estensione");

  // la pagina impostazioni deve mostrare il sito appena configurato + le sezioni
  const siteRow = await waitFor(async () => {
    const n = await evaluate(optSess, "document.querySelectorAll('.site-row').length");
    return n >= 1 ? n : null;
  });
  check("impostazioni: righe dei siti renderizzate", !!siteRow, "righe: " + siteRow);
  const themeCards = await waitFor(async () => {
    const n = await evaluate(optSess, "document.querySelectorAll('#themeGrid .theme-card').length");
    return n === 7 ? n : null;
  });
  check("impostazioni: 7 temi disponibili", !!themeCards, "temi: " + themeCards);

  const configured = await evaluate(optSess, `(async () => {
    const settings = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    settings.focusEnabled = true;
    settings.graceMinutes = 5;
    // lingua fissata a italiano: i controlli dei messaggi qui sotto assumono l'italiano
    settings.lang = "it";
    settings.sites = [{ id: 1, domain: "example.com", delay: 2, limitMinutes: 0, mode: "hold", active: true }];
    const resp = await chrome.runtime.sendMessage({ type: "saveSettings", settings });
    return resp && resp.ok;
  })()`);
  check("impostazioni salvate (via message, sanitizzate)", configured === true);

  /* ---------- 3. intercettazione ---------- */
  console.log("3. Intercettazione della navigazione");
  const tab = await createTarget("about:blank");
  const tabSess = await attach(tab);
  await sleep(400);
  await cdp("Page.navigate", { url: "https://example.com/" }, tabSess);

  const blockUrl = await waitFor(async () => {
    const href = await evaluate(tabSess, "location.href");
    return href.includes("block.html") ? href : null;
  });
  check("tab reindirizzato alla pagina di blocco", !!blockUrl, blockUrl || "blocco non attivato");

  const holdBtnReady = await waitFor(async () => {
    const ok = await evaluate(tabSess, "!!document.getElementById('holdBtn') && !document.getElementById('holdBtn').hidden");
    return ok || null;
  });
  check("pagina di blocco pronta con pulsante 'tieni premuto'", !!holdBtnReady);

  const msg = await evaluate(tabSess, "document.getElementById('message').textContent");
  check("messaggio 'tieni premuto' mostrato", /Tieni premuto/i.test(msg), msg);

  /* ---------- 4. tieni premuto (mouse reale via CDP) ---------- */
  console.log("4. Tieni premuto per sbloccare");
  await cdp("Page.bringToFront", {}, tabSess);
  await sleep(400);
  const rect = await evaluate(tabSess, `(() => {
    const r = document.getElementById('holdBtn').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y }, tabSess);
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", buttons: 1, clickCount: 1 }, tabSess);
  await sleep(3200); // > 2s di hold
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", buttons: 0, clickCount: 1 }, tabSess);

  const unlocked = await waitFor(async () => {
    const href = await evaluate(tabSess, "location.href");
    return href.startsWith("https://example.com") ? href : null;
  });
  check("dopo il hold il sito si apre", !!unlocked, unlocked || "nessuna navigazione verso example.com");

  /* ---------- 5. limite giornaliero ---------- */
  console.log("5. Limite giornaliero");
  await evaluate(optSess, `(async () => {
    const settings = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    settings.sites = settings.sites.map(s => ({ ...s, limitMinutes: 1 }));
    await chrome.runtime.sendMessage({ type: "saveSettings", settings });
    const d = new Date();
    const today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    await chrome.storage.local.set({ stats: { byDay: { [today]: { "example.com": 99999 } }, blocked: {}, unlocks: {} } });
    return true;
  })()`);
  await sleep(500);
  await cdp("Page.navigate", { url: "https://example.com/" }, tabSess);

  const limitUrl = await waitFor(async () => {
    const href = await evaluate(tabSess, "location.href");
    return href.includes("block.html") && href.includes("r=limit") ? href : null;
  });
  check("superato il limite → blocco con motivo 'limit'", !!limitUrl);

  const limitMsg = await waitFor(async () => {
    const m = await evaluate(tabSess, "document.getElementById('message') ? document.getElementById('message').textContent : ''");
    return /limite/i.test(m) ? m : null;
  });
  check("messaggio di limite raggiunto mostrato", !!limitMsg, limitMsg || "nessun messaggio");

  const noHold = await evaluate(tabSess, "document.getElementById('holdBtn').hidden");
  check("nessun pulsante 'tieni premuto' (non si può sbloccare)", noHold === true);

  /* ---------- 5b. blocco automatico al superamento del limite ---------- */
  console.log("5b. Limite superato a pagina aperta → blocco automatico");
  await evaluate(optSess, `(async () => {
    const settings = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    settings.sites = settings.sites.map(s => ({ ...s, limitMinutes: 0 }));
    await chrome.runtime.sendMessage({ type: "saveSettings", settings });
    return true;
  })()`);
  const tab2 = await evaluate(optSess, `(async () => {
    const t = await chrome.tabs.create({ url: "about:blank" });
    // grazia per questo tab: senza, il sito verrebbe intercettato con motivo "hold"
    await chrome.runtime.sendMessage({ type: "unlock", tabId: t.id });
    await chrome.tabs.update(t.id, { url: "https://example.com/" });
    return t.id;
  })()`);
  const opened = await waitFor(async () => {
    const url = await evaluate(optSess, `(async () => (await chrome.tabs.get(${tab2})).url || "")()`);
    return url.startsWith("https://example.com") ? url : null;
  }, 15000);
  check("nuova scheda aperta su example.com (senza limite)", !!opened, (opened || "").slice(0, 48));
  if (opened) {
    // imposta un limite già superato mentre la pagina è aperta: nessun reload
    await evaluate(optSess, `(async () => {
      const settings = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
      settings.sites = settings.sites.map(s => ({ ...s, limitMinutes: 1 }));
      await chrome.runtime.sendMessage({ type: "saveSettings", settings });
      const d = new Date();
      const today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      await chrome.storage.local.set({ stats: { byDay: { [today]: { "example.com": 99999 } }, blocked: {}, unlocks: {} } });
      return true;
    })()`);
    const autoBlock = await waitFor(async () => {
      const url = await evaluate(optSess, `(async () => (await chrome.tabs.get(${tab2})).url || "")()`);
      return url.includes("block.html") && url.includes("r=limit") ? url : null;
    }, 45000, 500);
    check("limite superato a pagina aperta → blocco automatico senza ricaricare", !!autoBlock, autoBlock || "nessun blocco entro 45 s");
  }

  /* ---------- 6. dashboard ---------- */
  console.log("6. Dashboard (nuova scheda)");
  // un todo scaduto in archivio: prima del fix il rendering crashava con "t is not a function"
  await evaluate(optSess, `(async () => {
    await chrome.storage.local.set({ todo: [{ id: 42, text: "Overdue task", done: false, priority: "high", due: "2020-01-01" }] });
    return true;
  })()`);
  const dash = await createTarget(pageUrl("dashboard.html"));
  const dashSess = await attach(dash);
  await waitFor(async () => {
    const ok = await evaluate(dashSess, "typeof chrome !== 'undefined' && location.href.includes('dashboard.html')");
    return ok || null;
  });
  const clockOk = await waitFor(async () => {
    const c = await evaluate(dashSess, "document.getElementById('clock').textContent");
    return /^\d{2}:\d{2}/.test(c) ? c : null;
  });
  check("orologio renderizzato", !!clockOk, clockOk || "orologio mancante");
  const focusOn = await evaluate(dashSess, "document.getElementById('focusToggle').checked");
  check("toggle focus attivo sulla dashboard", focusOn === true);
  const todayLine = await evaluate(dashSess, "document.getElementById('todayStats').textContent");
  check("statistiche del giorno visibili", /tentativi bloccati/.test(todayLine), todayLine.trim().slice(0, 60));

  const overdueChip = await waitFor(async () => {
    const r = await evaluate(dashSess, `(() => {
      const chip = document.querySelector('.todo-item .chip.late');
      return chip ? chip.textContent : null;
    })()`);
    return r && r.indexOf("ritardo") >= 0 ? r : null;
  });
  check("todo scaduto renderizzato senza crash (chip 'in ritardo')", !!overdueChip, (overdueChip || "").trim().slice(0, 40));

  // il dialog di modifica deve apparire centrato nello schermo
  const editDialog = await waitFor(async () => {
    const r = await evaluate(dashSess, `(() => {
      const btn = document.querySelector('.todo-item .t-edit');
      if (!btn) return null;
      btn.click();
      const d = document.getElementById('todoDialog');
      const wasOpen = d.open;
      const b = d.getBoundingClientRect();
      const cx = (b.left + b.right) / 2;
      const cy = (b.top + b.bottom) / 2;
      document.getElementById('dCancel').click(); // richiude il modal
      return { open: wasOpen, dx: Math.abs(cx - window.innerWidth / 2), dy: Math.abs(cy - window.innerHeight / 2) };
    })()`);
    return r && r.open ? r : null;
  });
  check("dialog modifica task centrato nello schermo", !!editDialog && editDialog.dx < 30 && editDialog.dy < 40, editDialog ? JSON.stringify(editDialog) : "");

  // le textbox devono avere padding reale (niente testo attaccato ai bordi)
  const pad = (id) => evaluate(dashSess, `(() => {
    const el0 = document.getElementById('${id}');
    return el0 ? getComputedStyle(el0).paddingLeft : null;
  })()`);
  const todoPad = await pad("todoInput");
  const searchPad = await pad("searchInput");
  check("textbox todo con padding (testo non attaccato)", /px$/.test(todoPad || "") && todoPad !== "0px", "paddingLeft: " + todoPad);
  check("textbox di ricerca con padding", /px$/.test(searchPad || "") && searchPad !== "0px", "paddingLeft: " + searchPad);

  /* ---------- 6b. widget ricerca nascondibile dalle impostazioni ---------- */
  console.log("6b. Widget di ricerca visibile/nascosto");
  await evaluate(optSess, `(async () => {
    const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    s.showSearch = false;
    await chrome.runtime.sendMessage({ type: "saveSettings", settings: s });
    return true;
  })()`);
  const searchHidden = await waitFor(async () => {
    const h = await evaluate(dashSess, "document.getElementById('searchCard').hidden");
    return h === true ? true : null;
  });
  check("barra di ricerca nascosta dalle impostazioni", searchHidden === true);
  await evaluate(optSess, `(async () => {
    const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    s.showSearch = true;
    await chrome.runtime.sendMessage({ type: "saveSettings", settings: s });
    return true;
  })()`);
  const searchShown = await waitFor(async () => {
    const h = await evaluate(dashSess, "document.getElementById('searchCard').hidden");
    return h === false ? true : null;
  });
  check("barra di ricerca di nuovo visibile", searchShown === true);

  /* ---------- 7. popup ---------- */
  console.log("7. Popup");
  const pop = await createTarget(pageUrl("popup.html"));
  const popSess = await attach(pop);
  const popReady = await waitFor(async () => {
    const ok = await evaluate(popSess, "typeof chrome !== 'undefined' && !!document.getElementById('today')");
    return ok || null;
  });
  check("popup caricato", !!popReady);
  const popStats = await waitFor(async () => {
    const t = await evaluate(popSess, "document.getElementById('today').textContent");
    return /tentativi bloccati/.test(t) ? t : null;
  });
  check("popup mostra le statistiche di oggi", !!popStats, (popStats || "").trim().slice(0, 60));

  /* ---------- 8. selezione tema (evidenziazione) + cambio lingua ---------- */
  console.log("8. Selezione tema e cambio lingua");
  // 8a. clic su una card tema → l'evidenziazione si sposta sul tema scelto
  const themeClicked = await waitFor(async () => {
    const r = await evaluate(optSess, `(() => {
      const card = document.querySelector('#themeGrid .theme-card[data-theme="eink"]');
      if (!card) return null;
      card.click();
      return true;
    })()`);
    return r || null;
  });
  check("click su una card tema (eink)", !!themeClicked);
  const themeSelected = await waitFor(async () => {
    const sel = await evaluate(optSess, `(() => {
      const c = document.querySelector('#themeGrid .theme-card.selected');
      return c ? c.dataset.theme : null;
    })()`);
    return sel === "eink" ? sel : null;
  });
  check("l'evidenziazione segue il tema selezionato", themeSelected === "eink", "selezionato: " + themeSelected);
  const storedTheme = await evaluate(optSess, `(async () => {
    const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    return s.theme;
  })()`);
  check("tema persistito nello storage", storedTheme === "eink", "theme: " + storedTheme);

  // 8b. cambio lingua → le pagine aperte si traducono
  const langSaved = await evaluate(optSess, `(async () => {
    const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    s.lang = "en";
    const resp = await chrome.runtime.sendMessage({ type: "saveSettings", settings: s });
    return resp && resp.ok;
  })()`);
  check("lingua salvata (en)", langSaved === true);
  const navApp = await waitFor(async () => {
    const txt = await evaluate(optSess, `(() => {
      const btn = document.querySelector('nav button[data-sec="appearance"]');
      return btn ? btn.textContent.trim() : "";
    })()`);
    return txt === "Appearance" ? txt : null;
  });
  check("impostazioni tradotte in inglese (Aspetto → Appearance)", !!navApp, navApp || "testo non tradotto");
  const dashSettings = await waitFor(async () => {
    const txt = await evaluate(dashSess, `(() => {
      const a = document.getElementById('settingsLink');
      return a ? a.textContent.trim() : "";
    })()`);
    return txt === "Settings" ? txt : null;
  });
  check("dashboard tradotta in inglese (Impostazioni → Settings)", !!dashSettings, dashSettings || "testo non tradotto");

  /* ---------- 9. temi custom ---------- */
  console.log("9. Temi custom (creazione con nome, editor, eliminazione)");
  const customSaved = await waitFor(async () => {
    await evaluate(optSess, `(() => {
      openCustomEditor(null);
      el("ctName").value = "Test Theme";
      setColorInputs("bg", { r: 12, g: 34, b: 56 });
      setColorInputs("fg", { r: 240, g: 240, b: 240 });
      setColorInputs("accent", { r: 255, g: 100, b: 50 });
      saveCustomTheme();
      return true;
    })()`);
    const r = await evaluate(optSess, `(async () => {
      const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
      const t = s.customThemes && s.customThemes.find(ct => ct.name === "Test Theme");
      return t && s.theme === t.id ? { id: t.id, bg: t.bg, accent: t.accent } : null;
    })()`);
    return r || null;
  });
  check("tema custom salvato con nome e 3 colori", !!customSaved, customSaved ? JSON.stringify(customSaved) : "");

  let customSelected = false;
  let customDeleted = false;
  if (customSaved) {
    customSelected = !!(await waitFor(async () => {
      const r = await evaluate(optSess, `(() => {
        const card = document.querySelector('#themeGrid .theme-card.custom[data-theme="${customSaved.id}"]');
        if (!card) return null;
        return card.classList.contains("selected")
          && !document.getElementById("customEditor").hidden
          && !document.getElementById("ctDelete").hidden;
      })()`);
      return r || null;
    }));
    check("tema custom selezionato con editor aperto", customSelected === true);

    customDeleted = !!(await waitFor(async () => {
      const r = await evaluate(optSess, `(async () => {
        window.confirm = () => true;
        const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
        const t = s.customThemes.find(ct => ct.name === "Test Theme");
        if (!t) return null;
        removeCustomTheme(t.id);
        await new Promise(r => setTimeout(r, 600));
        const s2 = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
        return s2.customThemes.length === 0 && s2.theme === "midnight" ? true : null;
      })()`);
      return r || null;
    }));
    check("tema custom eliminato (torna a Midnight)", customDeleted === true);
  }

  /* ---------- 10. tipografia: cambio stile font ---------- */
  console.log("10. Tipografia: il cambio di stile font viene applicato");
  const fontApplied = await waitFor(async () => {
    await evaluate(optSess, `(() => {
      const sel = document.getElementById('fontFamily');
      sel.value = 'mono';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    const ff = await evaluate(optSess, "getComputedStyle(document.body).fontFamily");
    return /cascadia|consolas|courier/i.test(ff) ? ff : null;
  });
  check("cambio stile font applicato subito (monospace)", !!fontApplied, fontApplied || "");
  const dashFont = await waitFor(async () => {
    const ff = await evaluate(dashSess, "getComputedStyle(document.body).fontFamily");
    return /cascadia|consolas|courier/i.test(ff) ? ff : null;
  });
  check("font aggiornato anche nella dashboard già aperta", !!dashFont, dashFont || "");

  /* ---------- 11. personalizzazione avanzata: sfondo + arrotondamento ---------- */
  console.log("11. Personalizzazione avanzata (immagine di sfondo e arrotondamento)");
  // la lingua è ancora "en" (sezione 8b): la card deve risultare tradotta
  const advTitle = await evaluate(optSess, `(() => {
    const cards = [...document.querySelectorAll('#sec-appearance .card')];
    const card = cards.find(c => {
      const h = c.querySelector('h2');
      return h && h.dataset.i18n === 'advanced_title';
    });
    return card ? card.querySelector('h2').textContent.trim() : '';
  })()`);
  check("card 'Avanzate' presente in Aspetto (tradotta: Advanced)", advTitle === "Advanced", advTitle || "card mancante");

  const advControls = await evaluate(optSess, `(() => {
    const bg = document.getElementById('bgImage');
    const r = document.getElementById('borderRadius');
    return !!(bg && r && document.getElementById('borderRadiusVal')
      && document.getElementById('borderRadiusReset')
      && r.min === '0' && r.max === '24' && r.step === '1' && r.value === '8');
  })()`);
  check("controlli avanzati renderizzati (URL sfondo, slider 0–24, valore, reset)", advControls === true);

  // 11a. slider: input → anteprima live, change → salvataggio
  const liveRadius = await waitFor(async () => {
    await evaluate(optSess, `(() => {
      const r = document.getElementById('borderRadius');
      r.value = '20';
      r.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    const v = await evaluate(optSess, `(() => {
      const cssVar = document.documentElement.style.getPropertyValue('--border-radius').trim();
      const val = document.getElementById('borderRadiusVal').textContent;
      const card = document.querySelector('#sec-appearance .card');
      return cssVar === '20px' && val === '20px'
        && getComputedStyle(card).borderRadius === '26px'          // card = radius + 6px
        && getComputedStyle(document.getElementById('bgImage')).borderRadius === '20px'
        ? true : null;
    })()`);
    return v || null;
  });
  check("anteprima live arrotondamento (var 20px, card 26px, input 20px)", liveRadius === true);

  await evaluate(optSess, `(() => {
    const r = document.getElementById('borderRadius');
    r.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  const radiusSaved = await waitFor(async () => {
    const s = await evaluate(optSess, `(async () => (await new Promise(r => chrome.storage.local.get('settings', o => r(o.settings || {})))).borderRadius)()`);
    return s === 20 ? s : null;
  });
  check("arrotondamento persistito (storage borderRadius = 20)", radiusSaved === 20);

  const dashRadius = await waitFor(async () => {
    const v = await evaluate(dashSess, "document.documentElement.style.getPropertyValue('--border-radius').trim()");
    return v === '20px' ? v : null;
  });
  check("dashboard già aperta aggiornata in tempo reale (--border-radius 20px)", dashRadius === "20px", dashRadius || "");

  // 11b. reset → torna a 8 (UI + storage)
  const resetRadius = await waitFor(async () => {
    await evaluate(optSess, `(() => { document.getElementById('borderRadiusReset').click(); return true; })()`);
    const ui = await evaluate(optSess, `(() => {
      const r = document.getElementById('borderRadius');
      return r.value === '8' && document.getElementById('borderRadiusVal').textContent === '8px' ? true : null;
    })()`);
    if (!ui) return null;
    const s = await evaluate(optSess, `(async () => (await new Promise(r => chrome.storage.local.get('settings', o => r(o.settings || {})))).borderRadius)()`);
    return s === 8 ? true : null;
  });
  check("reset arrotondamento → 8px (slider, etichetta e storage)", resetRadius === true);

  // 11c. immagine di sfondo: anteprima live, persistenza, propagazione alla dashboard
  const bgLive = await waitFor(async () => {
    await evaluate(optSess, `(() => {
      const bg = document.getElementById('bgImage');
      bg.value = 'https://example.com/bg.png';
      bg.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    const ok = await evaluate(optSess, `(() => {
      const v = document.documentElement.style.getPropertyValue('--bg-img');
      return v === 'url("https://example.com/bg.png")' ? true : null;
    })()`);
    return ok || null;
  });
  check("anteprima live sfondo (--bg-img url corretta)", bgLive === true);
  await evaluate(optSess, `(() => {
    const bg = document.getElementById('bgImage');
    bg.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  const bgSaved = await waitFor(async () => {
    const s = await evaluate(optSess, `(async () => (await new Promise(r => chrome.storage.local.get('settings', o => r(o.settings || {})))).bgImage)()`);
    return s === 'https://example.com/bg.png' ? s : null;
  });
  check("immagine di sfondo persistita (storage bgImage)", bgSaved === "https://example.com/bg.png", bgSaved || "");
  const bgApplied = await waitFor(async () => {
    const ok = await evaluate(dashSess, `(() => {
      const v = document.documentElement.style.getPropertyValue('--bg-img');
      return v === 'url("https://example.com/bg.png")' ? true : null;
    })()`);
    return ok || null;
  });
  check("sfondo applicato anche alla dashboard già aperta", bgApplied === true);

  // 11d. l'URL dello sfondo non deve permettere CSS injection (doppi apici escapati)
  // 11d. l'URL dello sfondo non deve permettere CSS injection: i doppi apici interni
  // vengono escapati, quindi lo sfondo resta un unico url(...) e non nasce alcuna
  // nuova dichiarazione (es. un background-color rosso).
  const noInjection = await evaluate(optSess, `(() => {
    const bg = document.getElementById('bgImage');
    bg.value = 'https://example.com/x");background:red;color:red;/*';
    bg.dispatchEvent(new Event('input', { bubbles: true }));
    const bgImg = getComputedStyle(document.body).backgroundImage;
    const bgColor = getComputedStyle(document.body).backgroundColor;
    return bgColor !== 'rgb(255, 0, 0)' && bgColor !== 'red'
      && bgImg.indexOf('example.com') >= 0   // lo sfondo è ancora l'immagine richiesta
      && bgImg.indexOf('background:red') >= 0 // …con l'intero testo dentro l'url() (non troncato)
      ? true : null;
  })()`);
  check("URL con doppi apici non genera CSS injection", noInjection === true);

  // pulizia: rimuove l'anteprima iniettata e ripristina lo stato pulito
  await evaluate(optSess, `(() => {
    const bg = document.getElementById('bgImage');
    bg.value = '';
    bg.dispatchEvent(new Event('input', { bubbles: true }));
    bg.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);

  // 11e. sanitizzazione lato background: clamp 0–24 e trim dell'URL
  const sanitized = await evaluate(optSess, `(async () => {
    const s = await new Promise(r => chrome.storage.local.get('settings', o => r(o.settings || {})));
    s.borderRadius = 99;
    s.bgImage = '   https://example.com/bg.png   ';
    const resp = await chrome.runtime.sendMessage({ type: 'saveSettings', settings: s });
    await new Promise(r => setTimeout(r, 600));
    const s2 = await new Promise(r => chrome.storage.local.get('settings', o => r(o.settings || {})));
    return resp && resp.ok ? { br: s2.borderRadius, bg: s2.bgImage } : null;
  })()`);
  check("sanitizzazione: borderRadius clampato a 24, bgImage trimmata", !!sanitized && sanitized.br === 24 && sanitized.bg === "https://example.com/bg.png", sanitized ? JSON.stringify(sanitized) : "");

  /* ---------- 12. categorie + PRO (cold turkey, fasce orarie) ---------- */
  console.log("12. Categorie di siti e funzioni PRO");
  // stato noto: un solo sito singolo (example.com, id 1) + nessuna categoria attiva
  await evaluate(optSess, `(async () => {
    const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    s.sites = [{ id: 1, domain: "example.com", delay: 2, limitMinutes: 0, mode: "hold", active: true }];
    s.categories = s.categories.map(c => ({ ...c, active: false, limitMinutes: 0, mode: "hold", ctUntil: 0, schedule: null }));
    await chrome.runtime.sendMessage({ type: "saveSettings", settings: s });
    await chrome.runtime.sendMessage({ type: "resetStats" });
    return true;
  })()`);
  await sleep(400);
  // ricarica le impostazioni nella pagina (la UI salva dal proprio stato in memoria)
  await cdp("Page.reload", {}, optSess);
  await waitFor(async () => {
    const ok = await evaluate(optSess, "typeof onCtStart === 'function' && document.querySelectorAll('#siteRows .site-row').length >= 1");
    return ok ? true : null;
  });
  await sleep(400);

  const catRows = await waitFor(async () => {
    const n = await evaluate(optSess, "document.querySelectorAll('#catRows .cat-row').length");
    return n === 6 ? n : null;
  });
  check("6 categorie precompilate renderizzate", catRows === 6, "righe: " + catRows);
  check("categorie presenti nello storage sanitizzato", !!(await evaluate(optSess, `(async () => {
    const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    return s.categories && s.categories.length === 6 && s.categories.every(c => c.id);
  })()`)));

  // attiva la categoria "video" dall'interfaccia
  const catActivated = await waitFor(async () => {
    await evaluate(optSess, `(() => {
      const row = document.querySelector('.cat-row[data-cat="video"]');
      if (!row) return null;
      const cb = row.querySelector('.cat-active');
      if (!cb.checked) cb.click();
      return true;
    })()`);
    const on = await evaluate(optSess, `(async () => {
      const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
      const c = (s.categories || []).find(x => x.id === "video");
      return c && c.active === true ? true : null;
    })()`);
    return on || null;
  });
  check("attivazione categoria dall'interfaccia (persistita)", catActivated === true);

  // un dominio della categoria (netflix.com, non configurato singolarmente) viene intercettato
  const catTab = await createTarget("about:blank");
  const catSess = await attach(catTab);
  await sleep(400);
  await cdp("Page.navigate", { url: "https://netflix.com/" }, catSess);
  const catBlock = await waitFor(async () => {
    const href = await evaluate(catSess, "location.href");
    return href.includes("block.html") && href.includes("r=hold") ? href : null;
  });
  check("dominio della categoria intercettato (tieni premuto)", !!catBlock, catBlock || "");

  // limite aggregato: 60 min condivisi tra tutti i domini della categoria
  await evaluate(optSess, `(async () => {
    const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    const c = s.categories.find(x => x.id === "video");
    c.limitMinutes = 1;
    await chrome.runtime.sendMessage({ type: "saveSettings", settings: s });
    const d = new Date();
    const today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    await chrome.storage.local.set({ stats: { byDay: { [today]: { "youtube.com": 99999 } }, blocked: {}, unlocks: {} } });
    return true;
  })()`);
  await sleep(500);
  await cdp("Page.navigate", { url: "https://youtube.com/" }, catSess);
  const catLimit = await waitFor(async () => {
    const href = await evaluate(catSess, "location.href");
    return href.includes("block.html") && href.includes("r=limit") && href.includes("c=video") ? href : null;
  });
  check("budget aggregato di categoria superato → blocco 'limit' (c=video)", !!catLimit, catLimit || "");
  // ripristino: categoria spenta e statistiche pulite
  await evaluate(optSess, `(async () => {
    const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    const c = s.categories.find(x => x.id === "video");
    c.active = false; c.limitMinutes = 0;
    await chrome.runtime.sendMessage({ type: "saveSettings", settings: s });
    await chrome.runtime.sendMessage({ type: "resetStats" });
    return true;
  })()`);

  // PRO: bloccata di default, il segnale locale non basta
  const proLocked = await waitFor(async () => {
    const r = await evaluate(optSess, `(() => {
      return !document.getElementById("proTools").hidden && !document.getElementById("proLocked").hidden ? null
        : document.getElementById("proLocked").hidden === false ? true : null;
    })()`);
    return r || null;
  });
  check("strumenti PRO bloccati senza abbonamento", proLocked === true);

  // Temi PRO: presenti in una griglia dedicata con una card per tema del registry
  const proThemeCount = await evaluate(optSess, `(() => {
    const grid = document.getElementById("proThemeGrid");
    const n = grid ? document.querySelectorAll("#proThemeGrid .theme-card.pro").length : -1;
    return n === Number(grid.dataset.total) && n > 0 ? n : null;
  })()`);
  check("temi PRO: card renderizzate come nel registry", !!proThemeCount, "temi: " + proThemeCount);

  // anteprima gratuita: il click su un tema PRO bloccato mostra la barra, applica
  // il gradiente in memoria e NON persiste il tema nello storage
  const themeBefore = await evaluate(optSess, `(async () =>
    (await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})))).theme)()`);
  const previewShown = await waitFor(async () => {
    const out = await evaluate(optSess, `(() => {
      const card = document.querySelector('#proThemeGrid .theme-card.pro[data-pro-theme="pr-aurora"]');
      const bar = document.getElementById("proPreviewBar");
      const st = getComputedStyle(document.documentElement);
      const gradOk = (st.getPropertyValue("--bg-grad") || "").includes("linear-gradient");
      if (bar && bar.hidden && card) card.click(); // entra in anteprima solo se non già attiva
      if (bar && bar.hidden === false && gradOk) return document.getElementById("proPreviewName").textContent;
      return null;
    })()`);
    return out || null;
  });
  check("anteprima tema PRO per i free: barra visibile + gradiente applicato", previewShown === "Aurora", previewShown || "");
  const themeAfter = await evaluate(optSess, `(async () =>
    (await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})))).theme)()`);
  check("l'anteprima non persiste il tema PRO", themeAfter === themeBefore, `prima: ${themeBefore} dopo: ${themeAfter}`);
  const previewClosed = await waitFor(async () => {
    await evaluate(optSess, `(() => { document.getElementById("proPreviewClose").click(); return true; })()`);
    const out = await evaluate(optSess, `(() => {
      const st = getComputedStyle(document.documentElement);
      return document.getElementById("proPreviewBar").hidden === true
        && !(st.getPropertyValue("--bg-grad") || "").includes("linear-gradient") ? true : null;
    })()`);
    return out || null;
  });
  check("chiusura anteprima: barra nascosta e gradiente rimosso", previewClosed === true);

  // la LISTA dei siti di ogni categoria è visibile anche gratis (espandendo la riga)
  const catListSeen = await waitFor(async () => {
    const r = await evaluate(optSess, `(() => {
      const row = document.querySelector('.cat-row[data-cat="social"]');
      if (!row) return null;
      if (!row.classList.contains("open")) {
        const head = row.querySelector(".cat-head");
        if (head) { head.click(); return "opening"; }
        return null;
      }
      const chips = [...row.querySelectorAll(".cat-domain-chips .chip")].map(c => c.textContent.trim());
      return chips.includes("instagram.com") && chips.length > 0 ? chips : null;
    })()`);
    return Array.isArray(r) && r.length ? r.length : null;
  });
  check("lista dei siti della categoria visibile per tutti (es. instagram.com)", !!catListSeen);

  // modificare la lista è PRO: il bottone dietro il lucchetto mostra l'avviso
  const catGateFree = await evaluate(optSess, `(async () => {
    const btn = document.querySelector('.cat-row[data-cat="social"] [data-edit-gate]');
    if (!btn) return null;
    btn.click();
    const s0 = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    const msg = document.querySelector('.cat-row[data-cat="social"] .cat-msg');
    const doms = (s0.categories.find(c => c.id === "social") || {}).domains || [];
    return { msg: msg ? msg.textContent : "", noCustom: doms.length === 0 };
  })()`);
  check("modifica siti categoria bloccata per i free (avviso, nessuna lista custom)",
    catGateFree && catGateFree.msg.length > 0 && catGateFree.noCustom === true,
    catGateFree ? JSON.stringify(catGateFree) : "");

  // interfaccia di sblocco PRO (ExtensionPay): pulsanti presenti dietro il lucchetto
  const payUi = await evaluate(optSess, `(async () => {
    const row = document.getElementById("proPayRow");
    const unlock = document.getElementById("proUnlock");
    const login = document.getElementById("proLogin");
    return row && unlock && login && row.hidden === false
      && unlock.textContent.trim().length > 0 && login.textContent.trim().length > 0;
  })()`);
  check("UI di sblocco PRO presente (bottone acquisto + login)", payUi === true);

  // build di sviluppo (EXT_PAY_ID vuoto): il click sul pulsante non apre pagine e mostra l'avviso
  const unconf = await evaluate(optSess, `(async () => {
    document.getElementById("proMsg").textContent = "";
    await onProUnlock();
    await new Promise(r => setTimeout(r, 300));
    return document.getElementById("proMsg").textContent.length > 0
      && !location.href.includes("extensionpay.com");
  })()`);
  check("senza EXT_PAY_ID il pulsante mostra l'avviso di build non configurata", unconf === true);

  // proRefresh: senza ExtensionPay configurato (e senza toggle) risponde paid:false senza toccare la firma
  const proRefresh = await evaluate(optSess, `(async () => {
    const s0 = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    const resp = await chrome.runtime.sendMessage({ type: "proRefresh" });
    await new Promise(r => setTimeout(r, 300));
    const s1 = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    return { ok: resp && resp.ok, paid: resp && resp.paid, sig0: s0._aT, sig1: s1._aT };
  })()`);
  check("proRefresh senza ExtensionPay: ok, paid:false, firma invariata",
    proRefresh && proRefresh.ok === true && proRefresh.paid === false && proRefresh.sig0 === proRefresh.sig1,
    proRefresh ? JSON.stringify(proRefresh) : "");

  const forged = await evaluate(optSess, `(async () => {
    const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    s._aT = "x8f9q"; // firma falsificata: la UI lo mostrerebbe come PRO…
    await chrome.runtime.sendMessage({ type: "saveSettings", settings: s });
    const resp = await chrome.runtime.sendMessage({ type: "coldTurkey", kind: "site", id: 1, hours: 1, days: 0 });
    await new Promise(r => setTimeout(r, 400));
    const s2 = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    return { ok: resp && resp.ok, reason: resp && resp.reason, sig: s2._aT };
  })()`);
  check("senza verifica live il cold turkey è rifiutato e la firma locale viene rimossa",
    forged && forged.ok !== true && forged.reason === "pro" && !forged.sig, forged ? JSON.stringify(forged) : "");

  // toggle di sviluppo (Info) → strumenti PRO visibili e attivazione possibile
  const devOn = await waitFor(async () => {
    await evaluate(optSess, `(() => {
      const t = document.getElementById("proTestToggle");
      if (!t.checked) t.click();
      return true;
    })()`);
    const r = await evaluate(optSess, `(async () => {
      const d = await new Promise(r => chrome.storage.local.get("_devPro", o => r(o._devPro)));
      const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
      return d === true && s._aT === "x8f9q" && document.getElementById("proTools").hidden === false ? true : null;
    })()`);
    return r || null;
  });
  check("toggle di sviluppo: strumenti PRO visibili", devOn === true);

  // con PRO attivo un tema gradiente si applica e si salva (firma presente)
  const proThemeApplied = await waitFor(async () => {
    const out = await evaluate(optSess, `(async () => {
      const read = async () => {
        const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
        const sel = document.querySelector("#proThemeGrid .theme-card.pro.selected");
        return s.theme === "pr-lagoon" && s._aT === "x8f9q" && sel && sel.dataset.proTheme === "pr-lagoon"
          ? s.theme : null;
      };
      let v = await read();
      if (!v) {
        const card = document.querySelector('#proThemeGrid .theme-card.pro[data-pro-theme="pr-lagoon"]');
        if (card) card.click();
        await new Promise(r => setTimeout(r, 400));
        v = await read();
      }
      return v || null;
    })()`);
    return out || null;
  });
  check("con PRO attivo il tema gradiente si applica e si salva", proThemeApplied === "pr-lagoon", proThemeApplied || "");

  // PRO: aggiunta di un dominio personalizzato a una categoria dall'interfaccia
  const catEdited = await waitFor(async () => {
    const r = await evaluate(optSess, `(() => {
      const row = document.querySelector('.cat-row[data-cat="shopping"]');
      if (!row) return null;
      if (!row.classList.contains("open")) { const h = row.querySelector(".cat-head"); if (h) h.click(); return "opening"; }
      if (!row.querySelector(".cat-dom-input")) {
        const start = row.querySelector("[data-edit-start]");
        if (start) { start.click(); return "opening-edit"; }
        return null;
      }
      return "ready";
    })()`);
    if (r === "ready") {
      const done = await evaluate(optSess, `(async () => {
        const row = document.querySelector('.cat-row[data-cat="shopping"]');
        const input = row.querySelector(".cat-dom-input");
        input.value = "testshop.example";
        row.querySelector(".cat-dom-add").click();
        await new Promise(r2 => setTimeout(r2, 500));
        const s = await new Promise(r2 => chrome.storage.local.get("settings", o => r2(o.settings || {})));
        const doms = (s.categories.find(c => c.id === "shopping") || {}).domains || [];
        return doms.includes("testshop.example") ? doms : null;
      })()`);
      return done ? done : null;
    }
    return null;
  });
  check("PRO: dominio personalizzato aggiunto a una categoria dall'interfaccia",
    !!(catEdited && catEdited.includes("testshop.example")), "");

  const ctStarted = await waitFor(async () => {
    const r = await evaluate(optSess, `(async () => {
      const sel = document.getElementById("ctTarget");
      if (![...sel.options].some(o => o.value === "site:1")) return null;
      sel.value = "site:1";
      document.getElementById("ctHours").value = "1";
      document.getElementById("ctDays").value = "0";
      const before = Date.now();
      let err = null;
      try { await onCtStart(); } catch (e) { err = String((e && e.message) || e); }
      // il blocco chiede conferma esplicita: il dialog deve aprirsi con il riepilogo
      const dlg = document.getElementById("ctConfirm");
      if (!dlg || !dlg.open || !document.getElementById("ctConfirmBody").textContent) return null;
      document.getElementById("ctConfirmOk").click(); // conferma: parte il messaggio coldTurkey
      for (let i = 0; i < 15; i++) { // attende l'esito (messaggio asincrono al background)
        await new Promise(r2 => setTimeout(r2, 200));
        const s2 = await new Promise(r2 => chrome.storage.local.get("settings", o => r2(o.settings || {})));
        const site2 = s2.sites.find(x => String(x.id) === "1");
        if (site2 && site2.ctUntil > before) return { until: site2.ctUntil };
      }
      const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
      const site = s.sites.find(x => String(x.id) === "1");
      return site && site.ctUntil > before
        ? { until: site.ctUntil }
        : { until: site && site.ctUntil, err, sig: s._aT, msg: document.getElementById("ctMsg").textContent };
    })()`);
    return r && r.until ? { until: r.until } : null;
  });
  check("cold turkey attivato dall'interfaccia (ctUntil futuro)", !!ctStarted, ctStarted ? JSON.stringify(ctStarted) : "");

  const ctRowLocked = await waitFor(async () => {
    const r = await evaluate(optSess, `(() => {
      const row = document.querySelector('.site-row[data-id="1"]');
      if (!row) return null;
      const toggle = row.querySelector(".site-active");
      const chip = row.querySelector(".chip.ct-chip");
      return toggle && toggle.disabled === true && chip ? true : null;
    })()`);
    return r || null;
  });
  check("riga del sito bloccata nell'interfaccia (toggle disabilitato + chip ⛓)", ctRowLocked === true);

  // il blocco ferreo ignora anche il periodo di grazia
  const ctTabId = await evaluate(optSess, `(async () => (await chrome.tabs.create({ url: "about:blank" })).id)()`);
  await evaluate(optSess, `(async () => {
    await chrome.runtime.sendMessage({ type: "unlock", tabId: ${ctTabId} }); // grazia concessa…
    await chrome.tabs.update(${ctTabId}, { url: "https://example.com/" });
    return true;
  })()`);
  const ctBlock = await waitFor(async () => {
    const url = await evaluate(optSess, `(async () => (await chrome.tabs.get(${ctTabId})).url || "")()`);
    return url.includes("block.html") && url.includes("r=ct") ? url : null;
  }, 15000);
  check("cold turkey blocca anche con periodo di grazia attivo (r=ct)", !!ctBlock, (ctBlock || "").slice(0, 60));

  // fasce orarie (su un secondo sito, così il cold turkey di example.com non interferisce)
  await evaluate(optSess, `(async () => {
    const s = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
    s.sites.push({ id: 98, domain: "example.org", delay: 2, limitMinutes: 0, mode: "hold", active: true });
    await chrome.runtime.sendMessage({ type: "saveSettings", settings: s });
    return true;
  })()`);
  await sleep(400);
  const isoDay = await evaluate(optSess, `new Date().getDay() === 0 ? 7 : new Date().getDay()`);
  const otherDay = isoDay === 1 ? 2 : 1; // un giorno diverso da oggi
  await evaluate(optSess, `(async () => {
    const resp = await chrome.runtime.sendMessage({
      type: "proSchedule", kind: "site", id: 98,
      schedule: { days: [${otherDay}], start: 0, end: 1440 }
    });
    return resp && resp.ok;
  })()`);
  await sleep(400);
  const schedTab = await createTarget("about:blank");
  const schedSess = await attach(schedTab);
  await sleep(400);
  await cdp("Page.navigate", { url: "https://example.org/" }, schedSess);
  const navPassed = await waitFor(async () => {
    const href = await evaluate(schedSess, "location.href");
    return href.startsWith("https://example.org") ? href : null;
  }, 8000);
  check("fuori fascia oraria il sito NON viene intercettato", !!navPassed, "");
  // ora dentro fascia (oggi, tutto il giorno)
  await evaluate(optSess, `(async () => {
    const resp = await chrome.runtime.sendMessage({
      type: "proSchedule", kind: "site", id: 98,
      schedule: { days: [${isoDay}], start: 0, end: 1440 }
    });
    return resp && resp.ok;
  })()`);
  await sleep(400);
  // URL univoco: la navigazione verso lo stesso URL potrebbe non generare onBeforeNavigate
  await cdp("Page.navigate", { url: "https://example.org/?t=2" }, schedSess);
  const schedBlock = await waitFor(async () => {
    const href = await evaluate(schedSess, "location.href");
    return href.includes("block.html") ? href : null;
  });
  check("dentro la fascia oraria il sito viene intercettato", !!schedBlock, schedBlock || "");

  // pulizia: toggle di sviluppo spento → strumenti PRO di nuovo bloccati
  await evaluate(optSess, `(() => {
    const t = document.getElementById("proTestToggle");
    if (t.checked) t.click();
    return true;
  })()`);
  const devOff = await waitFor(async () => {
    const r = await evaluate(optSess, `(async () => {
      const d = await new Promise(r => chrome.storage.local.get("_devPro", o => r(o._devPro)));
      return d !== true && document.getElementById("proLocked").hidden === false ? true : null;
    })()`);
    return r || null;
  });
  check("toggle di sviluppo spento: strumenti PRO di nuovo bloccati", devOff === true);

  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
  return failed === 0 ? 0 : 1;
}

async function cleanup() {
  try { ws && ws.close(); } catch {}
  if (chromeProc) {
    chromeProc.kill();
    await sleep(1500);
  }
  for (let i = 0; i < 6; i++) {
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); return; }
    catch { await sleep(500); }
  }
}

main()
  .then(code => cleanup().then(() => process.exit(code)))
  .catch(err => {
    console.error("ERRORE:", err.message);
    cleanup().then(() => process.exit(1));
  });
