import { Component } from '../GameObject';
import { Vector3 } from '../math';
import { Physics } from '../Physics';
import { field, Types } from '../reflection';

/**
 * Physics components (simulated by the installed provider, `@rs/physics`).
 * - Collider: a shape on the object; with no RigidBody on it or a parent it is static scenery. Colliders of children of a
 *   RigidBody belong to that body (compound).
 * - RigidBody: Dynamic (simulated), Kinematic (moved by its Transform), Static.
 * - CharacterController: a kinematic capsule moved with `move()` (slides along walls, climbs steps, snaps to the ground).
 * Behaviors on the object receive onCollisionEnter / onCollisionExit (Collision) and onTriggerEnter / onTriggerExit (GameObject).
 */

export const COLLIDER_SHAPES = ['Box', 'Sphere', 'Capsule', 'Cylinder'] as const;
export type ColliderShape = (typeof COLLIDER_SHAPES)[number];

export class Collider extends Component {
  @field({ type: 'enum', options: COLLIDER_SHAPES }) shape: ColliderShape = 'Box';
  /** Offset from the object's origin (local space). */
  center = new Vector3(0, 0, 0);
  /** Box size (local, × the object's scale). */
  size = new Vector3(1, 1, 1);
  /** Sphere / capsule / cylinder radius. */
  @field({ min: 0.001, step: 0.05 }) radius = 0.5;
  /** Capsule / cylinder total height (along local Y). */
  @field({ min: 0.001, step: 0.05 }) height = 2;
  /** Reports overlaps (onTriggerEnter / Exit) without blocking. */
  isTrigger = false;
  @field({ min: 0, max: 2, step: 0.05 }) friction = 0.5;
  @field({ min: 0, max: 1, step: 0.05 }) restitution = 0;
}

export const BODY_TYPES = ['Dynamic', 'Kinematic', 'Static'] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export class RigidBody extends Component {
  @field({ type: 'enum', options: BODY_TYPES }) bodyType: BodyType = 'Dynamic';
  @field({ min: 0.001, step: 0.1 }) mass = 1;
  @field({ min: 0, step: 0.01 }) linearDamping = 0;
  @field({ min: 0, step: 0.01 }) angularDamping = 0.05;
  useGravity = true;
  /** Continuous collision detection (fast small bodies). */
  ccd = false;
  @field({ header: 'Constraints' }) freezeRotationX = false;
  freezeRotationY = false;
  freezeRotationZ = false;

  private api() {
    const s = this.gameObject?.scene;
    return s && Physics.provider ? Physics.provider.body(s, this.gameObject) : null;
  }
  get velocity(): Vector3 {
    return this.api()?.getVelocity() ?? Vector3.Zero();
  }
  set velocity(v: Vector3) {
    this.api()?.setVelocity(v);
  }
  get angularVelocity(): Vector3 {
    return this.api()?.getAngularVelocity() ?? Vector3.Zero();
  }
  set angularVelocity(v: Vector3) {
    this.api()?.setAngularVelocity(v);
  }
  addForce(f: Vector3): void {
    this.api()?.addForce(f);
  }
  addImpulse(i: Vector3): void {
    this.api()?.addImpulse(i);
  }
  addTorque(t: Vector3): void {
    this.api()?.addTorque(t);
  }
  /** After moving a dynamic body's Transform from a script: teleport the body there. */
  syncFromTransform(): void {
    this.api()?.syncFromTransform();
  }
  wakeUp(): void {
    this.api()?.wakeUp();
  }
}

export class CharacterController extends Component {
  @field({ min: 0.01, step: 0.05 }) radius = 0.4;
  /** Total capsule height. */
  @field({ min: 0.02, step: 0.05 }) height = 1.8;
  /** Capsule centre relative to the object's origin. */
  center = new Vector3(0, 0.9, 0);
  /** Highest step climbed automatically. */
  @field({ min: 0, step: 0.05 }) stepOffset = 0.3;
  /** Steepest walkable slope, degrees. */
  @field({ min: 0, max: 89 }) slopeLimit = 45;
  /** Gap kept around the capsule. */
  @field({ min: 0.001, step: 0.005 }) skinWidth = 0.02;
  /** @internal */ _grounded = false;
  /** @internal */ readonly _velocity = new Vector3();

  /** On the ground after the last move. */
  get isGrounded(): boolean {
    return this._grounded;
  }
  /** Actual velocity of the last move. */
  get velocity(): Vector3 {
    return this._velocity.clone();
  }

  /** Moves by a world displacement, sliding along obstacles. Returns the actual movement. */
  move(displacement: Vector3): Vector3 {
    const s = this.gameObject?.scene;
    const p = Physics.provider;
    if (!s || !p || !s.playing) {
      this.transform.localPosition.addInPlace(displacement);
      this.transform.markDirty();
      return displacement.clone();
    }
    const r = p.moveCharacter(s, this.gameObject, displacement);
    this._grounded = r.grounded;
    return r.moved;
  }
}

Types.register(Collider, 'Collider', 'component', { menu: 'Physics/Collider' });
Types.register(RigidBody, 'RigidBody', 'component', { menu: 'Physics/RigidBody', single: true });
Types.register(CharacterController, 'CharacterController', 'component', { menu: 'Physics/CharacterController', single: true });
