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

  // cambio lingua dall'esterno (es. un'altra scheda) → ri-render del tutto
  onStorageChange((changes) => {
    const s = changes.settings;
    if (!s || !s.newValue) return;
    if ((s.oldValue || {}).lang !== s.newValue.lang) {
      settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...s.newValue, sites: s.newValue.sites || [] };
      setUILang(settings.lang);
      applyI18n(document);
      renderAll();
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
  renderGrace();
  renderTheme();
  renderTypography();
  renderLang();
  renderSearchEngine();
  renderSearchToggle();
  renderPin();
  renderStats();
  el("focusToggle").checked = settings.focusEnabled;
}

function renderSites() {
  el("siteSuggestions").innerHTML = SUGGESTED_SITES.map(s => `<option value="${esc(s)}">`).join("");
  const rows = el("siteRows");
  rows.innerHTML = settings.sites.map(s => `
    <div class="site-row" data-id="${s.id}">
      <label class="switch small"><input type="checkbox" class="site-active" ${s.active ? "checked" : ""} aria-label="${esc(t("active_aria"))}"><span class="slider"></span></label>
      <span class="site-domain">${esc(s.domain)}</span>
      <select class="site-mode" aria-label="${esc(t("mode_aria"))}">
        <option value="hold" ${s.mode === "hold" ? "selected" : ""}>${esc(t("mode_hold"))}</option>
        <option value="block" ${s.mode === "block" ? "selected" : ""}>${esc(t("mode_block"))}</option>
      </select>
      <span class="delay-field">⏱ <input type="number" class="site-delay" min="1" max="30" value="${s.delay}" ${s.mode === "block" ? "disabled" : ""}> s</span>
      <span class="limit-field">⏳ <input type="number" class="site-limit" min="0" max="1440" value="${s.limitMinutes}"> ${esc(t("limit_per_day_short"))}</span>
      <button class="site-del-btn" title="${esc(t("remove_aria"))}" aria-label="${esc(t("remove_aria"))}">✕</button>
    </div>`).join("");

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
    applyTheme(document.documentElement, settings);
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
      const id = card.dataset.theme;
      if (e.target.closest(".t-del")) {
        removeCustomTheme(id); // ✕ della card: elimina senza selezionare
        return;
      }
      settings.theme = id;
      save(); // updateThemeSelection apostera l'editor sul tema scelto
    });
  });
  el("themeNewCard").addEventListener("click", () => openCustomEditor(null));

  updateThemeSelection();
}

/* ---------------- temi custom ------------- */
let customEditingId = null; // id del tema in modifica; null = nuovo tema

// Evidenzia il tema selezionato e apre l'editor quando è selezionato un tema
// custom (così si possono rifinire i colori con precisione). Chiamato da save().
function updateThemeSelection() {
  document.querySelectorAll("#themeGrid .theme-card").forEach(card => {
    card.classList.toggle("selected", settings.theme === card.dataset.theme);
  });
  const ct = findCustomTheme(settings);
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

init();