import { Application, Behavior, Vector3, field, type Prefab } from '@rs/core';

/** Instantiates a prefab every `interval` seconds at a random point around it (up to `maxCount` alive). */
export class Spawner extends Behavior {
  @field({ type: 'prefab' }) prefab: Prefab | null = null;
  @field({ min: 0.1, step: 0.1 }) interval = 2;
  @field({ type: 'int', min: 1 }) maxCount = 8;
  @field({ min: 0 }) radius = 6;
  private _timer = 0;
  private readonly _spawned: { destroyed: boolean }[] = [];

  update(): void {
    this._timer += Application.deltaTime;
    if (this._timer < this.interval || !this.prefab?.loaded) return;
    this._timer = 0;
    for (let i = this._spawned.length - 1; i >= 0; i--) if (this._spawned[i].destroyed) this._spawned.splice(i, 1);
    if (this._spawned.length >= this.maxCount) return;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * this.radius;
    const p = this.transform.position.add(new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    this._spawned.push(this.prefab.instantiate(p, this.gameObject.folder));
  }
}
