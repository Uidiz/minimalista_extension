// popup.js — mini pannello: interruttore Focus e riepilogo di oggi.
"use strict";

const el = (id) => document.getElementById(id);

let settings = null;
let stats = null;

async function init() {
  settings = await getSettings();
  stats = await getStats();
  setUILang(settings.lang);
  applyI18n(document);
  applyTheme(document.documentElement, settings);

  el("focusToggle").checked = settings.focusEnabled;
  el("focusToggle").addEventListener("change", async (e) => {
    settings.focusEnabled = e.target.checked;
    await sendMessage({ type: "setFocus", value: e.target.checked });
  });

  renderToday();

  onStorageChange((changes) => {
    if (changes.settings) {
      const ns = changes.settings.newValue || {};
      settings = { ...settings, ...ns, sites: ns.sites || settings.sites };
      setUILang(settings.lang);
      applyI18n(document);
      applyTheme(document.documentElement, settings); // tema + font aggiornati all'istante
      el("focusToggle").checked = settings.focusEnabled;
      renderToday();
    }
    if (changes.stats) { stats = changes.stats.newValue || emptyStats(); renderToday(); }
  });
}

function renderToday() {
  const today = dayKey();
  const dayData = stats.byDay[today] || {};
  const { distracting, other } = splitByCategory(dayData, settings);
  const distSecs = totalSeconds(distracting);
  const otherSecs = totalSeconds(other);
  const blocked = stats.blocked[today] || 0;
  const unlocks = stats.unlocks[today] || 0;

  el("today").innerHTML =
    t("stats_used_today", { time: fmtDuration(distSecs + otherSecs) }) + "<br>" +
    esc(t("stats_breakdown", { dist: fmtDuration(distSecs), other: fmtDuration(otherSecs) })) + "<br>" +
    t("stats_today_counts", { blocked, unlocks });
}

init();