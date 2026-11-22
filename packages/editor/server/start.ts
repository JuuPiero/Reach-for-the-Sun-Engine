import path from 'node:path';
import { createServer } from 'vite';
import { rsProjectPlugin } from '../../runtime/vite/rsProjectPlugin';
import { projectApiPlugin } from './projectApi';
import { buildGame } from '../../runtime/vite/build';

/** Starts the editor's dev server for a project (`node scripts/rs.mjs editor <project>`). */
export async function startEditor(o: { projectRoot: string; engineRoot: string; port: number; open: boolean }): Promise<void> {
  const editorDir = path.join(o.engineRoot, 'packages', 'editor');
  const server = await createServer({
    configFile: false,
    root: editorDir,
    cacheDir: path.join(o.engineRoot, 'node_modules', '.vite-rs-editor'),
    plugins: [
      rsProjectPlugin({ projectRoot: o.projectRoot, engineRoot: o.engineRoot, mode: 'editor' }),
      projectApiPlugin(o.projectRoot),
      {
        // File ▸ Build: builds the game from the editor
        name: 'rs-build-route',
        configureServer(s) {
          s.middlewares.use(async (req, res, next) => {
            if (req.url !== '/__rs/api/build' || req.method !== 'POST') return next();
            try {
              const t0 = Date.now();
              const r = await buildGame(o.projectRoot, o.engineRoot);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, outDir: r.outDir.split(path.sep).join('/'), files: r.files, ms: Date.now() - t0 }));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: (e as Error).message }));
            }
          });
        },
      },
    ],
    server: { port: o.port, open: o.open, strictPort: false },
    logLevel: 'info',
  });
  await server.listen();
  server.printUrls();
}
