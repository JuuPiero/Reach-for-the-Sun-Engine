import { Application, Behavior, Vector3, field } from '@rs/core';

/** Spins its GameObject (degrees per second) and bobs it up and down. */
export class Rotator extends Behavior {
  speed = new Vector3(0, 90, 0);
  @field({ min: 0, step: 0.05 }) bobHeight = 0;
  @field({ min: 0, step: 0.1 }) bobSpeed = 2;
  private _baseY = 0;

  start(): void {
    this._baseY = this.transform.localPosition.y;
  }

  update(): void {
    const dt = Application.deltaTime;
    this.transform.rotate(this.speed.x * dt, this.speed.y * dt, this.speed.z * dt);
    if (this.bobHeight > 0) this.transform.localPosition.y = this._baseY + Math.sin(Application.time * this.bobSpeed) * this.bobHeight;
  }
}
