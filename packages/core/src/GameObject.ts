import { Matrix, Quaternion, Vector3, eulerDegFromQuat, quatFromEulerDeg } from './math';
import { Types } from './reflection';
import type { Folder, Scene } from './Scene';

/**
 * GameObject / Transform / Component — RE-style: every GameObject has a Transform (shown as Global / Local in the Inspector,
 * not in its component list), any number of components, flags `updateSelf` (its components update) and `drawSelf` (its renderers
 * draw), and lives in a Folder of a Scene. Children are GameObjects whose Transform has a parent.
 */

let frameStamp = 1;
/** @internal advanced once per frame by the scene: invalidates cached world matrices. */
export function _nextTransformFrame(): void {
  frameStamp++;
}

export class Transform {
  readonly gameObject: GameObject;
  readonly localPosition = new Vector3(0, 0, 0);
  readonly localRotation = new Quaternion(0, 0, 0, 1);
  readonly localScale = new Vector3(1, 1, 1);
  private _parent: Transform | null = null;
  private readonly _children: Transform[] = [];
  private readonly _world = Matrix.Identity();
  private _worldStamp = 0;

  constructor(go: GameObject) {
    this.gameObject = go;
  }

  get parent(): Transform | null {
    return this._parent;
  }
  get children(): readonly Transform[] {
    return this._children;
  }

  /** Re-parents (keeps local values; `keepWorld` keeps the world placement instead). */
  setParent(p: Transform | null, keepWorld = false, index = -1): void {
    if (p === this._parent && index < 0) return;
    for (let q = p; q; q = q._parent) if (q === this) return; // no cycles
    const world = keepWorld ? this.worldMatrix.clone() : null;
    if (this._parent) {
      const i = this._parent._children.indexOf(this);
      if (i >= 0) this._parent._children.splice(i, 1);
    }
    this._parent = p;
    if (p) {
      if (index < 0 || index > p._children.length) p._children.push(this);
      else p._children.splice(index, 0, this);
    }
    if (world) {
      const local = p ? world.multiply(p.worldMatrix.clone().invert()) : world;
      local.decompose(this.localScale, this.localRotation, this.localPosition);
    }
    this._worldStamp = 0;
  }

  /** World matrix (cached for the current frame; call `markDirty()` after changing local values mid-frame). */
  get worldMatrix(): Matrix {
    if (this._worldStamp !== frameStamp) {
      Matrix.ComposeToRef(this.localScale, this.localRotation, this.localPosition, this._world);
      if (this._parent) this._world.multiplyToRef(this._parent.worldMatrix, this._world);
      this._worldStamp = frameStamp;
    }
    return this._world;
  }

  markDirty(): void {
    this._worldStamp = 0;
    for (const c of this._children) c.markDirty();
  }

  get position(): Vector3 {
    return this.worldMatrix.getTranslation();
  }
  set position(v: Vector3) {
    if (!this._parent) this.localPosition.copyFrom(v);
    else Vector3.TransformCoordinatesToRef(v, this._parent.worldMatrix.clone().invert(), this.localPosition);
    this.markDirty();
  }

  get rotation(): Quaternion {
    const q = new Quaternion();
    this.worldMatrix.decompose(undefined, q);
    return q;
  }
  set rotation(q: Quaternion) {
    if (!this._parent) this.localRotation.copyFrom(q);
    else {
      const pq = new Quaternion();
      this._parent.worldMatrix.decompose(undefined, pq);
      Quaternion.InverseToRef(pq, pq);
      pq.multiplyToRef(q, this.localRotation);
    }
    this.markDirty();
  }

  /** Local rotation as Euler angles in degrees. */
  get localEulerAngles(): Vector3 {
    return eulerDegFromQuat(this.localRotation);
  }
  set localEulerAngles(e: Vector3) {
    quatFromEulerDeg(e.x, e.y, e.z, this.localRotation);
    this.markDirty();
  }

  /** World forward (+Z, Babylon's left-handed convention). */
  get forward(): Vector3 {
    return Vector3.TransformNormal(Vector3.Forward(), this.worldMatrix).normalize();
  }
  get right(): Vector3 {
    return Vector3.TransformNormal(Vector3.Right(), this.worldMatrix).normalize();
  }
  get up(): Vector3 {
    return Vector3.TransformNormal(Vector3.Up(), this.worldMatrix).normalize();
  }

  translate(x: number, y: number, z: number, space: 'self' | 'world' = 'self'): void {
    const d = new Vector3(x, y, z);
    if (space === 'self') Vector3.TransformNormalToRef(d, Matrix.FromQuaternionToRef(this.localRotation, new Matrix()), d);
    this.localPosition.addInPlace(d);
    this.markDirty();
  }

  /** Rotates by Euler degrees around local axes. */
  rotate(x: number, y: number, z: number): void {
    const q = quatFromEulerDeg(x, y, z);
    this.localRotation.multiplyInPlace(q);
    this.markDirty();
  }

  lookAt(target: Vector3): void {
    const p = this.position;
    const d = target.subtract(p);
    if (d.lengthSquared() < 1e-12) return;
    const yaw = Math.atan2(d.x, d.z);
    const pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
    this.rotation = Quaternion.RotationYawPitchRoll(yaw, pitch, 0);
  }
}

export abstract class Component {
  /** Owner (set when added). */
  gameObject!: GameObject;
  /** Disabled components don't update (renderers don't draw). */
  enabled = true;
  /** @internal */ _started = false;
  /** @internal */ _awoken = false;

