import fs from 'node:fs';
import path from 'node:path';
import type { InlineConfig } from 'vite';
import { rsProjectPlugin } from './rsProjectPlugin';

/** Vite config of a game build: packages/runtime/index.html + the project's scripts → `<project>/Build/Web`. */
export function gameBuildConfig(o: { projectRoot: string; engineRoot: string; outDir?: string }): InlineConfig {
  const runtimeDir = path.join(o.engineRoot, 'packages', 'runtime');
  return {
    configFile: false,
    root: runtimeDir,
    base: './',
    logLevel: 'warn',
    plugins: [rsProjectPlugin({ projectRoot: o.projectRoot, engineRoot: o.engineRoot, mode: 'game' })],
    build: {
      outDir: o.outDir ?? path.join(o.projectRoot, 'Build', 'Web'),
      emptyOutDir: true,
      assetsDir: '_rs',
      target: 'es2022',
      chunkSizeWarningLimit: 100_000,
    },
  };
}

/** Builds the game; returns the output folder and its files with sizes. */
export async function buildGame(projectRoot: string, engineRoot: string): Promise<{ outDir: string; files: { file: string; bytes: number }[] }> {
  const { build } = await import('vite');
  const cfg = gameBuildConfig({ projectRoot, engineRoot });
  await build(cfg);
  const outDir = cfg.build!.outDir!;
  const files: { file: string; bytes: number }[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push({ file: path.relative(outDir, p).split(path.sep).join('/'), bytes: fs.statSync(p).size });
    }
  };
  walk(outDir);
  return { outDir, files };
}
