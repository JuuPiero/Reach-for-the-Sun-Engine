#!/usr/bin/env node
// Generates the Demo's robot model: examples/Demo/Assets/Models/Robot.glb — a rigid node hierarchy (boxes) with
// node-TRS animations Idle, Walk, Run, Jump. Original content (CC0), made for RS Engine.
//   node scripts/gen-demo-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'examples', 'Demo', 'Assets', 'Models', 'Robot.glb');

// ---- binary buffer helpers
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

// ---- unit cube (24 vertices, flat normals)
const P = [];
const N = [];
const I = [];
const faces = [
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
  [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
  [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
for (const [n, u, v] of faces) {
  const base = P.length / 3;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    P.push(0.5 * (n[0] + a * u[0] + b * v[0]), 0.5 * (n[1] + a * u[1] + b * v[1]), 0.5 * (n[2] + a * u[2] + b * v[2]));
    N.push(...n);
  }
  I.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
const pos = accessor(new Float32Array(P), 'VEC3', 5126, 24, { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, 34962);
const nrm = accessor(new Float32Array(N), 'VEC3', 5126, 24, {}, 34962);
const idx = accessor(new Uint16Array(I), 'SCALAR', 5123, 36, {}, 34963);

const materials = [
  { name: 'Body', pbrMetallicRoughness: { baseColorFactor: [0.82, 0.85, 0.9, 1], metallicFactor: 0.2, roughnessFactor: 0.5 } },
  { name: 'Joint', pbrMetallicRoughness: { baseColorFactor: [0.18, 0.2, 0.24, 1], metallicFactor: 0.3, roughnessFactor: 0.6 } },
  { name: 'Visor', pbrMetallicRoughness: { baseColorFactor: [0.1, 0.85, 1, 1], metallicFactor: 0, roughnessFactor: 0.3 }, emissiveFactor: [0.05, 0.6, 0.8] },
  { name: 'Accent', pbrMetallicRoughness: { baseColorFactor: [0.95, 0.45, 0.15, 1], metallicFactor: 0.1, roughnessFactor: 0.5 } },
];
const meshes = materials.map((m, i) => ({ name: `Box_${m.name}`, primitives: [{ attributes: { POSITION: pos, NORMAL: nrm }, indices: idx, material: i }] }));

// ---- node hierarchy (the model faces -Z in glTF space = +Z after Babylon's handedness conversion)
const nodes = [];
const node = (name, t, children = [], extra = {}) => {
  nodes.push({ name, translation: t, children, ...extra });
  return nodes.length - 1;
};
const box = (name, t, s, mat) => node(name, t, [], { scale: s, mesh: mat });
const B = 0;
const J = 1;
const V = 2;
const A = 3;
const head = node('Head', [0, 0.62, 0], [box('HeadMesh', [0, 0.17, 0], [0.34, 0.3, 0.32], B), box('Visor', [0, 0.19, -0.165], [0.26, 0.09, 0.02], V), box('Antenna', [0, 0.38, 0], [0.04, 0.12, 0.04], A)]);
const armL = node('ArmL', [0.33, 0.5, 0], [box('ArmLMesh', [0.03, -0.28, 0], [0.12, 0.56, 0.13], B), box('HandL', [0.03, -0.6, 0], [0.13, 0.12, 0.14], J)]);
const armR = node('ArmR', [-0.33, 0.5, 0], [box('ArmRMesh', [-0.03, -0.28, 0], [0.12, 0.56, 0.13], B), box('HandR', [-0.03, -0.6, 0], [0.13, 0.12, 0.14], J)]);
const torso = node('Torso', [0, 0.08, 0], [box('TorsoMesh', [0, 0.32, 0], [0.52, 0.56, 0.3], B), box('Chest', [0, 0.38, -0.155], [0.3, 0.2, 0.02], A), head, armL, armR]);
const legL = node('LegL', [0.13, -0.04, 0], [box('LegLMesh', [0, -0.42, 0], [0.17, 0.82, 0.19], J), box('FootL', [0, -0.85, -0.05], [0.18, 0.1, 0.28], B)]);
const legR = node('LegR', [-0.13, -0.04, 0], [box('LegRMesh', [0, -0.42, 0], [0.17, 0.82, 0.19], J), box('FootR', [0, -0.85, -0.05], [0.18, 0.1, 0.28], B)]);
const hips = node('Hips', [0, 0.95, 0], [box('Pelvis', [0, 0, 0], [0.42, 0.18, 0.26], J), torso, legL, legR]);
// turned 180° so it faces +Z in RS Engine (Babylon's glTF import keeps glTF's -Z front as the back)
const robot = node('Robot', [0, 0, 0], [hips], { rotation: [0, 1, 0, 0] });

// ---- animations
const rad = Math.PI / 180;
const qx = (deg) => [Math.sin((deg * rad) / 2), 0, 0, Math.cos((deg * rad) / 2)];
const qy = (deg) => [0, Math.sin((deg * rad) / 2), 0, Math.cos((deg * rad) / 2)];
const qz = (deg) => [0, 0, Math.sin((deg * rad) / 2), Math.cos((deg * rad) / 2)];
const animations = [];
function anim(name, tracks) {
  const samplers = [];
  const channels = [];
  for (const [nodeIndex, pathName, keys] of tracks) {
    const times = new Float32Array(keys.map((k) => k[0]));
    const values = new Float32Array(keys.flatMap((k) => k[1]));
    const input = accessor(times, 'SCALAR', 5126, keys.length, { min: [times[0]], max: [times[times.length - 1]] });
    const output = accessor(values, pathName === 'rotation' ? 'VEC4' : 'VEC3', 5126, keys.length);
    samplers.push({ input, output, interpolation: 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex, path: pathName } });
  }
  animations.push({ name, samplers, channels });
}
const cycle = (period, fn, steps = 8) => Array.from({ length: steps + 1 }, (_, i) => [(period * i) / steps, fn((i / steps) * Math.PI * 2)]);
// swing angles: positive X rotation lifts a leg forward (towards -Z) in glTF space
anim('Idle', [
  [hips, 'translation', cycle(2, (a) => [0, 0.95 - 0.012 * (1 - Math.cos(a)), 0])],
  [armL, 'rotation', cycle(2, (a) => qz(4 + 2 * Math.sin(a)))],
  [armR, 'rotation', cycle(2, (a) => qz(-4 - 2 * Math.sin(a)))],
  [head, 'rotation', cycle(2, (a) => qy(4 * Math.sin(a)))],
  [legL, 'rotation', [[0, qx(0)], [2, qx(0)]]],
  [legR, 'rotation', [[0, qx(0)], [2, qx(0)]]],
  [torso, 'rotation', [[0, qx(0)], [2, qx(0)]]],
]);
anim('Walk', [
  [hips, 'translation', cycle(1, (a) => [0, 0.95 - 0.03 * Math.abs(Math.sin(a)), 0])],
  [legL, 'rotation', cycle(1, (a) => qx(28 * Math.sin(a)))],
  [legR, 'rotation', cycle(1, (a) => qx(-28 * Math.sin(a)))],
  [armL, 'rotation', cycle(1, (a) => qx(-22 * Math.sin(a)))],
  [armR, 'rotation', cycle(1, (a) => qx(22 * Math.sin(a)))],
  [head, 'rotation', [[0, qy(0)], [1, qy(0)]]],
  [torso, 'rotation', cycle(1, (a) => qy(4 * Math.sin(a)))],
]);
anim('Run', [
  [hips, 'translation', cycle(0.6, (a) => [0, 0.9 - 0.06 * Math.abs(Math.sin(a)), 0])],
  [legL, 'rotation', cycle(0.6, (a) => qx(50 * Math.sin(a)))],
  [legR, 'rotation', cycle(0.6, (a) => qx(-50 * Math.sin(a)))],
  [armL, 'rotation', cycle(0.6, (a) => qx(-45 * Math.sin(a)))],
  [armR, 'rotation', cycle(0.6, (a) => qx(45 * Math.sin(a)))],
  [head, 'rotation', [[0, qx(-6)], [0.6, qx(-6)]]],
  [torso, 'rotation', cycle(0.6, (a) => mulQ(qx(12), qy(6 * Math.sin(a))))],
]);
anim('Jump', [
  [hips, 'translation', [[0, [0, 0.95, 0]], [0.15, [0, 0.82, 0]], [0.4, [0, 0.95, 0]], [0.8, [0, 0.95, 0]]]],
  [legL, 'rotation', [[0, qx(0)], [0.15, qx(25)], [0.4, qx(45)], [0.8, qx(10)]]],
  [legR, 'rotation', [[0, qx(0)], [0.15, qx(25)], [0.4, qx(-10)], [0.8, qx(5)]]],
  [armL, 'rotation', [[0, qz(4)], [0.15, qz(20)], [0.4, mulQ(qx(-160), qz(10))], [0.8, qz(30)]]],
  [armR, 'rotation', [[0, qz(-4)], [0.15, qz(-20)], [0.4, mulQ(qx(-160), qz(-10))], [0.8, qz(-30)]]],
  [head, 'rotation', [[0, qx(0)], [0.4, qx(-10)], [0.8, qx(0)]]],
  [torso, 'rotation', [[0, qx(0)], [0.15, qx(15)], [0.4, qx(-5)], [0.8, qx(0)]]],
]);
function mulQ(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

// ---- GLB
const json = {
  asset: { version: '2.0', generator: 'RS Engine demo generator (CC0)' },
  scene: 0,
  scenes: [{ nodes: [robot] }],
  nodes,
  meshes,
  materials,
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
console.log(`wrote ${path.relative(root, out)} (${glb.length} bytes, ${nodes.length} nodes, animations ${animations.map((a) => a.name).join(', ')})`);
