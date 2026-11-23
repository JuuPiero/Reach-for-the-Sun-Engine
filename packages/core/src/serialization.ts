import { Assets } from './assets';
import { Color3, Quaternion, Vector3 } from './math';
import { Component, GameObject, _newId, _reserveIds } from './GameObject';
import { getFields, Types, type FieldInfo } from './reflection';
import { Folder, Scene } from './Scene';
import { UserData } from './UserData';

/**
 * File formats (contract: users save them).
 * Scene `.scn.json`: `{ format: 1, root: FolderJson }`; FolderJson `{ name, active?, folders: [], gameObjects: [] }`;
 * GameObjectJson `{ id, name, tag?, update?, draw?, prefab?, transform: { p: [x,y,z], r: [x,y,z,w], s: [x,y,z] },
 * components: [{ type, enabled?, fields }], children: [] }`. Prefab `.pfb.json`: `{ format: 1, gameObject }`.
 * UserData `.user.json`: `{ format: 1, type, fields }`.
 * Field values: vec3 `[x,y,z]`, color `[r,g,b]`, gameobject = id (number | null), prefab / userdata / asset = project path.
 * A component whose type is unknown (script deleted or not compiling) becomes a MissingComponent keeping its data.
 */

export const FORMAT = 1;

export interface ComponentJson {
  type: string;
  enabled?: boolean;
  fields: Record<string, unknown>;
}
export interface GameObjectJson {
  id: number;
  name: string;
  tag?: string;
  layer?: number;
  update?: boolean;
  draw?: boolean;
  prefab?: string;
  transform: { p: number[]; r: number[]; s: number[] };
  components: ComponentJson[];
  children: GameObjectJson[];
  /** Prefab instance root saved compactly: the differences from the prefab (components / children are then empty). */
  overrides?: PrefabOverrides;
  /** @internal expanded instances: id of the object in the prefab file (never saved). */
  pid?: number;
}
/**
 * Differences of a prefab instance from its prefab, keyed by the ids of the prefab file's objects ("pid"). Components are keyed
 * `Type#n` (n-th component of that type on the object). Field values are saved values (references = scene ids).
 */
export interface PrefabOverrides {
  /** pid → scene id of every object of the instance (stable references across prefab edits). */
  ids: Record<string, number>;
  objects?: Record<string, { name?: string; tag?: string; layer?: number; update?: boolean; draw?: boolean; transform?: GameObjectJson['transform']; comps?: Record<string, { enabled?: boolean; fields?: Record<string, unknown> }> }>;
  addedComps?: Record<string, ComponentJson[]>;
  removedComps?: Record<string, string[]>;
  /** Children added under a prefab object (full / compact JSON). */
  added?: Record<string, GameObjectJson[]>;
  /** Prefab objects removed from the instance (with their subtree). */
  removed?: number[];
}
export interface FolderJson {
  name: string;
  active?: boolean;
  /** Linked scene file (content saved there, not here). */
  scene?: string;
  autoLoad?: boolean;
  /** Editor snapshots: the linked content is inline (folders / gameObjects). */
  loaded?: boolean;
  folders: FolderJson[];
  gameObjects: GameObjectJson[];
}
export interface SceneJson {
  format: number;
  root: FolderJson;
}
export interface PrefabJson {
  format: number;
  gameObject: GameObjectJson;
}
export interface UserDataJson {
  format: number;
  type: string;
  fields: Record<string, unknown>;
}

