// tools/package-zip.js — crea lo zip di pubblicazione per il Chrome Web Store
// contenente SOLO i file runtime dell'estensione (nessuna dipendenza: zlib di Node).
//
// Uso:
//   node tools/package-zip.js          → crea dist/minimalista.zip e lo verifica
//   node tools/package-zip.js --list   → elenca i file che verrebbero inclusi
//
// Check di sicurezza: prima di creare lo zip confronta la versione del manifest
// con l'ultima pubblicata (dist/.last-version) e si BLOCCA se non è aumentata
// (il Chrome Web Store rifiuta upload con la stessa versione).
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist");
const OUT_FILE = path.join(OUT_DIR, "minimalista.zip");

// File alla radice inclusi nel pacchetto (allowlist esplicita: niente .git,
// tools/, *.md, m.png, e2e-test.js, Images/…). Se aggiungi un file runtime al
// progetto, ricordati di aggiungerlo qui.
const FILES = [
  "manifest.json",
  "background.js",
  "common.js",
  "i18n.js",
  "ExtPay.js",
  "common.css",
  "block.html", "block.css", "block.js",
  "dashboard.html", "dashboard.css", "dashboard.js",
  "options.html", "options.css", "options.js",
  "popup.html", "popup.css", "popup.js"
];

// Directory incluse ricorsivamente.
const DIRS = ["icons", "_locales"];

/* ---------------- raccolta file ---------------- */
function collect() {
  const out = [];
  for (const f of FILES) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) throw new Error("File mancante: " + f);
    out.push({ name: f, abs });
  }
  const walk = (dir, prefix) => {
    const absDir = path.join(ROOT, dir);
    if (!fs.existsSync(absDir)) throw new Error("Directory mancante: " + dir);
    for (const name of fs.readdirSync(absDir).sort()) {
      const abs = path.join(absDir, name);
      const rel = prefix ? prefix + "/" + name : name;
      if (fs.statSync(abs).isDirectory()) walk(rel, rel);
      else out.push({ name: rel, abs });
    }
  };
  for (const d of DIRS) walk(d, d);
  return out;
}

/* ---------------- scrittura zip (deflate) ---------------- */
function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

function localHeader(e) {
  const b = Buffer.alloc(30);
  b.writeUInt32LE(0x04034b50, 0);
  b.writeUInt16LE(20, 4);      // versione necessaria
  b.writeUInt16LE(0x0800, 6);  // flag: nome UTF-8
  b.writeUInt16LE(8, 8);       // metodo: deflate
  b.writeUInt16LE(e.time, 10);
  b.writeUInt16LE(e.date, 12);
  b.writeUInt32LE(e.crc, 14);
  b.writeUInt32LE(e.csize, 18);
  b.writeUInt32LE(e.usize, 22);
  b.writeUInt16LE(Buffer.byteLength(e.name), 26);
  b.writeUInt16LE(0, 28);      // extra
  return Buffer.concat([b, Buffer.from(e.name, "utf8")]);
}

function centralHeader(e, offset) {
  const b = Buffer.alloc(46);
  b.writeUInt32LE(0x02014b50, 0);
  b.writeUInt16LE(20, 4);      // version made by
  b.writeUInt16LE(20, 6);      // versione necessaria
  b.writeUInt16LE(0x0800, 8);  // flag: nome UTF-8
  b.writeUInt16LE(8, 10);      // metodo: deflate
  b.writeUInt16LE(e.time, 12);
  b.writeUInt16LE(e.date, 14);
  b.writeUInt32LE(e.crc, 16);
  b.writeUInt32LE(e.csize, 20);
  b.writeUInt32LE(e.usize, 24);
  b.writeUInt16LE(Buffer.byteLength(e.name), 28);
  b.writeUInt16LE(0, 30);      // extra
  b.writeUInt16LE(0, 32);      // commento
  b.writeUInt16LE(0, 34);      // disco
  b.writeUInt16LE(0, 36);      // attributi interni
  b.writeUInt32LE(0, 38);      // attributi esterni
  b.writeUInt32LE(offset, 42); // offset header locale
  return Buffer.concat([b, Buffer.from(e.name, "utf8")]);
}

function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const lh = localHeader(e);
    chunks.push(lh, e.data);
    central.push(centralHeader(e, offset));
    offset += lh.length + e.data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);            // disco corrente
  eocd.writeUInt16LE(0, 6);            // disco del CD
  eocd.writeUInt16LE(entries.length, 8);   // voci su questo disco
  eocd.writeUInt16LE(entries.length, 10);  // voci totali
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);      // offset del CD
  eocd.writeUInt16LE(0, 20);           // commento
  return Buffer.concat([...chunks, ...central, eocd]);
}

