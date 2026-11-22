import { Application } from './Application';
import { Debug } from './Debug';
import { Behavior, Component, GameObject, _nextTransformFrame } from './GameObject';
import { Input } from './Input';

/**
 * Folder / Scene — RE-style organisation: a scene is a tree of Folders (each can be switched off as a whole) holding root
 * GameObjects. Play mode runs the components' lifecycle: awake (when created), start (before the first update), update,
 * lateUpdate, onDestroy (destruction is deferred to the end of the frame).
 */
export class Folder {
  name: string;
  /** Inactive folders neither update nor draw anything inside (RE's folder activation). */
  active = true;
  readonly folders: Folder[] = [];
  readonly gameObjects: GameObject[] = [];
  parent: Folder | null = null;
  /** @internal */ _scene: Scene | null = null;

  constructor(name = 'Folder') {
    this.name = name;
  }

  get scene(): Scene | null {
    return this._scene ?? this.parent?.scene ?? null;
  }
  get activeInHierarchy(): boolean {
    for (let f: Folder | null = this; f; f = f.parent) if (!f.active) return false;
    return true;
  }
  get path(): string {
    const parts: string[] = [];
    for (let f: Folder | null = this; f && f.parent; f = f.parent) parts.unshift(f.name);
    return parts.join('/');
  }

  addFolder(f: Folder | string, index = -1): Folder {
    const folder = typeof f === 'string' ? new Folder(f) : f;
    folder.parent?.removeFolder(folder);
    folder.parent = this;
    if (index < 0 || index > this.folders.length) this.folders.push(folder);
    else this.folders.splice(index, 0, folder);
    return folder;
  }
  removeFolder(f: Folder): void {
    const i = this.folders.indexOf(f);
    if (i >= 0) this.folders.splice(i, 1);
    f.parent = null;
  }

  /** Adds a root GameObject (detaches it from its parent / previous folder). */
  add(go: GameObject, index = -1): void {
    go.transform.setParent(null);
    go._folder?.remove(go);
    go._folder = this;
    go._scene = this.scene;
    if (index < 0 || index > this.gameObjects.length) this.gameObjects.push(go);
    else this.gameObjects.splice(index, 0, go);
  }
  remove(go: GameObject): void {
    const i = this.gameObjects.indexOf(go);
    if (i >= 0) this.gameObjects.splice(i, 1);
    if (go._folder === this) go._folder = null;
  }

  /** Folder by path below this one (`Enemies/Wave1`). */
  findFolder(path: string): Folder | null {
    let cur: Folder | null = this;
    for (const part of path.split('/').filter(Boolean)) {
      cur = cur?.folders.find((f) => f.name === part) ?? null;
      if (!cur) return null;
    }
    return cur;
  }

  *allFolders(): Generator<Folder> {
    yield this;
    for (const f of this.folders) yield* f.allFolders();
  }
}

export class Scene {
  name: string;
  /** Project path of the scene file (`Assets/Scenes/Main.scn.json`), null for unsaved scenes. */
  path: string | null = null;
  readonly root: Folder;
  /** Play mode: lifecycle runs. */
  playing = false;
  private readonly _toStart: Component[] = [];
  private readonly _toDestroy: GameObject[] = [];
  /** Bumped by structural changes (objects / folders added, removed, moved). */
  version = 0;

  constructor(name = 'Scene') {
    this.name = name;
    this.root = new Folder('Root');
    this.root._scene = this;
  }

  /** Every GameObject (root objects and their descendants), folder order. */
  allGameObjects(): GameObject[] {
    const out: GameObject[] = [];
    for (const f of this.root.allFolders()) for (const g of f.gameObjects) for (const d of g.selfAndDescendants()) out.push(d);
    return out;
  }

  findById(id: number): GameObject | null {
    for (const g of this.allGameObjects()) if (g.id === id) return g;
    return null;
  }
  /** First GameObject named `name` (or a `Root/Child` path from a root object). */
  find(name: string): GameObject | null {
    if (name.includes('/')) {
      const [first, ...rest] = name.split('/');
      const root = this.allGameObjects().find((g) => !g.parent && g.name === first);
      return root ? (rest.length ? root.find(rest.join('/')) : root) : null;
    }
    return this.allGameObjects().find((g) => g.name === name) ?? null;
  }
  findWithTag(tag: string): GameObject[] {
    return this.allGameObjects().filter((g) => g.tag === tag);
  }
  /** Every component of a type in the scene. */
  findComponents<T extends Component>(type: abstract new (...a: never[]) => T): T[] {
    const out: T[] = [];
    for (const g of this.allGameObjects()) for (const c of g.components) if (c instanceof type) out.push(c);
    return out;
  }