/** Placeholder for a component whose class is missing; saved back unchanged. */
export class MissingComponent extends Component {
  typeName = '';
  data: ComponentJson | null = null;
}
Types.register(MissingComponent, 'MissingComponent', 'component', { hidden: true });

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function writeValue(f: FieldInfo, v: unknown): unknown {
  switch (f.type) {
    case 'vec3':
      return v instanceof Vector3 ? [r6(v.x), r6(v.y), r6(v.z)] : [0, 0, 0];
    case 'color':
      return v instanceof Color3 ? [r6(v.r), r6(v.g), r6(v.b)] : [1, 1, 1];
    case 'gameobject':
      return v instanceof GameObject ? v.id : null;
    case 'prefab':
    case 'userdata':
      return (v as { path?: string | null } | null)?.path ?? (typeof v === 'string' ? v : null);
    case 'number':
      return typeof v === 'number' ? r6(v) : 0;
    case 'int':
      return typeof v === 'number' ? Math.round(v) : 0;
    case 'boolean':
      return !!v;
    default:
      return v ?? '';
  }
}

/** Reads a field value; GameObject references go through `refs` (resolved once every object exists). */
export function readValue(f: FieldInfo, raw: unknown, current: unknown, refs?: (id: number, set: (g: GameObject | null) => void) => void, set?: (v: unknown) => void): unknown {
  switch (f.type) {
    case 'vec3': {
      const a = Array.isArray(raw) ? raw : [0, 0, 0];
      const v = current instanceof Vector3 ? current : new Vector3();
      return v.set(+a[0] || 0, +a[1] || 0, +a[2] || 0);
    }
    case 'color': {
      const a = Array.isArray(raw) ? raw : [1, 1, 1];
      const c = current instanceof Color3 ? current : new Color3();
      c.set(+a[0] || 0, +a[1] || 0, +a[2] || 0);
      return c;
    }
    case 'gameobject':
      if (typeof raw === 'number' && refs && set) refs(raw, set);
      return null;
    case 'prefab':
      return typeof raw === 'string' && raw ? Assets.prefabRef(raw) : null;
    case 'userdata':
      return typeof raw === 'string' && raw ? (Assets.getUserData(raw) ?? null) : null;
    case 'number':
    case 'int':
      return typeof raw === 'number' ? raw : Number(raw) || 0;
    case 'boolean':
      return !!raw;
    default:
      return raw == null ? '' : String(raw);
  }
}

export function writeFields(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of getFields(obj.constructor)) out[f.name] = writeValue(f, (obj as Record<string, unknown>)[f.name]);
  return out;
}

export function readFields(obj: object, json: Record<string, unknown> | undefined, refs?: (id: number, set: (g: GameObject | null) => void) => void): void {
  if (!json) return;
  const o = obj as Record<string, unknown>;
  for (const f of getFields(obj.constructor)) {
    if (!(f.name in json)) continue;
    const v = readValue(f, json[f.name], o[f.name], refs, (g) => (o[f.name] = g));
    if (f.type !== 'gameobject') o[f.name] = v;
  }
}

// ---- GameObjects ------------------------------------------------------------------------------------------------------

export interface SerializeOptions {
  /** Plain full tree: prefab instances are written out entirely and lose their prefab link (prefab files, canonical data). */
  flatten?: boolean;
}

function transformJson(go: GameObject): GameObjectJson['transform'] {
  const t = go.transform;
  return {
    p: [r6(t.localPosition.x), r6(t.localPosition.y), r6(t.localPosition.z)],
    r: [r6(t.localRotation.x), r6(t.localRotation.y), r6(t.localRotation.z), r6(t.localRotation.w)],
    s: [r6(t.localScale.x), r6(t.localScale.y), r6(t.localScale.z)],
  };
}

/** Full JSON of one object (no prefab handling for the object itself; children follow `childJson`). */
function plainJson(go: GameObject, childJson: (c: GameObject) => GameObjectJson): GameObjectJson {
  const j: GameObjectJson = {
    id: go.id,
    name: go.name,
    transform: transformJson(go),
    components: go.components.map(serializeComponent),
    children: go.children.filter((c) => !c.destroyed).map(childJson),
  };
  if (go.tag) j.tag = go.tag;
  if (go.layer) j.layer = go.layer;
  if (!go.updateSelf) j.update = false;
  if (!go.drawSelf) j.draw = false;
  return j;
}

