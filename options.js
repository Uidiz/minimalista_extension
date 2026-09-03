// options.js — impostazioni: gestione siti, statistiche, aspetto, PIN.
"use strict";

let settings = null;
const el = (id) => document.getElementById(id);

/* ============================================================
   Avvio: PIN gate poi render
   ============================================================ */
async function init() {
  settings = await getSettings();
  setUILang(settings.lang);
  applyI18n(document);
  applyTheme(document.documentElement, settings);

  if (settings.pinHash) {
    el("lockScreen").hidden = false;
    el("pinUnlock").addEventListener("click", tryUnlock);
    el("pinInput").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
    return;
  }
  showApp();
}

async function tryUnlock() {
  const pin = el("pinInput").value;
  if (!pin) return;
  const hash = await sha256(pin);
  if (hash === settings.pinHash) {
    sessionStorage.setItem("minimalista_ok", "1");
    showApp();
  } else {
    el("pinError").textContent = t("pin_wrong");
    el("pinInput").value = "";
  }
}

function showApp() {
  el("lockScreen").hidden = true;
  el("app").hidden = false;
  renderAll();
  bindStatic();
}

/* ============================================================
   Navigazione tra sezioni
   ============================================================ */
let staticBound = false;
function bindStatic() {
  if (staticBound) return;
  staticBound = true;

  document.querySelectorAll("nav button").forEach(btn => {
    btn.addEventListener("click", () => switchSection(btn.dataset.sec));
  });
  window.addEventListener("hashchange", () => {
    const h = location.hash.replace("#", "");
    if (h) switchSection(h);
  });

  // aggiunta sito
  el("siteAdd").addEventListener("submit", async (e) => {
    e.preventDefault();
    const domain = normalizeDomain(el("siteInput").value);
    if (!domain) { el("siteInput").focus(); return; }
    if (settings.sites.some(s => s.domain === domain)) { el("siteInput").value = ""; return; }
    settings.sites.push({ id: Date.now() + Math.random(), domain, delay: 5, limitMinutes: 0, mode: "hold", active: true });
    el("siteInput").value = "";
    save();
  });

  // periodo di grazia + interruttore globale
  el("graceInput").addEventListener("change", (e) => {
    settings.graceMinutes = Math.min(120, Math.max(0, Number(e.target.value) || 5));
    e.target.value = settings.graceMinutes;
    save();
  });
  el("focusToggle").addEventListener("change", (e) => {
    settings.focusEnabled = e.target.checked;
    save();
  });

  // azzeramento statistiche
  el("resetStats").addEventListener("click", async () => {
    if (!confirm(t("confirm_reset_stats"))) return;
    await sendMessage({ type: "resetStats" });
    renderStats();
  });

  // statistiche live: si aggiornano quando il background salva i tick (sezione visibile)
  onStorageChange((changes) => {
    if (changes.stats && !el("sec-stats").hidden) renderStats();
  });

  // tema custom: salva / elimina / annulla + sync color picker ↔ campo hex
  el("ctSave").addEventListener("click", saveCustomTheme);
  el("ctDelete").addEventListener("click", () => removeCustomTheme(customEditingId));
  el("ctCancel").addEventListener("click", closeCustomEditor);
  el("ctName").addEventListener("keydown", (e) => { if (e.key === "Enter") saveCustomTheme(); });
  document.querySelectorAll(".ct-color-row").forEach(row => {
    const picker = row.querySelector(".ct-picker");
    const hex = row.querySelector(".ct-hex");
    picker.addEventListener("input", () => { hex.value = picker.value; });
    hex.addEventListener("change", () => {
      const v = hex.value.trim();
      if (/^#?[0-9a-fA-F]{6}$/.test(v)) picker.value = (v[0] === "#" ? v : "#" + v).toLowerCase();
    });
  });

  // cambio lingua dall'esterno (es. un'altra scheda) → ri-render del tutto;
  // cambio della sola firma PRO (pagamento arrivato, verifica fallita, revoca)
  // → aggiorna solo lo stato dei lucchetti
  onStorageChange((changes) => {
    const s = changes.settings;
    if (!s || !s.newValue) return;
    if ((s.oldValue || {}).lang !== s.newValue.lang) {
      settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...s.newValue, sites: s.newValue.sites || [] };
      setUILang(settings.lang);
      applyI18n(document);
      renderAll();
    } else if ((s.oldValue || {})[_PRO_SIG] !== s.newValue[_PRO_SIG]) {
      settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...s.newValue, sites: s.newValue.sites || [] };
      renderPro();
    }
  });
}

function switchSection(sec) {
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("active", b.dataset.sec === sec));
  document.querySelectorAll("main section").forEach(s => {
    s.hidden = s.id !== "sec-" + sec;
  });
}

/* ============================================================
   FOCUS
   ============================================================ */
function renderAll() {
  renderSites();
  renderCategories();
  renderPro();
  renderGrace();
  renderTheme();
  renderTypography();
  renderAdvanced();
  renderLang();
  renderSearchEngine();
  renderSearchToggle();
  renderPin();
  renderDev();
  renderStats();
  el("focusToggle").checked = settings.focusEnabled;
}

