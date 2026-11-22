import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Application,
  Assets,
  Behavior,
  cloneGameObject,
  Color3,
  deserializeScene,
  Folder,
  GameObject,
  getFields,
  Mesh,
  Motion,
  normalizeFsm,
  MissingComponent,
  Prefab,
  Scene,
  sceneFromJson,
  serializeScene,
  syncScripts,
  Types,
  UserData,
  Vector3,
  field,
  type SceneJson,
} from '@rs/core';

class Param extends UserData {
  @field({ min: 0 }) speed = 3;
  label = 'x';
}
const log: string[] = [];
class Spin extends Behavior {
  speed = new Vector3(0, 90, 0);
  @field({ type: 'gameobject' }) target: GameObject | null = null;
  @field({ type: 'userdata', userDataType: 'Param' }) param: Param | null = null;
  @field({ type: 'prefab' }) prefab: Prefab | null = null;
  @field({ type: 'enum', options: ['A', 'B'] }) mode = 'A';
  private _hidden = 1;
  awake() {
    log.push(`awake ${this.gameObject.name}`);
  }
  start() {
    log.push(`start ${this.gameObject.name}`);
  }
  update() {
    this.transform.rotate(0, this.speed.y * Application.deltaTime, 0);
  }
  onDestroy() {
    log.push(`destroy ${this.gameObject.name}`);
  }
}
syncScripts({ 'Assets/Scripts/Spin.ts': { Spin, Param } });

test('fields: decorated + plain values, declaration order, privates skipped', () => {
  const names = getFields(Spin).map((f) => `${f.name}:${f.type}`);
  assert.deepEqual(names, ['speed:vec3', 'target:gameobject', 'param:userdata', 'prefab:prefab', 'mode:enum']);
  assert.deepEqual(
    getFields(Mesh).slice(0, 4).map((f) => f.name),
    ['shape', 'model', 'material', 'color'],
  );
  assert.equal(Types.get('Spin')?.script, 'Assets/Scripts/Spin.ts');
  assert.equal(Types.get('Param')?.kind, 'userdata');
});

test('transform: parenting, world matrix, keep world on re-parent', () => {
  const s = new Scene();
  const a = s.createGameObject('A');
  const b = s.createGameObject('B', a);
  a.transform.localPosition.set(10, 0, 0);
  a.transform.markDirty();
  b.transform.localPosition.set(0, 1, 0);
  b.transform.markDirty();
  assert.deepEqual(b.transform.position.asArray(), [10, 1, 0]);
  b.transform.setParent(null, true);
  assert.deepEqual(b.transform.localPosition.asArray().map((v) => Math.round(v * 1e6) / 1e6), [10, 1, 0]);
  assert.equal(a.children.length, 0);
});

test('scene JSON round trip: folders, flags, components, references, unknown types kept', () => {
  const s = new Scene('T');
  const env = s.root.addFolder('Env');
  env.active = false;
  const cam = new GameObject('Cam', 5);
  env.add(cam);
  const g = new GameObject('Spinner', 7);
  g.tag = 'T1';
  g.drawSelf = false;
  const m = g.addComponent(Mesh);
  m.color = new Color3(1, 0, 0);
  const sp = g.addComponent(Spin);
  sp.target = cam;
  sp.mode = 'B';
  s.root.add(g);
  const child = s.createGameObject('Child', g);
  child.transform.localPosition.set(1, 2, 3);
  const j = serializeScene(s);
  (j.root.gameObjects[0].components as { type: string; fields: Record<string, unknown> }[]).push({ type: 'GoneScript', fields: { a: 1 } });
  const s2 = deserializeScene(JSON.parse(JSON.stringify(j)) as SceneJson);
  const g2 = s2.findById(7)!;
  assert.equal(g2.tag, 'T1');
  assert.equal(g2.drawSelf, false);
  assert.equal(s2.root.findFolder('Env')!.active, false);
  assert.equal(g2.getComponent(Mesh)!.color.r, 1);
  const sp2 = g2.getComponent(Spin)!;
  assert.equal(sp2.target, s2.findById(5));
  assert.equal(sp2.mode, 'B');
  assert.deepEqual(g2.find('Child')!.transform.localPosition.asArray(), [1, 2, 3]);
  const missing = g2.components.find((c) => c instanceof MissingComponent) as MissingComponent;
  assert.equal(missing.typeName, 'GoneScript');
  // saved back unchanged
  assert.deepEqual(serializeScene(s2).root.gameObjects[0].components[2], { type: 'GoneScript', fields: { a: 1 } });
  assert.ok(!s2.findById(5)!.activeInHierarchy, 'inactive folder');
});

