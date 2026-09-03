// tools/resize-icons.js — genera le icone dell'estensione da m.png (512x512 RGBA)
// usando solo zlib di Node (nessuna dipendenza). Uso: node tools/resize-icons.js
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SRC = path.join(__dirname, "..", "m.png");
const OUT_DIR = path.join(__dirname, "..", "icons");
const SIZES = [16, 32, 48, 128];

/* ---------------- decode PNG ---------------- */
const buf = fs.readFileSync(SRC);
let pos = 8;
let width = 0, height = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString("ascii", pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === "IHDR") {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    const bitDepth = data[8];
    const colorType = data[9];
    if (bitDepth !== 8 || colorType !== 6) {
      throw new Error(`PNG non supportato: bitDepth=${bitDepth} colorType=${colorType} (attesi 8 e 6)`);
    }
  } else if (type === "IDAT") {
    idat.push(data);
  } else if (type === "IEND") {
    break;
  }
  pos += 12 + len;
}

const raw = zlib.inflateSync(Buffer.concat(idat));
const bpp = 4;
const stride = width * bpp;

const pixels = Buffer.alloc(height * stride);
let prev = Buffer.alloc(stride);
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
  const cur = pixels.subarray(y * stride, (y + 1) * stride);
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? cur[x - bpp] : 0;
    const b = prev[x];
    const c = x >= bpp ? prev[x - bpp] : 0;
    let v = line[x];
    switch (filter) {
      case 0: break;
      case 1: v = (v + a) & 0xff; break;
      case 2: v = (v + b) & 0xff; break;
      case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
      case 4: {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (v + pr) & 0xff;
        break;
      }
      default: throw new Error(`filtro PNG sconosciuto: ${filter}`);
    }
    cur[x] = v;
  }
  prev = cur;
}

/* ---------------- resize (media dell'area sorgente) ---------------- */
function resize(src, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * bpp);
  for (let y = 0; y < dstH; y++) {
    const sy0 = Math.floor((y * srcH) / dstH);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx0 = Math.floor((x * srcW) / dstW);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * srcW) / dstW));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * srcW + sx) * bpp;
          r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++;
        }
      }
      const o = (y * dstW + x) * bpp;
      dst[o] = Math.round(r / n);
      dst[o + 1] = Math.round(g / n);
      dst[o + 2] = Math.round(b / n);
      dst[o + 3] = Math.round(a / n);
    }
  }
  return dst;
}

/* ---------------- encode PNG ---------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const stride = w * bpp;
  const scanlines = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    scanlines[y * (stride + 1)] = 0; // filtro 0 (nessuno)
    rgba.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(scanlines, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ---------------- genera ---------------- */
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const dst = resize(pixels, width, height, size, size);
  fs.writeFileSync(path.join(OUT_DIR, `icon${size}.png`), encodePNG(dst, size, size));
  console.log(`scritto icons/icon${size}.png`);
}
console.log("fatto.");