export function serializeGameObject(go: GameObject, opts: SerializeOptions = {}): GameObjectJson {
  if (opts.flatten) return plainJson(go, (c) => serializeGameObject(c, opts));
  if (go.prefab) {
    const pf = Assets.getPrefab(go.prefab);
    if (pf?.data) {
      if (go._prefabId === null) linkInstance(go, pf.data);
      return collapseInstance(go, pf.data);
    }
    if (go._prefabCompact) {
      // prefab missing: keep what was loaded, with the root's own state
      const j = { ...(go._prefabCompact as GameObjectJson), id: go.id, name: go.name, transform: transformJson(go) };
      return j;
    }
    const j = plainJson(go, (c) => serializeGameObject(c));
    j.prefab = go.prefab;
    return j;
  }
  return plainJson(go, (c) => serializeGameObject(c));
}

// ---- prefab instances ---------------------------------------------------------------------------------------------------

const canonicalCache = new WeakMap<PrefabJson, GameObjectJson>();
const canonicalBusy = new Set<PrefabJson>();
/**
 * A prefab's tree with every field written (read + written back once): the base that instances are compared with. Ids are the
 * prefab file's ids (pids). Nested prefab instances inside a prefab are flattened.
 */
export function canonicalPrefab(data: PrefabJson): GameObjectJson {
  let c = canonicalCache.get(data);
  if (!c) {
    if (canonicalBusy.has(data)) throw new Error('prefab contains itself');
    canonicalBusy.add(data);
    try {
      const ctx = newReadContext(true, null);
      ctx.temp = true;
      const root = { ...data.gameObject };
      if (!root.overrides) delete root.prefab; // a prefab file's root is not an instance of anything
      const go = deserializeGameObject(root, ctx);
      resolveReferences(ctx);
      c = serializeGameObject(go, { flatten: true });
      canonicalCache.set(data, c);
    } finally {
      canonicalBusy.delete(data);
    }
  }
  return c;
}

/** Full JSON of a new instance of a prefab (prefab ids kept as `pid`s). */
export function instanceJson(data: PrefabJson): GameObjectJson {
  const tree = clone(canonicalPrefab(data));
  const walk = (n: GameObjectJson) => {
    n.pid = n.id;
    n.children.forEach(walk);
  };
  walk(tree);
  return tree;
}

