import RAPIER from '@dimforge/rapier3d-compat';
import {
  CharacterController,
  Collider,
  Debug,
  Matrix,
  Physics,
  Quaternion,
  RigidBody,
  Vector3,
  type Collision,
  type GameObject,
  type PhysicsBodyApi,
  type PhysicsProvider,
  type QueryOptions,
  type RaycastHit,
  type Scene,
} from '@rs/core';


/** Rapier interaction groups of a layer: membership = its bit, filter = its row of the collision matrix. */
function groupsOf(layer: number): number {
  const l = layer & 15;
  return (((1 << l) << 16) | (Physics.collisionMatrix[l] & 0xffff)) >>> 0;
}
/**
 * Rapier implementation of the RS Engine physics provider. One Rapier world per playing scene, rebuilt incrementally every
 * fixed step from the components: bodies keyed by the GameObject that owns them (RigidBody / CharacterController, or a static
 * body for colliders without one), colliders keyed by component; a changed signature (type, shape, size, relative pose,
 * material) recreates them. Dynamic bodies write their pose back to the Transform after the step; kinematic / static bodies
 * follow their Transform. Contact / intersection events become component callbacks.
 */

type Kind = 'dynamic' | 'kinematic' | 'static' | 'character';
interface ColliderRec {
  comp: Collider | CharacterController;
  go: GameObject;
  collider: RAPIER.Collider;
  sig: string;
  owner: BodyRec;
}
interface BodyRec {
  go: GameObject;
  kind: Kind;
  body: RAPIER.RigidBody;
  sig: string;
  poseSig: string;
  colliders: Map<object, ColliderRec>;
  controller: RAPIER.KinematicCharacterController | null;
  seen: number;
}
interface WorldRec {
  world: RAPIER.World;
  events: RAPIER.EventQueue;
  bodies: Map<GameObject, BodyRec>;
  byHandle: Map<number, ColliderRec>;
  gen: number;
  /** The world was stepped at least once (colliders are in the query structures). */
  stepped: boolean;
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const v3 = (v: { x: number; y: number; z: number }) => new Vector3(v.x, v.y, v.z);

function decompose(m: Matrix): { p: Vector3; q: Quaternion; s: Vector3 } {
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  m.decompose(s, q, p);
  return { p, q, s };
}

export class RapierPhysics implements PhysicsProvider {
  readonly name = 'Rapier';
  private readonly worlds = new Map<Scene, WorldRec>();

  private worldOf(scene: Scene): WorldRec {
    let w = this.worlds.get(scene);
    if (!w) {
      const g = Physics.gravity;
      w = { world: new RAPIER.World({ x: g.x, y: g.y, z: g.z }), events: new RAPIER.EventQueue(true), bodies: new Map(), byHandle: new Map(), gen: 0, stepped: false };
      this.worlds.set(scene, w);
    }
    return w;
  }

  dispose(scene: Scene): void {
    const w = this.worlds.get(scene);
    if (!w) return;
    w.world.free();
    w.events.free();
    this.worlds.delete(scene);
  }

  // ---- sync ---------------------------------------------------------------------------------------------------------------

  /** Owner GameObject of a collider component: itself when it has a body component, else the nearest RigidBody parent, else itself (static). */
  private ownerOf(go: GameObject): GameObject {
    if (go.getComponent(RigidBody) || go.getComponent(CharacterController)) return go;
    for (let p = go.parent; p; p = p.parent) if (p.getComponent(RigidBody)?.enabled) return p;
    return go;
  }

