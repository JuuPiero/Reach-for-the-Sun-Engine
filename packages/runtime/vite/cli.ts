import fs from 'node:fs';
import path from 'node:path';
import { buildGame } from './build';
import { PROJECT_FILE, readProject } from './project';

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function projectArg(args: string[]): string {
  const p = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!p) throw new Error('missing <project> folder');
  const root = path.resolve(p);
  if (!fs.existsSync(path.join(root, PROJECT_FILE))) throw new Error(`${root} is not an RS Engine project (no ${PROJECT_FILE})`);
  return root;
}

export async function main(argv: string[], engineRoot: string): Promise<void> {
  const [cmd, ...args] = argv;
  try {
    if (cmd === 'build') {
      const root = projectArg(args);
      const t0 = Date.now();
      const r = await buildGame(root, engineRoot);
      const total = r.files.reduce((n, f) => n + f.bytes, 0);
      const code = r.files.filter((f) => f.file.endsWith('.js')).reduce((n, f) => n + f.bytes, 0);
      console.log(`Built ${readProject(root).name} → ${r.outDir} in ${Date.now() - t0} ms`);
      console.log(`  ${r.files.length} files, ${kb(total)} (code ${kb(code)})`);
      return;
    }
    if (cmd === 'editor') {
      const root = projectArg(args);
      const { startEditor } = await import('../../editor/server/start');
      await startEditor({ projectRoot: root, engineRoot, port: Number(option(args, '--port') ?? process.env.RS_PORT ?? 5180), open: process.env.RS_NO_OPEN !== '1' });
      return;
    }
    if (cmd === 'create') {
      const dir = args.find((a) => !a.startsWith('--'));
      if (!dir) throw new Error('usage: create <dir> [--from examples/Demo]');
      const from = path.resolve(engineRoot, option(args, '--from') ?? 'examples/Demo');
      const dest = path.resolve(dir);
      if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw new Error(`${dest} is not empty`);
      fs.cpSync(from, dest, { recursive: true, filter: (s) => !/[\\/](Build|node_modules|\.rs)([\\/]|$)/.test(path.relative(from, s)) });
      const pj = path.join(dest, PROJECT_FILE);
      const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
      j.name = path.basename(dest);
      fs.writeFileSync(pj, JSON.stringify(j, null, 2) + '\n');
      console.log(`Created project '${j.name}' at ${dest}`);
      return;
    }
    console.log('usage: node scripts/rs.mjs editor|build|create ...');
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