function renderSites() {
  el("siteSuggestions").innerHTML = SUGGESTED_SITES.map(s => `<option value="${esc(s)}">`).join("");
  const rows = el("siteRows");
  const now = Date.now();
  rows.innerHTML = settings.sites.map(s => {
    const inCt = (s.ctUntil || 0) > now;
    const chips =
      (inCt ? `<span class="chip ct-chip" data-until="${s.ctUntil}">⛓ ${esc(ctRemainingLabel(s.ctUntil))}</span>` : "") +
      (s.schedule ? `<span class="chip sched-chip" title="${esc(scheduleLabel(s.schedule))}">🕒</span>` : "");
    const dis = inCt ? " disabled" : "";
    return `
    <div class="site-row ${inCt ? "ct-locked" : ""}" data-id="${s.id}">
      <label class="switch small"><input type="checkbox" class="site-active" ${s.active ? "checked" : ""} aria-label="${esc(t("active_aria"))}"${dis}><span class="slider"></span></label>
      <span class="site-domain">${esc(s.domain)}${chips}</span>
      <select class="site-mode" aria-label="${esc(t("mode_aria"))}"${dis}>
        <option value="hold" ${s.mode === "hold" ? "selected" : ""}>${esc(t("mode_hold"))}</option>
        <option value="block" ${s.mode === "block" ? "selected" : ""}>${esc(t("mode_block"))}</option>
      </select>
      <span class="delay-field">⏱ <input type="number" class="site-delay" min="1" max="30" value="${s.delay}" ${s.mode === "block" || inCt ? "disabled" : ""}> s</span>
      <span class="limit-field">⏳ <input type="number" class="site-limit" min="0" max="1440" value="${s.limitMinutes}"${dis}> ${esc(t("limit_per_day_short"))}</span>
      <button class="site-del-btn" title="${esc(t("remove_aria"))}" aria-label="${esc(t("remove_aria"))}"${dis}>✕</button>
    </div>`;
  }).join("");

  rows.querySelectorAll(".site-row").forEach(row => {
    const id = Number(row.dataset.id);
    const site = settings.sites.find(s => s.id === id);
    if (!site) return;

    row.querySelector(".site-active").addEventListener("change", (e) => { site.active = e.target.checked; save(); });
    row.querySelector(".site-mode").addEventListener("change", (e) => {
      site.mode = e.target.value;
      row.querySelector(".site-delay").disabled = site.mode === "block";
      save();
    });
    row.querySelector(".site-delay").addEventListener("change", (e) => {
      site.delay = Math.min(30, Math.max(1, Number(e.target.value) || 5));
      e.target.value = site.delay;
      save();
    });
    row.querySelector(".site-limit").addEventListener("change", (e) => {
      site.limitMinutes = Math.max(0, Number(e.target.value) || 0);
      e.target.value = site.limitMinutes;
      save();
    });
    row.querySelector(".site-del-btn").addEventListener("click", async () => {
      if (!confirm(t("remove_site_confirm", { domain: site.domain }))) return;
      settings.sites = settings.sites.filter(s => s.id !== id);
      save();
    });
  });

}

function renderGrace() {
  el("graceInput").value = settings.graceMinutes;
}

function save() {
  sendMessage({ type: "saveSettings", settings }).then(() => {
    applyCurrentTheme();
    updateThemeSelection();
    renderSites(); // riallinea i controlli dopo la sanitizzazione (es. delay clamp)
  });
}

/* ============================================================
   ASPETTO
   ============================================================ */
function renderTheme() {
  const grid = el("themeGrid");

  // temi fissi
  const builtIn = FIXED_THEMES.map(name => {
    const tObj = THEMES[name];
    return `
      <div class="theme-card ${settings.theme === name ? "selected" : ""}" data-theme="${name}">
        <div class="t-name">${tObj.label}</div>
        <div class="t-swatches">
          <span style="background:${tObj.bg}"></span>
          <span style="background:${tObj.fg}"></span>
          <span style="background:${tObj.accent}"></span>
        </div>
      </div>`;
  }).join("");

  // temi custom salvati
  const customCards = (settings.customThemes || []).map(ct => `
      <div class="theme-card custom ${settings.theme === ct.id ? "selected" : ""}" data-theme="${esc(ct.id)}">
        <button class="t-del" title="${esc(t("delete_theme"))}" aria-label="${esc(t("delete_theme"))}">✕</button>
        <div class="t-name">${esc(ct.name)}</div>
        <div class="t-swatches">
          <span style="background:${cssRgb(ct.bg)}"></span>
          <span style="background:${cssRgb(ct.fg)}"></span>
          <span style="background:${cssRgb(ct.accent)}"></span>
        </div>
      </div>`).join("");

  // card "nuovo tema"
  const newCard = `
      <div class="theme-card new" id="themeNewCard">
        <div class="t-name">+</div>
        <div class="t-new-label" data-i18n="new_theme">${esc(t("new_theme"))}</div>
      </div>`;

  grid.innerHTML = builtIn + customCards + newCard;

  grid.querySelectorAll(".theme-card[data-theme]").forEach(card => {
    card.addEventListener("click", async (e) => {
      exitProPreview(); // scegliere un tema normale chiude l'eventuale anteprima PRO
      const id = card.dataset.theme;
      if (e.target.closest(".t-del")) {
        removeCustomTheme(id); // ✕ della card: elimina senza selezionare
        return;
      }
      settings.theme = id;
      save(); // updateThemeSelection apostera l'editor sul tema scelto
    });
  });
  el("themeNewCard").addEventListener("click", () => {
    exitProPreview();
    openCustomEditor(null);
  });

  renderProThemes();
  bindProPreviewBar();
  updateThemeSelection();
}

/* ---------------- temi PRO (gradienti) + anteprima per i non-PRO ------------- */
let proPreviewThemeId = null; // tema PRO in anteprima (solo memoria, mai salvato)
let previewBarBound = false;

// Applica il tema corrente: se c'è un'anteprima PRO attiva la forza (anche per i
// non-PRO), altrimenti il tema regolare di settings.
function applyCurrentTheme() {
  if (proPreviewThemeId) {
    applyTheme(document.documentElement, { ...settings, theme: proPreviewThemeId }, true);
  } else {
    applyTheme(document.documentElement, settings);
  }
}

