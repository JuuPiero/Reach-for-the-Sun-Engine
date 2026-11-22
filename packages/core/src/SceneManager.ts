import { Prefab } from './Prefab';
import type { GameObject } from './GameObject';
import type { Scene } from './Scene';

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
