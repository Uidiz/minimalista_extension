// tools/setup-cft.mjs — scarica Chrome for Testing (Chromium unbranded, supporta
// --load-extension anche nelle versioni recenti) e lo estrae in una cache.
// Uso da e2e-test.js: const { ensureCfT } = require("./tools/setup-cft.cjs");
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const CACHE_DIR = process.env.MINIMALISTA_CFT_DIR || path.join(os.homedir(), ".cache", "minimalista-cft");
const CHROME_EXE = path.join(CACHE_DIR, "chrome-win64", "chrome.exe");

async function ensureCfT() {
  if (fs.existsSync(CHROME_EXE)) return CHROME_EXE;

  console.log("Chrome for Testing non trovato nella cache, scarico…");
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const meta = await (await fetch(
    "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"
  )).json();
  const ver = meta.channels.Stable.version;
  const dl = meta.channels.Stable.downloads.chrome.find(x => x.platform === "win64");
  if (!dl) throw new Error("download win64 di Chrome for Testing non trovato");

  const zipPath = path.join(CACHE_DIR, `chrome-win64-${ver}.zip`);
  console.log("download di", ver, "…");
  const resp = await fetch(dl.url);
  if (!resp.ok) throw new Error("download fallito: " + resp.status);
  await pipeline(Readable.fromWeb(resp.body), fs.createWriteStream(zipPath));
  console.log("zip scaricato (" + Math.round(fs.statSync(zipPath).size / 1e6) + " MB), estrazione…");

  try {
    execFileSync("tar", ["-xf", zipPath, "-C", CACHE_DIR], { stdio: "inherit" });
  } catch {
    // fallback con PowerShell
    execFileSync("powershell", ["-NoProfile", "-Command",
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${CACHE_DIR}' -Force`],
      { stdio: "inherit" });
  }
  fs.rmSync(zipPath, { force: true });
  console.log("Chrome for Testing pronto:", CHROME_EXE);
  return CHROME_EXE;
}

module.exports = { ensureCfT, CHROME_EXE };
