import { Assets } from './assets';
import type { GameObject } from './GameObject';
import { _setPrefabHost, Prefab } from './Prefab';
import { _setFolderLoader, type Folder, type Scene } from './Scene';
import { deserializeGameObject, deserializeScene, deserializeUserData, fillLinkedFolder, instanceJson, newReadContext, resolveReferences, type SceneJson } from './serialization';

// wiring that would otherwise be import cycles
Assets._setUserDataReader(deserializeUserData);
_setFolderLoader(async (f) => {
  const j = await Assets.loadJson<SceneJson>(f.scenePath!);
  await Assets.preloadReferences(j);
  if (f._linkedLoaded) return;
  fillLinkedFolder(f, j);
  // linked folders inside (Auto Load), never a scene inside itself
  const inside = [...f.allFolders()].filter((x) => x !== f && x.scenePath && x.autoLoad && !x._linkedLoaded);
  const ancestors = (x: Folder) => { const out: string[] = []; for (let p: Folder | null = x.parent; p; p = p.parent) if (p.scenePath) out.push(p.scenePath); return out; };
  await Promise.all(inside.filter((x) => !ancestors(x).includes(x.scenePath!)).map((x) => x.loadScene()));
});
_setPrefabHost({
  instantiate(p: Prefab, scene: Scene, where: Folder | GameObject | null): GameObject {
    if (!p.data) throw new Error(`Prefab ${p.path} is not loaded (reference it from a field, or await Assets.loadPrefab)`);
    const ctx = newReadContext(false, scene);
    const go = deserializeGameObject(instanceJson(p.data), ctx);
    go.prefab = p.path;
    resolveReferences(ctx);
    scene.add(go, where);
    return go;
  },
});

/** Loads a scene file with everything it references (UserData, prefabs). */
export async function loadScene(path: string): Promise<Scene> {
  const j = await Assets.loadJson<SceneJson>(path);
  return sceneFromJson(j, path);
}

/**
 * Builds a scene from JSON after preloading its references, then loads its linked folders: those marked Auto Load, or all of
 * them with `loadAllLinked` (the editor).
 */
export async function sceneFromJson(j: SceneJson, path: string | null, opts: { loadAllLinked?: boolean } = {}): Promise<Scene> {
  await Assets.preloadReferences(j);
  const name = path ? path.slice(path.lastIndexOf('/') + 1).replace(/\.scn\.json$/, '') : 'Untitled';
  const s = deserializeScene(j, name);
  s.path = path;
  const linked = [...s.root.allFolders()].filter((f) => f.scenePath && !f._linkedLoaded && (opts.loadAllLinked || f.autoLoad));
  await Promise.all(
    linked.map((f) =>
      f.loadScene().catch((e) => {
        console.error(`Linked scene ${f.scenePath}: ${(e as Error).message}`);
      }),
    ),
  );
  return s;
}
