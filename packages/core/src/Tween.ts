import { Color3, Quaternion, Vector3 } from './math';
import type { Scene } from './Scene';
import { SceneManager } from './SceneManager';

/** Easing functions (t in 0..1). */
export const Ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => --t * t * t + 1,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  outBack: (t: number) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  outBounce: (t: number) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  outElastic: (t: number) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1),
};
export type EaseName = keyof typeof Ease;

export interface TweenOptions {
  ease?: EaseName | ((t: number) => number);
  delay?: number;
  /** Repeat count (-1 = forever). */
  repeat?: number;
  /** Go back and forth when repeating. */
  yoyo?: boolean;
  onUpdate?: (t: number) => void;
  onComplete?: () => void;
}

type Lerpable = number | Vector3 | Color3 | Quaternion;
interface Track {
  key: string;
  from: Lerpable;
  to: Lerpable;
}

/** A running tween (`kill()` stops it; `finished` promise resolves when it completes or is killed). */
export class Tween {
  private elapsed = 0;
  private tracks: Track[] | null = null;
  private resolve!: () => void;
  readonly finished: Promise<void>;
  killed = false;
  done = false;
  private loops = 0;

  constructor(
    readonly target: object,
    private readonly props: Record<string, Lerpable>,
    readonly duration: number,
    private readonly o: TweenOptions,
  ) {
    this.finished = new Promise((r) => (this.resolve = r));
  }

  /** Tweens properties of `target` (numbers, Vector3, Color3, Quaternion) to `props` over `duration` seconds of play time. */
  static to(target: object, props: Record<string, Lerpable>, duration: number, o: TweenOptions = {}, scene?: Scene): Tween {
    const t = new Tween(target, props, Math.max(0, duration), o);
    const s = scene ?? SceneManager.active;
    if (s) s._tweens.push(t);
    else t.kill();
    return t;
  }

  /** Stops every tween on `target`. */
  static killTweensOf(target: object, scene?: Scene): void {
    const s = scene ?? SceneManager.active;
    for (const t of s?._tweens ?? []) if (t.target === target) t.kill();
  }

  kill(): void {
    if (this.done) return;
    this.killed = this.done = true;
    this.resolve();
  }

  /** @internal advances; returns false when finished. */
  _advance(dt: number): boolean {
    if (this.done) return false;
    this.elapsed += dt;
    const delay = this.o.delay ?? 0;
    if (this.elapsed < delay) return true;
    if (!this.tracks) {
      const tgt = this.target as Record<string, unknown>;
      this.tracks = Object.entries(this.props).map(([key, to]) => {
        const cur = tgt[key] as Lerpable;
        const from = typeof cur === 'number' ? cur : (cur as Vector3 | Color3 | Quaternion).clone();
        return { key, from, to };
      });
    }
    const local = this.duration > 0 ? Math.min(1, (this.elapsed - delay) / this.duration) : 1;
    const back = this.o.yoyo && this.loops % 2 === 1;
    const f = typeof this.o.ease === 'function' ? this.o.ease : Ease[this.o.ease ?? 'outQuad'];
    const k = f(back ? 1 - local : local);
    const tgt = this.target as Record<string, Lerpable>;
    for (const tr of this.tracks) {
      if (typeof tr.from === 'number') tgt[tr.key] = tr.from + ((tr.to as number) - tr.from) * k;
      else if (tr.from instanceof Quaternion) Quaternion.SlerpToRef(tr.from, tr.to as Quaternion, k, tgt[tr.key] as Quaternion);
      else if (tr.from instanceof Vector3) Vector3.LerpToRef(tr.from, tr.to as Vector3, k, tgt[tr.key] as Vector3);
      else if (tr.from instanceof Color3) {
        const c = tgt[tr.key] as Color3;
        const a = tr.from;
        const b = tr.to as Color3;
        c.set(a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k);
      }
    }
    // Transforms: a tweened localPosition / localRotation / localScale must invalidate the world matrix
    (this.target as { markDirty?: () => void }).markDirty?.();
    this.o.onUpdate?.(k);
    if (local < 1) return true;
    const repeat = this.o.repeat ?? 0;
    if (repeat < 0 || this.loops < repeat) {
      this.loops++;
      this.elapsed = delay;
      return true;
    }
    this.done = true;
    this.o.onComplete?.();
    this.resolve();
    return false;
  }
}

/** A timer of play time (scene time). */
export interface SceneTimer {
  at: number;
  resolve: () => void;
  owner: object | null;
  cancelled: boolean;
}