test('clone: fresh ids, references inside the copy remapped, outside kept', () => {
  const s = new Scene();
  const outside = s.createGameObject('Outside');
  const root = s.createGameObject('Root');
  const inner = s.createGameObject('Inner', root);
  const sp = root.addComponent(Spin);
  sp.target = inner;
  const sp2 = inner.addComponent(Spin);
  sp2.target = outside;
  const c = cloneGameObject(root, s);
  assert.notEqual(c.id, root.id);
  assert.equal(c.getComponent(Spin)!.target, c.find('Inner'));
  assert.equal(c.find('Inner')!.getComponent(Spin)!.target, outside);
});

test('play lifecycle: awake / start / update / deferred destroy / end; inactive objects wait', () => {
  log.length = 0;
  const s = new Scene();
  const a = s.createGameObject('A');
  a.addComponent(Spin);
  const off = s.createGameObject('Off');
  off.updateSelf = false;
  off.addComponent(Spin);
  Application._reset();
  s.begin();
  assert.deepEqual(log, ['awake A', 'awake Off']);
  s.step(0.05);
  assert.ok(log.includes('start A') && !log.includes('start Off'));
  const y = a.transform.localEulerAngles.y;
  assert.ok(Math.abs(y - 4.5) < 1e-3, `rotated ${y}`);
  a.destroy();
  assert.ok(!a.destroyed, 'deferred to the end of the frame');
  s.step(0.05);
  assert.ok(a.destroyed && log.includes('destroy A'));
  // added during play: awake now, start next frame
  const late = s.createGameObject('Late');
  late.addComponent(Spin);
  assert.ok(log.includes('awake Late') && !log.includes('start Late'));
  s.step(0.05);
  assert.ok(log.includes('start Late'));
  s.end();
  assert.ok(log.includes('destroy Late'));
});

