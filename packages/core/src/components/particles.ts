import { Application } from '../Application';
import { Component } from '../GameObject';
import { Color3, Vector3 } from '../math';
import { field, Types } from '../reflection';

export const PARTICLE_SHAPES = ['Point', 'Sphere', 'Hemisphere', 'Cone', 'Box'] as const;
export const PARTICLE_BLENDS = ['Additive', 'Alpha'] as const;

/**
 * Particle effect (RE's simple VFX emitters): particles spawned from a shape at the GameObject, with random lifetime / speed /
 * size, colour + alpha + size over life, gravity. The renderer simulates them (CPU, Babylon ParticleSystem); this component holds
 * the settings and the play state. `play()`, `stop()`, `emit(n)` (a burst), `isPlaying`. In edit mode it previews when
 * `simulateInEdit` is on.
 */
export class ParticleSystem extends Component {
  @field({ header: 'Emission' }) playOnStart = true;
  loop = true;
  /** Seconds of emission per cycle (not looping: it stops emitting after this). */
  @field({ min: 0.05, step: 0.1 }) duration = 5;
  /** Particles per second. */
  @field({ min: 0, step: 1 }) rate = 20;
  /** Particles emitted at once when it starts playing (each cycle). */
  @field({ min: 0, step: 1 }) burst = 0;
  @field({ min: 1, step: 10 }) maxParticles = 300;

  @field({ min: 0.01, step: 0.1, header: 'Particle' }) lifetimeMin = 1;
  @field({ min: 0.01, step: 0.1 }) lifetimeMax = 2;
  @field({ min: 0, step: 0.1 }) speedMin = 1;
  @field({ min: 0, step: 0.1 }) speedMax = 2;
  @field({ min: 0, step: 0.05 }) sizeMin = 0.15;
  @field({ min: 0, step: 0.05 }) sizeMax = 0.3;
  /** Size multiplier at the end of a particle's life. */
  @field({ min: 0, step: 0.05 }) endSize = 1;
  startColor = new Color3(1, 0.85, 0.4);
  endColor = new Color3(1, 0.3, 0.1);
  @field({ min: 0, max: 1, step: 0.01 }) startAlpha = 1;
  @field({ min: 0, max: 1, step: 0.01 }) endAlpha = 0;
  /** Acceleration (world units / s²), e.g. (0, -9.8, 0). */
  gravity = new Vector3(0, 0, 0);
  /** Spin, degrees per second (random between ±). */
  @field({ min: 0, step: 10 }) spin = 0;

  @field({ type: 'enum', options: PARTICLE_SHAPES, header: 'Shape' }) shape: (typeof PARTICLE_SHAPES)[number] = 'Cone';
  @field({ min: 0, step: 0.05, visibleIf: (p: ParticleSystem) => p.shape !== 'Point' && p.shape !== 'Box' }) radius = 0.3;
  /** Cone half angle, degrees. */
  @field({ min: 0, max: 89, visibleIf: (p: ParticleSystem) => p.shape === 'Cone' }) angle = 20;
  @field({ visibleIf: (p: ParticleSystem) => p.shape === 'Box' }) boxSize = new Vector3(1, 1, 1);

  /** Particle image ('' = soft round dot). */
  @field({ type: 'asset', assetKind: ['png', 'jpg', 'jpeg', 'webp'], header: 'Rendering' }) texture = '';
  @field({ type: 'enum', options: PARTICLE_BLENDS }) blend: (typeof PARTICLE_BLENDS)[number] = 'Additive';
  /** Particles keep moving with the GameObject (off = they stay where they were emitted). */
  localSpace = false;
  simulateInEdit = true;

  /** @internal emission state read by the renderer. */
  _emitting = false;
  /** @internal particles to emit at once on the next render (bursts). */
  _pendingBurst = 0;
  /** @internal bumped by stop(true): the renderer clears live particles. */
  _clearVersion = 0;
  /** @internal live particles (written by the renderer). */
  _count = 0;
  private _time = 0;
  private _playing = false;

  start(): void {
    if (this.playOnStart) this.play();
  }

  update(): void {
    if (!this._playing) return;
    this._time += Application.deltaTime;
    if (this._time < this.duration) return;
    if (this.loop) {
      this._time %= this.duration;
      if (this.burst > 0) this._pendingBurst += this.burst;
    } else {
      this._emitting = false;
      this._playing = false;
    }
  }

  /** Starts (or restarts) emitting. */
  play(): void {
    this._playing = true;
    this._emitting = true;
    this._time = 0;
    if (this.burst > 0) this._pendingBurst += this.burst;
  }

  /** Stops emitting; `clear` also removes the live particles. */
  stop(clear = false): void {
    this._emitting = false;
    this._playing = false;
    this._pendingBurst = 0;
    if (clear) this._clearVersion++;
  }

  /** Emits `count` particles now (works while stopped too). */
  emit(count: number): void {
    this._pendingBurst += Math.max(0, Math.floor(count));
  }

  /** Emitting, or particles still alive. */
  get isPlaying(): boolean {
    return this._emitting || this._count > 0;
  }
  get particleCount(): number {
    return this._count;
  }
}

Types.register(ParticleSystem, 'ParticleSystem', 'component', { menu: 'Effects/Particle System', single: true });
