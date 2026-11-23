import test from 'node:test';
import assert from 'node:assert/strict';
import { Assets, Behavior, GameObject, Mesh, Scene, cloneGameObject, deserializeScene, field, serializeScene, Types, Color3, type PrefabJson, type SceneJson } from '@rs/core';

class Hover extends Behavior {
  height = 1;
  @field({ type: 'gameobject' }) target: GameObject | null = null;
}
Types.register(Hover, 'Hover', 'component');

const T = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
const PATH = 'Assets/Prefabs/Lamp.pfb.json';
function lamp(extra = false, height = 1): PrefabJson {
  const children = [
    { id: 2, name: 'Bulb', transform: { ...T, p: [0, 2, 0] }, components: [{ type: 'Mesh', fields: { shape: 'Sphere', color: [1, 1, 0] } }], children: [] },
    { id: 3, name: 'Base', transform: T, components: [{ type: 'Mesh', fields: { shape: 'Cylinder' } }], children: [] },
  ];
  if (extra) children.push({ id: 4, name: 'Shade', transform: { ...T, p: [0, 2.5, 0] }, components: [{ type: 'Mesh', fields: { shape: 'Cylinder' } }], children: [] });
  return { format: 1, gameObject: { id: 1, name: 'Lamp', transform: T, components: [{ type: 'Hover', fields: { height, target: 2 } }], children } };
}
function setPrefab(data: PrefabJson): void {
  const p = Assets.prefabRef(PATH);
  p.data = data;
}

test('prefab instance: compact save, overrides kept when the prefab changes, references stable', () => {
  setPrefab(lamp());
  const scene = new Scene('s');
  Assets.getPrefab(PATH)!.instantiate(null, null, scene);
  const inst = scene.root.gameObjects[0];
  assert.equal(inst.prefab, PATH);
  assert.deepEqual(inst.children.map((c) => c._prefabId), [2, 3]);
  const bulb = inst.children[0];
  assert.equal(inst.getComponent(Hover)!.target, bulb, 'internal reference resolved to the copy');

  // untouched instance: only the id map
  let j = serializeScene(scene);
  let g = j.root.gameObjects[0];
  assert.deepEqual(g.components, []);
  assert.deepEqual(g.children, []);
  assert.equal(g.overrides!.objects, undefined);

  // overrides: a field, a component added, a child added, a child removed, a renamed child
  bulb.getComponent(Mesh)!.color = new Color3(1, 0, 0);
  bulb.name = 'RedBulb';
  inst.children[1].addComponent(Hover).height = 9;
  const extra = new GameObject('Sticker');
  extra.transform.setParent(bulb.transform);
  const other = new GameObject('Watcher');
  scene.add(other);
  other.addComponent(Hover).target = bulb; // reference from outside into the instance
  inst.children[1].destroy(); // edit mode: removed at once
  j = serializeScene(scene);
  g = j.root.gameObjects.find((x) => x.prefab)!;
  const o = g.overrides!;
  assert.deepEqual(o.objects!['2'].comps!['Mesh#0'].fields, { color: [1, 0, 0] });
  assert.equal(o.objects!['2'].name, 'RedBulb');
  assert.equal(o.added!['2'][0].name, 'Sticker');
  assert.deepEqual(o.removed, [3]);

  // the prefab changes: new height, a new child; reload the scene
  setPrefab(lamp(true, 5));
  const s2 = deserializeScene(JSON.parse(JSON.stringify(j)) as SceneJson, 's2');
  const i2 = s2.root.gameObjects.find((x) => x.prefab)!;
  assert.equal(i2.getComponent(Hover)!.height, 5, 'prefab change reaches the instance');
  assert.deepEqual(i2.children.map((c) => c.name), ['RedBulb', 'Shade'], 'override kept, removed stays removed, new prefab child added');
  const b2 = i2.children[0];
  assert.equal(b2.id, bulb.id, 'ids of prefab objects are stable');
  assert.deepEqual([b2.getComponent(Mesh)!.color.r, b2.getComponent(Mesh)!.color.g], [1, 0]);
  assert.equal(b2.children[0].name, 'Sticker');
  assert.equal(s2.root.gameObjects.find((x) => x.name === 'Watcher')!.getComponent(Hover)!.target, b2, 'outside reference still resolves');
  assert.equal(i2.getComponent(Hover)!.target, b2);
  const shade = i2.children[1];
  assert.equal(shade._prefabId, 4);
  assert.ok(shade.id > 0 && shade.id !== b2.id);
  // saving again: the shade is now known (ids), no spurious overrides for it
  const j2 = serializeScene(s2).root.gameObjects.find((x) => x.prefab)!;
  assert.equal(j2.overrides!.ids['4'], shade.id);
  assert.equal(j2.overrides!.objects?.['4'], undefined);
});

