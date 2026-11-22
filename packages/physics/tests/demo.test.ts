import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Application, Assets, CharacterController, Prefab, sceneFromJson, syncScripts, type SceneJson } from '@rs/core';
import { initPhysics } from '@rs/physics';
import * as PlayerController from '../../../examples/Demo/Assets/Scripts/PlayerController';
import * as PlayerParam from '../../../examples/Demo/Assets/Scripts/PlayerParam';
import * as Rotator from '../../../examples/Demo/Assets/Scripts/Rotator';
import * as Spawner from '../../../examples/Demo/Assets/Scripts/Spawner';

// The Demo scene, simulated headless: the player must stand on the ground, crates must stay stacked.
test('Demo scene: the player stands on the ground and the crates rest', async () => {
  await initPhysics();
  syncScripts({ 'Assets/Scripts/PlayerController.ts': PlayerController, 'Assets/Scripts/PlayerParam.ts': PlayerParam, 'Assets/Scripts/Rotator.ts': Rotator, 'Assets/Scripts/Spawner.ts': Spawner });
  const root = path.resolve('examples/Demo');
  (globalThis as { fetch: unknown }).fetch = async (url: string) => {
    const p = path.join(root, decodeURIComponent(url.replace(/^\/demo\//, '')));
    const ok = fs.existsSync(p);
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
  };
  Assets.baseUrl = '/demo/';
  const j = JSON.parse(fs.readFileSync(path.join(root, 'Assets/Scenes/Main.scn.json'), 'utf8')) as SceneJson;
  const s = await sceneFromJson(j, 'Assets/Scenes/Main.scn.json');
  Prefab.activeScene = s;
  Application._reset();
  s.begin();
  const player = s.find('Player')!;
  // browser-like frames: a tiny first frame (no physics step before the first update), then slow ones (dt clamped to 0.1)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dts = [0.004, 0.1, 0.1, 0.004, 0.1, 0.05, ...Array(60).fill(0.1), ...Array(120).fill(1 / 60), ...Array.from({ length: 400 }, () => (rnd() < 0.3 ? rnd() * 0.02 : rnd() * 0.3))];
  let minY = Infinity;
  for (const dt of dts) {
    s.step(dt);
    minY = Math.min(minY, player.transform.position.y);
  }
  assert.ok(minY > -0.05, `never sinks: min y=${minY}`);
  const y = player.transform.position.y;
  assert.ok(y > -0.05 && y < 0.2, `player on the ground: y=${y}`);
  assert.ok(player.getComponent(CharacterController)!.isGrounded);
  for (const n of ['Crate_00', 'Crate_02']) assert.ok(s.find(n)!.transform.position.y > 0.3, `${n} rests`);
  s.end();
});
