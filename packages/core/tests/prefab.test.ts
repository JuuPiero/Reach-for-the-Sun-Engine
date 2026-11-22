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
