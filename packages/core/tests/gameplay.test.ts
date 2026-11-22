import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '@rs/core';
import { Application, Behavior, Camera, Ease, GameObject, SaveData, Scene, SceneManager, Screen, Tween, UIButton, UIText, Vector3 } from '@rs/core';

const drain = () => new Promise((r) => setImmediate(r));

test('timers: wait() resolves after scaled time, invoke() runs once, end() drops pending timers', async () => {
  const scene = new Scene('t');
  const events: string[] = [];
  class W extends Behavior {
    async start(): Promise<void> {
      await this.wait(0.5);
      events.push(`waited ${this.scene!.time.toFixed(1)}`);
    }
  }
  const go = new GameObject('w');
  const w = go.addComponent(W);
  scene.add(go);
  scene.begin();
  w.invoke(() => events.push('invoked'), 0.25);
  for (let i = 0; i < 4; i++) {
    scene.step(0.1);
    await drain();
  }
  assert.deepEqual(events, ['invoked']);
  for (let i = 0; i < 3; i++) {
    scene.step(0.1);
    await drain();
  }
  assert.equal(events.length, 2);
  assert.match(events[1], /^waited 0\.[56]$/);
  w.invoke(() => events.push('never'), 1);
  scene.end();
  await drain();
  assert.equal(events.length, 2);
});

test('tween: eases numbers and vectors on any object, yoyo repeat, kill, timeScale 0 freezes it', () => {
  const scene = new Scene('tw');
  scene.begin();
  SceneManager._setActive(scene);
  const o = { v: 0, p: new Vector3(0, 0, 0) };
  let done = false;
  Tween.to(o, { v: 10, p: new Vector3(2, 4, 0) }, 1, { ease: Ease.linear, onComplete: () => (done = true) });
  scene.step(0.05); // first frame: dt clamped, tween starts
  for (let i = 0; i < 5; i++) scene.step(0.1);
  assert.ok(o.v > 4 && o.v < 6.5, `half way: ${o.v}`);
  assert.ok(Math.abs(o.p.y - o.v * 0.4) < 1e-6);
  for (let i = 0; i < 6; i++) scene.step(0.1);
  assert.equal(o.v, 10);
  assert.ok(done);

  const y = { v: 0 };
  const t = Tween.to(y, { v: 1 }, 0.2, { repeat: -1, yoyo: true });
  for (let i = 0; i < 3; i++) scene.step(0.1); // 0.2 up + 0.1 back
  assert.ok(y.v < 1 && y.v > 0.2, `yoyo back: ${y.v}`);
  Application.timeScale = 0;
  const frozen = y.v;
  scene.step(0.1);
  assert.equal(y.v, frozen);
  Application.timeScale = 1;
  t.kill();
  scene.step(0.1);
  assert.equal(y.v, frozen);
  scene.end();
});

test('UI button: onClick handlers and the persistent target.method call', () => {
  const scene = new Scene('ui');
  const calls: string[] = [];
  class Receiver extends Behavior {
    hello(): void {
      calls.push('hello');
    }
  }
  const r = new GameObject('r');
  r.addComponent(Receiver);
  const b = new GameObject('b');
  const btn = b.addComponent(UIButton);
  btn.target = r;
  btn.method = 'hello';
  scene.add(r);
  scene.add(b);
  scene.begin();
  const off = btn.onClick(() => calls.push('handler'));
  btn.click();
  off();
  btn.interactable = false;
  btn.click();
  btn.interactable = true;
  btn.click();
  assert.deepEqual(calls, ['handler', 'hello', 'hello']);
  assert.equal(b.addComponent(UIText).text, 'Text');
  scene.end();
});

test('SaveData: typed values under the project namespace', () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  SaveData.namespace = 'TestGame';
  SaveData.setNumber('best', 12);
  SaveData.setString('name', 'pia');
  SaveData.setObject('opts', { music: false });
  assert.equal(SaveData.getNumber('best', 0), 12);
  assert.equal(SaveData.getNumber('missing', 3), 3);
  assert.equal(SaveData.getString('name'), 'pia');
  assert.deepEqual(SaveData.getObject('opts', null), { music: false });
  assert.ok([...store.keys()].every((k) => k.includes('TestGame')));
  SaveData.namespace = 'Other';
  assert.equal(SaveData.has('best'), false);
  SaveData.namespace = 'TestGame';
  SaveData.clear();
  assert.equal(store.size, 0);
});