function renderProThemes() {
  const grid = el("proThemeGrid");
  if (!grid) return;
  grid.dataset.total = String(PRO_THEME_IDS.length); // esposizione per i test e2e
  const unlocked = isPro(settings);
  grid.innerHTML = PRO_THEME_IDS.map(id => {
    const t = PRO_THEMES[id];
    const prev = proPreviewThemeId === id;
    const grad = `linear-gradient(160deg, ${t.grad[0]}, ${t.grad[1]})`;
    return `
      <div class="theme-card pro ${prev ? "previewing" : ""}" data-pro-theme="${id}">
        ${unlocked ? `<span class="pro-badge">PRO</span>` : `<span class="t-lock">🔒</span>`}
        <div class="t-grad" style="background:${grad}"></div>
        <div class="t-name">${esc(t.label)}</div>
      </div>`;
  }).join("");
  grid.querySelectorAll(".theme-card.pro").forEach(card => {
    card.addEventListener("click", () => onProThemeClick(card.dataset.proTheme));
  });
}

function onProThemeClick(id) {
  if (isPro(settings)) {
    // PRO: applica e salva (la sanitizzazione ammette il tema con la firma)
    exitProPreview();
    settings.theme = id;
    save();
    return;
  }
  // non-PRO: solo anteprima in memoria (mai persistita); un secondo click chiude
  if (proPreviewThemeId === id) { exitProPreview(); return; }
  proPreviewThemeId = id;
  el("proPreviewName").textContent = PRO_THEMES[id].label;
  el("proPreviewBar").hidden = false;
  applyCurrentTheme();
  updateThemeSelection();
}

function exitProPreview() {
  if (!proPreviewThemeId) return;
  proPreviewThemeId = null;
  el("proPreviewBar").hidden = true;
  applyCurrentTheme();
  updateThemeSelection();
}

function bindProPreviewBar() {
  if (previewBarBound) return;
  previewBarBound = true;
  el("proPreviewClose").addEventListener("click", exitProPreview);
  el("proPreviewUnlock").addEventListener("click", () => {
    // porta l'utente alla card di pagamento PRO (sezione Focus) e la evidenzia
    switchSection("focus");
    const card = el("proCard");
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("pro-pulse");
      setTimeout(() => card.classList.remove("pro-pulse"), 1600);
    }
  });
}

/* ---------------- temi custom ------------- */
let customEditingId = null; // id del tema in modifica; null = nuovo tema

// Evidenzia il tema selezionato (entrambe le griglie) e apre l'editor quando è
// selezionato un tema custom. Durante un'anteprima PRO la selezione normale è
// oscurata: evidenzia solo la card in anteprima. Chiamato da save().
function updateThemeSelection() {
  document.querySelectorAll("#themeGrid .theme-card, #proThemeGrid .theme-card").forEach(card => {
    const isProCard = !!card.dataset.proTheme;
    const id = isProCard ? card.dataset.proTheme : card.dataset.theme;
    let active;
    if (proPreviewThemeId) active = isProCard && id === proPreviewThemeId;
    else active = id === settings.theme;
    card.classList.toggle("selected", !!active);
    if (isProCard) card.classList.toggle("previewing", !!active && !!proPreviewThemeId);
  });
  const ct = proPreviewThemeId ? null : findCustomTheme(settings);
  if (ct) openCustomEditor(ct);
  else closeCustomEditor();
}

function openCustomEditor(ct) {
  customEditingId = ct ? ct.id : null;
  if (!ct) {
    // nuovo tema: parte dai colori del tema correntemente applicato
    const t = themeColors(settings);
    ct = { name: "", bg: cssToRgb(t.bg), fg: cssToRgb(t.fg), accent: cssToRgb(t.accent) };
  }
  el("ctName").value = ct.name || "";
  setColorInputs("bg", ct.bg);
  setColorInputs("fg", ct.fg);
  setColorInputs("accent", ct.accent);
  el("ctDelete").hidden = customEditingId === null;
  el("customEditor").hidden = false;
}

function closeCustomEditor() {
  customEditingId = null;
  el("customEditor").hidden = true;
}

function setColorInputs(key, rgb) {
  const hex = rgbToHex(rgb);
  document.querySelector(`.ct-picker[data-key="${key}"]`).value = hex;
  document.querySelector(`.ct-hex[data-key="${key}"]`).value = hex;
}

function saveCustomTheme() {
  const theme = {
    id: customEditingId || newThemeId(),
    name: el("ctName").value.trim().slice(0, 24) || "Custom",
    bg: hexToRgb(document.querySelector('.ct-picker[data-key="bg"]').value),
    fg: hexToRgb(document.querySelector('.ct-picker[data-key="fg"]').value),
    accent: hexToRgb(document.querySelector('.ct-picker[data-key="accent"]').value)
  };
  if (customEditingId) {
    const i = settings.customThemes.findIndex(c => c.id === customEditingId);
    if (i >= 0) settings.customThemes[i] = theme;
    else settings.customThemes.push(theme);
  } else {
    settings.customThemes.push(theme);
  }
  settings.theme = theme.id;
  save();
  renderTheme(); // mostra subito la nuova card nella griglia
}

