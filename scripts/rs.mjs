#!/usr/bin/env node
// RS Engine CLI:
//   node scripts/rs.mjs editor <project> [--port 5180]   web editor (RS_PORT, RS_NO_OPEN=1)
//   node scripts/rs.mjs build <project>                  game build → <project>/Build/Web
//   node scripts/rs.mjs create <dir> [--from examples/Demo]
// The Node side (packages/runtime/vite/cli.ts) is bundled with esbuild on each run (TypeScript, deps external).
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(engineRoot, 'node_modules', '.cache', 'rs', 'cli.mjs');
await build({
  entryPoints: [path.join(engineRoot, 'packages', 'runtime', 'vite', 'cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  outfile: out,
  logLevel: 'error',
});
const { main } = await import(pathToFileURL(out).href + `?t=${Date.now()}`);
await main(process.argv.slice(2), engineRoot);