  private sync(scene: Scene, w: WorldRec): void {
    const gen = ++w.gen;
    const wanted = new Map<GameObject, { colliders: (Collider | CharacterController)[] }>();
    for (const go of scene.allGameObjects()) {
      if (go.destroyed || !go.activeInHierarchy) continue;
      const cc = go.getComponent(CharacterController);
      if (cc?.enabled) {
        const e = wanted.get(go) ?? { colliders: [] };
        e.colliders.push(cc);
        wanted.set(go, e);
      }
      const rb = go.getComponent(RigidBody);
      if (rb?.enabled && !wanted.has(go)) wanted.set(go, { colliders: [] });
      for (const c of go.getComponents(Collider)) {
        if (!c.enabled) continue;
        const owner = this.ownerOf(go);
        const e = wanted.get(owner) ?? { colliders: [] };
        e.colliders.push(c);
        wanted.set(owner, e);
      }
    }
    for (const [go, want] of wanted) {
      const rb = go.getComponent(RigidBody);
      const cc = go.getComponent(CharacterController);
      const kind: Kind = cc?.enabled ? 'character' : rb?.enabled ? (rb.bodyType === 'Dynamic' ? 'dynamic' : rb.bodyType === 'Kinematic' ? 'kinematic' : 'static') : 'static';
      const sig = rb && kind !== 'character' ? `${kind}|${rb.mass}|${rb.linearDamping}|${rb.angularDamping}|${rb.useGravity}|${rb.ccd}|${rb.freezeRotationX}${rb.freezeRotationY}${rb.freezeRotationZ}` : kind;
      let rec = w.bodies.get(go);
      if (rec && rec.sig !== sig) {
        this.removeBody(w, rec);
        rec = undefined;
      }
      const { p, q } = decompose(go.transform.worldMatrix);
      if (!rec) {
        const desc = kind === 'dynamic' ? RAPIER.RigidBodyDesc.dynamic() : kind === 'static' ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.kinematicPositionBased();
        desc.setTranslation(p.x, p.y, p.z);
        if (kind !== 'character') desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
        if (rb && kind === 'dynamic') {
          desc.setLinearDamping(rb.linearDamping).setAngularDamping(rb.angularDamping).setGravityScale(rb.useGravity ? 1 : 0).setCcdEnabled(rb.ccd);
          desc.enabledRotations(!rb.freezeRotationX, !rb.freezeRotationY, !rb.freezeRotationZ);
        }
        const body = w.world.createRigidBody(desc);
        rec = { go, kind, body, sig, poseSig: '', colliders: new Map(), controller: null, seen: gen };
        w.bodies.set(go, rec);
      }
      rec.seen = gen;
      // kinematic / static / character bodies follow their Transform
      if (kind !== 'dynamic') {
        const poseSig = `${r4(p.x)},${r4(p.y)},${r4(p.z)},${r4(q.x)},${r4(q.y)},${r4(q.z)},${r4(q.w)}`;
        if (poseSig !== rec.poseSig) {
          rec.poseSig = poseSig;
          if (kind === 'kinematic') {
            rec.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
            rec.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
          } else {
            rec.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
            if (kind === 'static') rec.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
          }
        }
      }
      // colliders
      const keep = new Set<object>();
      const total = want.colliders.filter((c) => c instanceof Collider && !c.isTrigger).length || 1;
      for (const c of want.colliders) {
        keep.add(c);
        const shape = this.shapeOf(c, go, rec, kind === 'dynamic' && rb ? rb.mass / total : 0);
        const old = rec.colliders.get(c);
        if (old && old.sig === shape.sig) continue;
        if (old) this.removeCollider(w, old);
        const collider = w.world.createCollider(shape.desc, rec.body);
        const cr: ColliderRec = { comp: c, go: c.gameObject, collider, sig: shape.sig, owner: rec };
        rec.colliders.set(c, cr);
        w.byHandle.set(collider.handle, cr);
      }
      for (const [c, cr] of rec.colliders) if (!keep.has(c)) this.removeCollider(w, cr);
    }
    for (const rec of [...w.bodies.values()]) if (rec.seen !== gen) this.removeBody(w, rec);
  }