/* ---------------- verifica del file scritto ---------------- */
function verifyZip(file, expected) {
  const buf = fs.readFileSync(file);
  // EOCD: gli ultimi 22 byte (senza commento)
  const eocd = buf.subarray(buf.length - 22);
  if (eocd.readUInt32LE(0) !== 0x06054b50) throw new Error("EOCD non trovato");
  const n = eocd.readUInt16LE(10);
  const cdOffset = eocd.readUInt32LE(16);
  if (n !== expected.length) throw new Error("Conteggio voci errato: " + n + " ≠ " + expected.length);
  let p = cdOffset;
  const got = [];
  for (let i = 0; i < n; i++) {
    const cd = buf.subarray(p, p + 46);
    if (cd.readUInt32LE(0) !== 0x02014b50) throw new Error("Central directory corrotta");
    const nameLen = cd.readUInt16LE(28);
    const extraLen = cd.readUInt16LE(30);
    const commentLen = cd.readUInt16LE(32);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const method = cd.readUInt16LE(10);
    const crc = cd.readUInt32LE(16);
    const csize = cd.readUInt32LE(20);
    const usize = cd.readUInt32LE(24);
    const lhOff = cd.readUInt32LE(42);
    p += 46 + nameLen + extraLen + commentLen;
    // header locale
    const lh = buf.subarray(lhOff, lhOff + 30);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error("Local header non valido: " + name);
    const lNameLen = lh.readUInt16LE(26);
    const lExtraLen = lh.readUInt16LE(28);
    const dataStart = lhOff + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(dataStart, dataStart + csize);
    const raw = method === 8 ? zlib.inflateRawSync(data) : data;
    if (raw.length !== usize) throw new Error("Dimensione errata: " + name);
    if ((zlib.crc32(raw) >>> 0) !== crc) throw new Error("CRC errato: " + name);
    got.push(name);
  }
  // stessi file, stesso ordine
  const expNames = expected.map(e => e.name);
  if (JSON.stringify(got) !== JSON.stringify(expNames)) throw new Error("Elenco file diverso dall'atteso");
  return true;
}

/* ---------------- check di sicurezza: versione ---------------- */
const MANIFEST_FILE = path.join(ROOT, "manifest.json");
const LAST_VERSION_FILE = path.join(OUT_DIR, ".last-version");

function manifestVersion() {
  let m;
  try { m = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8")); }
  catch { throw new Error("manifest.json non leggibile o JSON non valido"); }
  if (!m || typeof m.version !== "string" || !/^\d+(\.\d+){0,2}$/.test(m.version)) {
    throw new Error("Versione non valida nel manifest.json: " + (m && m.version));
  }
  return m.version;
}

function versionGt(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false; // uguali → non maggiore
}

function nextVersion(v) {
  const p = v.split(".").map(Number);
  p[p.length - 1] += 1;
  return p.join(".");
}

function versionCheck() {
  const current = manifestVersion();
  const last = fs.existsSync(LAST_VERSION_FILE)
    ? fs.readFileSync(LAST_VERSION_FILE, "utf8").trim()
    : null;
  const ok = !last || versionGt(current, last);
  return { current, last, ok };
}

/* ---------------- main ---------------- */
function main() {
  const listOnly = process.argv.includes("--list");
  const v = versionCheck();
  if (v.last) {
    console.log("Versione manifest: " + v.current + " · ultima pubblicata: " + v.last +
      (v.ok ? " → OK (aumentata)" : " → ATTENZIONE: non aumentata"));
  } else {
    console.log("Versione manifest: " + v.current + " · prima pubblicazione (nessuna versione precedente registrata)");
  }
  if (!listOnly && !v.ok) {
    throw new Error(
      "La versione " + v.current + " non è maggiore dell'ultima pubblicata (" + v.last + "). " +
      "Il Chrome Web Store rifiuta upload con la stessa versione: incrementa \"version\" " +
      "in manifest.json (es. \"" + nextVersion(v.last) + "\") e rilancia lo script."
    );
  }
  const entries = collect().map(({ name, abs }) => {
    const data = fs.readFileSync(abs);
    const usize = data.length;
    const crc = zlib.crc32(data) >>> 0;
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const { time, date } = dosDateTime(fs.statSync(abs).mtime);
    return { name, data: deflated, crc, csize: deflated.length, usize, time, date };
  });

  const totalUsize = entries.reduce((s, e) => s + e.usize, 0);
  const totalCsize = entries.reduce((s, e) => s + e.csize, 0);
  const width = Math.max(...entries.map(e => e.name.length));

  console.log("File inclusi nel pacchetto:\n");
  for (const e of entries) {
    console.log("  " + e.name.padEnd(width) + "  " + String(e.usize).padStart(7) + " B");
  }
  console.log("\n" + entries.length + " file · " + totalUsize + " B non compressi → " + totalCsize + " B compressi");

  if (listOnly) return;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, buildZip(entries));
  verifyZip(OUT_FILE, entries);
  fs.writeFileSync(LAST_VERSION_FILE, v.current); // registra la versione appena impacchettata
  console.log("\n✅ " + OUT_FILE + " creato e verificato (" + fs.statSync(OUT_FILE).size + " B)");
  console.log("   Versione " + v.current + " registrata come ultima pubblicata (" + LAST_VERSION_FILE + ")");
  console.log("   Caricalo su https://chrome.google.com/webstore/devconsole");
}

try {
  main();
} catch (err) {
  console.error("ERRORE: " + err.message);
  process.exit(1);
}