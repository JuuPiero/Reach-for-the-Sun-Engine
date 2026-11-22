// Generates the Demo's textures (PNG, drawn procedurally): node scripts/gen-demo-textures.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'examples', 'Demo', 'Assets', 'Textures');
fs.mkdirSync(outDir, { recursive: true });

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(name, w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = pixel(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const file = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(path.join(outDir, name), file);
  console.log(`${name}: ${file.length} bytes`);
}
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// floor tiles: light grey squares with darker grout and a little noise
png('Tiles.png', 256, 256, (x, y) => {
  const g = x % 128 < 4 || y % 128 < 4 ? 0.62 : 0.86 + (((x >> 7) + (y >> 7)) % 2) * 0.05;
  const n = (rnd() - 0.5) * 0.05;
  const v = Math.round((g + n) * 255);
  return [v, v, Math.min(255, v + 6)];
});
// crate: planks with a frame
png('Crate.png', 128, 128, (x, y) => {
  const frame = x < 12 || y < 12 || x > 115 || y > 115 || Math.abs(x - y) < 8;
  const plank = Math.floor(y / 26) % 2;
  const grain = Math.sin(x * 0.45 + Math.sin(y * 0.1) * 3) * 0.04;
  const base = frame ? 0.52 : 0.72 + plank * 0.05;
  const n = (rnd() - 0.5) * 0.04;
  const k = base + grain + n;
  return [Math.round(k * 235), Math.round(k * 165), Math.round(k * 95)];
});
// star sparkle for particles (white, alpha shaped)
png('Sparkle.png', 64, 64, (x, y) => {
  const dx = (x - 31.5) / 32;
  const dy = (y - 31.5) / 32;
  const d = Math.hypot(dx, dy);
  const star = Math.max(0, 1 - Math.abs(dx) * 12) * Math.max(0, 1 - Math.abs(dy) * 1.1) + Math.max(0, 1 - Math.abs(dy) * 12) * Math.max(0, 1 - Math.abs(dx) * 1.1);
  const glow = Math.max(0, 1 - d * 2.2) ** 2;
  const a = Math.min(1, star + glow);
  return [255, 255, 255, Math.round(a * 255)];
});