const compKeys = (comps: ComponentJson[]): string[] => {
  const n = new Map<string, number>();
  return comps.map((c) => {
    const i = n.get(c.type) ?? 0;
    n.set(c.type, i + 1);
    return `${c.type}#${i}`;
  });
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Rewrites GameObject reference fields (ids) of components through `map`. */
function remapRefs(comps: ComponentJson[], map: Map<number, number>): void {
  for (const c of comps) {
    const t = Types.get(c.type);
    if (!t) continue;
    for (const f of getFields(t.ctor)) if (f.type === 'gameobject' && typeof c.fields?.[f.name] === 'number') c.fields[f.name] = map.get(c.fields[f.name] as number) ?? c.fields[f.name];
  }
}

/**
 * The prefab's canonical tree moved into the instance's id space: pids → scene ids (`ids`, fresh ids from `alloc` for objects the
 * instance doesn't know yet), internal references remapped, `pid` kept on every node.
 */
function prefabInSceneSpace(data: PrefabJson, ids: Record<string, number>, alloc: () => number, removed: Set<number>): GameObjectJson {
  const tree = clone(canonicalPrefab(data));
  const map = new Map<number, number>();
  const walk = (n: GameObjectJson) => {
    n.pid = n.id;
    n.id = ids[n.id] ?? alloc();
    map.set(n.pid, n.id);
    n.children = n.children.filter((c) => !removed.has(c.id));
    n.children.forEach(walk);
  };
  walk(tree);
  const remap = (n: GameObjectJson) => {
    remapRefs(n.components, map);
    n.children.forEach(remap);
  };
  remap(tree);
  return tree;
}

/** Full JSON (with `pid`s) of a compact instance; null if its prefab is not loaded. */
export function expandInstance(j: GameObjectJson, alloc: () => number): GameObjectJson | null {
  const pf = j.prefab ? Assets.getPrefab(j.prefab) : null;
  if (!pf?.data || !j.overrides) return null;
  const o = j.overrides;
  const tree = prefabInSceneSpace(pf.data, o.ids ?? {}, alloc, new Set(o.removed ?? []));
  const byPid = new Map<number, GameObjectJson>();
  const index = (n: GameObjectJson) => (byPid.set(n.pid!, n), n.children.forEach(index));
  index(tree);
  for (const [pidS, m] of Object.entries(o.objects ?? {})) {
    const n = byPid.get(+pidS);
    if (!n) continue;
    if (m.name !== undefined) n.name = m.name;
    if (m.tag !== undefined) n.tag = m.tag;
    if (m.layer !== undefined) n.layer = m.layer;
    if (m.update !== undefined) n.update = m.update;
    if (m.draw !== undefined) n.draw = m.draw;
    if (m.transform) n.transform = clone(m.transform);
    if (m.comps) {
      const keys = compKeys(n.components);
      for (const [key, cm] of Object.entries(m.comps)) {
        const c = n.components[keys.indexOf(key)];
        if (!c) continue;
        if (cm.enabled !== undefined) {
          if (cm.enabled) delete c.enabled;
          else c.enabled = false;
        }
        Object.assign((c.fields ??= {}), clone(cm.fields ?? {}));
      }
    }
  }
  for (const [pidS, keys] of Object.entries(o.removedComps ?? {})) {
    const n = byPid.get(+pidS);
    if (!n) continue;
    const all = compKeys(n.components);
    n.components = n.components.filter((_, i) => !keys.includes(all[i]));
  }
  for (const [pidS, comps] of Object.entries(o.addedComps ?? {})) byPid.get(+pidS)?.components.push(...clone(comps));
  for (const [pidS, kids] of Object.entries(o.added ?? {})) byPid.get(+pidS)?.children.push(...clone(kids));
  // the root's own state
  tree.id = j.id;
  tree.name = j.name;
  if (j.layer) tree.layer = j.layer;
  else delete tree.layer;
  if (j.tag) tree.tag = j.tag;
  else delete tree.tag;
  if (j.update === false) tree.update = false;
  else delete tree.update;
  if (j.draw === false) tree.draw = false;
  else delete tree.draw;
  tree.transform = clone(j.transform);
  tree.prefab = j.prefab;
  return tree;
}

/** Whether `child` is part of `root`'s instance (not added to it, not another instance). */
const ownedBy = (child: GameObject) => child._prefabId !== null && !child.prefab;

/** Compact JSON of an instance root: what differs from the prefab. */
export function collapseInstance(go: GameObject, data: PrefabJson): GameObjectJson {
  const ids: Record<string, number> = {};
  const live = new Map<number, GameObject>();
  const gather = (g: GameObject) => {
    if (g._prefabId === null) return;
    ids[g._prefabId] = g.id;
    live.set(g._prefabId, g);
    for (const c of g.children) if (!c.destroyed && ownedBy(c)) gather(c);
  };
  gather(go);
  const expected = prefabInSceneSpace(data, ids, () => -1, new Set());
  const o: PrefabOverrides = { ids };
  const removed: number[] = [];
  const diff = (e: GameObjectJson, isRoot: boolean) => {
    const g = live.get(e.pid!);
    if (!g) {
      removed.push(e.pid!);
      return;
    }
    const pid = String(e.pid);
    const m: NonNullable<PrefabOverrides['objects']>[string] = {};
    if (!isRoot) {
      if (g.name !== e.name) m.name = g.name;
      if ((g.tag || undefined) !== e.tag) m.tag = g.tag;
      if (g.layer !== (e.layer ?? 0)) m.layer = g.layer;
      if (g.updateSelf !== (e.update !== false)) m.update = g.updateSelf;
      if (g.drawSelf !== (e.draw !== false)) m.draw = g.drawSelf;
      const t = transformJson(g);
      if (!same(t, e.transform)) m.transform = t;
    }
    // components
    const mine = g.components.map(serializeComponent);
    const myKeys = compKeys(mine);
    const theirKeys = compKeys(e.components);
    const comps: NonNullable<typeof m.comps> = {};
    myKeys.forEach((k, i) => {
      const ti = theirKeys.indexOf(k);
      if (ti < 0) ((o.addedComps ??= {})[pid] ??= []).push(mine[i]);
      else {
        const a = mine[i];
        const b = e.components[ti];
        const cm: { enabled?: boolean; fields?: Record<string, unknown> } = {};
        if ((a.enabled !== false) !== (b.enabled !== false)) cm.enabled = a.enabled !== false;
        for (const [name, v] of Object.entries(a.fields ?? {})) if (!same(v, b.fields?.[name])) (cm.fields ??= {})[name] = v;
        if (cm.enabled !== undefined || cm.fields) comps[k] = cm;
      }
    });
    const gone = theirKeys.filter((k) => !myKeys.includes(k));
    if (gone.length) (o.removedComps ??= {})[pid] = gone;
    if (Object.keys(comps).length) m.comps = comps;
    if (Object.keys(m).length) (o.objects ??= {})[pid] = m;
    // children added to this object
    const extra = g.children.filter((c) => !c.destroyed && !ownedBy(c)).map((c) => serializeGameObject(c));
    if (extra.length) (o.added ??= {})[pid] = extra;
    for (const c of e.children) diff(c, false);
  };
  diff(expected, true);
  if (removed.length) o.removed = removed;
  const j: GameObjectJson = { id: go.id, name: go.name, prefab: go.prefab!, transform: transformJson(go), components: [], children: [], overrides: o };
  if (go.tag) j.tag = go.tag;
  if (go.layer) j.layer = go.layer;
  if (!go.updateSelf) j.update = false;
  if (!go.drawSelf) j.draw = false;
  return j;
}

/**
 * Links a full-tree instance (old scenes, or a hierarchy just saved as a prefab) to its prefab: objects are matched to the prefab's
 * by position (root to root, children by index + name).
 */
export function linkInstance(go: GameObject, data: PrefabJson): void {
  const match = (g: GameObject, n: GameObjectJson) => {
    g._prefabId = n.id;
    const kids = g.children.filter((c) => !c.destroyed && !c.prefab);
    n.children.forEach((nc, i) => {
      const c = kids[i] && kids[i].name === nc.name ? kids[i] : kids.find((k) => k._prefabId === null && k.name === nc.name);
      if (c) match(c, nc);
    });
  };
  match(go, canonicalPrefab(data));
}

/** Makes `go` a plain object tree (Unpack Prefab). */
export function unpackInstance(go: GameObject): void {
  const walk = (g: GameObject) => {
    g._prefabId = null;
    for (const c of g.children) if (!c.prefab) walk(c);
  };
  go.prefab = null;
  go._prefabCompact = null;
  walk(go);
}

export function serializeComponent(c: Component): ComponentJson {
  if (c instanceof MissingComponent && c.data) {
    const j: ComponentJson = { ...c.data };
    if (c.enabled) delete j.enabled;
    else j.enabled = false;
    return j;
  }
  const j: ComponentJson = { type: Types.nameOf(c.constructor), fields: writeFields(c) };
  if (!c.enabled) j.enabled = false;
  return j;
}

export interface ReadContext {
  /** Saved id → created object (references inside what is being read). */
  ids: Map<number, GameObject>;
  pending: { id: number; set: (g: GameObject | null) => void }[];
  /** Keep saved ids (scenes) or give fresh ones (prefab instances, duplicates). */
  keepIds: boolean;
  /** With keepIds: keep a saved id only when this says it is free (linked scenes loaded next to other content). */
  isFree?: (id: number) => boolean;
  /** Fallback for references to objects outside what is read (duplicates within a scene). */
  scene?: Scene | null;
  /** Throw-away objects (canonical prefab data): ids are not reserved. */
  temp?: boolean;
}

export function newReadContext(keepIds: boolean, scene: Scene | null = null): ReadContext {
  return { ids: new Map(), pending: [], keepIds, scene };
}

let tempIds = -1;

export function deserializeComponent(go: GameObject, j: ComponentJson, ctx?: ReadContext): Component {
  const t = Types.get(j.type);
  let c: Component;
  if (!t || t.kind !== 'component') {
    const m = new MissingComponent();
    m.typeName = j.type;
    m.data = j;
    c = m;
  } else {
    c = new (t.ctor as new () => Component)();
    c.gameObject = go;
    readFields(c, j.fields, ctx ? (id, set) => ctx.pending.push({ id, set }) : undefined);
  }
  c.enabled = j.enabled !== false;
  go._attach(c);
  return c;
}

export function deserializeGameObject(j: GameObjectJson, ctx: ReadContext): GameObject {
  let compact: GameObjectJson | null = null;
  if (j.prefab && j.overrides) {
    // compact prefab instance: rebuilt from the prefab + its overrides (fresh ids for prefab objects the instance didn't have)
    const full = expandInstance(j, () => (ctx.keepIds ? _newId() : tempIds--));
    if (full) j = full;
    else compact = j;
  }
  const go = new GameObject(j.name, ctx.keepIds && (!ctx.isFree || ctx.isFree(j.id)) ? j.id : undefined);
  ctx.ids.set(j.id, go);
  go.tag = j.tag ?? '';
  go.layer = typeof j.layer === 'number' ? j.layer | 0 : 0;
  go.updateSelf = j.update !== false;
  go.drawSelf = j.draw !== false;
  go.prefab = j.prefab ?? null;
  go._prefabId = j.pid ?? null;
  if (compact) go._prefabCompact = compact;
  const t = j.transform;
  if (t) {
    go.transform.localPosition.set(t.p?.[0] ?? 0, t.p?.[1] ?? 0, t.p?.[2] ?? 0);
    go.transform.localRotation.set(t.r?.[0] ?? 0, t.r?.[1] ?? 0, t.r?.[2] ?? 0, t.r?.[3] ?? 1);
    go.transform.localScale.set(t.s?.[0] ?? 1, t.s?.[1] ?? 1, t.s?.[2] ?? 1);
  }
  for (const cj of j.components ?? []) deserializeComponent(go, cj, ctx);
  for (const cj of j.children ?? []) deserializeGameObject(cj, ctx).transform.setParent(go.transform);
  // full-tree instance (older files): link its objects to the prefab's so it saves compactly
  if (go.prefab && go._prefabId === null && !compact) {
    const pf = Assets.getPrefab(go.prefab);
    if (pf?.data) linkInstance(go, pf.data);
  }
  return go;
}

/** Resolves GameObject references once everything of a read exists. */
export function resolveReferences(ctx: ReadContext): void {
  for (const p of ctx.pending) p.set(ctx.ids.get(p.id) ?? ctx.scene?.findById(p.id) ?? null);
  ctx.pending.length = 0;
}

// ---- scenes -----------------------------------------------------------------------------------------------------------

export interface SceneSerializeOptions {
  /** Write the content of loaded linked folders inline (editor snapshots: undo, play); files keep it in the linked scene. */
  inlineLinked?: boolean;
}

function serializeContent(f: Folder, j: FolderJson, opts: SceneSerializeOptions): void {
  j.folders = f.folders.map((sub) => serializeFolder(sub, opts));
  j.gameObjects = f.gameObjects.filter((g) => !g.destroyed).map((g) => serializeGameObject(g));
}

function serializeFolder(f: Folder, opts: SceneSerializeOptions): FolderJson {
  const j: FolderJson = { name: f.name, folders: [], gameObjects: [] };
  if (!f.active) j.active = false;
  if (f.scenePath) {
    j.scene = f.scenePath;
    if (!f.autoLoad) j.autoLoad = false;
    if (opts.inlineLinked && f._linkedLoaded) {
      j.loaded = true;
      serializeContent(f, j, opts);
    }
    return j;
  }
  serializeContent(f, j, opts);
  return j;
}

export function serializeScene(s: Scene, opts: SceneSerializeOptions = {}): SceneJson {
  return { format: FORMAT, root: serializeFolder(s.root, opts) };
}

/** The content of a linked folder as its own scene file. */
export function serializeLinkedFolder(f: Folder): SceneJson {
  const root: FolderJson = { name: 'Root', folders: [], gameObjects: [] };
  serializeContent(f, root, {});
  return { format: FORMAT, root };
}

function readFolderContent(fj: FolderJson, into: Folder, ctx: ReadContext, add: (go: GameObject, f: Folder) => void): void {
  for (const sub of fj.folders ?? []) {
    const f = into.addFolder(sub.name);
    f.active = sub.active !== false;
    if (sub.scene) {
      f.scenePath = sub.scene;
      f.autoLoad = sub.autoLoad !== false;
      if (!sub.loaded) continue;
      f._linkedLoaded = true;
    }
    readFolderContent(sub, f, ctx, add);
  }
  for (const gj of fj.gameObjects ?? []) add(deserializeGameObject(gj, ctx), into);
}

export function deserializeScene(j: SceneJson, name = 'Scene'): Scene {
  const s = new Scene(name);
  const ctx = newReadContext(true, s);
  const root = j.root ?? { name: 'Root', folders: [], gameObjects: [] };
  s.root.active = root.active !== false;
  readFolderContent(root, s.root, ctx, (go, f) => f.add(go));
  let maxId = 0;
  for (const id of ctx.ids.keys()) maxId = Math.max(maxId, id);
  _reserveIds(maxId);
  resolveReferences(ctx);
  return s;
}

/**
 * Fills a linked folder with a scene file's content (its root folder's folders / objects). Saved ids are kept unless another
 * object of the scene already has them; objects join the lifecycle like instantiated ones when the scene is playing.
 */
export function fillLinkedFolder(f: Folder, j: SceneJson): void {
  const s = f.scene;
  const ctx = newReadContext(true, s);
  ctx.isFree = (id) => !ctx.ids.has(id) && !s?.findById(id);
  const added: { go: GameObject; f: Folder }[] = [];
  readFolderContent(j.root ?? { name: 'Root', folders: [], gameObjects: [] }, f, ctx, (go, into) => added.push({ go, f: into }));
  resolveReferences(ctx);
  f._linkedLoaded = true;
  for (const a of added) (s ? s.add(a.go, a.f) : a.f.add(a.go));
}

// ---- UserData ---------------------------------------------------------------------------------------------------------

export function serializeUserData(u: UserData): UserDataJson {
  return { format: FORMAT, type: Types.nameOf(u.constructor), fields: writeFields(u) };
}

export function deserializeUserData(j: UserDataJson, path: string | null): UserData | null {
  const t = Types.get(j.type);
  if (!t || t.kind !== 'userdata') return null;
  const u = new (t.ctor as new () => UserData)();
  u.path = path;
  readFields(u, j.fields);
  return u;
}

/** Copies a subtree (fresh ids, references inside the copy remapped, references outside kept). */
export function cloneGameObject(go: GameObject, scene: Scene | null = go.scene): GameObject {
  const ctx = newReadContext(false, scene);
  const copy = deserializeGameObject(serializeGameObject(go), ctx);
  resolveReferences(ctx);
  return copy;
}
