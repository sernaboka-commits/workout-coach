/* make-icons.js — генерация PWA-иконок (штанга на синем фоне) без зависимостей.
 * Запуск разово: node make-icons.js → src/icon-192.png, src/icon-512.png */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

const BG = [76, 141, 255];   // --accent
const FG = [255, 255, 255];
function inRect(nx, ny, x0, y0, x1, y1) { return nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1; }
function pixel(nx, ny) {
  // штанга: гриф + по две «блины» с каждой стороны (симметрично)
  const bar = inRect(nx, ny, 0.28, 0.47, 0.72, 0.53);
  const outer = inRect(nx, ny, 0.15, 0.30, 0.23, 0.70) || inRect(nx, ny, 0.77, 0.30, 0.85, 0.70);
  const inner = inRect(nx, ny, 0.23, 0.37, 0.29, 0.63) || inRect(nx, ny, 0.71, 0.37, 0.77, 0.63);
  return (bar || outer || inner) ? FG : BG;
}

function png(size) {
  const bpp = 4, stride = size * bpp + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * stride + 1 + x * bpp;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

for (const s of [192, 512]) {
  const out = path.join(__dirname, 'src', `icon-${s}.png`);
  fs.writeFileSync(out, png(s));
  console.log('icon:', out, fs.statSync(out).size, 'байт');
}