function removeCustomTheme(id) {
  const ct = (settings.customThemes || []).find(c => c.id === id);
  if (!ct || !confirm(t("confirm_delete_theme", { name: ct.name }))) return;
  settings.customThemes = settings.customThemes.filter(c => c.id !== id);
  if (settings.theme === id) settings.theme = "midnight";
  if (customEditingId === id) closeCustomEditor();
  save();
  renderTheme(); // rimuove la card dalla griglia
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return { r: 43, g: 43, b: 46 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(c) {
  const p = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return "#" + p(c.r) + p(c.g) + p(c.b);
}

function cssToRgb(str) {
  const s = String(str || "").trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex) { const n = parseInt(hex[1], 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(s);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  return { r: 43, g: 43, b: 46 };
}

let typographyBound = false;
function renderTypography() {
  const fs = el("fontScale");
  fs.value = Math.round((settings.fontScale || 1) * 100);
  el("fontScaleVal").textContent = fs.value + "%";
  el("fontFamily").value = settings.fontFamily;
  el("showSeconds").checked = !!settings.showSeconds;

  if (typographyBound) return;
  typographyBound = true;

  fs.addEventListener("input", (e) => {
    settings.fontScale = Number(e.target.value) / 100;
    el("fontScaleVal").textContent = e.target.value + "%";
    applyTheme(document.documentElement, settings);
  });
  fs.addEventListener("change", () => save());
  el("fontFamily").addEventListener("change", (e) => { settings.fontFamily = e.target.value; save(); });
  el("showSeconds").addEventListener("change", (e) => { settings.showSeconds = e.target.checked; save(); });
}

/* ============================================================
   PERSONALIZZAZIONE AVANZATA (sfondo + arrotondamento)
   ============================================================ */
let advancedBound = false;
function renderAdvanced() {
  el("bgImage").value = settings.bgImage || "";
  const r = el("borderRadius");
  r.value = settings.borderRadius ?? 8;
  el("borderRadiusVal").textContent = r.value + "px";

  if (advancedBound) return;
  advancedBound = true;

  // URL immagine di sfondo: anteprima live durante la digitazione,
  // salvataggio definitivo al blur (change).
  el("bgImage").addEventListener("input", (e) => {
    settings.bgImage = e.target.value;
    applyTheme(document.documentElement, settings);
  });
  el("bgImage").addEventListener("change", () => save());

  // slider arrotondamento: input → anteprima live, change → salvataggio.
  el("borderRadius").addEventListener("input", (e) => {
    settings.borderRadius = Number(e.target.value);
    el("borderRadiusVal").textContent = e.target.value + "px";
    applyTheme(document.documentElement, settings);
  });
  el("borderRadius").addEventListener("change", () => save());

  // reset al valore di default (8px)
  el("borderRadiusReset").addEventListener("click", () => {
    settings.borderRadius = 8;
    el("borderRadius").value = 8;
    el("borderRadiusVal").textContent = "8px";
    save();
  });
}

/* ============================================================
   LINGUA + MOTORE DI RICERCA
   ============================================================ */
let langBound = false;
let searchEngineBound = false;
function renderLang() {
  const sel = el("langSelect");
  const opts = [["auto", t("language_auto")]].concat(Object.entries(LANGUAGES).map(([code, info]) => [code, info.name]));
  sel.innerHTML = opts.map(([code, label]) =>
    `<option value="${code}" ${uiStoredLang() === code ? "selected" : ""}>${esc(label)}</option>`
  ).join("");
  if (!langBound) {
    langBound = true;
    sel.addEventListener("change", onLangChange);
  }
}

async function onLangChange(e) {
  settings.lang = e.target.value;
  await sendMessage({ type: "saveSettings", settings });
  setUILang(settings.lang);
  applyI18n(document);
  applyTheme(document.documentElement, settings);
  renderAll();
}

function renderSearchEngine() {
  const sel = el("searchEngine");
  sel.innerHTML = Object.entries(SEARCH_ENGINES).map(([code, info]) =>
    `<option value="${code}" ${settings.searchEngine === code ? "selected" : ""}>${esc(info.name)}</option>`
  ).join("");
  if (!searchEngineBound) {
    searchEngineBound = true;
    sel.addEventListener("change", (e) => {
      settings.searchEngine = e.target.value;
      save();
    });
  }
}

let searchToggleBound = false;
function renderSearchToggle() {
  el("showSearchToggle").checked = settings.showSearch !== false;
  if (!searchToggleBound) {
    searchToggleBound = true;
    el("showSearchToggle").addEventListener("change", (e) => {
      settings.showSearch = e.target.checked;
      save();
    });
  }
}

/* ============================================================
   SICUREZZA (PIN)
   ============================================================ */
function renderPin() {
  const state = el("pinState");
  if (settings.pinHash) {
    state.innerHTML = `
      <div class="pin-active">${esc(t("pin_active"))}</div>
      <div class="pin-row">
        <input type="password" id="pinCurrent" placeholder="${esc(t("pin_current_ph"))}" autocomplete="off">
        <button id="pinRemove">${esc(t("pin_remove"))}</button>
      </div>
      <p class="hint" id="pinMsg"></p>`;
    el("pinRemove").addEventListener("click", async () => {
      const cur = el("pinCurrent").value;
      if (!cur) return;
      if ((await sha256(cur)) === settings.pinHash) {
        settings.pinHash = null;
        save();
      } else {
        el("pinMsg").textContent = t("pin_wrong");
      }
    });
  } else {
    state.innerHTML = `
      <div class="pin-row">
        <input type="password" id="pinNew" placeholder="${esc(t("pin_new_ph"))}" autocomplete="off">
        <input type="password" id="pinNew2" placeholder="${esc(t("pin_confirm_ph"))}" autocomplete="off">
        <button id="pinSet" class="primary">${esc(t("pin_set"))}</button>
      </div>
      <p class="hint" id="pinMsg"></p>`;
    el("pinSet").addEventListener("click", async () => {
      const a = el("pinNew").value;
      const b = el("pinNew2").value;
      if (!a) return;
      if (a !== b) { el("pinMsg").textContent = t("pin_mismatch"); return; }
      if (a.length < 4) { el("pinMsg").textContent = t("pin_too_short"); return; }
      settings.pinHash = await sha256(a);
      save();
    });
  }
}

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
}

/* ============================================================
   STATISTICHE
   ============================================================ */
let stats = null;

async function renderStats() {
  stats = await getStats();
  const today = new Date();
  const distSet = new Set((settings.sites || []).map(s => s.domain));

  // grafico ultimi 7 giorni: barra dei siti distraenti (accento) + altri siti (muted)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const k = dayKey(addDays(today, -i));
    const { distracting, other } = splitByCategory(stats.byDay[k] || {}, settings);
    days.push({ key: k, dist: totalSeconds(distracting) / 60, other: totalSeconds(other) / 60 });
  }
  const max = Math.max(1, ...days.map(d => d.dist + d.other));
  const pct = (v) => v <= 0 ? 0 : Math.max(3, (v / max) * 100);
  el("weekChart").innerHTML = days.map(d => {
    const totalSecs = Math.round((d.dist + d.other) * 60);
    const bars = totalSecs > 0
      ? `<div class="bar-stack">
          ${d.other > 0 ? `<div class="bar other" style="height:${pct(d.other)}%"></div>` : ""}
          ${d.dist > 0 ? `<div class="bar" style="height:${pct(d.dist)}%"></div>` : ""}
        </div>`
      : `<div class="bar-stack"></div>`;
    return `<div class="bar-col" title="${esc(fmtDayLabel(d.key))} — ${esc(fmtDuration(totalSecs))}">
      ${bars}
      <span class="bar-label">${esc(fmtDayLabel(d.key))}</span>
    </div>`;
  }).join("");

  // confronto con la settimana precedente (solo per i siti distraenti)
  const weekStart = dayKey(addDays(today, -6));
  const prevStart = dayKey(addDays(today, -13));
  const weekDist = days.reduce((a, d) => a + d.dist, 0);
  const weekOther = days.reduce((a, d) => a + d.other, 0);
  let prev = 0;
  for (let i = 7; i <= 13; i++) {
    const k = dayKey(addDays(today, -i));
    const { distracting } = splitByCategory(stats.byDay[k] || {}, settings);
    prev += totalSeconds(distracting) / 60;
  }

  const unlocksWeek = sumCounter(stats, "unlocks", weekStart, dayKey(today));
  const unlocksPrev = sumCounter(stats, "unlocks", prevStart, dayKey(addDays(today, -7)));
  const blockedWeek = sumCounter(stats, "blocked", weekStart, dayKey(today));

  let trend;
  if (prev === 0) trend = t("trend_no_data");
  else {
    const pct2 = Math.round(((weekDist - prev) / prev) * 100);
    trend = pct2 === 0 ? t("trend_equal")
      : pct2 > 0 ? t("trend_up", { pct: pct2 })
      : t("trend_down", { pct: pct2 });
  }
  el("weekTotals").innerHTML =
    t("stats_week_line", { time: fmtDuration(weekDist * 60), other: fmtDuration(weekOther * 60), trend, blocked: blockedWeek, unlocks: unlocksWeek, prev: unlocksPrev });

  // oggi
  const tk = dayKey(today);
  const { distracting: todayDist, other: todayOther } = splitByCategory(stats.byDay[tk] || {}, settings);
  const distSecs = totalSeconds(todayDist);
  const otherSecs = totalSeconds(todayOther);
  el("todayNumbers").innerHTML =
    t("stats_today_line", {
      total: fmtDuration(distSecs + otherSecs),
      dist: fmtDuration(distSecs),
      other: fmtDuration(otherSecs),
      blocked: stats.blocked[tk] || 0,
      unlocks: stats.unlocks[tk] || 0
    });

  const top = Object.entries(stats.byDay[tk] || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (!top.length) {
    el("topSites").innerHTML = `<p class="hint">${esc(t("stats_no_data_today"))}</p>`;
  } else {
    const total = top.reduce((a, [, s]) => a + s, 0);
    el("topSites").innerHTML = top.map(([domain, secs]) => {
      const isDist = distSet.has(domain);
      return `
      <div class="top-row">
        <span class="t-name ${isDist ? "dist" : ""}" ${isDist ? `title="${esc(t("on_distracting_sites"))}"` : ""}>${isDist ? `<span class="dot"></span>` : ""}${esc(domain)}</span>
        <span class="t-track"><span class="t-fill" style="width:${Math.round((secs / total) * 100)}%"></span></span>
        <span class="t-val">${Math.round((secs / total) * 100)}% · ${fmtDuration(secs)}</span>
      </div>`;
    }).join("");
  }

}

/* ============================================================
   CATEGORIE DI SITI (per tutti i piani)
   ============================================================ */
// Stato UI delle righe categoria (riga aperta, modalità modifica, messaggio):
// solo vista, non viene persistito.
const catUi = {};
function catUiState(id) {
  return catUi[id] || (catUi[id] = { open: false, edit: false, msg: "", ok: false });
}

// Salva la lista personalizzata dei domini di una categoria (PRO). La verifica
// live avviene nel background: se l'utente non è PRO il salvataggio viene
// rifiutato e la firma UI (se falsificata) rimossa.
async function applyCatDomains(id, domains) {
  const resp = await sendMessage({ type: "proSaveCategories", id, domains });
  settings = await getSettings();
  const ui = catUiState(id);
  ui.edit = false;
  if (resp && resp.ok) {
    ui.msg = t("cat_saved_ok");
    ui.ok = true;
  } else if (resp && resp.reason === "pro") {
    ui.msg = t("pro_denied");
    ui.ok = false;
  } else {
    ui.msg = t("pro_action_failed");
    ui.ok = false;
  }
  renderCategories();
  renderPro();
  setTimeout(() => {
    const m = document.querySelector(`.cat-row[data-cat="${id}"] .cat-msg`);
    if (m) m.textContent = "";
  }, 4000);
}

function renderCategories() {
  const rows = el("catRows");
  const now = Date.now();
  const locked = !isPro(settings);
  rows.innerHTML = CATEGORIES.map(reg => {
    const conf = categoryConf(settings, reg.id);
    const ui = catUiState(reg.id);
    const inCt = (conf.ctUntil || 0) > now;
    const dis = inCt ? " disabled" : "";
    const name = esc(t(reg.labelKey));
    const doms = categoryDomains(settings, reg.id);
    const chips =
      (inCt ? `<span class="chip ct-chip" data-until="${conf.ctUntil}">⛓ ${esc(ctRemainingLabel(conf.ctUntil))}</span>` : "") +
      (conf.schedule ? `<span class="chip sched-chip" title="${esc(scheduleLabel(conf.schedule))}">🕒</span>` : "");
    const list = ui.open ? `
      <div class="cat-domain-list">
        <div class="cat-domain-chips">
          ${doms.length
            ? doms.map(d => `<span class="chip">${esc(d)}${ui.edit && !inCt && !locked
                ? `<button type="button" class="cat-del-dom" data-dom="${esc(d)}" title="${esc(t("cat_del_title"))}" aria-label="${esc(t("cat_del_title"))}">✕</button>`
                : ""}</span>`).join("")
            : `<span class="hint">${esc(t("cat_no_domains"))}</span>`}
        </div>
        <div class="cat-edit-row">
          ${ui.edit && !inCt && !locked ? `
            <input type="text" class="cat-dom-input" placeholder="${esc(t("cat_add_ph"))}" autocomplete="off" spellcheck="false" aria-label="${esc(t("cat_add_ph"))}">
            <button type="button" class="primary cat-dom-add" data-i18n="cat_add">${esc(t("cat_add"))}</button>
            <button type="button" class="cat-edit-done" data-i18n="cat_done">${esc(t("cat_done"))}</button>`
          : (inCt || locked)
            ? `<button type="button" class="cat-pro-note" data-edit-gate>🔒 PRO · ${esc(t("cat_edit"))}</button>`
            : `<button type="button" class="cat-edit-toggle" data-edit-start>✎ ${esc(t("cat_edit"))}</button>`}
        </div>
        <p class="cat-msg ${ui.ok ? "ok" : ui.msg ? "err" : ""}">${esc(ui.msg || "")}</p>
      </div>` : "";
    return `
    <div class="cat-row ${ui.open ? "open" : ""} ${inCt ? "ct-locked" : ""}" data-cat="${reg.id}">
      <label class="switch small"><input type="checkbox" class="cat-active" ${conf.active ? "checked" : ""} aria-label="${name}"${dis}><span class="slider"></span></label>
      <div class="cat-head" title="${esc(t("cat_view_title"))}">
        <span class="cat-chevron">▶</span>
        <span class="cat-name" title="${esc(doms.join(" · "))}">${name} <span class="chip">${doms.length}</span>${chips}</span>
      </div>
      <select class="cat-mode" aria-label="${name}"${dis}>
        <option value="hold" ${conf.mode === "hold" ? "selected" : ""}>${esc(t("mode_hold"))}</option>
        <option value="block" ${conf.mode === "block" ? "selected" : ""}>${esc(t("mode_block"))}</option>
      </select>
      <span class="delay-field">⏱ <input type="number" class="cat-delay" min="1" max="30" value="${conf.delay}" ${conf.mode === "block" || inCt ? "disabled" : ""}> s</span>
      <span class="limit-field">⏳ <input type="number" class="cat-limit" min="0" max="1440" value="${conf.limitMinutes}"${dis}> ${esc(t("limit_per_day_short"))}</span>
      ${list}
    </div>`;
  }).join("");

  rows.querySelectorAll(".cat-row").forEach(row => {
    const id = row.dataset.cat;
    const conf = settings.categories.find(c => c.id === id);
    if (!conf) return;
    row.querySelector(".cat-active").addEventListener("change", (e) => {
      conf.active = e.target.checked;
      save();
      checkIncognitoBanner();
    });
    row.querySelector(".cat-mode").addEventListener("change", (e) => {
      conf.mode = e.target.value;
      row.querySelector(".cat-delay").disabled = conf.mode === "block";
      save();
    });
    row.querySelector(".cat-delay").addEventListener("change", (e) => {
      conf.delay = Math.min(30, Math.max(1, Number(e.target.value) || 5));
      e.target.value = conf.delay;
      save();
    });
    row.querySelector(".cat-limit").addEventListener("change", (e) => {
      conf.limitMinutes = Math.max(0, Number(e.target.value) || 0);
      e.target.value = conf.limitMinutes;
      save();
    });
    // espandi/comprimi la lista dei domini della categoria
    const head = row.querySelector(".cat-head");
    if (head) head.addEventListener("click", () => {
      catUiState(id).open = !catUiState(id).open;
      renderCategories();
    });
    // modifica dei domini (PRO): entra/esci dalla modalità, aggiungi, rimuovi
    const startEdit = row.querySelector("[data-edit-start]");
    if (startEdit) startEdit.addEventListener("click", () => {
      catUiState(id).edit = true;
      renderCategories();
      const inp = document.querySelector(`.cat-row[data-cat="${id}"] .cat-dom-input`);
      if (inp) inp.focus();
    });
    const gate = row.querySelector("[data-edit-gate]");
    if (gate) gate.addEventListener("click", () => {
      const ui = catUiState(id);
      ui.msg = t("cat_edit_pro");
      ui.ok = false;
      const m = row.querySelector(".cat-msg");
      if (m) { m.textContent = ui.msg; m.classList.add("err"); }
    });
    const done = row.querySelector(".cat-edit-done");
    if (done) done.addEventListener("click", () => {
      catUiState(id).edit = false;
      renderCategories();
    });
    const addBtn = row.querySelector(".cat-dom-add");
    const input = row.querySelector(".cat-dom-input");
    if (addBtn && input) {
      const add = () => {
        const d = normalizeDomain(input.value);
        input.value = "";
        if (!d) return;
        const doms = categoryDomains(settings, id);
        if (doms.includes(d)) {
          const ui = catUiState(id);
          ui.msg = t("cat_dup");
          ui.ok = false;
          renderCategories();
          return;
        }
        applyCatDomains(id, [...doms, d]);
      };
      addBtn.addEventListener("click", add);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
    }
    row.querySelectorAll(".cat-del-dom").forEach(btn => {
      btn.addEventListener("click", () => {
        const d = btn.dataset.dom;
        applyCatDomains(id, categoryDomains(settings, id).filter(x => x !== d));
      });
    });
  });
  checkIncognitoBanner();
}

// Avviso incognito: le estensioni non sono attive in incognito di default.
let incogBound = false;
async function checkIncognitoBanner() {
  const banner = el("incogBanner");
  const adultiActive = (settings.categories || []).some(c => c.id === "adulti" && c.active);
  if (!adultiActive) { banner.hidden = true; return; }
  if (!incogBound) {
    incogBound = true;
    el("incogOpen").addEventListener("click", async () => {
      try {
        await chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id });
      } catch {
        el("incogOpen").textContent = "chrome://extensions/?id=" + chrome.runtime.id;
      }
    });
  }
  try {
    const allowed = await chrome.extension.isAllowedIncognitoAccess();
    banner.hidden = allowed !== false;
  } catch {
    banner.hidden = true; // API non disponibile: niente banner
  }
}

