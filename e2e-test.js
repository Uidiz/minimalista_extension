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
