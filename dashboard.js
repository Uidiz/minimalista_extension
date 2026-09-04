// dashboard.js — nuova scheda: orologio, ToDo, preferiti, stato del focus e statistiche del giorno.
"use strict";

let settings = null;
let todo = [];
let favorites = [];
let stats = null;
let editingId = null; // id dell'attività ToDo in modifica

const el = (id) => document.getElementById(id);

async function init() {
  settings = await getSettings();
  todo = await getTodo();
  favorites = await getFavorites();
  stats = await getStats();
  setUILang(settings.lang);
  applyI18n(document);
  applyTheme(document.documentElement, settings);

  renderClock();
  setInterval(renderClock, 250);
  renderStatus();
  renderSections();
  renderQuickLinks();
  renderTodo();
  renderFavorites();
  renderFocus();

  // i collegamenti rapidi si aprono in una nuova scheda (la dashboard resta aperta)
  el("quickLinks").addEventListener("click", (e) => {
    const a = e.target.closest("a[data-url]");
    if (!a) return;
    e.preventDefault();
    chrome.tabs.create({ url: a.dataset.url });
  });
  el("searchForm").addEventListener("submit", onSearch);
  el("todoAdd").addEventListener("submit", onTodoAdd);
  el("todoClearDone").addEventListener("click", onClearDone);
  el("favEdit").addEventListener("click", toggleFavEdit);
  el("favAdd").addEventListener("submit", onFavAdd);
  el("focusToggle").addEventListener("change", onFocusToggle);
  el("todoForm").addEventListener("submit", onTodoSave);
  el("dCancel").addEventListener("click", () => el("todoDialog").close());
  el("dDue").addEventListener("change", () => {
    el("dDate").hidden = el("dDue").value !== "custom";
  });

  onStorageChange((changes) => {
    if (changes.settings) {
      const ns = changes.settings.newValue || {};
      settings = { ...settings, ...ns, sites: ns.sites || settings.sites };
      setUILang(settings.lang);
      applyI18n(document);
      applyTheme(document.documentElement, settings); // tema + font aggiornati all'istante
      renderClock();
      renderStatus();
      renderSections();
      renderQuickLinks();
      renderTodo();
      renderFavorites();
      renderFocus();
    }
    if (changes.todo) { todo = changes.todo.newValue || []; renderTodo(); }
    if (changes.favorites) { favorites = changes.favorites.newValue || []; renderFavorites(); }
    if (changes.stats) { stats = changes.stats.newValue || emptyStats(); renderFocus(); }
  });
}

/* ============================================================
   Orologio e stato
   ============================================================ */
function renderClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  el("clock").textContent = settings.showSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
  el("date").textContent = now.toLocaleDateString(localeTag(), { weekday: "long", day: "numeric", month: "long" });
}

function renderStatus() {
  const s = el("status");
  s.classList.toggle("on", settings.focusEnabled);
  el("statusText").textContent = settings.focusEnabled ? t("status_on") : t("status_off");
  el("focusToggle").checked = settings.focusEnabled;
}

// Mostra/nasconde le sezioni della nuova scheda (configurabili in Impostazioni → Home)
function renderSections() {
  el("searchCard").hidden = settings.showSearch === false;
  el("todoCard").hidden = settings.showTodo === false;
  el("favCard").hidden = settings.showFavorites === false;
  el("focusCard").hidden = settings.showFocus === false;
}

/* ============================================================
   Collegamenti rapidi (PRO) — riga in alto a destra
   ============================================================ */
