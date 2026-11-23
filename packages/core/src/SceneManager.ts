import { Prefab } from './Prefab';
import type { GameObject } from './GameObject';
import type { Folder, Scene } from './Scene';

/** Size of the game view in CSS pixels (set by the host: player, editor Runtime view). */
export const Screen = {
  width: 1280,
  height: 720,
  pixelRatio: 1,
  get aspect(): number {
    return this.width / Math.max(1, this.height);
  },
  /** @internal host. */
  _set(w: number, h: number, ratio = 1): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.pixelRatio = ratio;
  },
};

export interface SceneHost {
  /** Replaces the playing scene with the scene file at `path` (play mode continues in the new scene). */
  load(path: string): Promise<Scene>;
}

let host: SceneHost | null = null;
let active: Scene | null = null;
const listeners = new Set<(s: Scene) => void>();

/**
 * Scene switching from scripts (RE's scene / level loading): `SceneManager.load('Assets/Scenes/Level2.scn.json')` swaps the
 * playing scene at the end of the frame — the current scene ends (onDestroy everywhere), the new one starts. The player and the
 * editor install the host; in the editor, Stop returns to the scene that was being edited.
 */
export const SceneManager = {
  /** The scene that is playing (or edited). */
  get active(): Scene | null {
    return active;
  },
  /** Loads a scene and makes it the playing one. */
  load(path: string): Promise<Scene> {
    if (!host) return Promise.reject(new Error('SceneManager.load: no scene host (player / editor)'));
    return host.load(path);
  },
  /**
   * Adds a scene's content to the playing one (streaming a level section, a UI scene…): into the linked folder of that path if the
   * scene has one, else into a new root folder named after the file. Resolves with the folder.
   */
  async loadAdditive(path: string): Promise<Folder> {
    const s = active;
    if (!s) throw new Error('SceneManager.loadAdditive: no active scene');
    let f = [...s.root.allFolders()].find((x) => x.scenePath === path) ?? null;
    if (!f) {
      f = s.root.addFolder(path.slice(path.lastIndexOf('/') + 1).replace(/\.scn\.json$/, ''));
      f.scenePath = path;
      f.autoLoad = false;
      f._additive = true;
      s.version++;
    }
    await f.loadScene();
    return f;
  },
  /** Removes additively loaded content (a folder created by loadAdditive disappears; a linked folder stays, empty). */
  unloadAdditive(pathOrFolder: string | Folder): void {
    const s = active;
    if (!s) return;
    const f = typeof pathOrFolder === 'string' ? [...s.root.allFolders()].find((x) => x.scenePath === pathOrFolder) : pathOrFolder;
    if (!f) return;
    f.unloadScene();
    if (f._additive) {
      f.parent?.removeFolder(f);
      s.version++;
    }
  },
  /** Keeps an object (its root, with children) alive when SceneManager.load switches scenes: it moves into the new scene with its
   * state (no onDestroy, no new start). Timers / tweens it had on the old scene are dropped. */
  dontDestroyOnLoad(go: GameObject): void {
    let r = go;
    while (r.parent) r = r.parent;
    r._dontDestroy = true;
  },
  /** @internal hosts switching scenes: `keep = from._takePersistent()` before `from.end()`, then this after `to.begin()`. */
  _carry(keep: GameObject[], to: Scene): void {
    for (const g of keep) to.add(g);
  },
  /** Called with every scene that becomes active. */
  onActiveChanged(f: (s: Scene) => void): () => void {
    listeners.add(f);
    return () => listeners.delete(f);
  },
  /** @internal */
  _setHost(h: SceneHost | null): void {
    host = h;
  },
  /** @internal hosts call it when a scene becomes the active one. */
  _setActive(s: Scene): void {
    active = s;
    Prefab.activeScene = s;
    for (const f of listeners) f(s);
  },
};
