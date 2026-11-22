import { Application, Behavior, Debug, Input, Quaternion, Vector3, field, type GameObject } from '@rs/core';
import type { PlayerParam } from './PlayerParam';

/** WASD / arrow keys move on the ground, Space jumps; the camera follows (RE-style behavior with a UserData). */
export class PlayerController extends Behavior {
  @field({ type: 'userdata', userDataType: 'PlayerParam' }) param: PlayerParam | null = null;
  /** Camera that follows the player (optional). */
  @field({ type: 'gameobject' }) followCamera: GameObject | null = null;
  cameraOffset = new Vector3(0, 6, -9);
  private _vy = 0;
  private _ground = 0;
  private _coins = 0;

  start(): void {
    this._ground = this.transform.localPosition.y;
    if (!this.param) Debug.warn('PlayerController: no PlayerParam assigned, using defaults');
  }

  update(): void {
    const dt = Application.deltaTime;
    const speed = this.param?.moveSpeed ?? 5;
    const x = Input.axis('KeyA', 'KeyD') + Input.axis('ArrowLeft', 'ArrowRight');
    const z = Input.axis('KeyS', 'KeyW') + Input.axis('ArrowDown', 'ArrowUp');
    const move = new Vector3(x, 0, z);
    const p = this.transform.localPosition;
    if (move.lengthSquared() > 0) {
      move.normalize();
      p.addInPlace(move.scale(speed * dt));
      const target = Quaternion.RotationYawPitchRoll(Math.atan2(move.x, move.z), 0, 0);
      const t = Math.min(1, ((this.param?.turnSpeed ?? 540) / 180) * dt * 3);
      Quaternion.SlerpToRef(this.transform.localRotation, target, t, this.transform.localRotation);
    }
    // jump
    const onGround = p.y <= this._ground + 1e-4;
    if (onGround && Input.getKeyDown('Space')) this._vy = Math.sqrt(2 * 9.8 * (this.param?.jumpHeight ?? 1.5));
    this._vy -= 9.8 * dt;
    p.y = Math.max(this._ground, p.y + this._vy * dt);
    if (p.y <= this._ground) this._vy = 0;
    this.transform.markDirty();
    this.collectCoins();
  }

  lateUpdate(): void {
    const cam = this.followCamera;
    if (!cam) return;
    const target = this.transform.position;
    cam.transform.localPosition.copyFrom(target.add(this.cameraOffset));
    cam.transform.markDirty();
    cam.transform.lookAt(target.add(new Vector3(0, 1, 0)));
  }

  private collectCoins(): void {
    const me = this.transform.position;
    for (const coin of this.scene.findWithTag('Coin')) {
      if (Vector3.Distance(coin.transform.position, me) < 1.1) {
        coin.destroy();
        this._coins++;
        Debug.log(`Coin! (${this._coins})`);
      }
    }
  }

  get coins(): number {
    return this._coins;
  }
}
