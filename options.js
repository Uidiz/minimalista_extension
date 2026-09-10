// options.js — impostazioni: siti, categorie, statistiche, aspetto, funzioni PRO.
"use strict";

let settings = null;
const el = (id) => document.getElementById(id);

// Icone SVG monocromatiche (spessore sottile) usate nella UI PRO al posto delle
// emoji: lucchetto per i blocchi ferrei, orologio per le fasce orarie.
const ICO = {
  lock: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
};

/* ============================================================
   Avvio: carica le impostazioni e mostra la pagina
   ============================================================ */
async function init() {
  settings = await getSettings();
  setUILang(settings.lang);
  applyI18n(document);
  applyTheme(document.documentElement, settings);
  showApp();
}

function showApp() {
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

  // dialog di conferma del blocco ferreo: confermare esegue, chiudere/ESC annulla
  const ctDialog = el("ctConfirm");
  el("ctConfirmOk").addEventListener("click", onCtConfirm);
  el("ctConfirmCancel").addEventListener("click", () => { ctPending = null; ctDialog.close(); });
  ctDialog.addEventListener("close", () => { ctPending = null; });

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
  renderCardHover();
  renderLang();
  renderSearchEngine();
  renderSearchToggle();
  renderHomeSectionsToggles();
  renderBgMotion();
  renderMembership();
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
      (inCt ? `<span class="chip ct-chip" data-until="${s.ctUntil}">${ICO.lock} ${esc(ctRemainingLabel(s.ctUntil))}</span>` : "") +
      (s.schedule ? `<span class="chip sched-chip" title="${esc(scheduleLabel(s.schedule))}">${ICO.clock}</span>` : "");
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
    checkIncognitoBanner(); // attivazione/disattivazione di blocchi → aggiorna il banner
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

  renderProThemes();
  updateThemeSelection();
}

/* ---------------- temi PRO (gradienti) ---------------- */

// Applica il tema corrente di settings.
function applyCurrentTheme() {
  applyTheme(document.documentElement, settings);
}

