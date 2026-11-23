// Generates a skinned test model for the Demo: a tentacle (tapered tube) on a 4-bone chain with "Idle" and "Wiggle" clips.
//   node scripts/gen-skinned.mjs   →   examples/Demo/Assets/Models/Tentacle.glb
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'examples', 'Demo', 'Assets', 'Models', 'Tentacle.glb');

const chunks = [];
let byteLength = 0;
const bufferViews = [];
const accessors = [];
function addData(typed, target) {
  const pad = (4 - (byteLength % 4)) % 4;
  if (pad) {
    chunks.push(new Uint8Array(pad));
    byteLength += pad;
  }
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  chunks.push(bytes);
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
  byteLength += bytes.byteLength;
  return bufferViews.length - 1;
}
function accessor(typed, type, componentType, count, extra = {}, target) {
  accessors.push({ bufferView: addData(typed, target), componentType, count, type, ...extra });
  return accessors.length - 1;
}

// ---- tube along +Y, height H, tapered, RINGS × SEG vertices
const H = 2.4;
const BONES = 4;
const SEG = 14;
const RINGS = 25;
const boneY = (b) => (b * H) / BONES; // bone b starts at this height
const P = [];
const N = [];
const J = [];
const W = [];
const I = [];
for (let r = 0; r < RINGS; r++) {
  const v = r / (RINGS - 1);
  const y = v * H;
  const rad = 0.22 * (1 - v * 0.8);
  // weights: blend the two bones around this height
  const f = Math.min(BONES - 1 - 1e-6, (y / H) * BONES - 0.5);
  const b0 = Math.max(0, Math.floor(f));
  const t = Math.min(1, Math.max(0, f - b0));
  const b1 = Math.min(BONES - 1, b0 + 1);
  for (let s = 0; s < SEG; s++) {
    const a = (s / SEG) * Math.PI * 2;
    const x = Math.cos(a);
    const z = Math.sin(a);
    P.push(x * rad, y, z * rad);
    const l = Math.hypot(x, 0.15, z);
    N.push(x / l, 0.15 / l, z / l);
    J.push(b0, b1, 0, 0);
    W.push(1 - t, t, 0, 0);
  }
}
for (let r = 0; r < RINGS - 1; r++)
  for (let s = 0; s < SEG; s++) {
    const a = r * SEG + s;
    const b = r * SEG + ((s + 1) % SEG);
    const c = a + SEG;
    const d = b + SEG;
    I.push(a, c, b, b, c, d);
  }
const count = P.length / 3;
const pos = accessor(new Float32Array(P), 'VEC3', 5126, count, { min: [-0.22, 0, -0.22], max: [0.22, H, 0.22] }, 34962);
const nrm = accessor(new Float32Array(N), 'VEC3', 5126, count, {}, 34962);
const joints = accessor(new Uint8Array(J), 'VEC4', 5121, count, {}, 34962);
const weights = accessor(new Float32Array(W), 'VEC4', 5126, count, {}, 34962);
const idx = accessor(new Uint16Array(I), 'SCALAR', 5123, I.length, {}, 34963);

// ---- nodes: 0 root, 1 mesh (skinned), 2.. bones (chain)
const nodes = [
  { name: 'Tentacle', children: [1, 2] },
  { name: 'TentacleMesh', mesh: 0, skin: 0 },
];
for (let b = 0; b < BONES; b++) nodes.push({ name: `Bone${b}`, translation: [0, b === 0 ? 0 : H / BONES, 0], ...(b < BONES - 1 ? { children: [3 + b] } : {}) });
const jointNodes = Array.from({ length: BONES }, (_, b) => 2 + b);
// inverse bind matrices: translate(0, -boneY, 0), column-major
const ibm = [];
for (let b = 0; b < BONES; b++) ibm.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -boneY(b), 0, 1);
const ibmAcc = accessor(new Float32Array(ibm), 'MAT4', 5126, BONES);

