import { Assets } from './assets';
import { Color3, Quaternion, Vector3 } from './math';
import { Component, GameObject, _reserveIds } from './GameObject';
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
  update?: boolean;
  draw?: boolean;
  prefab?: string;
  transform: { p: number[]; r: number[]; s: number[] };
  components: ComponentJson[];
  children: GameObjectJson[];
}
export interface FolderJson {
  name: string;
  active?: boolean;
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

export function serializeGameObject(go: GameObject): GameObjectJson {
  const t = go.transform;
  const j: GameObjectJson = {
    id: go.id,
    name: go.name,
    transform: {
      p: [r6(t.localPosition.x), r6(t.localPosition.y), r6(t.localPosition.z)],
      r: [r6(t.localRotation.x), r6(t.localRotation.y), r6(t.localRotation.z), r6(t.localRotation.w)],
      s: [r6(t.localScale.x), r6(t.localScale.y), r6(t.localScale.z)],
    },
    components: go.components.map(serializeComponent),
    children: go.children.filter((c) => !c.destroyed).map(serializeGameObject),
  };
  if (go.tag) j.tag = go.tag;
  if (!go.updateSelf) j.update = false;
  if (!go.drawSelf) j.draw = false;
  if (go.prefab) j.prefab = go.prefab;
  return j;
}

export function serializeComponent(c: Component): ComponentJson {
  if (c instanceof MissingComponent && c.data) return { ...c.data, enabled: c.enabled };
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
  /** Fallback for references to objects outside what is read (duplicates within a scene). */
  scene?: Scene | null;
}

export function newReadContext(keepIds: boolean, scene: Scene | null = null): ReadContext {
  return { ids: new Map(), pending: [], keepIds, scene };
}

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
  const go = new GameObject(j.name, ctx.keepIds ? j.id : undefined);
  ctx.ids.set(j.id, go);
  go.tag = j.tag ?? '';
  go.updateSelf = j.update !== false;
  go.drawSelf = j.draw !== false;
  go.prefab = j.prefab ?? null;
  const t = j.transform;
  if (t) {
    go.transform.localPosition.set(t.p?.[0] ?? 0, t.p?.[1] ?? 0, t.p?.[2] ?? 0);
    go.transform.localRotation.set(t.r?.[0] ?? 0, t.r?.[1] ?? 0, t.r?.[2] ?? 0, t.r?.[3] ?? 1);
    go.transform.localScale.set(t.s?.[0] ?? 1, t.s?.[1] ?? 1, t.s?.[2] ?? 1);
  }
  for (const cj of j.components ?? []) deserializeComponent(go, cj, ctx);
  for (const cj of j.children ?? []) deserializeGameObject(cj, ctx).transform.setParent(go.transform);
  return go;
}

/** Resolves GameObject references once everything of a read exists. */
export function resolveReferences(ctx: ReadContext): void {
  for (const p of ctx.pending) p.set(ctx.ids.get(p.id) ?? ctx.scene?.findById(p.id) ?? null);
  ctx.pending.length = 0;
}

// ---- scenes -----------------------------------------------------------------------------------------------------------

function serializeFolder(f: Folder): FolderJson {
  const j: FolderJson = { name: f.name, folders: f.folders.map(serializeFolder), gameObjects: f.gameObjects.filter((g) => !g.destroyed).map(serializeGameObject) };
  if (!f.active) j.active = false;
  return j;
}

export function serializeScene(s: Scene): SceneJson {
  return { format: FORMAT, root: serializeFolder(s.root) };
}

export function deserializeScene(j: SceneJson, name = 'Scene'): Scene {
  const s = new Scene(name);
  const ctx = newReadContext(true, s);
  let maxId = 0;
  const readFolder = (fj: FolderJson, into: Folder) => {
    into.active = fj.active !== false;
    for (const sub of fj.folders ?? []) readFolder(sub, into.addFolder(sub.name));
    for (const gj of fj.gameObjects ?? []) into.add(deserializeGameObject(gj, ctx));
  };
  readFolder(j.root ?? { name: 'Root', folders: [], gameObjects: [] }, s.root);
  for (const id of ctx.ids.keys()) maxId = Math.max(maxId, id);
  _reserveIds(maxId);
  resolveReferences(ctx);
  return s;
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
