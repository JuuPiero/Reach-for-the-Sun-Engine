import { Assets } from './assets';
import { Debug } from './Debug';
import type { Vector3 } from './math';

/**
 * Web Audio engine: one AudioContext (created lazily, resumed on the first user gesture — browsers block audio before),
 * decoded clips cached by path, a master gain. Without Web Audio (Node tests) everything is silent.
 */
type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const loaded = new Map<string, AudioBuffer>();

function context(): Ctx | null {
  if (ctx) return ctx;
  const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  ctx = new C();
  master = ctx.createGain();
  master.gain.value = AudioEngine.masterVolume;
  master.connect(ctx.destination);
  return ctx;
}

export const AudioEngine = {
  masterVolume: 1,
  /** Muted (e.g. a settings toggle). */
  muted: false,
  get context(): Ctx | null {
    return context();
  },
  get output(): AudioNode | null {
    context();
    return master;
  },
  /** Resumes audio after a user gesture (the player / editor call it on the first key / pointer press). */
  resume(): void {
    const c = context();
    if (c && c.state === 'suspended') void c.resume();
  },
  /** Applies masterVolume / muted. */
  applyVolume(): void {
    if (master) master.gain.value = this.muted ? 0 : this.masterVolume;
  },
  /** Loads and decodes a clip (wav / mp3 / ogg), cached. */
  load(path: string): Promise<AudioBuffer | null> {
    let p = buffers.get(path);
    if (!p) {
      const c = context();
      if (!c) return Promise.resolve(null);
      p = fetch(Assets.url(path))
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((b) => c.decodeAudioData(b))
        .then((buf) => {
          loaded.set(path, buf);
          return buf;
        })
        .catch((e) => {
          Debug.warn(`Audio ${path}: ${(e as Error).message}`);
          buffers.delete(path);
          return null;
        });
      buffers.set(path, p);
    }
    return p;
  },
  /** A decoded clip if already loaded. */
  get(path: string): AudioBuffer | null {
    return loaded.get(path) ?? null;
  },
  /** Fire-and-forget sound (2D, or positioned when `at` is given). */
  async playClip(path: string, volume = 1, at?: Vector3, pitch = 1): Promise<void> {
    const c = context();
    if (!c || !master) return;
    const buf = await this.load(path);
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    const g = c.createGain();
    g.gain.value = volume;
    src.connect(g);
    if (at) {
      const p = c.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 2;
      p.maxDistance = 50;
      setPannerPosition(p, at.x, at.y, at.z);
      g.connect(p).connect(master);
    } else g.connect(master);
    src.start();
  },
  /** Forgets cached clips (editor: a file changed). */
  invalidate(path?: string): void {
    if (path) {
      buffers.delete(path);
      loaded.delete(path);
    } else {
      buffers.clear();
      loaded.clear();
    }
  },
};

export function setPannerPosition(p: PannerNode, x: number, y: number, z: number): void {
  // Web Audio is right-handed (−Z forward); the engine is left-handed (+Z forward): mirror Z
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = -z;
  } else p.setPosition(x, y, -z);
}