  /** Creates a GameObject in a folder (default: root folder) or under a parent. */
  createGameObject(name = 'GameObject', where: Folder | GameObject | null = null): GameObject {
    const go = new GameObject(name);
    this.add(go, where);
    return go;
  }

  /** Adds an object (and its children) to the scene: into a folder or under a parent GameObject. */
  add(go: GameObject, where: Folder | GameObject | null = null, index = -1): void {
    if (where instanceof GameObject) {
      go._folder?.remove(go);
      go._folder = null;
      go._scene = null;
      go.transform.setParent(where.transform, false, index);
    } else (where ?? this.root).add(go, index);
    this.version++;
    if (this.playing) for (const d of go.selfAndDescendants()) for (const c of d.components) this._componentAdded(c);
  }

  /** Destroys an object and its children (end of frame in play mode). */
  destroy(go: GameObject): void {
    if (go._destroyed) return;
    if (this.playing) {
      if (!this._toDestroy.includes(go)) this._toDestroy.push(go);
      return;
    }
    this._remove(go);
  }

  private _remove(go: GameObject): void {
    for (const d of [...go.selfAndDescendants()].reverse()) {
      if (this.playing)
        for (const c of d.components)
          if (c._awoken && c.onDestroy) {
            try {
              c.onDestroy();
            } catch (e) {
              Debug.exception(e, c);
            }
          }
      d._destroyed = true;
    }
    if (go.parent) go.transform.setParent(null);
    go._folder?.remove(go);
    go._scene = null;
    this.version++;
  }

  /** @internal */
  _componentAdded(c: Component): void {
    if (!this.playing) return;
    this._awake(c);
    this._toStart.push(c);
  }
  /** @internal */
  _componentRemoved(c: Component): void {
    if (this.playing && c._awoken && c.onDestroy) {
      try {
        c.onDestroy();
      } catch (e) {
        Debug.exception(e, c);
      }
    }
    const i = this._toStart.indexOf(c);
    if (i >= 0) this._toStart.splice(i, 1);
  }

  private _awake(c: Component): void {
    if (c._awoken) return;
    c._awoken = true;
    if (c.awake) {
      try {
        c.awake();
      } catch (e) {
        Debug.exception(e, c);
      }
    }
  }

  /** Enters play mode: every component awakes, then starts on the first frame. */
  begin(): void {
    if (this.playing) return;
    this.playing = true;
    const all = this.allGameObjects().flatMap((g) => g.components);
    for (const c of all) this._awake(c);
    this._toStart.push(...all);
  }

  /** Leaves play mode (onDestroy of everything awoken). */
  end(): void {
    if (!this.playing) return;
    for (const g of this.allGameObjects())
      for (const c of g.components)
        if (c._awoken && c.onDestroy) {
          try {
            c.onDestroy();
          } catch (e) {
            Debug.exception(e, c);
          }
        }
    this.playing = false;
    this._toStart.length = 0;
    this._toDestroy.length = 0;
  }

  /** One frame (play mode runs the lifecycle; edit mode only refreshes transforms). */
  step(dt: number): void {
    _nextTransformFrame();
    if (!this.playing) return;
    Application._tick(dt);
    const runs = (c: Component) => c.enabled && !c.gameObject._destroyed && c.gameObject.activeInHierarchy;
    if (this._toStart.length) {
      const list = this._toStart.splice(0);
      for (const c of list) {
        if (c._started || c.gameObject._destroyed) continue;
        if (!runs(c)) {
          this._toStart.push(c);
          continue;
        }
        c._started = true;
        if (c.start) {
          try {
            c.start();
          } catch (e) {
            Debug.exception(e, c);
          }
        }
      }
    }
    const all = this.allGameObjects();
    for (const g of all)
      for (const c of g.components)
        if (c.update && c._started && runs(c)) {
          try {
            c.update();
          } catch (e) {
            Debug.exception(e, c);
          }
        }
    for (const g of all)
      for (const c of g.components)
        if (c.lateUpdate && c._started && runs(c)) {
          try {
            c.lateUpdate();
          } catch (e) {
            Debug.exception(e, c);
          }
        }
    if (this._toDestroy.length) for (const g of this._toDestroy.splice(0)) this._remove(g);
    Input._endFrame();
    _nextTransformFrame();
  }

  /** Behaviors in the scene (debugging / tools). */
  get behaviors(): Behavior[] {
    return this.findComponents(Behavior);
  }
}
