import test from 'node:test';
import assert from 'node:assert/strict';
import { Application, Behavior, CharacterController, Collider, Physics, RigidBody, Scene, Vector3, type Collision, type GameObject } from '@rs/core';
import { initPhysics } from '@rs/physics';

const events: string[] = [];
class Probe extends Behavior {
  onCollisionEnter(c: Collision) {
    events.push(`hit ${this.gameObject.name}<-${c.gameObject.name}`);
  }
  onTriggerEnter(o: GameObject) {
    events.push(`enter ${this.gameObject.name}<-${o.name}`);
  }
  onTriggerExit(o: GameObject) {
    events.push(`exit ${this.gameObject.name}<-${o.name}`);
  }
}

function ground(s: Scene) {
  const g = s.createGameObject('Ground');
  g.transform.localScale.set(20, 1, 20);
  g.transform.localPosition.set(0, -0.5, 0);
  g.addComponent(Collider);
  return g;
}

function run(s: Scene, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) s.step(1 / 60);
}

test('dynamic box falls and rests on a static collider; collision callbacks', async () => {
  await initPhysics();
  events.length = 0;
  const s = new Scene();
  ground(s);
  const box = s.createGameObject('Box');
  box.transform.localPosition.set(0, 5, 0);
  box.addComponent(Collider);
  box.addComponent(RigidBody);
  box.addComponent(Probe);
  Application._reset();
  s.begin();
  run(s, 3);
  const y = box.transform.position.y;
  assert.ok(Math.abs(y - 0.5) < 0.05, `rests on the ground at ${y}`);
  assert.ok(events.includes('hit Box<-Ground'), events.join());
  s.end();
});

test('kinematic / static follow the Transform, frozen rotation, impulses, gravity off', async () => {
  await initPhysics();
  const s = new Scene();
  const a = s.createGameObject('A');
  a.addComponent(Collider).shape = 'Sphere';
  const rb = a.addComponent(RigidBody);
  rb.useGravity = false;
  Application._reset();
  s.begin();
  s.step(1 / 60);
  rb.addImpulse(new Vector3(2, 0, 0));
  run(s, 1);
  assert.ok(Math.abs(a.transform.position.x - 2) < 0.1, `moved by the impulse: ${a.transform.position.x}`);
  assert.ok(Math.abs(rb.velocity.x - 2) < 0.05);
  assert.ok(Math.abs(a.transform.position.y) < 1e-3, 'no gravity');
  s.end();
});

test('triggers report enter / exit; raycast and overlap hit colliders (not triggers by default)', async () => {
  await initPhysics();
  events.length = 0;
  const s = new Scene();
  ground(s);
  const zone = s.createGameObject('Zone');
  zone.transform.localPosition.set(0, 1, 0);
  const zc = zone.addComponent(Collider);
  zc.isTrigger = true;
  zc.size.set(2, 2, 2);
  zone.addComponent(Probe);
  const ball = s.createGameObject('Ball');
  ball.transform.localPosition.set(0, 6, 0);
  ball.addComponent(Collider).shape = 'Sphere';
  ball.addComponent(RigidBody);
  Application._reset();
  s.begin();
  run(s, 3);
  assert.ok(events.includes('enter Zone<-Ball'), events.join());
  const hit = Physics.raycast(new Vector3(5, 5, 5), new Vector3(0, -1, 0), 20);
  assert.equal(hit?.gameObject.name, 'Ground');
  assert.ok(Math.abs(hit!.point.y) < 1e-3 && hit!.normal.y > 0.99);
  const down = Physics.raycast(new Vector3(0, 10, 0), new Vector3(0, -1, 0), 20);
  assert.equal(down?.gameObject.name, 'Ball', 'triggers are skipped');
  assert.equal(Physics.raycast(new Vector3(0, 10, 0), new Vector3(0, -1, 0), 20, { triggers: true, ignore: down!.gameObject })?.gameObject.name, 'Zone');
  assert.deepEqual(Physics.overlapSphere(new Vector3(0, 0.5, 0), 0.6).map((g) => g.name).sort(), ['Ball', 'Ground']);
  s.end();
});

