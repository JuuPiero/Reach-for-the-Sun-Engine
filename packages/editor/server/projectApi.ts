import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { PROJECT_FILE, readProject, resolveInProject, toPosix } from '../../runtime/vite/project';

/**
 * Editor API on the dev server (`/__rs/api/...`), project-relative posix paths, everything confined to the project:
 *   GET  files                 → { files: [{ path, dir, size, mtime }] } (Assets/ tree)
 *   GET  project               → rs.project.json (defaults filled)
 *   PUT  file?path=            body = file content (folders created)
 *   POST mkdir?path=           POST delete?path=        POST rename { from, to }
 */
export function projectApiPlugin(projectRoot: string): Plugin {
  const root = path.resolve(projectRoot);
  const send = (res: ServerResponse, code: number, body: unknown) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  /** Writable paths: below Assets/ or the project file. */
  const writable = (rel: string | null) => {
    if (!rel) return null;
    const norm = toPosix(path.normalize(rel));
    if (norm !== PROJECT_FILE && !norm.startsWith('Assets/') && norm !== 'Assets') return null;
    return resolveInProject(root, norm);
  };

  const list = () => {
    const out: { path: string; dir: boolean; size: number; mtime: number }[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, e.name);
        const st = fs.statSync(abs);
        out.push({ path: toPosix(path.relative(root, abs)), dir: e.isDirectory(), size: st.size, mtime: st.mtimeMs });
        if (e.isDirectory()) walk(abs);
      }
    };
    walk(path.join(root, 'Assets'));
    return out;
  };

  return {
    name: 'rs-project-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__rs/api/')) return next();
        const url = new URL(req.url, 'http://x');
        const route = url.pathname.slice('/__rs/api/'.length);
        const rel = url.searchParams.get('path');
        try {
          if (route === 'files' && req.method === 'GET') return send(res, 200, { files: list() });
          if (route === 'project' && req.method === 'GET') return send(res, 200, { ...readProject(root), root: toPosix(root) });
          if (route === 'file' && req.method === 'PUT') {
            const abs = writable(rel);
            if (!abs) return send(res, 400, { error: `not writable: ${rel}` });
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, await readBody(req));
            return send(res, 200, { ok: true });
          }
          if (route === 'mkdir' && req.method === 'POST') {
            const abs = writable(rel);
            if (!abs) return send(res, 400, { error: `not writable: ${rel}` });
            fs.mkdirSync(abs, { recursive: true });
            return send(res, 200, { ok: true });
          }
          if (route === 'delete' && req.method === 'POST') {
            const abs = writable(rel);
            if (!abs || toPosix(path.relative(root, abs)) === 'Assets') return send(res, 400, { error: `cannot delete: ${rel}` });
            fs.rmSync(abs, { recursive: true, force: true });
            return send(res, 200, { ok: true });
          }
          if (route === 'rename' && req.method === 'POST') {
            const { from, to } = JSON.parse((await readBody(req)).toString('utf8')) as { from: string; to: string };
            const a = writable(from);
            const b = writable(to);
            if (!a || !b) return send(res, 400, { error: 'bad paths' });
            if (fs.existsSync(b)) return send(res, 409, { error: `${to} already exists` });
            fs.mkdirSync(path.dirname(b), { recursive: true });
            fs.renameSync(a, b);
            return send(res, 200, { ok: true });
          }
          send(res, 404, { error: `unknown route ${req.method} ${route}` });
        } catch (e) {
          send(res, 500, { error: (e as Error).message });
        }
      });
    },
  };
}
