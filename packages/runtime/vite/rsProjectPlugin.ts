import fs from 'node:fs';
import path from 'node:path';
import { normalizePath, type Plugin, type ViteDevServer } from 'vite';
import { listAssetFiles, listScripts, readProject, resolveInProject, toPosix, PROJECT_FILE } from './project';

export const SCRIPTS_ID = 'virtual:rs/scripts';
export const PROJECT_ID = 'virtual:rs/project';
const R_SCRIPTS = '\0' + SCRIPTS_ID;
const R_PROJECT = '\0' + PROJECT_ID;
export const PHYSICS_ID = 'virtual:rs/physics';
const R_PHYSICS = '\0' + PHYSICS_ID;

/** Physics usage in a project (scenes / prefabs / scripts name a physics component or the Physics API). */
const PHYSICS_RE = /\b(RigidBody|Collider|CharacterController|Physics)\b/;
export function projectUsesPhysics(root: string): boolean {
  return listAssetFiles(root).some((f) => /\.(json|ts)$/.test(f) && PHYSICS_RE.test(fs.readFileSync(path.join(root, f), 'utf8')));
}

export interface RsProjectPluginOptions {
  projectRoot: string;
  engineRoot: string;
  /** 'editor' = the editor's dev server, 'game' = building a game. */
  mode: 'editor' | 'game';
}

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.ts': 'text/plain; charset=utf-8',
};

/**
 * The project side of every RS Engine Vite server / build:
 * - `virtual:rs/scripts` imports every project script and registers its exported Behaviors / UserData (`syncScripts`); it accepts
 *   itself, so an edited script re-registers its classes and fires `rs:scripts-reloaded` (the editor rebuilds the scene);
 * - `virtual:rs/project` = rs.project.json;
 * - `@rs/*` aliases to the engine sources, TS decorators;
 * - dev: `/project/<path>` serves project files; game builds copy the project's assets (not scripts) next to the game.
 */
