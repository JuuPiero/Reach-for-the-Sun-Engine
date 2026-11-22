import type { GameObject } from './GameObject';
import { Vector3 } from './math';
import type { Scene } from './Scene';

/**
 * Physics API (RE's via.physics role). The simulation itself is a provider (`@rs/physics` = Rapier) installed with
 * `Physics._install`; without one, worlds run without physics (queries hit nothing, bodies don't move).
 * Scenes step physics at a fixed rate (`Physics.fixedDeltaTime`) inside play frames: fixedUpdate → simulate → collision /
 * trigger callbacks, before update.
 */

export interface RaycastHit {
  gameObject: GameObject;
  point: Vector3;
  normal: Vector3;
  distance: number;
}

export interface Collision {
  /** The other object. */
  gameObject: GameObject;
  /** First contact point / normal (world), when the provider reports it. */
  point: Vector3 | null;
  normal: Vector3 | null;
}

export interface QueryOptions {
  /** Ignore this object (and its children). */
  ignore?: GameObject | null;
  /** Hit trigger colliders too. */
  triggers?: boolean;
}

export interface PhysicsProvider {
  readonly name: string;
  /** One fixed step of a scene's world (creates / updates / removes bodies from the components first). */
  step(scene: Scene, dt: number): void;
  /** Drops a scene's world (play stopped / scene unloaded). */
  dispose(scene: Scene): void;
  raycast(scene: Scene, origin: Vector3, direction: Vector3, maxDistance: number, o?: QueryOptions): RaycastHit | null;
  overlapSphere(scene: Scene, center: Vector3, radius: number, o?: QueryOptions): GameObject[];
  /** CharacterController.move (collision-aware displacement). */
  moveCharacter(scene: Scene, go: GameObject, displacement: Vector3): { grounded: boolean; moved: Vector3 };
  /** RigidBody runtime API. */
  body(scene: Scene, go: GameObject): PhysicsBodyApi | null;
}

export interface PhysicsBodyApi {
  getVelocity(): Vector3;
  setVelocity(v: Vector3): void;
  getAngularVelocity(): Vector3;
  setAngularVelocity(v: Vector3): void;
  addForce(f: Vector3): void;
  addImpulse(i: Vector3): void;
  addTorque(t: Vector3): void;
  /** Teleports the body to its Transform (after a script moved a dynamic body). */
  syncFromTransform(): void;
  sleep(): void;
  wakeUp(): void;
}

let provider: PhysicsProvider | null = null;
let activeScene: Scene | null = null;

export const Physics = {
  gravity: new Vector3(0, -9.81, 0),
  /** Seconds per physics step. */
  fixedDeltaTime: 1 / 60,
  /** At most this many steps per frame (slow frames slow the simulation down instead of spiralling). */
  maxSubSteps: 4,
  get provider(): PhysicsProvider | null {
    return provider;
  },
  /** @internal */
  _install(p: PhysicsProvider | null): void {
    provider = p;
  },
  /** @internal the scene queries run against (set by Scene.step). */
  _setActiveScene(s: Scene | null): void {
    activeScene = s;
  },
  get activeScene(): Scene | null {
    return activeScene;
  },
  /** Closest hit along a ray (direction normalized internally), or null. */
  raycast(origin: Vector3, direction: Vector3, maxDistance = 1000, o?: QueryOptions): RaycastHit | null {
    if (!provider || !activeScene) return null;
    const d = direction.normalizeToNew();
    return provider.raycast(activeScene, origin, d, maxDistance, o);
  },
  overlapSphere(center: Vector3, radius: number, o?: QueryOptions): GameObject[] {
    if (!provider || !activeScene) return [];
    return provider.overlapSphere(activeScene, center, radius, o);
  },
};
