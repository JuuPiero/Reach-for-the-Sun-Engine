import { Color3, Vector3 } from './math';

/**
 * Reflection: serialized / inspected fields of components and UserData, and the type registry (component / UserData classes by
 * name). Fields are found two ways: `@field(...)` (metadata: type, range, enum options, asset kind...) and public own properties of a
 * default instance holding plain values (number, string, boolean, Vector3, Color3) — `_name` members are private, never serialized.
 */

export type FieldType = 'number' | 'int' | 'string' | 'boolean' | 'vec3' | 'color' | 'enum' | 'asset' | 'prefab' | 'userdata' | 'gameobject';

export interface FieldOptions {
  type?: FieldType;
  /** Label in the Inspector (default: the member name, spaced). */
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  /** `enum`: the choices (stored as the string). */
  options?: readonly string[];
  /** `asset`: accepted file extension(s) without the dot (`glb`, `png`...). */
  assetKind?: string | readonly string[];
  /** `userdata`: the UserData class name accepted. */
  userDataType?: string;
  /** Section title drawn before the field. */
  header?: string;
  tooltip?: string;
  /** Serialized but not drawn. */
  hidden?: boolean;
  /** `string`: suggested values computed from the object (drawn as a drop-down, e.g. the clips of a model). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  choices?: (target: any) => readonly string[];
  /** Drawn only when this returns true (e.g. options of the selected mode). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visibleIf?: (target: any) => boolean;
}

export interface FieldInfo extends FieldOptions {
  name: string;
  type: FieldType;
}

const declared = new WeakMap<object, FieldInfo[]>();

/** Marks a member as a serialized / inspected field (RE's script fields). */
export function field(options: FieldOptions = {}) {
  return (proto: object, name: string) => {
    let list = declared.get(proto);
    if (!list) declared.set(proto, (list = []));
    const i = list.findIndex((f) => f.name === name);
    const info = { ...options, name, type: options.type ?? 'number' } as FieldInfo & { _inferType?: boolean };
    if (!options.type) info._inferType = true;
    if (i >= 0) list[i] = info;
    else list.push(info);
  };
}

function inferType(v: unknown): FieldType | null {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'boolean';
  if (v instanceof Vector3) return 'vec3';
  if (v instanceof Color3) return 'color';
  return null;
}

const fieldCache = new WeakMap<Function, FieldInfo[]>();
/** Members never serialized as fields (engine-managed). */
const RESERVED = new Set(['gameObject', 'enabled', 'path', 'constructor']);

/** Every field of a class (base classes first), cached. */
export function getFields(ctor: Function): FieldInfo[] {
  const cached = fieldCache.get(ctor);
  if (cached) return cached;
  const chain: object[] = [];
  for (let p = ctor.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) chain.unshift(p);
  let sample: Record<string, unknown> | null = null;
  try {
    sample = new (ctor as new () => Record<string, unknown>)();
  } catch {
    sample = null;
  }
  const out: FieldInfo[] = [];
  const seen = new Set<string>();
  for (const p of chain) {
    for (const f of declared.get(p) ?? []) {
      const g = { ...f } as FieldInfo & { _inferType?: boolean };
      if (g._inferType) g.type = (sample && inferType(sample[f.name])) ?? (f.options ? 'enum' : 'number');
      if (f.options && !g.type) g.type = 'enum';
      delete g._inferType;
      const i = out.findIndex((x) => x.name === f.name);
      if (i >= 0) out[i] = g;
      else out.push(g);
      seen.add(f.name);
    }
  }
  // declaration order: class fields are defined in source order on the instance (decorated ones without an initializer last)
  let ordered = out;
  if (sample) {
    ordered = [];
    for (const name of Object.keys(sample)) {
      const decl = out.find((f) => f.name === name);
      if (decl) ordered.push(decl);
      else if (!seen.has(name) && !name.startsWith('_') && !RESERVED.has(name)) {
        const t = inferType(sample[name]);
        if (t) ordered.push({ name, type: t });
      }
    }
    for (const f of out) if (!ordered.includes(f)) ordered.push(f);
  }
  fieldCache.set(ctor, ordered);
  return ordered;
}

// ---- type registry ----------------------------------------------------------------------------------------------------

export interface TypeOptions {
  /** Add Component menu path (`Render/Mesh`); default `Scripts/<Name>` for scripts. */
  menu?: string;
  /** Hidden from the Add Component menu. */
  hidden?: boolean;
  /** Only one per GameObject. */
  single?: boolean;
  /** UserData types: file extension of their assets (default `.user.json`; Material = `.mat.json`). */
  fileExt?: string;
}

/** File extension of a UserData type's assets. */
export function userDataExt(typeName: string | undefined): string {
  return (typeName && Types.get(typeName)?.options.fileExt) || '.user.json';
}
/** Whether a project path is a UserData asset (`.user.json` or a type's own extension such as `.mat.json`). */
export function isUserDataPath(path: string): boolean {
  if (path.endsWith('.user.json')) return true;
  for (const t of Types.all('userdata')) if (t.options.fileExt && path.endsWith(t.options.fileExt)) return true;
  return false;
}

export interface TypeInfo {
  name: string;
  ctor: Function;
  kind: 'component' | 'userdata';
  options: TypeOptions;
  /** Project script that defines it (`Assets/Scripts/Rotator.ts`), null for engine types. */
  script: string | null;
}

const byName = new Map<string, TypeInfo>();
const byCtor = new Map<Function, TypeInfo>();
let typesVersion = 0;

export const Types = {
  register(ctor: Function, name: string, kind: TypeInfo['kind'], options: TypeOptions = {}, script: string | null = null): TypeInfo {
    const info: TypeInfo = { name, ctor, kind, options, script };
    const old = byName.get(name);
    if (old) byCtor.delete(old.ctor);
    byName.set(name, info);
    byCtor.set(ctor, info);
    typesVersion++;
    return info;
  },
  get(name: string): TypeInfo | undefined {
    return byName.get(name);
  },
  of(ctor: Function): TypeInfo | undefined {
    for (let c: Function | null = ctor; c && c !== Object; c = Object.getPrototypeOf(c)) {
      const t = byCtor.get(c);
      if (t) return t;
    }
    return undefined;
  },
  /** Exact registration of a class (not its base). */
  exact(ctor: Function): TypeInfo | undefined {
    return byCtor.get(ctor);
  },
  nameOf(ctor: Function): string {
    return byCtor.get(ctor)?.name ?? ctor.name;
  },
  all(kind?: TypeInfo['kind']): TypeInfo[] {
    return [...byName.values()].filter((t) => !kind || t.kind === kind);
  },
  get version(): number {
    return typesVersion;
  },
};

const pendingOptions = new WeakMap<Function, TypeOptions>();
/** Component / UserData class options (menu path...). Scripts register by their export name. */
export function component(options: TypeOptions = {}) {
  return (ctor: Function) => {
    pendingOptions.set(ctor, options);
  };
}
export function typeOptionsOf(ctor: Function): TypeOptions {
  return pendingOptions.get(ctor) ?? {};
}

/** "moveSpeed" → "Move Speed". */
export function niceName(name: string): string {
  const s = name.replace(/^_+/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