function renderProThemes() {
  const grid = el("proThemeGrid");
  if (!grid) return;
  grid.dataset.total = String(PRO_THEME_IDS.length); // esposizione per i test e2e
  const unlocked = isPro(settings);
  grid.innerHTML = PRO_THEME_IDS.map(id => {
    const t = PRO_THEMES[id];
    const grad = `linear-gradient(160deg, ${t.grad[0]}, ${t.grad[1]})`;
    return `
      <div class="theme-card pro" data-pro-theme="${id}">
        ${unlocked ? `<span class="pro-badge">PRO</span>` : `<span class="t-lock">${ICO.lock}</span>`}
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
    settings.theme = id;
    save();
    return;
  }
  // non-PRO: la preview si apre nella dashboard (nuova scheda) dove il tema è
  // visibile in azione; non viene mai persistito.
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") + "?preview=" + encodeURIComponent(id) });
}

/* ---------------- temi custom ------------- */
let customEditingId = null; // id del tema in modifica; null = nuovo tema

// Evidenzia il tema selezionato (entrambe le griglie) e apre l'editor quando è
// selezionato un tema custom. Chiamato da save().
function updateThemeSelection() {
  document.querySelectorAll("#themeGrid .theme-card, #proThemeGrid .theme-card").forEach(card => {
    const id = card.dataset.proTheme || card.dataset.theme;
    card.classList.toggle("selected", id === settings.theme);
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
    ct = { name: "", bg: cssToRgb(t.bg), fg: cssToRgb(t.fg), accent: cssToRgb(t.accent), bgImage: "" };
  }
  el("ctName").value = ct.name || "";
  setColorInputs("bg", ct.bg);
  setColorInputs("fg", ct.fg);
  setColorInputs("accent", ct.accent);
  el("ctBgImage").value = ct.bgImage || "";
  // l'immagine di sfondo del tema custom è PRO: per i free il campo resta bloccato
  const pro = isPro(settings);
  el("ctBgImage").disabled = !pro;
  el("ctBgImageLock").hidden = pro;
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
    accent: hexToRgb(document.querySelector('.ct-picker[data-key="accent"]').value),
    // PRO: URL dell'immagine di sfondo associata al tema (per i free resta vuoto)
    bgImage: isPro(settings) ? (el("ctBgImage").value || "").trim() : ""
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

  // immagine di sfondo (URL): funzione PRO — per i free il campo è disabilitato
  // (e il valore non viene mai conservato: la sanitizzazione del background lo toglie)
  const pro = isPro(settings);
  el("bgImage").disabled = !pro;
  el("bgImageLock").hidden = pro;

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

let cardHoverBound = false;
function renderCardHover() {
  el("cardHoverToggle").checked = settings.cardHover !== false;
  if (!cardHoverBound) {
    cardHoverBound = true;
    el("cardHoverToggle").addEventListener("change", (e) => {
      settings.cardHover = e.target.checked;
      // applyTheme gestisce la classe no-hover su <body>: effetto immediato qui e nelle altre pagine
      applyTheme(document.documentElement, settings);
      save();
    });
  }
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
  applySearchEngineState();
  if (!searchToggleBound) {
    searchToggleBound = true;
    el("showSearchToggle").addEventListener("change", (e) => {
      settings.showSearch = e.target.checked;
      applySearchEngineState();
      save();
    });
  }
}
// il motore di ricerca serve solo se la barra è visibile: barra nascosta → disabilitato e attenuato
function applySearchEngineState() {
  const on = settings.showSearch !== false;
  el("searchEngine").disabled = !on;
  el("searchEngineRow").classList.toggle("dimmed", !on);
}

/* ============================================================
   HOME — sezioni della nuova scheda visibili/nascoste
   ============================================================ */
let homeTogglesBound = false;
function renderHomeSectionsToggles() {
  el("showTodoToggle").checked = settings.showTodo !== false;
  el("showFavToggle").checked = settings.showFavorites !== false;
  el("showFocusToggle").checked = settings.showFocus !== false;
  if (homeTogglesBound) return;
  homeTogglesBound = true;
  el("showTodoToggle").addEventListener("change", (e) => { settings.showTodo = e.target.checked; save(); });
  el("showFavToggle").addEventListener("change", (e) => { settings.showFavorites = e.target.checked; save(); });
  el("showFocusToggle").addEventListener("change", (e) => { settings.showFocus = e.target.checked; save(); });
}

/* modalità dello sfondo dei temi PRO (aurora animata / bagliore statico / solo gradiente) */
let bgMotionBound = false;
function renderBgMotion() {
  const sel = el("bgMotionSelect");
  sel.value = ["aurora", "static", "plain"].includes(settings.bgMotion) ? settings.bgMotion : "aurora";
  if (bgMotionBound) return;
  bgMotionBound = true;
  sel.addEventListener("change", (e) => { settings.bgMotion = e.target.value; save(); });
}

/* ============================================================
   STATISTICHE
   ============================================================ */
let stats = null;
let statsOffset = 0;      // giorni indietro rispetto a oggi nella vista statistiche
let statsNavBound = false;

// Etichetta del giorno in esame: "Oggi" / "Ieri" / data formattata.
function statsDayLabel() {
  if (statsOffset === 0) return t("day_today");
  if (statsOffset === 1) return t("day_yesterday");
  return fmtDayLabel(dayKey(addDays(new Date(), -statsOffset)));
}

// Confronto settimanale: ultime 4 finestre di 7 giorni, con lo stesso dettaglio
// della vista giornaliera (tempo per sito, blocchi/sblocchi). Le "fasce orarie"
// della giornata non vengono tracciate dal modello dati (solo totali per giorno),
// quindi il confronto copre il tempo per sito e i contatori per settimana.
function renderWeekCmp() {
  const body = el("weekCmpBody");
  const distSet = new Set((settings.sites || []).map(s => s.domain));
  const weeks = [];
  for (let w = 0; w < 4; w++) {
    const end = addDays(new Date(), -w * 7);
    const start = addDays(end, -6);
    const perSite = {};
    const perDay = []; // 7 giorni della settimana: distraenti vs altri (come il grafico principale)
    let blocked = 0, unlocks = 0;
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, d);
      const k = dayKey(day);
      const { distracting, other } = splitByCategory(stats.byDay[k] || {}, settings);
      perDay.push({ key: k, day, dist: totalSeconds(distracting), other: totalSeconds(other) });
      for (const dom in (stats.byDay[k] || {})) perSite[dom] = (perSite[dom] || 0) + stats.byDay[k][dom];
      blocked += stats.blocked[k] || 0;
      unlocks += stats.unlocks[k] || 0;
    }
    const dist = perDay.reduce((a, p) => a + p.dist, 0);
    const other = perDay.reduce((a, p) => a + p.other, 0);
    const top = Object.entries(perSite).sort((a, b) => b[1] - a[1]).slice(0, 5);
    weeks.push({ start, end, dist, other, blocked, unlocks, top, perDay });
  }

  // grafico riassuntivo: le 4 settimane a confronto (barre accatastate distraenti/altri)
  const maxTotal = Math.max(1, ...weeks.map(w => w.dist + w.other));
  const pctOf = (v) => v <= 0 ? 0 : Math.max(3, (v / maxTotal) * 100);

  // mini grafico per settimana: gli stessi 7 giorni della card "ultimi 7 giorni"
  const miniChart = (wk) => {
    const wkMax = Math.max(1, ...wk.perDay.map(p => p.dist + p.other));
    const pct = (v) => v <= 0 ? 0 : Math.max(2, (v / wkMax) * 100);
    return wk.perDay.map(p => {
      const totalSecs = p.dist + p.other;
      const bars = totalSecs > 0
        ? `<div class="bar-stack">
            ${p.other > 0 ? `<div class="bar other" style="height:${pct(p.other)}%"></div>` : ""}
            ${p.dist > 0 ? `<div class="bar" style="height:${pct(p.dist)}%"></div>` : ""}
          </div>`
        : `<div class="bar-stack"></div>`;
      return `<div class="bar-col" title="${esc(fmtDayLabel(p.key))} — ${esc(fmtDuration(totalSecs))}">
        ${bars}
        <span class="bar-label">${esc(p.day.toLocaleDateString(localeTag(), { weekday: "short" }))}</span>
      </div>`;
    }).join("");
  };

  body.innerHTML = `
    <div class="week-cmp-summary">
      <div class="week-cmp-summary-label">${esc(t("week_cmp_summary"))}</div>
      <div class="legend">
        <span class="lg"><span class="sw dist"></span>${esc(t("legend_distracting"))}</span>
        <span class="lg"><span class="sw other"></span>${esc(t("legend_other"))}</span>
      </div>
      <div class="week-cmp-chart">
        ${weeks.map(wk => `
          <div class="bar-col" title="${esc(fmtShortDate(dayKey(wk.start)))} — ${esc(fmtDuration(wk.dist + wk.other))}">
            <span class="bar-val">${esc(fmtDuration(wk.dist + wk.other))}</span>
            <div class="bar-stack">
              ${wk.other > 0 ? `<div class="bar other" style="height:${pctOf(wk.other)}%"></div>` : ""}
              ${wk.dist > 0 ? `<div class="bar" style="height:${pctOf(wk.dist)}%"></div>` : ""}
            </div>
            <span class="bar-label">${esc(fmtShortDate(dayKey(wk.start)))}</span>
          </div>`).join("")}
      </div>
    </div>
    ${weeks.map(wk => {
      const totalSecs = wk.dist + wk.other;
      const topHtml = wk.top.length
        ? wk.top.map(([dom, secs]) => {
            const isDist = distSet.has(dom);
            return `
        <div class="top-row">
          <span class="t-name ${isDist ? "dist" : ""}" ${isDist ? `title="${esc(t("on_distracting_sites"))}"` : ""}>${isDist ? `<span class="dot"></span>` : ""}${esc(dom)}</span>
          <span class="t-track"><span class="t-fill" style="width:${totalSecs ? Math.round((secs / totalSecs) * 100) : 0}%"></span></span>
          <span class="t-val">${Math.round(totalSecs ? (secs / totalSecs) * 100 : 0)}% · ${fmtDuration(secs)}</span>
        </div>`;
          }).join("")
        : `<p class="hint">${esc(t("stats_no_data_today"))}</p>`;
      return `
        <div class="week-cmp-block">
          <div class="week-cmp-head">
            <span class="week-cmp-label">${esc(t("week_cmp_week", { date: fmtShortDate(dayKey(wk.start)) }))}</span>
            <span class="week-cmp-totals">${t("stats_breakdown", { dist: fmtDuration(wk.dist), other: fmtDuration(wk.other) })} · ${t("stats_today_counts", { blocked: wk.blocked, unlocks: wk.unlocks })}</span>
          </div>
          <div class="week-cmp-mini">${miniChart(wk)}</div>
          ${topHtml}
        </div>`;
    }).join("")}
  `;
}

function openWeekCmp() {
  if (el("weekDialog").open) return;
  renderWeekCmp();
  el("weekDialog").showModal();
}

async function renderStats() {
  stats = await getStats();
  // la vista si sposta nel tempo con le frecce ‹ › (offset in giorni da oggi)
  const today = addDays(new Date(), -statsOffset);
  const distSet = new Set((settings.sites || []).map(s => s.domain));
  el("dayLabel").textContent = statsDayLabel();
  el("dayNext").disabled = statsOffset === 0;
  if (!statsNavBound) {
    statsNavBound = true;
    el("dayPrev").addEventListener("click", () => { statsOffset = Math.min(69, statsOffset + 1); renderStats(); });
    el("dayNext").addEventListener("click", () => { statsOffset = Math.max(0, statsOffset - 1); renderStats(); });
    el("weekCmpOpen").addEventListener("click", openWeekCmp);
    // la card "Browsing Time" è cliccabile: apre il confronto settimanale
    el("statsWeekCard").addEventListener("click", (e) => {
      if (e.target.closest("#weekCmpOpen")) return; // il bottone gestisce già il click
      openWeekCmp();
    });
    el("weekCmpClose").addEventListener("click", () => el("weekDialog").close());
    // click fuori dal dialog (sul backdrop) → chiusura, come una finestra di sistema
    el("weekDialog").addEventListener("click", (e) => {
      if (e.target === el("weekDialog")) el("weekDialog").close();
    });
  }

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
      (inCt ? `<span class="chip ct-chip" data-until="${conf.ctUntil}">${ICO.lock} ${esc(ctRemainingLabel(conf.ctUntil))}</span>` : "") +
      (conf.schedule ? `<span class="chip sched-chip" title="${esc(scheduleLabel(conf.schedule))}">${ICO.clock}</span>` : "");
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
            ? `<button type="button" class="cat-pro-note" data-edit-gate>${ICO.lock} PRO · ${esc(t("cat_edit"))}</button>`
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

// Avviso incognito: le estensioni non sono attive in incognito di default, quindi
// chi naviga in incognito non verrebbe mai bloccato. Il banner è un piccolo easter
// egg: compare SOLO quando si attiva la categoria "Adulti" (le estensioni non agiscono
// in incognito, e i siti per adulti sono quelli che più spesso si cercano lì).
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
    // campo orario: selettori ora/minuti (opzioni fisse) che scrivono la bozza
    const hOpts = Array.from({ length: 24 }, (_, i) => `<option value="${i}">${String(i).padStart(2, "0")}</option>`).join("");
    const mOpts = Array.from({ length: 60 }, (_, i) => `<option value="${i}">${String(i).padStart(2, "0")}</option>`).join("");
    for (const id of ["schedStartH", "schedEndH"]) el(id).innerHTML = hOpts;
    for (const id of ["schedStartM", "schedEndM"]) el(id).innerHTML = mOpts;
    el("schedStartH").addEventListener("change", e => { if (schedDraft) schedDraft.start = Number(e.target.value) * 60 + (schedDraft.start % 60); });
    el("schedStartM").addEventListener("change", e => { if (schedDraft) schedDraft.start = Math.floor(schedDraft.start / 60) * 60 + Number(e.target.value); });
    el("schedEndH").addEventListener("change", e => { if (schedDraft) schedDraft.end = Number(e.target.value) * 60 + (schedDraft.end % 60); });
    el("schedEndM").addEventListener("change", e => { if (schedDraft) schedDraft.end = Math.floor(schedDraft.end / 60) * 60 + Number(e.target.value); });
  }
  if (unlocked) {
    fillTargetSelect(el("ctTarget"));
    fillTargetSelect(el("schedTarget"));
    renderCtActive();
    renderSchedEditor();
    renderSchedList();
  }
  renderProThemes();  // aggiorna i lucchetti delle card tema PRO allo stato attuale
  renderShortcuts();  // e il blocco/abilitazione dei collegamenti rapidi
  renderMembership(); // stato account e upgrade (sezione Membership)
  renderAdvanced();   // sblocca/blocca l'immagine di sfondo (URL) al cambio firma
  // la card "Sfondo dei temi PRO" ha senso solo con un tema PRO applicabile
  el("bgMotionCard").hidden = !unlocked;
}

/* ============================================================
   COLLEGAMENTI RAPIDI (PRO) — Aspetto → riga in alto a destra
   ============================================================ */
let shortcutsBound = false;
function renderShortcuts() {
  const unlocked = isPro(settings);
  el("shortcutsLocked").hidden = unlocked;
  el("shortcutsBody").hidden = !unlocked;
  if (!shortcutsBound) {
    shortcutsBound = true;
    el("shortcutAdd").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = el("shortcutName").value.trim();
      const url = el("shortcutUrl").value.trim();
      if (!name || !/^https?:\/\//i.test(url)) return;
      settings.shortcuts = [...(settings.shortcuts || []), { id: Date.now() + Math.random(), preset: null, name, url }];
      el("shortcutName").value = "";
      el("shortcutUrl").value = "";
      renderShortcuts();
      save();
    });
    el("shortcutsUnlock").addEventListener("click", () => {
      // l'upsell è consolidato nella sezione Membership: porta l'utente lì
      switchSection("membership");
      onProUnlock("mMsg");
    });
  }
  if (!unlocked) return;

  const list = settings.shortcuts || [];
  const rows = el("shortcutRows");
  if (!list.length) {
    rows.innerHTML = `<div class="empty">${esc(t("shortcuts_empty"))}</div>`;
  } else {
    rows.innerHTML = list.map(s => `
      <div class="shortcut-row" data-id="${esc(String(s.id))}">
        <span class="shortcut-name">${esc(shortcutLabel(s))}</span>
        <span class="shortcut-url">${esc(s.url)}</span>
        <button type="button" class="shortcut-del" title="${esc(t("remove_aria"))}" aria-label="${esc(t("remove_aria"))}">✕</button>
      </div>`).join("");
    rows.querySelectorAll(".shortcut-del").forEach(btn => {
      btn.addEventListener("click", () => {
        settings.shortcuts = (settings.shortcuts || []).filter(s => String(s.id) !== btn.parentElement.dataset.id);
        renderShortcuts();
        save();
      });
    });
  }

  // i preset già scelti spariscono dalla fila dei suggeriti
  const chosen = new Set(list.map(s => s.preset).filter(Boolean));
  el("shortcutPresets").innerHTML = SHORTCUT_PRESETS.filter(p => !chosen.has(p.id))
    .map(p => `<button type="button" class="chip shortcut-add" data-preset="${p.id}">+ ${esc(t(p.labelKey))}</button>`)
    .join("");
  el("shortcutPresets").querySelectorAll(".shortcut-add").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = SHORTCUT_PRESETS.find(x => x.id === btn.dataset.preset);
      if (!p) return;
      settings.shortcuts = [...(settings.shortcuts || []), { id: Date.now() + Math.random(), preset: p.id, name: "", url: p.url }];
      renderShortcuts();
      save();
    });
  });
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
      `<div class="pro-item"><span class="pro-label">${ICO.lock} ${esc(it.label)}</span>` +
      `<span class="chip ct-chip" data-until="${it.until}">${ICO.lock} ${esc(ctRemainingLabel(it.until))}</span></div>`).join("")
    : `<div class="empty">${esc(t("ct_empty"))}</div>`;
}

// durata leggibile per il riepilogo: "2 giorni, 3 ore" (componenti a zero omessi)
function ctDurationLabel(hours, days) {
  const parts = [];
  if (days > 0) parts.push(days + " " + t("ct_days"));
  if (hours > 0) parts.push(hours + " " + t("ct_hours"));
  return parts.join(", ");
}

let ctPending = null; // blocco in attesa della conferma esplicita nel dialog
function onCtStart() {
  const sel = el("ctTarget").value;
  const hours = Number(el("ctHours").value) || 0;
  const days = Number(el("ctDays").value) || 0;
  el("ctMsg").textContent = "";
  if (!sel) return;
  if (hours <= 0 && days <= 0) { el("ctMsg").textContent = t("ct_invalid"); return; }
  const target = findTarget(sel);
  if (!target) return;
  // sicurezza: il blocco è irreversibile, quindi prima di partire chiediamo conferma
  // spiegando per bene cosa si sta per fare.
  ctPending = { kind: target.kind, id: target.id, hours, days };
  el("ctConfirmBody").textContent = t("ct_confirm_body", { label: target.label, dur: ctDurationLabel(hours, days) });
  el("ctConfirm").showModal();
}

async function onCtConfirm() {
  const p = ctPending;
  el("ctConfirm").close();
  ctPending = null;
  if (!p) return;
  const resp = await sendMessage({ type: "coldTurkey", kind: p.kind, id: p.id, hours: p.hours, days: p.days });
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
function scheduleLabel(sched) {
  if (!sched) return "";
  const wd = weekdayNames();
  const days = sched.days.map(d => wd[d - 1]);
  const dLabel = sched.days.length === 7 ? wd[0] + "–" + wd[6] : days.join(", ");
  return dLabel + " " + minToHHMM(sched.start) + "–" + minToHHMM(sched.end);
}

// Bozza NON persistita dell'editor fasce orarie: i giorni e gli orari scelti
// dall'utente sopravvivono ai ri-render della pagina (es. scadenza di un blocco
// ferreo o cambio di firma PRO) finché non vengono salvati o si cambia
// destinazione. schedDraft.target è la chiave "kind:id" a cui si riferisce.
let schedDraft = null;

function renderSchedEditor() {
  const wrap = el("schedDays");
  const wd = weekdayNames();
  wrap.innerHTML = wd.map((name, i) =>
    `<button type="button" class="day-chip" data-d="${i + 1}">${esc(name)}</button>`).join("");
  const targetKey = el("schedTarget").value;
  const target = findTarget(targetKey);
  const saved = target ? target.sched : null;
  // la bozza resta quella in corso finché non si salva o si cambia destinazione
  if (!schedDraft || schedDraft.target !== targetKey) {
    schedDraft = {
      target: targetKey,
      days: saved ? [...saved.days] : [],
      start: saved ? saved.start : 9 * 60,
      end: saved ? saved.end : 18 * 60
    };
  }
  wrap.querySelectorAll(".day-chip").forEach(ch => {
    const d = Number(ch.dataset.d);
    ch.classList.toggle("on", schedDraft.days.includes(d));
    ch.addEventListener("click", () => {
      schedDraft.days = schedDraft.days.includes(d)
        ? schedDraft.days.filter(x => x !== d)
        : [...schedDraft.days, d];
      ch.classList.toggle("on");
    });
  });
  el("schedStartH").value = String(Math.floor(schedDraft.start / 60));
  el("schedStartM").value = String(schedDraft.start % 60);
  el("schedEndH").value = String(Math.floor(schedDraft.end / 60));
  el("schedEndM").value = String(schedDraft.end % 60);
}

async function onSchedSave() {
  const sel = el("schedTarget").value;
  el("schedMsg").textContent = "";
  if (!sel) return;
  const days = [...document.querySelectorAll("#schedDays .day-chip.on")].map(ch => Number(ch.dataset.d));
  const start = Number(el("schedStartH").value) * 60 + Number(el("schedStartM").value);
  const end = Number(el("schedEndH").value) * 60 + Number(el("schedEndM").value);
  if (!days.length || end <= start) {
    el("schedMsg").textContent = t("sched_invalid");
    return;
  }
  const [kind, id] = splitTarget(sel);
  const resp = await sendMessage({ type: "proSchedule", kind, id, schedule: { days, start, end } });
  if (resp && resp.ok) schedDraft = null; // salvato: la prossima render riparte dallo stato persistito
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
      `<div class="pro-item"><span class="pro-label">${ICO.clock} ${esc(it.label)}</span>` +
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

/* ---------------- Membership: stato account + upgrade (sezione dedicata) ---------------- */
let membershipBound = false;
function renderMembership() {
  const unlocked = isPro(settings);
  el("planName").textContent = unlocked ? t("membership_state_lifetime") : t("membership_state_free");
  el("planDesc").textContent = unlocked ? t("membership_pro_desc") : t("membership_free_desc");
  el("membershipLocked").hidden = unlocked;
  el("membershipActive").hidden = !unlocked;
  if (membershipBound) return;
  membershipBound = true;
  el("mUnlock").addEventListener("click", () => onProUnlock("mMsg"));
  el("mLogin").addEventListener("click", () => onProLogin("mMsg"));
  el("proGoMembership").addEventListener("click", () => switchSection("membership"));
}

/* ---------------- sblocco PRO via ExtensionPay ---------------- */
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

async function onProUnlock(msgId = "proMsg") {
  el(msgId).textContent = "";
  const ep = uiExtPay();
  if (!ep) {
    el(msgId).textContent = t("pro_not_configured"); // build senza EXT_PAY_ID: PRO bloccato
    return;
  }
  try {
    await ep.openPaymentPage();
    pollPaidStatus();
  } catch {
    el(msgId).textContent = t("pro_pay_error");
  }
}

async function onProLogin(msgId = "proMsg") {
  el(msgId).textContent = "";
  const ep = uiExtPay();
  if (!ep) {
    el(msgId).textContent = t("pro_not_configured");
    return;
  }
  try {
    await ep.openLoginPage(); // chi ha già pagato può riattivare su questo browser
    pollPaidStatus();
  } catch {
    el(msgId).textContent = t("pro_pay_error");
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
  let changed = false;
  for (const o of [...(settings.sites || []), ...(settings.categories || [])]) {
    if ((o.ctUntil || 0) > 0 && o.ctUntil <= now) { o.ctUntil = 0; changed = true; }
  }
  document.querySelectorAll(".ct-chip").forEach(ch => {
    const u = Number(ch.dataset.until || 0);
    if (u > now) ch.innerHTML = ICO.lock + " " + ctRemainingLabel(u);
  });
  if (changed) {
    // pulizia una tantum dei blocchi scaduti: senza, ogni tick ri-renderizzerebbe
    // le sezioni PRO all'infinito (azzerando la selezione dell'editor fasce orarie)
    renderSites();
    renderCategories();
    renderPro();
    save();
  }
}, 1000);

init();