/* ============================================================
   FUNZIONI PRO (Cold Turkey + fasce orarie)
   ============================================================ */
let proBound = false;
function renderPro() {
  const unlocked = isPro(settings);
  el("proLocked").hidden = unlocked;
  el("proTools").hidden = !unlocked;
  if (!proBound) {
    proBound = true;
    el("ctStart").addEventListener("click", onCtStart);
    el("schedSave").addEventListener("click", onSchedSave);
    el("schedTarget").addEventListener("change", renderSchedEditor);
    el("schedList").addEventListener("click", onSchedDel);
    el("proUnlock").addEventListener("click", onProUnlock);
    el("proLogin").addEventListener("click", onProLogin);
  }
  if (unlocked) {
    fillTargetSelect(el("ctTarget"));
    fillTargetSelect(el("schedTarget"));
    renderCtActive();
    renderSchedEditor();
    renderSchedList();
  }
  renderProThemes(); // aggiorna i lucchetti delle card tema PRO allo stato attuale
}

function splitTarget(v) {
  const i = String(v || "").indexOf(":");
  return [v.slice(0, i), v.slice(i + 1)];
}

function findTarget(key) {
  const [kind, id] = splitTarget(key);
  if (kind === "site") {
    const s = settings.sites.find(x => String(x.id) === id);
    return s ? { kind, id, label: s.domain, ct: s.ctUntil || 0, sched: s.schedule || null } : null;
  }
  const reg = CATEGORIES.find(c => c.id === id);
  if (!reg) return null;
  const conf = categoryConf(settings, id);
  return { kind, id, label: t(reg.labelKey), ct: conf.ctUntil || 0, sched: conf.schedule || null };
}

