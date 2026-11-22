import { Behavior, Component } from './GameObject';
import { Types, typeOptionsOf } from './reflection';
import { UserData } from './UserData';

/**
 * Project scripts: every exported Component (Behavior) / UserData subclass of a script module registers under its EXPORT name
 * (bundlers may rename classes, never exports). Re-registering (live reload) replaces the previous class of that name; types of a
 * script that disappeared are unregistered by `syncScripts`.
 */
const byScript = new Map<string, string[]>();
let version = 0;

export function registerScriptModule(path: string, mod: Record<string, unknown>): string[] {
  const names: string[] = [];
  for (const [name, v] of Object.entries(mod)) {
    if (typeof v !== 'function') continue;
    const proto = (v as Function).prototype;
    if (proto instanceof Component && v !== Behavior) {
      Types.register(v, name, 'component', { menu: `Scripts/${name}`, ...typeOptionsOf(v) }, path);
      names.push(name);
    } else if (proto instanceof UserData) {
      Types.register(v, name, 'userdata', typeOptionsOf(v), path);
      names.push(name);
    }
  }
  byScript.set(path, names);
  version++;
  return names;
}

/** Registers a set of script modules (path → module); forgets scripts no longer present. */
export function syncScripts(mods: Record<string, Record<string, unknown>>): void {
  for (const path of [...byScript.keys()]) if (!(path in mods)) byScript.delete(path);
  for (const [path, mod] of Object.entries(mods)) registerScriptModule(path, mod);
}

export function scriptTypes(path: string): readonly string[] {
  return byScript.get(path) ?? [];
}
export function scriptsVersion(): number {
  return version;
}
