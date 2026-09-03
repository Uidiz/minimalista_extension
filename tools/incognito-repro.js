// tools/incognito-repro.js — verifica manuale del comportamento in incognito.
// Riproduce il bug documentato: con incognito "spanning" (default), l'estensione
// intercetta in incognito ma Chrome blocca la navigazione verso block.html
// (ERR_BLOCKED_BY_CLIENT). La correzione è "incognito": "split" nel manifest.
//
// Flusso:
//   FASE A — accesso incognito OFF (default) → estensione inerte in incognito
//   FASE B — "Consenti in incognito" attivato dalla UI + riavvio di Chrome
//            → il sito viene intercettato MA compare l'errore ERR_BLOCKED_BY_CLIENT
//            (con "incognito":"split" nel manifest deve comparire block.html)
// Uso: node tools/incognito-repro.js
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ensureCfT } = require("./setup-cft.cjs");

const EXT = path.resolve(__dirname, "..");
const PORT = 9444;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "minimalista-incog-"));

let chromeProc = null;
let ws = null;
let seq = 0;
const pending = new Map();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJson(p) {
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`);
  return res.json();
}

function cdp(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("timeout: " + method)); }, 25000);
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
  }
}

async function attach(targetId) {
  const { sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true });
  await cdp("Runtime.enable", {}, sessionId);
  await cdp("Page.enable", {}, sessionId).catch(() => {});
  return sessionId;
}

async function evaluate(sessionId, expression) {
  const res = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (res.exceptionDetails) throw new Error("evaluate: " + JSON.stringify(res.exceptionDetails.exception || res.exceptionDetails.text));
  return res.result.value;
}

async function waitFor(fn, timeoutMs = 15000, step = 400) {
  const start = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* riprova */ }
    if (Date.now() - start > timeoutMs) return null;
    await sleep(step);
  }
}

async function launch(withIncognito) {
  const chromeBin = process.env.CHROME_BIN || await ensureCfT();
  console.log("Chrome:", chromeBin + (withIncognito ? " (--incognito)" : ""));
  const args = [
    "--no-first-run", "--no-default-browser-check",
    "--window-position=0,0", "--window-size=1000,700",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    `--user-data-dir=${PROFILE}`,
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    `--remote-debugging-port=${PORT}`
  ];
  if (withIncognito) args.push("--incognito");
  args.push("about:blank");
  chromeProc = spawn(chromeBin, args, { stdio: "ignore" });

  let version;
  for (let i = 0; i < 60 && !version; i++) {
    try { version = await fetchJson("/json/version"); } catch { await sleep(500); }
  }
  if (!version) throw new Error("CDP non raggiungibile");
  ws = new WebSocket(version.webSocketDebuggerUrl);
  ws.onmessage = onWsMessage;
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws error")); });
}

async function stop() {
  try { await cdp("Browser.close"); } catch {}
  await sleep(1200);
  if (chromeProc) { chromeProc.kill(); chromeProc = null; }
  if (ws) { try { ws.close(); } catch {} ws = null; }
  await sleep(600);
}

async function findExtensionId() {
  const t = await cdp("Target.createTarget", { url: "chrome://extensions/" });
  const s = await attach(t.targetId);
  return waitFor(async () => {
    const r = await evaluate(s, `(() => {
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
}

// Abilita "Consenti in incognito" cliccando il toggle vero di chrome://extensions
// (Dettagli → cr-toggle della riga allow-incognito). Vale dopo il riavvio.
async function enableIncognitoViaUI(extId) {
  const t = await cdp("Target.createTarget", { url: "chrome://extensions/" });
  const s = await attach(t.targetId);
  const opened = await waitFor(async () => {
    const r = await evaluate(s, `(() => {
      const walk = root => {
        for (const el of root.querySelectorAll('*')) {
          if (el.tagName === 'EXTENSIONS-ITEM' && el.getAttribute('id') === '${extId}') return el;
        }
        for (const el of root.querySelectorAll('*')) if (el.shadowRoot) {
          const r = walk(el.shadowRoot);
          if (r) return r;
        }
        return null;
      };
      const item = walk(document);
      if (!item || !item.shadowRoot) return null;
      const btn = item.shadowRoot.querySelector('#detailsButton');
      if (!btn) return null;
      btn.click();
      return 'open';
    })()`);
    return r || null;
  }, 15000);
  if (!opened) return false;
  const clicked = await waitFor(async () => {
    const r = await evaluate(s, `(() => {
      const find = (root, pred, out) => {
        for (const el of root.querySelectorAll('*')) {
          if (pred(el)) { out.push(el); }
          if (el.shadowRoot) find(el.shadowRoot, pred, out);
        }
      };
      const rows = [];
      find(document, el => el.id === 'allow-incognito' && el.tagName === 'EXTENSIONS-TOGGLE-ROW', rows);
      if (!rows.length) return null;
      let inner = rows[0].shadowRoot && rows[0].shadowRoot.querySelector('cr-toggle');
      if (!inner) {
        const found = [];
        find(rows[0], el => el.tagName === 'CR-TOGGLE', found);
        inner = found[0] || null;
      }
      if (!inner) return 'no-inner-toggle';
      if (inner.checked) return 'already-on';
      inner.click();
      return 'clicked';
    })()`);
    return r || null;
  }, 15000);
  return !!clicked;
}

async function configureBlockedSite(extId) {
  const opt = await cdp("Target.createTarget", { url: `chrome-extension://${extId}/options.html` });
  const s = await attach(opt.targetId);
  await waitFor(async () => evaluate(s, "typeof chrome !== 'undefined' && location.href.includes('options.html')"));
  const ok = await waitFor(async () => {
    const r = await evaluate(s, `(async () => {
      try {
        const st = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
        st.focusEnabled = true;
        st.lang = "it";
        st.sites = [{ id: 1, domain: "example.com", delay: 2, limitMinutes: 0, mode: "hold", active: true }];
        await new Promise(r => chrome.storage.local.set({ settings: st }, () => r()));
        const resp = await chrome.runtime.sendMessage({ type: "saveSettings", settings: st }).catch(() => null);
        return resp && resp.ok ? true : null;
      } catch { return null; }
    })()`);
    return r || null;
  }, 20000);
  if (!ok) throw new Error("impossibile configurare il sito di test");
  return s;
}

async function isAllowedIncognito(extId) {
  const opt = await cdp("Target.createTarget", { url: `chrome-extension://${extId}/options.html` });
  const s = await attach(opt.targetId);
  await waitFor(async () => evaluate(s, "typeof chrome !== 'undefined' && location.href.includes('options.html')"));
  return evaluate(s, "chrome.extension.isAllowedIncognitoAccess ? chrome.extension.isAllowedIncognitoAccess() : 'n/d'").catch(() => "n/d");
}

async function navigateAndReport(label, browserContextId) {
  const tab = await cdp("Target.createTarget", { url: "about:blank", browserContextId });
  const s = await attach(tab.targetId);
  await sleep(400);
  await cdp("Page.navigate", { url: "https://example.com/" }, s);
  const href = await waitFor(async () => {
    const h = await evaluate(s, "location.href");
    return h.startsWith("https://example.com") || h.includes("block.html") ? h : null;
  }, 15000);
  let outcome;
  if (href && href.includes("block.html")) {
    const st = await waitFor(async () => {
      const r = await evaluate(s, `(() => ({
        msg: document.getElementById('message') ? document.getElementById('message').textContent : null,
        hasHold: !!document.getElementById('holdBtn') && !document.getElementById('holdBtn').hidden
      }))()`);
      return r && (r.msg || r.hasHold) ? r : null;
    }, 8000);
    outcome = st ? "PAGINA DI BLOCCO OK: " + JSON.stringify(st) : href;
  } else {
    const st = await evaluate(s, `(() => ({
      title: document.title,
      body: document.body ? document.body.innerText.slice(0, 160) : ""
    }))()`).catch(() => null);
    const err = st && /ERR_BLOCKED_BY_CLIENT|bloccata da Chrome|blocked by Chrome/i.test((st.title || "") + " " + (st.body || ""));
    outcome = err ? "ERRORE CHROME (ERR_BLOCKED_BY_CLIENT): " + JSON.stringify(st) : "pagina finale: " + JSON.stringify(st);
  }
  console.log(`  ${label}:`, href || "(nessun esito)", "→", outcome);
  return href;
}

async function main() {
  /* ---------- FASE A: accesso incognito OFF (default) ---------- */
  console.log("=== FASE A: accesso incognito OFF (default) ===");
  await launch();
  const extId = await findExtensionId();
  console.log("1) estensione:", extId || "NON TROVATA");
  if (!extId) return;
  await configureBlockedSite(extId);
  console.log("2) isAllowedIncognitoAccess:", await isAllowedIncognito(extId));
  const { browserContextId: incA } = await cdp("Target.createBrowserContext", { disposeOnDetach: false });
  await navigateAndReport("A) incognito, accesso OFF", incA);
  await navigateAndReport("A2) NORMALE (sanity: deve bloccare)", undefined);

  /* ---------- FASE B: accesso incognito ON + riavvio (finestra incognito reale) ---------- */
  console.log("\n=== FASE B: 'Consenti in incognito' ON + finestra incognito reale ===");
  await enableIncognitoViaUI(extId);
  await stop();
  await launch(true); // riavvio con --incognito: il permesso persistito si applica
  console.log("3) isAllowedIncognitoAccess dopo il riavvio:", await isAllowedIncognito(extId));
  // trova il browser context incognito REALE (non quello CDP)
  const { browserContextIds } = await cdp("Target.getBrowserContexts");
  console.log("   browser contexts:", browserContextIds);
  const incB = browserContextIds.length > 1 ? browserContextIds.find(id => id !== browserContextIds[0]) : null;
  console.log("   contesto incognito reale:", incB);
  if (incB) {
    await navigateAndReport("B) incognito, accesso ON (1ª navigazione)", incB);
    await navigateAndReport("B2) incognito, accesso ON (2ª navigazione)", incB);
  }
  await stop();

  /* ---------- FASE C: sweepBlocked (recupero navigazioni sfuggite) ---------- */
  console.log("\n=== FASE C: sweepBlocked (sito aperto prima del blocco) ===");
  await launch();
  const extId2 = await findExtensionId();
  const opt2 = await cdp("Target.createTarget", { url: `chrome-extension://${extId2}/options.html` });
  const opt2S = await attach(opt2.targetId);
  await waitFor(async () => evaluate(opt2S, "typeof chrome !== 'undefined' && location.href.includes('options.html')"));
  const writeSettings = (patch) => waitFor(async () => {
    const r = await evaluate(opt2S, `(async () => {
      try {
        const st = await new Promise(r => chrome.storage.local.get("settings", o => r(o.settings || {})));
        Object.assign(st, ${JSON.stringify(patch)});
        await new Promise(r => chrome.storage.local.set({ settings: st }, () => r()));
        const resp = await chrome.runtime.sendMessage({ type: "saveSettings", settings: st }).catch(() => null);
        return resp && resp.ok ? true : null;
      } catch { return null; }
    })()`);
    return r || null;
  }, 20000);
  await writeSettings({ sites: [], focusEnabled: true });
  const t3 = await cdp("Target.createTarget", { url: "about:blank" });
  const t3S = await attach(t3.targetId);
  await sleep(500);
  await cdp("Page.navigate", { url: "https://example.com/" }, t3S);
  const openFree = await waitFor(async () => {
    const h = await evaluate(t3S, "location.href");
    return h.startsWith("https://example.com") ? h : null;
  }, 15000);
  console.log("   sito aperto libero (nessun blocco configurato):", openFree ? "sì" : "no");
  const reblock = await writeSettings({
    focusEnabled: true,
    sites: [{ id: 1, domain: "example.com", delay: 2, limitMinutes: 0, mode: "hold", active: true }]
  });
  console.log("   blocco riattivato:", reblock === true);
  const { targetInfos } = await cdp("Target.getTargets");
  const sw = targetInfos.find(t => t.type === "service_worker" && /background\.js/.test(t.url));
  if (sw) {
    const { sessionId: swS } = await cdp("Target.attachToTarget", { targetId: sw.targetId, flatten: true });
    await cdp("Runtime.enable", {}, swS);
    await sleep(500);
    await cdp("Runtime.evaluate", { expression: "sweepBlocked()", awaitPromise: true, returnByValue: true }, swS);
  }
  const sweptHref = await waitFor(async () => {
    const h = await evaluate(t3S, "location.href");
    return h.includes("block.html") ? h : null;
  }, 10000);
  console.log("   sweepBlocked → tab reindirizzato a block.html:", sweptHref ? "sì — " + sweptHref : "NO");
  await stop();
}

main().catch(e => { console.error("ERRORE:", e.message); if (chromeProc) chromeProc.kill(); process.exit(1); });