  /** Collider description of a component, relative to its owner body. */
  private shapeOf(c: Collider | CharacterController, owner: GameObject, rec: BodyRec, mass: number): { desc: RAPIER.ColliderDesc; sig: string } {
    const go = c.gameObject;
    if (c instanceof CharacterController) {
      const half = Math.max(0, c.height / 2 - c.radius);
      const desc = RAPIER.ColliderDesc.capsule(half, c.radius).setTranslation(c.center.x, c.center.y, c.center.z);
      desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS).setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
      const g = groupsOf(go.layer);
      desc.setCollisionGroups(g).setSolverGroups(g);
      return { desc, sig: `cc|${c.radius}|${c.height}|${c.center.x},${c.center.y},${c.center.z}|${g}` };
    }
    // pose of the collider's object in the owner's space (scale applied to the shape, not the pose)
    const ownerWorld = owner.transform.worldMatrix;
    const rel = go === owner ? Matrix.Identity() : go.transform.worldMatrix.multiply(ownerWorld.clone().invert());
    const { s: ownerScale } = decompose(ownerWorld);
    const { p: relP, q: relQ, s: relS } = decompose(rel);
    const scale = new Vector3(Math.abs(ownerScale.x * relS.x), Math.abs(ownerScale.y * relS.y), Math.abs(ownerScale.z * relS.z));
    if (go !== owner) relP.multiplyInPlace(new Vector3(Math.abs(ownerScale.x), Math.abs(ownerScale.y), Math.abs(ownerScale.z)));
    const center = Vector3.TransformCoordinates(c.center.multiply(scale), Matrix.FromQuaternionToRef(relQ, new Matrix())).add(relP);
    let desc: RAPIER.ColliderDesc;
    const maxXZ = Math.max(scale.x, scale.z);
    switch (c.shape) {
      case 'Sphere':
        desc = RAPIER.ColliderDesc.ball(c.radius * Math.max(scale.x, scale.y, scale.z));
        break;
      case 'Capsule': {
        const r = c.radius * maxXZ;
        desc = RAPIER.ColliderDesc.capsule(Math.max(0, (c.height * scale.y) / 2 - r), r);
        break;
      }
      case 'Cylinder':
        desc = RAPIER.ColliderDesc.cylinder((c.height * scale.y) / 2, c.radius * maxXZ);
        break;
      default:
        desc = RAPIER.ColliderDesc.cuboid(Math.max(1e-4, (c.size.x * scale.x) / 2), Math.max(1e-4, (c.size.y * scale.y) / 2), Math.max(1e-4, (c.size.z * scale.z) / 2));
    }
    desc.setTranslation(center.x, center.y, center.z).setRotation({ x: relQ.x, y: relQ.y, z: relQ.z, w: relQ.w });
    desc.setFriction(c.friction).setRestitution(c.restitution).setSensor(c.isTrigger);
    desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS).setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
    if (mass > 0 && !c.isTrigger) desc.setMass(mass);
    else if (rec.kind === 'dynamic') desc.setDensity(c.isTrigger ? 0 : 1);
    const groups = groupsOf(go.layer);
    desc.setCollisionGroups(groups).setSolverGroups(groups);
    const sig = `${groups}|${c.shape}|${r4(center.x)},${r4(center.y)},${r4(center.z)}|${r4(relQ.x)},${r4(relQ.y)},${r4(relQ.z)},${r4(relQ.w)}|${c.size.x},${c.size.y},${c.size.z}|${c.radius}|${c.height}|${r4(scale.x)},${r4(scale.y)},${r4(scale.z)}|${c.isTrigger}|${c.friction}|${c.restitution}|${mass}`;
    return { desc, sig };
  }

  private removeCollider(w: WorldRec, cr: ColliderRec): void {
    w.byHandle.delete(cr.collider.handle);
    if (w.world.getCollider(cr.collider.handle)) w.world.removeCollider(cr.collider, true);
    cr.owner.colliders.delete(cr.comp);
  }

  private removeBody(w: WorldRec, rec: BodyRec): void {
    for (const cr of rec.colliders.values()) w.byHandle.delete(cr.collider.handle);
    if (rec.controller) w.world.removeCharacterController(rec.controller);
    w.world.removeRigidBody(rec.body);
    w.bodies.delete(rec.go);
  }

  // ---- step ---------------------------------------------------------------------------------------------------------------

  step(scene: Scene, dt: number): void {
    const w = this.worldOf(scene);
    const g = Physics.gravity;
    w.world.gravity = { x: g.x, y: g.y, z: g.z };
    this.sync(scene, w);
    w.world.timestep = dt;
    w.world.step(w.events);
    w.stepped = true;
    // dynamic bodies → Transforms
    for (const rec of w.bodies.values()) {
      if (rec.kind !== 'dynamic' || rec.body.isSleeping()) continue;
      const t = rec.body.translation();
      const r = rec.body.rotation();
      const tr = rec.go.transform;
      const p = new Vector3(t.x, t.y, t.z);
      const q = new Quaternion(r.x, r.y, r.z, r.w);
      const parent = tr.parent;
      if (parent) {
        const inv = parent.worldMatrix.clone().invert();
        Vector3.TransformCoordinatesToRef(p, inv, tr.localPosition);
        const pq = new Quaternion();
        parent.worldMatrix.decompose(undefined, pq);
        Quaternion.InverseToRef(pq, pq).multiplyToRef(q, tr.localRotation);
      } else {
        tr.localPosition.copyFrom(p);
        tr.localRotation.copyFrom(q);
      }
      tr.markDirty();
      rec.body.resetForces(false);
      rec.body.resetTorques(false);
    }
    // events → callbacks (after the poses are written)
    const calls: (() => void)[] = [];
    w.events.drainCollisionEvents((h1, h2, started) => {
      const a = w.byHandle.get(h1);
      const b = w.byHandle.get(h2);
      if (!a || !b) return;
      const trigger = a.collider.isSensor() || b.collider.isSensor();
      if (trigger) {
        calls.push(() => {
          this.fire(a.owner.go, started ? 'onTriggerEnter' : 'onTriggerExit', b.owner.go);
          this.fire(b.owner.go, started ? 'onTriggerEnter' : 'onTriggerExit', a.owner.go);
        });
        return;
      }
      let point: Vector3 | null = null;
      let normal: Vector3 | null = null;
      if (started)
        w.world.contactPair(a.collider, b.collider, (m, flipped) => {
          if (point || m.numSolverContacts() === 0) return;
          const cp = m.solverContactPoint(0);
          if (cp) point = v3(cp);
          const n = m.normal();
          normal = flipped ? new Vector3(-n.x, -n.y, -n.z) : v3(n);
        });
      calls.push(() => {
        const ca: Collision = { gameObject: b.owner.go, point, normal };
        const cb: Collision = { gameObject: a.owner.go, point, normal: normal ? (normal as Vector3).scale(-1) : null };
        this.fire(a.owner.go, started ? 'onCollisionEnter' : 'onCollisionExit', ca);
        this.fire(b.owner.go, started ? 'onCollisionEnter' : 'onCollisionExit', cb);
      });
    });
    for (const c of calls) c();
  }

  private fire(go: GameObject, method: 'onTriggerEnter' | 'onTriggerExit' | 'onCollisionEnter' | 'onCollisionExit', arg: unknown): void {
    if (go.destroyed) return;
    for (const c of go.components) {
      const f = (c as unknown as Record<string, ((a: unknown) => void) | undefined>)[method];
      if (typeof f !== 'function' || !c.enabled || !c._started) continue;
      try {
        f.call(c, arg);
      } catch (e) {
        Debug.exception(e, c);
      }
    }
  }

  // ---- queries ------------------------------------------------------------------------------------------------------------

  private filter(w: WorldRec, o?: QueryOptions): (c: RAPIER.Collider) => boolean {
    const ignore = o?.ignore ?? null;
    const mask = o?.layerMask ?? Physics.defaultQueryMask;
    return (c) => {
      const rec = w.byHandle.get(c.handle);
      if (!rec) return true;
      if (!(mask & (1 << (rec.go.layer & 15)))) return false;
      if (!ignore) return true;
      for (let g: GameObject | null = rec.go; g; g = g.parent) if (g === ignore) return false;
      return rec.owner.go !== ignore;
    };
  }

  raycast(scene: Scene, origin: Vector3, direction: Vector3, maxDistance: number, o?: QueryOptions): RaycastHit | null {
    const w = this.worlds.get(scene);
    if (!w) return null;
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: direction.x, y: direction.y, z: direction.z });
    const hit = w.world.castRayAndGetNormal(ray, maxDistance, true, o?.triggers ? undefined : RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, this.filter(w, o));
    if (!hit) return null;
    const rec = w.byHandle.get(hit.collider.handle);
    if (!rec) return null;
    return { gameObject: rec.go, point: origin.add(direction.scale(hit.timeOfImpact)), normal: v3(hit.normal), distance: hit.timeOfImpact };
  }

  overlapSphere(scene: Scene, center: Vector3, radius: number, o?: QueryOptions): GameObject[] {
    const w = this.worlds.get(scene);
    if (!w) return [];
    const out = new Set<GameObject>();
    w.world.intersectionsWithShape(
      { x: center.x, y: center.y, z: center.z },
      { x: 0, y: 0, z: 0, w: 1 },
      new RAPIER.Ball(radius),
      (c) => {
        const rec = w.byHandle.get(c.handle);
        if (rec) out.add(rec.go);
        return true;
      },
      o?.triggers ? undefined : RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      this.filter(w, o),
    );
    return [...out];
  }

  moveCharacter(scene: Scene, go: GameObject, d: Vector3): { grounded: boolean; moved: Vector3 } {
    const w = this.worldOf(scene);
    let rec = w.bodies.get(go);
    if (!rec || rec.kind !== 'character' || !w.stepped) {
      this.sync(scene, w);
      // new colliders reach the query structures only through a step: a tiny one before the first move (else the
      // character falls into ground created in the same frame)
      w.world.timestep = 1e-6;
      w.world.step();
      w.stepped = true;
      rec = w.bodies.get(go);
    }
    const cc = go.getComponent(CharacterController);
    const cr = rec && cc ? rec.colliders.get(cc) : undefined;
    if (!rec || !cc || !cr) {
      go.transform.position = go.transform.position.add(d);
      return { grounded: false, moved: d.clone() };
    }
    if (!rec.controller) {
      const k = w.world.createCharacterController(cc.skinWidth);
      k.setUp({ x: 0, y: 1, z: 0 });
      k.setApplyImpulsesToDynamicBodies(true);
      rec.controller = k;
    }
    const k = rec.controller;
    k.setMaxSlopeClimbAngle((cc.slopeLimit * Math.PI) / 180);
    k.setMinSlopeSlideAngle(((cc.slopeLimit + 5) * Math.PI) / 180);
    if (cc.stepOffset > 0) k.enableAutostep(cc.stepOffset, cc.radius * 0.5, false);
    else k.disableAutostep();
    // no snap-to-ground: in Rapier 0.21 it sometimes lets a resting character move straight down through the ground (the
    // full downward displacement comes back while grounded is reported); scripts keep a small downward velocity instead
    k.disableSnapToGround();
    // the Transform is the truth: the body starts every move from it (no drift between frames / physics steps)
    const t = go.transform.position;
    rec.body.setTranslation({ x: t.x, y: t.y, z: t.z }, true);
    w.world.propagateModifiedBodyPositionsToColliders();
    k.computeColliderMovement(cr.collider, { x: d.x, y: d.y, z: d.z }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, groupsOf(go.layer));
    const m = k.computedMovement();
    const moved = new Vector3(m.x, m.y, m.z);
    const np = new Vector3(t.x + moved.x, t.y + moved.y, t.z + moved.z);
    rec.body.setTranslation({ x: np.x, y: np.y, z: np.z }, true);
    w.world.propagateModifiedBodyPositionsToColliders();
    go.transform.position = np;
    const pq = decompose(go.transform.worldMatrix).q;
    rec.poseSig = `${r4(np.x)},${r4(np.y)},${r4(np.z)},${r4(pq.x)},${r4(pq.y)},${r4(pq.z)},${r4(pq.w)}`;
    const dt = Physics.fixedDeltaTime;
    cc._velocity.copyFrom(moved.scale(1 / Math.max(dt, 1e-6)));
    return { grounded: k.computedGrounded(), moved };
  }

  body(scene: Scene, go: GameObject): PhysicsBodyApi | null {
    const w = this.worlds.get(scene);
    const rec = w?.bodies.get(go);
    if (!rec) return null;
    const b = rec.body;
    return {
      getVelocity: () => v3(b.linvel()),
      setVelocity: (v) => b.setLinvel({ x: v.x, y: v.y, z: v.z }, true),
      getAngularVelocity: () => v3(b.angvel()),
      setAngularVelocity: (v) => b.setAngvel({ x: v.x, y: v.y, z: v.z }, true),
      addForce: (f) => b.addForce({ x: f.x, y: f.y, z: f.z }, true),
      addImpulse: (i) => b.applyImpulse({ x: i.x, y: i.y, z: i.z }, true),
      addTorque: (t) => b.addTorque({ x: t.x, y: t.y, z: t.z }, true),
      syncFromTransform: () => {
        const { p, q } = decompose(go.transform.worldMatrix);
        b.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
        b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      },
      sleep: () => b.sleep(),
      wakeUp: () => b.wakeUp(),
    };
  }
}

let ready: Promise<void> | null = null;
/** Loads Rapier (WASM) once and installs it as the physics provider. */
export function initPhysics(): Promise<void> {
  if (!ready)
    ready = RAPIER.init().then(() => {
      Physics._install(new RapierPhysics());
    });
  return ready;
}