function fillTargetSelect(sel) {
  const prev = sel.value;
  const opts = [];
  for (const s of settings.sites) opts.push({ v: "site:" + s.id, l: esc(s.domain) });
  for (const reg of CATEGORIES) opts.push({ v: "cat:" + reg.id, l: esc(t(reg.labelKey)) + " (" + esc(t("cat_word")) + ")" });
  sel.innerHTML = opts.map(o => `<option value="${o.v}">${o.l}</option>`).join("");
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}

function renderCtActive() {
  const now = Date.now();
  const items = [];
  for (const s of settings.sites) if ((s.ctUntil || 0) > now) items.push({ label: s.domain, until: s.ctUntil });
  for (const reg of CATEGORIES) {
    const conf = categoryConf(settings, reg.id);
    if ((conf.ctUntil || 0) > now) items.push({ label: t(reg.labelKey), until: conf.ctUntil });
  }
  el("ctActive").innerHTML = items.length
    ? items.map(it =>
      `<div class="pro-item"><span class="pro-label">⛓ ${esc(it.label)}</span>` +
      `<span class="chip ct-chip" data-until="${it.until}">⛓ ${esc(ctRemainingLabel(it.until))}</span></div>`).join("")
    : `<div class="empty">${esc(t("ct_empty"))}</div>`;
}