function renderQuickLinks() {
  const nav = el("quickLinks");
  // funzione PRO: per i non-PRO la riga non esiste proprio
  const list = isPro(settings) ? (settings.shortcuts || []) : [];
  const items = list.filter(s => s && shortcutLabel(s) && /^https?:\/\//i.test(s.url || ""));
  if (!items.length) {
    nav.hidden = true;
    nav.innerHTML = "";
    return;
  }
  nav.hidden = false;
  nav.innerHTML = items.map(s => {
    const label = shortcutLabel(s);
    const url = s.url;
    return `<a href="${esc(url)}" data-url="${esc(url)}" title="${esc(url)}">${esc(label)}</a>`;
  }).join("");
}

/* ============================================================
   ToDo
   ============================================================ */
function renderTodo() {
  const listEl = el("todoList");
  const sorted = sortTodo(todo);
  if (!sorted.length) {
    listEl.innerHTML = `<div class="empty">${esc(t("todo_empty"))}</div>`;
    return;
  }
  // nota: il parametro si chiama `item`, NON `t`, perché t() è la funzione di traduzione globale
  listEl.innerHTML = sorted.map(item => `
    <div class="todo-item ${item.done ? "done" : ""}" data-id="${item.id}">
      <input type="checkbox" class="t-check" ${item.done ? "checked" : ""} aria-label="${esc(t("todo_done_aria"))}">
      <span class="t-prio ${item.priority || "medium"}"></span>
      <span class="t-text">${esc(item.text)}</span>
      ${dueLabel(item) ? `<span class="chip due ${isOverdue(item) ? "late" : ""}">${isOverdue(item) ? esc(t("overdue_prefix")) : ""}${esc(dueLabel(item))}</span>` : ""}
      <span class="t-actions">
        <button class="t-edit" title="${esc(t("todo_edit_title"))}">✎</button>
        <button class="t-del danger" title="${esc(t("todo_del_title"))}">✕</button>
      </span>
    </div>`).join("");

  listEl.querySelectorAll(".todo-item").forEach(row => {
    const id = Number(row.dataset.id);
    row.querySelector(".t-check").addEventListener("change", (e) => {
      const item = todo.find(x => x.id === id);
      if (item) { item.done = e.target.checked; saveTodo(); }
    });
    row.querySelector(".t-edit").addEventListener("click", () => openTodoDialog(id));
    row.querySelector(".t-del").addEventListener("click", async () => {
      if (confirm(t("confirm_delete_todo"))) {
        todo = todo.filter(x => x.id !== id);
        saveTodo();
      }
    });
  });
}

function saveTodo() { setTodo(todo).then(renderTodo); }

function onSearch(e) {
  e.preventDefault();
  const q = el("searchInput").value.trim();
  if (!q) return;
  const engine = SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.google;
  chrome.tabs.create({ url: engine.url(q) });
}

async function onTodoAdd(e) {
  e.preventDefault();
  const text = el("todoInput").value.trim();
  if (!text) return;
  todo.push({ id: Date.now(), text, done: false, priority: "medium", due: "none" });
  el("todoInput").value = "";
  saveTodo();
}

function onClearDone() {
  todo = todo.filter(t => !t.done);
  saveTodo();
}

function openTodoDialog(id) {
  const t = todo.find(x => x.id === id);
  if (!t) return;
  editingId = id;
  el("dText").value = t.text;
  el("dPriority").value = t.priority || "medium";
  const custom = t.due && t.due !== "none" && t.due !== "today" && t.due !== "tomorrow";
  el("dDue").value = custom ? "custom" : (t.due || "none");
  el("dDate").hidden = !custom;
  el("dDate").value = custom ? t.due : "";
  el("todoDialog").showModal();
}

function onTodoSave(e) {
  e.preventDefault();
  const t = todo.find(x => x.id === editingId);
  if (!t) return;
  t.text = el("dText").value.trim() || t.text;
  t.priority = el("dPriority").value;
  const dueSel = el("dDue").value;
  t.due = dueSel === "custom" ? (el("dDate").value || "none") : dueSel;
  el("todoDialog").close();
  saveTodo();
}

/* ============================================================
   Preferiti — griglia launcher con icona del sito + nome sotto
   ============================================================ */
let favEditMode = false;

// Icona del sito dalla cache di Chrome (_favicon, permesso "favicon"): nessuna
// richiesta di rete — l'estensione non contatta mai il sito o servizi esterni.
function faviconUrl(url) {
  try {
    const u = new URL(chrome.runtime.getURL("/_favicon/"));
    u.searchParams.set("pageUrl", url);
    u.searchParams.set("size", "64");
    return u.toString();
  } catch { return ""; }
}

function renderFavorites() {
  const listEl = el("favList");
  if (!favorites.length) {
    listEl.innerHTML = `<div class="empty">${esc(t("fav_empty"))}</div>`;
  } else {
    listEl.innerHTML = favorites.map(f => {
      const letter = esc((f.name || "?").trim().charAt(0).toUpperCase() || "?");
      const inner =
        `<span class="fav-ico" data-letter="${letter}">` +
        `<img class="fav-favicon" src="${esc(faviconUrl(f.url))}" alt="" loading="lazy">` +
        `</span>` +
        `<span class="fav-name">${esc(f.name)}</span>`;
      // in modalità modifica il link è disattivato: sulla tile compare solo ✕
      const body = favEditMode
        ? `<button class="fav-x" data-id="${f.id}" title="${esc(t("remove_aria"))}" aria-label="${esc(t("remove_aria"))}">✕</button>` +
          `<span class="fav-link">${inner}</span>`
        : `<a class="fav-link" href="${esc(f.url)}" title="${esc(f.url)}">${inner}</a>`;
      return `<span class="fav-item">${body}</span>`;
    }).join("");
  }
  el("favEdit").textContent = favEditMode ? t("fav_done") : t("fav_edit");
  el("favAdd").hidden = !favEditMode;

  listEl.querySelectorAll(".fav-x").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      favorites = favorites.filter(f => f.id !== id);
      setFavorites(favorites).then(renderFavorites);
    });
  });

  // favicon non disponibile (sito mai visitato o immagine rotta) → iniziale del nome
  listEl.querySelectorAll("img.fav-favicon").forEach(img => {
    const missing = () => {
      const tile = img.closest(".fav-item");
      if (tile) tile.classList.add("no-favicon");
    };
    if (img.complete && img.naturalWidth === 0) missing();
    img.addEventListener("error", missing);
  });
}

