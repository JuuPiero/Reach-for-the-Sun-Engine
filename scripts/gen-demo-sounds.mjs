// Generates the Demo's sound effects (16-bit mono WAV, synthesized): node scripts/gen-demo-sounds.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'examples', 'Demo', 'Assets', 'Sounds');
fs.mkdirSync(outDir, { recursive: true });
const RATE = 22050;

function wav(name, seconds, sample) {
  const n = Math.floor(seconds * RATE);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, sample(i / RATE, i / n)));
    buf.writeInt16LE(Math.round(v * 32000), 44 + i * 2);
  }
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log(`${name}: ${buf.length} bytes`);
}

const square = (ph) => (ph % 1 < 0.5 ? 1 : -1);
let seed = 1;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// coin: two quick rising square notes
wav('Coin.wav', 0.28, (t, u) => {
  const f = t < 0.07 ? 988 : 1319;
  return 0.35 * square(t * f) * (1 - u) ** 1.5;
});
// jump: square sweep upwards
wav('Jump.wav', 0.22, (t, u) => {
  const f = 220 + 600 * u;
  return 0.3 * square(t * f) * (1 - u);
});
// click: short blip
wav('Click.wav', 0.06, (t, u) => 0.4 * Math.sin(2 * Math.PI * 1200 * t) * (1 - u) ** 2);
// land: soft noise thump
wav('Land.wav', 0.12, (t, u) => 0.5 * noise() * (1 - u) ** 3 * Math.sin(2 * Math.PI * 90 * t));
// music: a 4-bar loop (bass + arpeggio), seamless
const BPM = 120;
const beat = 60 / BPM;
const chords = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [196, 246.94, 293.66],
  [164.81, 207.65, 246.94],
];
wav('Music.wav', beat * 16, (t) => {
  const bar = Math.floor(t / (beat * 4)) % 4;
  const c = chords[bar];
  const step = Math.floor(t / (beat / 2));
  const tn = t % (beat / 2);
  const arp = c[step % 3] * 2;
  const env = Math.exp(-tn * 8);
  const tb = t % beat;
  const bass = Math.sin(2 * Math.PI * (c[0] / 2) * t) * Math.exp(-tb * 3);
  return 0.18 * square(t * arp) * env * 0.6 + 0.3 * bass;
});