test('CharacterController walks, stops at walls, climbs steps, falls and lands', async () => {
  await initPhysics();
  const s = new Scene();
  ground(s);
  const wall = s.createGameObject('Wall');
  wall.transform.localPosition.set(0, 1, 3);
  wall.addComponent(Collider).size.set(4, 2, 0.5);
  const step = s.createGameObject('Step');
  step.transform.localPosition.set(-4, 0.1, 0);
  step.addComponent(Collider).size.set(3, 0.2, 10);
  const p = s.createGameObject('Player');
  const cc = p.addComponent(CharacterController);
  p.transform.localPosition.set(0, 1, 0);
  Application._reset();
  s.begin();
  s.step(1 / 60);
  let vy = 0;
  const go = (dir: Vector3, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      vy = cc.isGrounded ? -1 : vy - 9.81 / 60;
      cc.move(dir.scale(4 / 60).add(new Vector3(0, vy / 60, 0)));
      s.step(1 / 60);
    }
  };
  go(Vector3.Zero(), 1);
  assert.ok(cc.isGrounded, 'lands');
  assert.ok(Math.abs(p.transform.position.y) < 0.06, `feet on the ground: ${p.transform.position.y}`);
  go(new Vector3(0, 0, 1), 2);
  const z = p.transform.position.z;
  assert.ok(z < 3 - 0.25 - 0.4 + 0.05 && z > 1.5, `stopped by the wall at z=${z}`);
  go(new Vector3(-1, 0, 0), 1.2);
  assert.ok(p.transform.position.y > 0.15, `climbed the step: y=${p.transform.position.y}`);
  s.end();
});

test('CharacterController: moving before the first physics step does not fall through ground created in the same frame', async () => {
  await initPhysics();
  const s = new Scene();
  ground(s);
  const p = s.createGameObject('Player');
  const cc = p.addComponent(CharacterController);
  p.transform.localPosition.set(0, 0.05, 0);
  Application._reset();
  s.begin();
  cc.move(new Vector3(0, -0.3, 0)); // first frame: big downward step, no world.step yet
  assert.ok(p.transform.position.y > -0.01, `stays on the ground: ${p.transform.position.y}`);
  assert.ok(cc.isGrounded);
  s.end();
});

test('layers: the collision matrix lets objects pass through each other; queries filter by layer mask', async () => {
  await initPhysics();
  const s = new Scene();
  ground(s);
  Physics.layers[3] = 'Ghost';
  Physics.setLayerCollision(0, 3, false); // ghosts ignore the default layer (the ground)
  const ghost = s.createGameObject('Ghost');
  ghost.layer = 3;
  ghost.transform.localPosition.set(3, 2, 0);
  ghost.addComponent(Collider);
  ghost.addComponent(RigidBody);
  const solid = s.createGameObject('Solid');
  solid.transform.localPosition.set(-3, 2, 0);
  solid.addComponent(Collider);
  solid.addComponent(RigidBody);
  Application._reset();
  s.begin();
  run(s, 1.5);
  assert.ok(solid.transform.position.y > 0.3, 'default layer rests on the ground');
  assert.ok(ghost.transform.position.y < -2, `ghost falls through (${ghost.transform.position.y})`);
  // raycasts down at the solid box: default mask hits it, a Ghost-only mask doesn't
  const down = new Vector3(0, -1, 0);
  assert.equal(Physics.raycast(new Vector3(-3, 5, 0), down)?.gameObject, solid);
  assert.equal(Physics.raycast(new Vector3(-3, 5, 0), down, 100, { layerMask: Physics.layerMask('Ghost') }), null);
  // Ignore Raycast layer is skipped by default
  solid.layer = 1;
  run(s, 0.1);
  assert.equal(Physics.raycast(new Vector3(-3, 5, 0), down)?.gameObject.name, 'Ground');
  assert.equal(Physics.raycast(new Vector3(-3, 5, 0), down, 100, { layerMask: Physics.layerMask(1) })?.gameObject, solid);
  s.end();
  Physics.setLayerCollision(0, 3, true);
  Physics.layers[3] = '';
});