// ---- animations: rotations of bones 1..3 around Z (and X for a bit of 3D)
const quat = (ax, ay, az, deg) => {
  const h = (deg * Math.PI) / 360;
  const s = Math.sin(h);
  return [ax * s, ay * s, az * s, Math.cos(h)];
};
function clip(name, seconds, amp, freq) {
  const keys = 24;
  const times = Array.from({ length: keys + 1 }, (_, k) => (k / keys) * seconds);
  const timeAcc = accessor(new Float32Array(times), 'SCALAR', 5126, times.length, { min: [0], max: [seconds] });
  const channels = [];
  const samplers = [];
  for (let b = 1; b < BONES; b++) {
    const q = [];
    for (const t of times) {
      const ph = (t / seconds) * Math.PI * 2 * freq - b * 0.9;
      const z = Math.sin(ph) * amp * (0.6 + b * 0.25);
      const x = Math.cos(ph * 0.5) * amp * 0.3;
      const qz = quat(0, 0, 1, z);
      const qx = quat(1, 0, 0, x);
      // qz * qx
      q.push(qz[3] * qx[0] + qz[0] * qx[3] + qz[1] * qx[2] - qz[2] * qx[1], qz[3] * qx[1] - qz[0] * qx[2] + qz[1] * qx[3] + qz[2] * qx[0], qz[3] * qx[2] + qz[0] * qx[1] - qz[1] * qx[0] + qz[2] * qx[3], qz[3] * qx[3] - qz[0] * qx[0] - qz[1] * qx[1] - qz[2] * qx[2]);
    }
    samplers.push({ input: timeAcc, output: accessor(new Float32Array(q), 'VEC4', 5126, times.length), interpolation: 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node: 2 + b, path: 'rotation' } });
  }
  return { name, channels, samplers };
}
const animations = [clip('Idle', 3, 8, 1), clip('Wiggle', 1.6, 32, 1)];

const json = {
  asset: { version: '2.0', generator: 'RS Engine gen-skinned' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes,
  meshes: [{ name: 'Tentacle', primitives: [{ attributes: { POSITION: pos, NORMAL: nrm, JOINTS_0: joints, WEIGHTS_0: weights }, indices: idx, material: 0 }] }],
  materials: [{ name: 'Tentacle', pbrMetallicRoughness: { baseColorFactor: [0.55, 0.25, 0.75, 1], metallicFactor: 0, roughnessFactor: 0.6 } }],
  skins: [{ name: 'TentacleSkin', joints: jointNodes, skeleton: 2, inverseBindMatrices: ibmAcc }],
  accessors,
  bufferViews,
  buffers: [{ byteLength }],
  animations,
};
const bin = new Uint8Array(byteLength);
let at = 0;
for (const c of chunks) {
  bin.set(c, at);
  at += c.byteLength;
}
const jsonBytes = Buffer.from(JSON.stringify(json));
const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
const binPad = (4 - (bin.length % 4)) % 4;
const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length + binPad;
const glb = Buffer.alloc(total);
let o = 0;
glb.writeUInt32LE(0x46546c67, o);
glb.writeUInt32LE(2, o + 4);
glb.writeUInt32LE(total, o + 8);
o = 12;
glb.writeUInt32LE(jsonBytes.length + jsonPad, o);
glb.writeUInt32LE(0x4e4f534a, o + 4);
jsonBytes.copy(glb, o + 8);
glb.fill(0x20, o + 8 + jsonBytes.length, o + 8 + jsonBytes.length + jsonPad);
o += 8 + jsonBytes.length + jsonPad;
glb.writeUInt32LE(bin.length + binPad, o);
glb.writeUInt32LE(0x004e4942, o + 4);
Buffer.from(bin).copy(glb, o + 8);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, glb);
console.log(`wrote ${path.relative(root, out)} (${glb.length} bytes, ${count} vertices, ${BONES} bones, clips ${animations.map((a) => a.name).join(', ')})`);