export function rsProjectPlugin(opts: RsProjectPluginOptions): Plugin {
  const projectRoot = path.resolve(opts.projectRoot);
  const engineRoot = path.resolve(opts.engineRoot);
  const pkg = (name: string, entry = 'index.ts') => normalizePath(path.join(engineRoot, 'packages', name, 'src', entry));
  let server: ViteDevServer | null = null;

  const scriptsModule = () => {
    const files = listScripts(projectRoot);
    const lines = [`import { syncScripts } from '@rs/core';`];
    files.forEach((f, i) => lines.push(`import * as m${i} from ${JSON.stringify(normalizePath(path.join(projectRoot, f)))};`));
    lines.push(`syncScripts({ ${files.map((f, i) => `${JSON.stringify(f)}: m${i}`).join(', ')} });`);
    lines.push(`export const scripts = ${JSON.stringify(files)};`);
    lines.push(`if (import.meta.hot) { import.meta.hot.accept(); window.dispatchEvent(new CustomEvent('rs:scripts-reloaded')); }`);
    return lines.join('\n');
  };

  return {
    name: 'rs-project',
    enforce: 'pre',

    config() {
      return {
        resolve: {
          alias: {
            '@rs/core': pkg('core'),
            '@rs/render-babylon': pkg('render-babylon'),
            '@rs/physics': pkg('physics'),
            '@rs/runtime': pkg('runtime'),
            '@rs/editor': pkg('editor', 'api.ts'),
          },
          dedupe: ['@babylonjs/core', '@babylonjs/loaders', 'react', 'react-dom'],
        },
        esbuild: { tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: true, jsx: 'react-jsx' } } },
        server: { fs: { allow: [engineRoot, projectRoot] } },
        optimizeDeps: { include: ['@babylonjs/core', '@babylonjs/loaders', 'react', 'react-dom', 'react-dom/client'] },
      };
    },

    resolveId(id) {
      if (id === SCRIPTS_ID) return R_SCRIPTS;
      if (id === PROJECT_ID) return R_PROJECT;
      if (id === PHYSICS_ID) return R_PHYSICS;
      return null;
    },

    load(id) {
      if (id === R_SCRIPTS) return scriptsModule();
      // Rapier (~2 MB of WASM) only in games whose project uses physics (projectUsesPhysics); the editor always has it
      if (id === R_PHYSICS) return opts.mode === 'editor' || projectUsesPhysics(projectRoot) ? `export { initPhysics } from '@rs/physics';\n` : `export const initPhysics = () => Promise.resolve();\n`;
      if (id === R_PROJECT) return `export const project = ${JSON.stringify(readProject(projectRoot))};\nexport const projectRoot = ${JSON.stringify(opts.mode === 'editor' ? toPosix(projectRoot) : '')};`;
      return null;
    },

    // Games: Rapier's compat build carries its WASM as base64 inside the JS (~3.5 MB of JS to download and parse). Emit the
    // bytes as a real .wasm file instead (smaller, compressed by servers, compiled while streaming) and pass its URL to
    // wasm-bindgen's init, which fetches URLs itself.
    transform(code, id) {
      if (opts.mode !== 'game' || !/rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/.test(id.split('?')[0])) return null;
      // `x.toByteArray("<base64>").buffer` → the emitted file's URL (wasm-bindgen fetches a URL string)
      const m = /(\w+)\.toByteArray\("([A-Za-z0-9+/=]{1000,})"\)(\.buffer)?/.exec(code);
      if (!m) {
        this.warn('Rapier: inlined WASM not found, kept as is');
        return null;
      }
      const ref = this.emitFile({ type: 'asset', name: 'rapier3d.wasm', source: Buffer.from(m[2], 'base64') });
      return { code: code.slice(0, m.index) + `import.meta.ROLLUP_FILE_URL_${ref}` + code.slice(m.index + m[0].length), map: null };
    },

    configureServer(s) {
      server = s;
      // project files under /project/
      s.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/project/')) return next();
        let rel: string;
        try {
          rel = decodeURIComponent(req.url.slice('/project/'.length).split('?')[0]);
        } catch {
          return next();
        }
        const abs = resolveInProject(projectRoot, rel);
        if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        res.setHeader('Content-Type', MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(abs).pipe(res);
      });
      // project changes: new / deleted scripts rebuild the scripts module; every change is announced to the editor
      const assetsDir = path.join(projectRoot, 'Assets');
      s.watcher.add([assetsDir, path.join(projectRoot, PROJECT_FILE)]);
      const onFs = (kind: string) => (file: string) => {
        const rel = toPosix(path.relative(projectRoot, file));
        if (rel.startsWith('..')) return;
        if ((kind === 'add' || kind === 'unlink') && rel.endsWith('.ts')) {
          const mod = s.moduleGraph.getModuleById(R_SCRIPTS);
          if (mod) void s.reloadModule(mod);
        }
        if (rel === PROJECT_FILE) {
          const mod = s.moduleGraph.getModuleById(R_PROJECT);
          if (mod) s.moduleGraph.invalidateModule(mod);
        }
        s.ws.send({ type: 'custom', event: 'rs:assets-changed', data: { path: rel, kind } });
      };
      for (const k of ['add', 'change', 'unlink', 'addDir', 'unlinkDir']) s.watcher.on(k, onFs(k));
    },

    // game builds: the project's assets next to index.html (scripts are bundled, not shipped)
    writeBundle(o) {
      if (opts.mode !== 'game' || !o.dir) return;
      for (const rel of listAssetFiles(projectRoot)) {
        if (rel.endsWith('.ts')) continue;
        const dest = path.join(o.dir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(projectRoot, rel), dest);
      }
      fs.copyFileSync(path.join(projectRoot, PROJECT_FILE), path.join(o.dir, PROJECT_FILE));
    },

    transformIndexHtml(html) {
      return opts.mode === 'game' ? html.replace(/<title>[^<]*<\/title>/, `<title>${readProject(projectRoot).name.replace(/[<&]/g, '')}</title>`) : html;
    },
  };
  void server;
}
