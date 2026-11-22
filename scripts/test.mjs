#!/usr/bin/env node
// Unit tests: every packages/*/tests/*.test.ts is bundled with esbuild (decorators on, @rs/* aliased to the sources,
// npm deps external) into node_modules/.cache/rs/tests and run with `node --test`.
//   node scripts/test.mjs [filter ...]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filters = process.argv.slice(2);
const out = path.join(root, 'node_modules', '.cache', 'rs', 'tests');
const tests = [];
for (const pkg of fs.readdirSync(path.join(root, 'packages'))) {
  const dir = path.join(root, 'packages', pkg, 'tests');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith('.test.ts')) tests.push(path.join(dir, f));
}
const selected = tests.filter((t) => !filters.length || filters.some((f) => t.includes(f)));
if (!selected.length) {
  console.error('no test files');
  process.exit(1);
}
const alias = {};
for (const pkg of fs.readdirSync(path.join(root, 'packages'))) alias[`@rs/${pkg}`] = path.join(root, 'packages', pkg, 'src', pkg === 'editor' ? 'api.ts' : 'index.ts');
fs.rmSync(out, { recursive: true, force: true });
const outs = [];
for (const t of selected) {
  const o = path.join(out, path.relative(root, t).replace(/[\\/]/g, '__').replace(/\.ts$/, '.mjs'));
  await build({
    entryPoints: [t],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: o,
    alias,
    keepNames: true,
    minify: process.env.RS_TEST_MINIFY === '1',
    logLevel: 'error',
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: true } },
    plugins: [
      {
        name: 'external-npm',
        setup(b) {
          // Babylon is bundled (its deep ESM paths have no extensions Node accepts); other packages stay external
          b.onResolve({ filter: /^[^./]/ }, (a) => (a.kind === 'entry-point' || path.isAbsolute(a.path) || a.path.startsWith('@rs/') || a.path.startsWith('@babylonjs/') ? null : { path: a.path, external: true }));
        },
      },
    ],
  });
  outs.push(o);
}
const r = spawnSync(process.execPath, ['--test', ...outs], { stdio: 'inherit' });
process.exit(r.status ?? 1);