async function onCtStart() {
  const sel = el("ctTarget").value;
  const hours = Number(el("ctHours").value) || 0;
  const days = Number(el("ctDays").value) || 0;
  el("ctMsg").textContent = "";
  if (!sel) return;
  if (hours <= 0 && days <= 0) { el("ctMsg").textContent = t("ct_invalid"); return; }
  const [kind, id] = splitTarget(sel);
  const resp = await sendMessage({ type: "coldTurkey", kind, id, hours, days });
  await applyProResponse(resp, "ctMsg");
}

async function applyProResponse(resp, msgId) {
  settings = await getSettings(); // rilegge ciò che il background ha davvero salvato
  renderSites();
  renderCategories();
  renderPro();
  if (resp && resp.ok) { el(msgId).textContent = ""; return; }
  if (resp && resp.reason === "pro") { el("proMsg").textContent = t("pro_denied"); return; }
  el(msgId).textContent = t("pro_action_failed");
}

/* ---------------- fasce orarie ---------------- */
const _MON = new Date(2024, 0, 1); // lunedì
function weekdayNames() {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(_MON);
    d.setDate(_MON.getDate() + i);
    out.push(d.toLocaleDateString(localeTag(), { weekday: "short" }));
  }
  return out;
}
function minToHHMM(m) {
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}
function hhmmToMin(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || ""));
  return m ? (+m[1]) * 60 + (+m[2]) : NaN;
}
function scheduleLabel(sched) {
  if (!sched) return "";
  const wd = weekdayNames();
  const days = sched.days.map(d => wd[d - 1]);
  const dLabel = sched.days.length === 7 ? wd[0] + "–" + wd[6] : days.join(", ");
  return dLabel + " " + minToHHMM(sched.start) + "–" + minToHHMM(sched.end);
}

function renderSchedEditor() {
  const wrap = el("schedDays");
  const wd = weekdayNames();
  wrap.innerHTML = wd.map((name, i) =>
    `<button type="button" class="day-chip" data-d="${i + 1}">${esc(name)}</button>`).join("");
  wrap.querySelectorAll(".day-chip").forEach(ch =>
    ch.addEventListener("click", () => ch.classList.toggle("on")));
  const target = findTarget(el("schedTarget").value);
  const sched = target ? target.sched : null;
  wrap.querySelectorAll(".day-chip").forEach(ch =>
    ch.classList.toggle("on", !!(sched && sched.days.includes(Number(ch.dataset.d)))));
  el("schedStart").value = sched ? minToHHMM(sched.start) : "09:00";
  el("schedEnd").value = sched ? minToHHMM(sched.end) : "18:00";
}

