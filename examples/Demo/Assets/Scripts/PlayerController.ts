import { Application, AudioSource, Behavior, CharacterController, Debug, Input, Motion, Quaternion, Vector3, field, type GameObject } from '@rs/core';
import type { PlayerParam } from './PlayerParam';

/**
 * Third-person movement: WASD / arrows walk (Shift = run), Space jumps. Moves with the CharacterController, turns towards the
 * movement, drives the body's Motion FSM (speed / grounded / jump) and collects coins (trigger colliders tagged "Coin").
 */
export class PlayerController extends Behavior {
  @field({ type: 'userdata', userDataType: 'PlayerParam' }) param: PlayerParam | null = null;
  /** Camera that follows the player (optional). */
  @field({ type: 'gameobject' }) followCamera: GameObject | null = null;
  /** Child with the model + Motion (turned towards the movement). */
  @field({ type: 'gameobject' }) body: GameObject | null = null;
  cameraOffset = new Vector3(0, 6, -9);
  @field({ min: 1, step: 0.5 }) runMultiplier = 2;
  @field({ type: 'asset', assetKind: ['wav', 'mp3', 'ogg'], header: 'Sounds' }) jumpSound = '';
  @field({ type: 'asset', assetKind: ['wav', 'mp3', 'ogg'] }) coinSound = '';
  private _audio: AudioSource | null = null;
  private _vy = 0;
  private _coins = 0;
  private _cc: CharacterController | null = null;
  private _motion: Motion | null = null;

  start(): void {
    this._cc = this.getComponent(CharacterController);
    this._motion = this.body?.getComponent(Motion) ?? null;
    this._audio = this.getComponent(AudioSource);
    if (!this.param) Debug.warn('PlayerController: no PlayerParam assigned, using defaults');
  }

  update(): void {
    const dt = Application.deltaTime;
    const run = Input.getKey('ShiftLeft') || Input.getKey('ShiftRight');
    const speed = (this.param?.moveSpeed ?? 5) * (run ? this.runMultiplier : 1);
    const x = Input.axis('KeyA', 'KeyD') + Input.axis('ArrowLeft', 'ArrowRight');
    const z = Input.axis('KeyS', 'KeyW') + Input.axis('ArrowDown', 'ArrowUp');
    const move = new Vector3(x, 0, z);
    if (move.lengthSquared() > 1) move.normalize();
    const grounded = this._cc?.isGrounded ?? true;
    if (grounded) this._vy = Math.max(this._vy, -1);
    if (grounded && Input.getKeyDown('Space')) {
      this._vy = Math.sqrt(2 * 9.81 * (this.param?.jumpHeight ?? 1.5));
      this._motion?.setTrigger('jump');
      if (this.jumpSound) this._audio?.playOneShot(this.jumpSound, 0.5);
    }
    this._vy -= 9.81 * dt;
    const d = move.scale(speed * dt);
    d.y = this._vy * dt;
    if (this._cc) this._cc.move(d);
    else {
      this.transform.localPosition.addInPlace(d);
      this.transform.markDirty();
    }
    // face the movement
    if (move.lengthSquared() > 0.01 && this.body) {
      const target = Quaternion.RotationYawPitchRoll(Math.atan2(move.x, move.z), 0, 0);
      const t = Math.min(1, ((this.param?.turnSpeed ?? 540) / 90) * dt);
      Quaternion.SlerpToRef(this.body.transform.localRotation, target, t, this.body.transform.localRotation);
      this.body.transform.markDirty();
    }
    this._motion?.setFloat('speed', move.length() * speed);
    this._motion?.setBool('grounded', this._cc?.isGrounded ?? true);
    // fell off the world
    if (this.transform.position.y < -20) {
      this.transform.position = new Vector3(0, 2, 0);
      this._vy = 0;
    }
  }

  lateUpdate(): void {
    const cam = this.followCamera;
    if (!cam) return;
    const target = this.transform.position;
    cam.transform.localPosition.copyFrom(target.add(this.cameraOffset));
    cam.transform.markDirty();
    cam.transform.lookAt(target.add(new Vector3(0, 1, 0)));
  }

  onTriggerEnter(other: GameObject): void {
    if (other.tag !== 'Coin') return;
    other.destroy();
    this._coins++;
    if (this.coinSound) this._audio?.playOneShot(this.coinSound, 0.7);
    Debug.log(`Coin! (${this._coins})`);
  }

  get coins(): number {
    return this._coins;
  }
}
