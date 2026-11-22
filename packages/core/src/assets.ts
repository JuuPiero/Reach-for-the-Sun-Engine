import { Debug } from './Debug';
import { Prefab } from './Prefab';
import type { PrefabJson, UserDataJson } from './serialization';
import type { UserData } from './UserData';

/**
 * Project files by path (`Assets/...`, the RE way: references are paths). `baseUrl` is where they are served
 * (editor: `/project/`, builds: `./`). JSON assets are cached; UserData / prefabs are loaded once and shared.
 * Scenes preload every `.user.json` / `.pfb.json` they mention before being built (`preloadReferences`).
 */
const json = new Map<string, Promise<unknown>>();
const userData = new Map<string, UserData>();
const prefabs = new Map<string, Prefab>();
let readUserData: ((j: UserDataJson, path: string) => UserData | null) | null = null;

export const ASSET_EXT = {
  scene: '.scn.json',
  prefab: '.pfb.json',
  userdata: '.user.json',
} as const;

export const Assets = {
  baseUrl: '',
  url(path: string): string {
    return Assets.baseUrl + path.split('/').map(encodeURIComponent).join('/');
  },

  async loadJson<T = unknown>(path: string): Promise<T> {
    let p = json.get(path);
    if (!p) {
      p = fetch(Assets.url(path), { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
        return r.json();
      });
      json.set(path, p);
      p.catch(() => json.delete(path));
    }
    return p as Promise<T>;
  },

  /** Loads a UserData file (shared instance). */
  async loadUserData(path: string): Promise<UserData | null> {
    const have = userData.get(path);
    if (have) return have;
    try {
      const j = await Assets.loadJson<UserDataJson>(path);
      const u = readUserData?.(j, path) ?? null;
      if (u) userData.set(path, u);
      else Debug.warn(`UserData ${path}: unknown type '${j.type}'`);
      return u;
    } catch (e) {
      Debug.error(`UserData ${path}: ${(e as Error).message}`);
      return null;
    }
  },
  getUserData(path: string): UserData | null {
    return userData.get(path) ?? null;
  },
  /** Replaces the shared instance (editor edits / reloads). */
  setUserData(path: string, u: UserData | null): void {
    if (u) userData.set(path, u);
    else userData.delete(path);
  },

  async loadPrefab(path: string): Promise<Prefab | null> {
    const have = prefabs.get(path);
    if (have?.loaded) return have;
    try {
      const j = await Assets.loadJson<PrefabJson>(path);
      const p = have ?? new Prefab(path, null);
      p.data = j;
      prefabs.set(path, p);
      await Assets.preloadReferences(j);
      return p;
    } catch (e) {
      Debug.error(`Prefab ${path}: ${(e as Error).message}`);
      return null;
    }
  },
  getPrefab(path: string): Prefab | null {
    return prefabs.get(path) ?? null;
  },
  /** The shared Prefab object of a path (not loaded yet = `loaded` false; filled by loadPrefab). */
  prefabRef(path: string): Prefab {
    let p = prefabs.get(path);
    if (!p) prefabs.set(path, (p = new Prefab(path, null)));
    return p;
  },

  /** Loads every UserData / prefab a JSON document mentions (recursively for prefabs). */
  async preloadReferences(doc: unknown): Promise<void> {
    const refs = new Set<string>();
    const walk = (v: unknown) => {
      if (typeof v === 'string') {
        if (v.endsWith(ASSET_EXT.userdata) || v.endsWith(ASSET_EXT.prefab)) refs.add(v);
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(doc);
    await Promise.all([...refs].map((r) => (r.endsWith(ASSET_EXT.userdata) ? Assets.loadUserData(r) : Assets.loadPrefab(r))));
  },

  /** Forgets cached files (the editor after a file changed on disk). */
  invalidate(path?: string): void {
    if (!path) {
      json.clear();
      userData.clear();
      for (const p of prefabs.values()) p.data = null;
      return;
    }
    json.delete(path);
    userData.delete(path);
    const p = prefabs.get(path);
    if (p) p.data = null;
  },

  /** @internal installed by index.ts. */
  _setUserDataReader(f: (j: UserDataJson, path: string) => UserData | null): void {
    readUserData = f;
  },
};