async function onSchedSave() {
  const sel = el("schedTarget").value;
  el("schedMsg").textContent = "";
  if (!sel) return;
  const days = [...document.querySelectorAll("#schedDays .day-chip.on")].map(ch => Number(ch.dataset.d));
  const start = hhmmToMin(el("schedStart").value);
  const end = hhmmToMin(el("schedEnd").value);
  if (!days.length || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    el("schedMsg").textContent = t("sched_invalid");
    return;
  }
  const [kind, id] = splitTarget(sel);
  const resp = await sendMessage({ type: "proSchedule", kind, id, schedule: { days, start, end } });
  await applyProResponse(resp, "schedMsg");
}

function renderSchedList() {
  const items = [];
  for (const s of settings.sites) if (s.schedule) items.push({ kind: "site", id: s.id, label: s.domain, sched: s.schedule });
  for (const reg of CATEGORIES) {
    const conf = categoryConf(settings, reg.id);
    if (conf.schedule) items.push({ kind: "cat", id: reg.id, label: t(reg.labelKey), sched: conf.schedule });
  }
  el("schedList").innerHTML = items.length
    ? items.map(it =>
      `<div class="pro-item"><span class="pro-label">🕒 ${esc(it.label)}</span>` +
      `<span class="hint">${esc(scheduleLabel(it.sched))}</span>` +
      `<button type="button" class="pro-del" data-kind="${it.kind}" data-id="${it.id}" title="${esc(t("sched_remove"))}">✕</button></div>`).join("")
    : `<div class="empty">${esc(t("sched_empty"))}</div>`;
}

async function onSchedDel(e) {
  const btn = e.target.closest(".pro-del");
  if (!btn) return;
  const resp = await sendMessage({ type: "proSchedule", kind: btn.dataset.kind, id: btn.dataset.id, schedule: null });
  await applyProResponse(resp, "schedMsg");
}

/* ---------------- toggle PRO di sviluppo (sezione Info) ---------------- */
let devBound = false;
async function renderDev() {
  if (!el("proTestToggle")) return;
  try {
    const d = await chrome.storage.local.get("_devPro");
    el("proTestToggle").checked = d._devPro === true;
  } catch { /* ignora */ }
  if (devBound) return;
  devBound = true;
  el("proTestToggle").addEventListener("change", async (e) => {
    const on = e.target.checked;
    await chrome.storage.local.set({ _devPro: on });
    await sendMessage({ type: "proTest", on });
    settings = await getSettings();
    renderPro();
  });
}

/* ---------------- sblocco PRO via ExtensionPay (sezione 7) ---------------- */
let extpayUI = null;
let proThanksTimer = null;
function uiExtPay() {
  if (!extpayUI && extpayConfigured()) extpayUI = ExtPay(EXT_PAY_ID);
  return extpayUI;
}

function proThanks(text) {
  const th = el("proThanks");
  th.textContent = text;
  th.hidden = false;
  clearTimeout(proThanksTimer || 0);
  proThanksTimer = setTimeout(() => { th.hidden = true; }, 8000);
}

async function onProUnlock() {
  el("proMsg").textContent = "";
  const ep = uiExtPay();
  if (!ep) {
    el("proMsg").textContent = t("pro_not_configured"); // build di sviluppo: serve il toggle in Info
    return;
  }
  try {
    await ep.openPaymentPage();
    pollPaidStatus();
  } catch {
    el("proMsg").textContent = t("pro_pay_error");
  }
}

async function onProLogin() {
  el("proMsg").textContent = "";
  const ep = uiExtPay();
  if (!ep) {
    el("proMsg").textContent = t("pro_not_configured");
    return;
  }
  try {
    await ep.openLoginPage(); // chi ha già pagato può riattivare su questo browser
    pollPaidStatus();
  } catch {
    el("proMsg").textContent = t("pro_pay_error");
  }
}

// Mentre l'utente completa il pagamento in un'altra scheda, interroga lo stato
// ogni 4 s (max ~5 minuti); appena risulta pagato, chiede al background di
// riallineare la firma UI: i lucchetti spariscono all'istante. Nessun contenuto
// personale viene inviato: è solo la verifica dello stato di pagamento.
async function pollPaidStatus() {
  const ep = uiExtPay();
  if (!ep || isPro(settings)) return;
  for (let i = 0; i < 75; i++) {
    await new Promise(r => setTimeout(r, 4000));
    let paid = false;
    try { const user = await ep.getUser(); paid = !!(user && user.paid); } catch { /* rete: riprova */ }
    if (paid) {
      const resp = await sendMessage({ type: "proRefresh" });
      settings = await getSettings();
      renderPro();
      if (resp && resp.paid) proThanks(t("pro_thanks"));
      return;
    }
  }
}

/* ---------------- countdown dei blocchi ferrei ---------------- */
function ctRemainingLabel(until) {
  const ms = (until || 0) - Date.now();
  if (ms <= 0) return "";
  const h = Math.floor(ms / 3600000);
  const m = Math.max(1, Math.floor((ms % 3600000) / 60000));
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// un tick al secondo: aggiorna i countdown e, quando un blocco scade, sblocca le righe
setInterval(() => {
  if (!settings) return;
  const now = Date.now();
  let expired = false;
  for (const o of [...(settings.sites || []), ...(settings.categories || [])]) {
    if ((o.ctUntil || 0) > 0 && o.ctUntil <= now) expired = true;
  }
  document.querySelectorAll(".ct-chip").forEach(ch => {
    const u = Number(ch.dataset.until || 0);
    if (u > now) ch.textContent = "⛓ " + ctRemainingLabel(u);
  });
  if (expired) {
    renderSites();
    renderCategories();
    renderPro();
  }
}, 1000);

init();