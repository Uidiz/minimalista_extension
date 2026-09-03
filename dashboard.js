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
  renderSearch();
  renderTodo();
  renderFavorites();
  renderFocus();

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
      renderSearch();
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

function renderSearch() {
  el("searchCard").hidden = settings.showSearch === false;
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
   Preferiti
   ============================================================ */
let favEditMode = false;

function renderFavorites() {
  const listEl = el("favList");
  if (!favorites.length) {
    listEl.innerHTML = `<div class="empty">${esc(t("fav_empty"))}</div>`;
  } else {
    listEl.innerHTML = favorites.map(f => `
      <span class="fav-item">
        ${favEditMode
          ? `<button class="fav-x" data-id="${f.id}" title="${esc(t("remove_aria"))}">✕</button>`
          : `<a href="${esc(f.url)}" title="${esc(f.url)}">${esc(f.name)}</a>`}
      </span>`).join("");
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