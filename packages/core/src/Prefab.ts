import type { GameObject } from './GameObject';
import type { Vector3 } from './math';
import type { Folder, Scene } from './Scene';
import type { PrefabJson } from './serialization';

type FPrefabHost = {
  instantiate(p: Prefab, scene: Scene, where: Folder | GameObject | null): GameObject;
};
let host: FPrefabHost | null = null;
/** @internal installed by index.ts (avoids an import cycle with serialization). */
export function _setPrefabHost(h: FPrefabHost): void {
  host = h;
}

/**
 * A prefab file (`.pfb.json`): a GameObject tree to instantiate (RE's .pfb). Components reference prefabs with
 * `@field({ type: 'prefab' })`; `prefab.instantiate()` adds a copy to the current scene.
 */
export class Prefab {
  readonly path: string;
  data: PrefabJson | null;

  constructor(path: string, data: PrefabJson | null) {
    this.path = path;
    this.data = data;
  }

  /** A reference to a prefab not loaded yet (resolved by Assets when it is). */
  static placeholder(path: string): Prefab {
    return new Prefab(path, null);
  }

  get loaded(): boolean {
    return !!this.data;
  }

  /** Adds a copy to `scene` (default: the active scene) in a folder / under a parent, optionally at a world position. */
  instantiate(position?: Vector3 | null, where: Folder | GameObject | null = null, scene?: Scene): GameObject {
    const s = scene ?? Prefab.activeScene;
    if (!s) throw new Error('Prefab.instantiate: no active scene');
    if (!host) throw new Error('Prefab.instantiate: core not initialised');
    const go = host.instantiate(this, s, where);
    if (position) go.transform.position = position;
    return go;
  }

  /** The scene `instantiate()` adds to by default (set by the player / editor). */
  static activeScene: Scene | null = null;
}