test('prefab instance: duplicate keeps the link + overrides; legacy full trees link by structure; missing prefab kept', () => {
  setPrefab(lamp());
  const scene = new Scene('d');
  const inst = Assets.getPrefab(PATH)!.instantiate(null, null, scene);
  inst.children[0].name = 'B2';
  const copy = cloneGameObject(inst, scene);
  assert.equal(copy.prefab, PATH);
  assert.equal(copy.children[0].name, 'B2');
  assert.equal(copy.children[0]._prefabId, 2);
  assert.notEqual(copy.children[0].id, inst.children[0].id);
  assert.equal(copy.getComponent(Hover)!.target, copy.children[0], 'reference inside the copy points into the copy');

  // legacy: a full tree with a prefab mark (files written before compact instances)
  const legacy: SceneJson = {
    format: 1,
    root: { name: 'Root', folders: [], gameObjects: [{ id: 50, name: 'Lamp', prefab: PATH, transform: T, components: [{ type: 'Hover', fields: { height: 1, target: 51 } }], children: [{ id: 51, name: 'Bulb', transform: { ...T, p: [0, 2, 0] }, components: [{ type: 'Mesh', fields: { shape: 'Sphere', color: [0, 0, 1] } }], children: [] }, { id: 52, name: 'Base', transform: T, components: [{ type: 'Mesh', fields: { shape: 'Cylinder' } }], children: [] }] }] },
  };
  const s = deserializeScene(legacy, 'legacy');
  const l = s.root.gameObjects[0];
  assert.deepEqual([l._prefabId, ...l.children.map((c) => c._prefabId)], [1, 2, 3]);
  const lj = serializeScene(s).root.gameObjects[0];
  assert.deepEqual(lj.overrides!.ids, { 1: 50, 2: 51, 3: 52 });
  assert.deepEqual(lj.overrides!.objects!['2'].comps!['Mesh#0'].fields, { color: [0, 0, 1] });

  // missing prefab: the compact data is saved back as it was
  const missing: SceneJson = { format: 1, root: { name: 'Root', folders: [], gameObjects: [{ id: 70, name: 'Ghost', prefab: 'Assets/Nope.pfb.json', transform: T, components: [], children: [], overrides: { ids: { 1: 70 }, objects: { 1: { name: 'x' } } } }] } };
  const sm = deserializeScene(missing, 'm');
  assert.equal(sm.root.gameObjects[0].name, 'Ghost');
  assert.deepEqual(serializeScene(sm).root.gameObjects[0].overrides, missing.root.gameObjects[0].overrides);
});

test('nested prefabs: outer prefab contains a compact instance; inner changes reach scene instances; overrides at every level', async () => {
  const { serializePrefabTree, canonicalPrefab } = await import('@rs/core');
  const BULB = 'Assets/Prefabs/Bulb.pfb.json';
  const LAMP2 = 'Assets/Prefabs/Lamp2.pfb.json';
  const bulb = (extra: boolean, height: number): PrefabJson => ({
    format: 1,
    gameObject: {
      id: 1,
      name: 'Bulb',
      transform: T,
      components: [{ type: 'Mesh', fields: { shape: 'Sphere', color: [1, 1, 1] } }, { type: 'Hover', fields: { height } }],
      children: extra ? [{ id: 2, name: 'Glow', transform: T, components: [], children: [] }] : [],
    },
  });
  Assets.prefabRef(BULB).data = bulb(false, 1);
  // Lamp2: a base with a Bulb instance (yellow in the lamp: an override stored in Lamp2's file)
  Assets.prefabRef(LAMP2).data = {
    format: 1,
    gameObject: {
      id: 1,
      name: 'Lamp2',
      transform: T,
      components: [],
      children: [{ id: 10, name: 'Bulb', prefab: BULB, transform: { ...T, p: [0, 2, 0] }, components: [], children: [], overrides: { ids: { 1: 10 }, objects: { 1: { comps: { 'Mesh#0': { fields: { color: [1, 1, 0] } } } } } } }],
    },
  };
  const canon = canonicalPrefab(Assets.getPrefab(LAMP2)!.data!);
  assert.equal(canon.children[0].npf, BULB);
  assert.equal(canon.children[0].npid, 1);

  const scene = new Scene('n');
  const inst = Assets.getPrefab(LAMP2)!.instantiate(null, null, scene);
  const b = inst.children[0];
  assert.equal(b._nestedPrefab, BULB);
  assert.equal(b.prefab, null, 'the nested root is part of the outer instance');
  assert.deepEqual([...b.getComponent(Mesh)!.color.asArray()], [1, 1, 0], 'outer prefab override applied');
  // a scene override on the nested object
  b.getComponent(Hover)!.height = 7;
  const j1 = serializeScene(scene);
  assert.deepEqual(j1.root.gameObjects[0].overrides!.objects!['10'].comps!['Hover#0'].fields, { height: 7 });

  // the inner prefab changes: new child + another default; the scene reloads
  Assets.prefabRef(BULB).data = bulb(true, 3);
  const s2 = deserializeScene(JSON.parse(JSON.stringify(j1)), 'n2');
  const b2 = s2.root.gameObjects[0].children[0];
  assert.deepEqual(b2.children.map((c) => c.name), ['Glow'], 'inner prefab child reaches the outer instance');
  assert.equal(b2.getComponent(Hover)!.height, 7, 'scene override kept');
  assert.deepEqual([...b2.getComponent(Mesh)!.color.asArray()], [1, 1, 0], 'outer prefab override kept');
  assert.equal(b2.children[0]._nestedPid, 2);
  assert.ok(b2.children[0]._prefabId! >= 1_000_000_000, 'objects new in the inner prefab get stable ids in the outer one');
  assert.equal(canonicalPrefab(Assets.getPrefab(LAMP2)!.data!).children[0].children[0].id, b2.children[0]._prefabId, 'deterministic');

  // what Apply writes for the outer prefab: the nested part stays a compact Bulb instance with its overrides
  const tree = serializePrefabTree(s2.root.gameObjects[0]);
  const nested = tree.children[0];
  assert.equal(nested.prefab, BULB);
  assert.deepEqual(nested.overrides!.objects!['1'].comps!['Mesh#0'].fields, { color: [1, 1, 0] });
  assert.deepEqual(nested.overrides!.objects!['1'].comps!['Hover#0'].fields, { height: 7 });
  assert.deepEqual(nested.children, []);
});