test('assets: scene preloads UserData and prefabs; prefabs instantiate with fresh ids', async () => {
  const files: Record<string, unknown> = {
    'Assets/P.user.json': { format: 1, type: 'Param', fields: { speed: 9, label: 'fast' } },
    'Assets/Coin.pfb.json': { format: 1, gameObject: { id: 1, name: 'Coin', transform: { p: [0, 1, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, components: [{ type: 'Mesh', fields: { shape: 'Torus' } }], children: [] } },
  };
  (globalThis as { fetch: unknown }).fetch = async (url: string) => {
    const p = decodeURIComponent(url.replace(/^\/x\//, ''));
    return { ok: p in files, status: p in files ? 200 : 404, json: async () => files[p] };
  };
  Assets.baseUrl = '/x/';
  const j: SceneJson = {
    format: 1,
    root: { name: 'Root', folders: [], gameObjects: [{ id: 3, name: 'S', transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, components: [{ type: 'Spin', fields: { param: 'Assets/P.user.json', prefab: 'Assets/Coin.pfb.json' } }], children: [] }] },
  };
  const s = await sceneFromJson(j, 'Assets/Main.scn.json');
  const sp = s.findById(3)!.getComponent(Spin)!;
  assert.equal(sp.param?.speed, 9);
  assert.equal(sp.param?.path, 'Assets/P.user.json');
  assert.ok(sp.prefab?.loaded);
  const f = s.root.addFolder(new Folder('Spawned'));
  const coin = sp.prefab!.instantiate(new Vector3(5, 0, 0), f, s);
  assert.equal(coin.folder, f);
  assert.equal(coin.prefab, 'Assets/Coin.pfb.json');
  assert.deepEqual(coin.transform.position.asArray(), [5, 0, 0]);
  assert.equal(coin.getComponent(Mesh)!.shape, 'Torus');
  assert.notEqual(coin.id, 1);
  // serialized as paths
  const back = serializeScene(s).root.gameObjects[0].components[0].fields;
  assert.equal(back.param, 'Assets/P.user.json');
  assert.equal(back.prefab, 'Assets/Coin.pfb.json');
});

test('Motion: FSM transitions (float / bool / trigger / exit time), cross-fade weights, edits picked up', () => {
  const fsm = normalizeFsm({
    initial: 'Idle',
    parameters: [
      { name: 'speed', type: 'float', value: 0 },
      { name: 'grounded', type: 'bool', value: true },
      { name: 'jump', type: 'trigger' },
    ],
    states: [
      { name: 'Idle', clip: 'Idle' },
      { name: 'Walk', clip: 'Walk' },
      { name: 'Jump', clip: 'Jump', loop: false },
    ],
    transitions: [
      { from: '*', to: 'Jump', conditions: [{ param: 'jump' }], duration: 0 },
      { from: 'Idle', to: 'Walk', conditions: [{ param: 'speed', op: '>', value: 0.1 }], duration: 0.5 },
      { from: 'Walk', to: 'Idle', conditions: [{ param: 'speed', op: '<=', value: 0.1 }], duration: 0.2 },
      { from: 'Jump', to: 'Idle', conditions: [{ param: 'grounded', op: '==', value: true }], exitTime: 1, duration: 0 },
    ],
  });
  Assets.setFsm('Assets/M.fsm.json', fsm);
  const go = new GameObject('Robot');
  const m = go.addComponent(Motion);
  m.fsm = 'Assets/M.fsm.json';
  m._setClips(new Map([['Idle', 2], ['Walk', 1], ['Jump', 0.8]]));
  m.restart();
  assert.equal(m.state, 'Idle');
  m.tick(0.1);
  m.setFloat('speed', 2);
  m.tick(0.1);
  assert.equal(m.state, 'Walk');
  assert.equal(m.layers.length, 2, 'fading from Idle');
  m.tick(0.25);
  assert.ok(Math.abs(m.layers[1].weight - 0.5) < 1e-6 && Math.abs(m.layers[0].weight - 0.5) < 1e-6, JSON.stringify(m.layers));
  m.tick(0.3);
  assert.equal(m.layers.length, 1);
  assert.equal(m.currentClip, 'Walk');
  m.tick(1.5);
  assert.ok(m.layers[0].time < 1, 'looping clip wraps');
  m.setTrigger('jump');
  m.tick(0.01);
  assert.equal(m.state, 'Jump');
  m.tick(0.5);
  assert.equal(m.state, 'Jump', 'exit time not reached');
  m.tick(0.5);
  assert.equal(m.state, 'Idle');
  assert.ok(Math.abs(m.layers[0].time - 0) < 1e-6);
  // a trigger not used this frame is gone next frame
  m.setTrigger('jump');
  m.setFloat('speed', 0);
  // editing the shared FSM: Motions pick it up
  Assets.setFsm('Assets/M.fsm.json', { ...fsm, transitions: [] });
  m.tick(0.1);
  assert.equal(m.state, 'Idle', 'state kept, edited FSM has no transitions');
  // without FSM: plays `clip`
  const m2 = new GameObject('B').addComponent(Motion);
  m2.clip = 'Walk';
  m2.restart();
  assert.equal(m2.currentClip, 'Walk');
  m2.play('Idle', 0.4);
  m2.tick(0.2);
  assert.deepEqual(m2.layers.map((l) => [l.clip, Math.round(l.weight * 100) / 100]), [['Walk', 0.5], ['Idle', 0.5]]);
});
