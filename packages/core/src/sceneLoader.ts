import { Assets } from './assets';
import type { GameObject } from './GameObject';
import { _setPrefabHost, Prefab } from './Prefab';
import type { Folder, Scene } from './Scene';
import { deserializeGameObject, deserializeScene, deserializeUserData, instanceJson, newReadContext, resolveReferences, type SceneJson } from './serialization';

// wiring that would otherwise be import cycles
Assets._setUserDataReader(deserializeUserData);
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

/** Builds a scene from JSON after preloading its references. */
export async function sceneFromJson(j: SceneJson, path: string | null): Promise<Scene> {
  await Assets.preloadReferences(j);
  const name = path ? path.slice(path.lastIndexOf('/') + 1).replace(/\.scn\.json$/, '') : 'Untitled';
  const s = deserializeScene(j, name);
  s.path = path;
  return s;
}