test('camera: worldToScreenPoint / screenPointToRay agree; Camera.main; SceneManager host', async () => {
  Screen._set(800, 600, 1);
  const scene = new Scene('cam');
  const go = new GameObject('cam');
  go.transform.localPosition.set(0, 2, -10);
  const cam = go.addComponent(Camera);
  scene.add(go);
  SceneManager._setActive(scene);
  assert.equal(Camera.main, cam);
  const p = new Vector3(1.5, 2.5, 3);
  const s = cam.worldToScreenPoint(p);
  assert.ok(s.visible);
  const ray = cam.screenPointToRay(s.x, s.y);
  const toP = p.subtract(ray.origin).normalize();
  assert.ok(Vector3.Dot(toP, ray.direction) > 0.99999, 'ray points at the projected point');
  assert.ok(Math.abs(cam.worldToScreenPoint(new Vector3(0, 2, 5)).x - 400) < 1e-6, 'straight ahead = screen centre');

  const other = new Scene('next');
  SceneManager._setHost({ load: async (path) => (other.path = path, SceneManager._setActive(other), other) });
  const seen: string[] = [];
  const off = SceneManager.onActiveChanged((sc) => seen.push(sc.name));
  const loaded = await SceneManager.load('Assets/Scenes/Next.scn.json');
  assert.equal(loaded, other);
  assert.equal(SceneManager.active, other);
  assert.deepEqual(seen, ['next']);
  off();
});

test('Material: built-in UserData type with its own extension; scenes preload .mat.json references', async () => {
  const { Material, Mesh, Assets, isUserDataPath, userDataExt, serializeUserData, sceneFromJson, Color3 } = core;
  assert.equal(userDataExt('Material'), '.mat.json');
  assert.equal(userDataExt('Whatever'), '.user.json');
  assert.ok(isUserDataPath('Assets/Materials/Gold.mat.json') && isUserDataPath('a.user.json') && !isUserDataPath('a.scn.json'));
  const m = new Material();
  m.color = new Color3(1, 0.5, 0);
  m.metallic = 1;
  const json = serializeUserData(m);
  assert.equal(json.type, 'Material');
  const files: Record<string, unknown> = {
    'Assets/M.mat.json': json,
    'Assets/S.scn.json': {
      format: 1,
      root: { name: 'Root', folders: [], gameObjects: [{ id: 1, name: 'Box', transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, components: [{ type: 'Mesh', fields: { material: 'Assets/M.mat.json' } }], children: [] }] },
    },
  };
  (globalThis as { fetch: unknown }).fetch = async (url: string) => {
    const p = decodeURIComponent(url);
    return p in files ? { ok: true, json: async () => structuredClone(files[p]) } : { ok: false, status: 404 };
  };
  Assets.invalidate();
  await Assets.preloadReferences(files['Assets/S.scn.json']);
  const scene = await sceneFromJson(files['Assets/S.scn.json'] as never, 'S');
  const mesh = scene.find('Box')!.getComponent(Mesh)!;
  assert.ok(mesh.material instanceof Material);
  assert.equal(mesh.material!.metallic, 1);
  assert.equal(mesh.material!.path, 'Assets/M.mat.json');
  assert.equal(mesh.material!.color.g, 0.5);
});

test('Debug lines: one frame by default, kept for their duration, cleared when play ends', () => {
  const { Debug } = core;
  const scene = new Scene('d');
  scene.begin();
  scene.step(0.016);
  Debug.drawLine(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
  Debug.drawRay(new Vector3(0, 0, 0), new Vector3(0, 2, 0), undefined, 0.5);
  assert.equal(Debug._lines.length, 2);
  scene.step(0.1);
  assert.equal(Debug._lines.length, 1, 'frame line dropped, timed line kept');
  for (let i = 0; i < 6; i++) scene.step(0.1);
  assert.equal(Debug._lines.length, 0);
  Debug.drawBox(new Vector3(0, 0, 0), new Vector3(1, 1, 1), undefined, 10);
  assert.equal(Debug._lines.length, 12);
  scene.end();
  assert.equal(Debug._lines.length, 0);
});

test('ParticleSystem: play on start, burst, non-looping stops after duration, stop / emit', () => {
  const { ParticleSystem } = core;
  const scene = new Scene('p');
  const go = new GameObject('fx');
  const ps = go.addComponent(ParticleSystem);
  ps.loop = false;
  ps.duration = 0.5;
  ps.burst = 10;
  scene.add(go);
  scene.begin();
  scene.step(0.016);
  assert.ok(ps._emitting);
  assert.equal(ps._pendingBurst, 10);
  ps._pendingBurst = 0; // the renderer takes it
  for (let i = 0; i < 6; i++) scene.step(0.1);
  assert.equal(ps._emitting, false, 'stopped after its duration');
  ps.loop = true;
  ps.play();
  for (let i = 0; i < 6; i++) scene.step(0.1);
  assert.ok(ps._emitting, 'looping keeps emitting');
  assert.equal(ps._pendingBurst, 20, 'burst at start + one per cycle');
  ps.emit(5);
  const v = ps._clearVersion;
  ps.stop(true);
  assert.equal(ps._emitting, false);
  assert.equal(ps._clearVersion, v + 1);
  assert.equal(ps._pendingBurst, 0);
  scene.end();
});