  get transform(): Transform {
    return this.gameObject.transform;
  }
  get scene(): Scene {
    return this.gameObject.scene!;
  }
  getComponent<T extends Component>(type: abstract new (...a: never[]) => T): T | null {
    return this.gameObject.getComponent(type);
  }

  /** Lifecycle (play mode): awake once when created, start before its first update. */
  awake?(): void;
  start?(): void;
  update?(): void;
  lateUpdate?(): void;
  /** Every physics step (Physics.fixedDeltaTime), before the simulation. */
  fixedUpdate?(): void;
  onDestroy?(): void;
  /** Physics callbacks (components of the object that owns the collider / body). */
  onCollisionEnter?(c: import('./Physics').Collision): void;
  onCollisionExit?(c: import('./Physics').Collision): void;
  onTriggerEnter?(other: GameObject): void;
  onTriggerExit?(other: GameObject): void;
  /** Edit mode too: called when a field changed in the Inspector. */
  onValidate?(): void;
}

/** Base of gameplay scripts (RE's via.Behavior). Exported Behavior subclasses of project scripts become components. */
export abstract class Behavior extends Component {}

let nextId = 1;

export class GameObject {
  /** Unique within its scene (scene files reference GameObjects by id). */
  id: number;
  name: string;
  tag = '';
  /** Components update (RE's UpdateSelf). */
  updateSelf = true;
  /** Renderers draw (RE's DrawSelf). */
  drawSelf = true;
  readonly transform: Transform;
  readonly components: Component[] = [];
  /** @internal set by Scene / Folder. */ _folder: Folder | null = null;
  /** @internal */ _scene: Scene | null = null;
  /** Prefab file this object was instantiated from (informative). */
  prefab: string | null = null;
  /** @internal */ _destroyed = false;
  /** Bumped when the component list changes (renderers cache by it). */
  componentsVersion = 0;

  constructor(name = 'GameObject', id?: number) {
    this.name = name;
    this.id = id ?? nextId++;
    if (this.id >= nextId) nextId = this.id + 1;
    this.transform = new Transform(this);
  }

  get scene(): Scene | null {
    return this._scene ?? this.parent?.scene ?? null;
  }
  get folder(): Folder | null {
    return this._folder ?? this.parent?.folder ?? null;
  }
  get parent(): GameObject | null {
    return this.transform.parent?.gameObject ?? null;
  }
  get children(): GameObject[] {
    return this.transform.children.map((t) => t.gameObject);
  }
  get destroyed(): boolean {
    return this._destroyed;
  }

  /** Active in the hierarchy: its folders are active and it (and its parents) update. */
  get activeInHierarchy(): boolean {
    for (let g: GameObject | null = this; g; g = g.parent) if (!g.updateSelf) return false;
    const f = this.folder;
    return !f || f.activeInHierarchy;
  }
  get visibleInHierarchy(): boolean {
    for (let g: GameObject | null = this; g; g = g.parent) if (!g.drawSelf) return false;
    const f = this.folder;
    return !f || f.activeInHierarchy;
  }

  addComponent<T extends Component>(type: (new () => T) | string): T {
    const ctor = typeof type === 'string' ? (Types.get(type)?.ctor as (new () => T) | undefined) : type;
    if (!ctor) throw new Error(`Unknown component type '${String(type)}'`);
    const c = new ctor();
    this._attach(c);
    return c;
  }

  /** @internal attaches an instance (deserialization / duplication). */
  _attach(c: Component, index = -1): void {
    c.gameObject = this;
    if (index < 0 || index >= this.components.length) this.components.push(c);
    else this.components.splice(index, 0, c);
    this.componentsVersion++;
    this.scene?._componentAdded(c);
  }

  getComponent<T extends Component>(type: (abstract new (...a: never[]) => T) | string): T | null {
    if (typeof type === 'string') return (this.components.find((c) => Types.nameOf(c.constructor) === type) as T) ?? null;
    return (this.components.find((c) => c instanceof type) as T) ?? null;
  }
  getComponents<T extends Component>(type: abstract new (...a: never[]) => T): T[] {
    return this.components.filter((c) => c instanceof type) as T[];
  }
  getComponentInChildren<T extends Component>(type: abstract new (...a: never[]) => T): T | null {
    const own = this.getComponent(type);
    if (own) return own;
    for (const c of this.children) {
      const r = c.getComponentInChildren(type);
      if (r) return r;
    }
    return null;
  }

  removeComponent(c: Component): void {
    const i = this.components.indexOf(c);
    if (i < 0) return;
    this.scene?._componentRemoved(c);
    this.components.splice(i, 1);
    this.componentsVersion++;
  }

  /** Destroys at the end of the frame (immediately outside play mode). */
  destroy(): void {
    const s = this.scene;
    if (s) s.destroy(this);
    else this._destroyed = true;
  }

  /** This object and every descendant, depth first. */
  *selfAndDescendants(): Generator<GameObject> {
    yield this;
    for (const t of this.transform.children) yield* t.gameObject.selfAndDescendants();
  }

  /** Child by name, or by path `Arm/Hand`. */
  find(path: string): GameObject | null {
    let cur: GameObject | null = this;
    for (const part of path.split('/')) {
      cur = cur?.children.find((c) => c.name === part) ?? null;
      if (!cur) return null;
    }
    return cur;
  }
}

/** @internal next free GameObject id (deserialization keeps saved ids). */
export function _reserveIds(maxId: number): void {
  if (maxId >= nextId) nextId = maxId + 1;
}
