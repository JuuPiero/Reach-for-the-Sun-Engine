/** Calls to the editor's dev server (packages/editor/server/projectApi.ts). */
export interface FileEntry {
  path: string;
  dir: boolean;
  size: number;
  mtime: number;
}

async function json<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

const q = (p: string) => encodeURIComponent(p);

export const api = {
  files: async () => (await json<{ files: FileEntry[] }>(await fetch('/__rs/api/files'))).files,
  project: async () => json<{ name: string; startScene: string; editorScene?: string; root: string }>(await fetch('/__rs/api/project')),
  readText: async (path: string) => {
    const r = await fetch('/project/' + path.split('/').map(encodeURIComponent).join('/'), { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.text();
  },
  write: async (path: string, content: string | Blob) => json(await fetch(`/__rs/api/file?path=${q(path)}`, { method: 'PUT', body: content })),
  writeJson: async (path: string, data: unknown) => api.write(path, JSON.stringify(data, null, 2) + '\n'),
  mkdir: async (path: string) => json(await fetch(`/__rs/api/mkdir?path=${q(path)}`, { method: 'POST' })),
  remove: async (path: string) => json(await fetch(`/__rs/api/delete?path=${q(path)}`, { method: 'POST' })),
  rename: async (from: string, to: string) => json(await fetch('/__rs/api/rename', { method: 'POST', body: JSON.stringify({ from, to }) })),
  build: async () => json<{ ok: boolean; outDir: string; files: { file: string; bytes: number }[]; ms: number }>(await fetch('/__rs/api/build', { method: 'POST' })),
};