function toggleFavEdit() {
  favEditMode = !favEditMode;
  renderFavorites();
}

async function onFavAdd(e) {
  e.preventDefault();
  const name = el("favName").value.trim();
  const url = el("favUrl").value.trim();
  if (!name || !/^https?:\/\//i.test(url)) return;
  favorites.push({ id: Date.now(), name, url });
  el("favName").value = "";
  el("favUrl").value = "";
  await setFavorites(favorites);
  renderFavorites();
}

/* ============================================================
   Focus e statistiche del giorno
   ============================================================ */
function renderFocus() {
  const sitesEl = el("focusSites");
  const active = settings.sites.filter(s => s.active);
  if (!active.length) {
    sitesEl.innerHTML = `<div class="empty">${esc(t("sites_empty"))}</div>`;
  } else {
    sitesEl.innerHTML = active.map(s => {
      const kind = s.mode === "block" ? t("mode_blocked") : `${s.delay}s`;
      const extra = s.limitMinutes > 0 ? ` · ${esc(t("stats_total_limit", { n: s.limitMinutes }))}` : "";
      return `<span class="site-chip" title="${esc(t("chip_title"))}">${esc(s.domain)} — ${esc(kind)}${extra}</span>`;
    }).join("");
  }
  sitesEl.querySelectorAll(".site-chip").forEach(ch => {
    ch.addEventListener("click", () => location.href = "options.html#focus");
  });

  const today = dayKey();
  const dayData = stats.byDay[today] || {};
  const { distracting, other } = splitByCategory(dayData, settings);
  const distSecs = totalSeconds(distracting);
  const otherSecs = totalSeconds(other);
  const blocked = stats.blocked[today] || 0;
  const unlocks = stats.unlocks[today] || 0;

  const totalLimit = active.reduce((acc, s) => acc + s.limitMinutes, 0);
  let html = t("stats_used_today", { time: fmtDuration(distSecs + otherSecs) });
  if (totalLimit > 0) html += ` <span class="chip">${esc(t("stats_total_limit", { n: totalLimit }))}</span>`;
  if (distSecs > 0 || otherSecs > 0) {
    html += `<br>${esc(t("stats_breakdown", { dist: fmtDuration(distSecs), other: fmtDuration(otherSecs) }))}`;
  }
  html += `<br>${t("stats_today_counts", { blocked, unlocks })}`;
  el("todayStats").innerHTML = html;
}

async function onFocusToggle(e) {
  settings.focusEnabled = e.target.checked;
  await sendMessage({ type: "setFocus", value: e.target.checked });
  renderStatus();
}

init();