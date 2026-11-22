import { Application } from '../Application';
import { Assets } from '../assets';
import { Component } from '../GameObject';
import { conditionsMet, type FsmParameter, type FsmState, type MotionFsmData } from '../MotionFsm';
import { field, Types } from '../reflection';

/**
 * Motion — plays the animation clips of the model drawn by a Mesh component on the same GameObject (RE's motion component).
 * With a MotionFsm (`.fsm.json`) the state machine picks the clip from parameters (`setFloat('speed', 3)`, `setTrigger('jump')`);
 * without one it plays `clip`. Cross-fades blend the outgoing clip out over `crossFade` seconds. The renderer samples the clips
 * at the times / weights computed here (`layers`) and reports the model's clips back (`_setClips`).
 * Runs in play mode; `updateInEdit` also animates it in the editor.
 */
export interface MotionLayer {
  clip: string;
  time: number;
  weight: number;
  speed: number;
  loop: boolean;
}

export class Motion extends Component {
  @field({ type: 'asset', assetKind: 'fsm.json' }) fsm = '';
  /** Clip played without an FSM (or before it loads). */
  @field({ type: 'string', choices: (m: Motion) => m.clipNames }) clip = '';
  @field({ step: 0.05 }) speed = 1;
  loop = true;
  playOnStart = true;
  /** Default cross-fade, seconds. */
  @field({ min: 0, step: 0.05 }) crossFade = 0.2;
  /** Animate in the editor too. */
  updateInEdit = false;

  /** @internal editor preview bookkeeping (restart when the FSM / clip field changes). */
  _editPreviewFsm: string | null = null;
  /** @internal */ _editPreviewClip: string | null = null;
  /** Active clips, oldest first (the last one is the current clip). */
  readonly layers: MotionLayer[] = [];
  private _fadeTime = 0;
  private _fadeDuration = 0;
  private _clipLengths = new Map<string, number>();
  private _params = new Map<string, number | boolean>();
  private _triggers = new Set<string>();
  private _types = new Map<string, FsmParameter['type']>();
  private _state: FsmState | null = null;
  private _fsmData: MotionFsmData | null = null;
  private _fsmPath = '';
  private _stateTime = 0;

  /** Clip names of the model (filled by the renderer once the model is loaded). */
  get clipNames(): string[] {
    return [...this._clipLengths.keys()];
  }
  /** @internal renderer: the model's clips and their lengths (seconds). */
  _setClips(clips: Map<string, number>): void {
    this._clipLengths = clips;
  }
  clipLength(name: string): number {
    return this._clipLengths.get(name) ?? 0;
  }

  /** Current FSM state name ('' without FSM). */
  get state(): string {
    return this._state?.name ?? '';
  }
  /** Current clip. */
  get currentClip(): string {
    return this.layers[this.layers.length - 1]?.clip ?? '';
  }
  /** Normalized time of the current clip (0..1 per loop; > 1 when a non-looping clip ended). */
  get normalizedTime(): number {
    const l = this.layers[this.layers.length - 1];
    if (!l) return 0;
    const len = this.clipLength(l.clip) || 1;
    return l.time / len;
  }

  setFloat(name: string, v: number): void {
    this._params.set(name, v);
  }
  setBool(name: string, v: boolean): void {
    this._params.set(name, v);
  }
  setTrigger(name: string): void {
    this._triggers.add(name);
  }
  resetTrigger(name: string): void {
    this._triggers.delete(name);
  }
  getFloat(name: string): number {
    const v = this._params.get(name);
    return typeof v === 'number' ? v : 0;
  }
  getBool(name: string): boolean {
    return this._params.get(name) === true;
  }

  /** Plays a clip, fading from what plays now. */
  play(clip: string, fade = this.crossFade, opts: { speed?: number; loop?: boolean } = {}): void {
    const layer: MotionLayer = { clip, time: 0, weight: 1, speed: opts.speed ?? 1, loop: opts.loop ?? this.loop };
    if (fade <= 0 || !this.layers.length) {
      this.layers.length = 0;
      this.layers.push(layer);
      this._fadeDuration = 0;
      return;
    }
    // keep only the current clip as the one fading out
    const cur = this.layers[this.layers.length - 1];
    this.layers.length = 0;
    this.layers.push(cur, layer);
    layer.weight = 0;
    this._fadeTime = 0;
    this._fadeDuration = fade;
  }

  /** Jumps to an FSM state. */
  setState(name: string, fade = this.crossFade): void {
    const s = this._fsmData?.states.find((x) => x.name === name);
    if (!s) return;
    this._state = s;
    this._stateTime = 0;
    this.play(s.clip, fade, { speed: s.speed ?? 1, loop: s.loop ?? true });
  }

  start(): void {
    this.restart();
  }

  /** Back to the initial state / clip. */
  restart(): void {
    this.layers.length = 0;
    this._state = null;
    this._fsmData = null;
    this._triggers.clear();
    this.loadFsm();
    const d = this._fsmData as MotionFsmData | null;
    if (d) this.setState(d.initial, 0);
    else if (this.playOnStart && this.clip) this.play(this.clip, 0);
  }

  private loadFsm(): void {
    if (this._fsmPath === this.fsm && this._fsmData) return;
    this._fsmPath = this.fsm;
    this._fsmData = this.fsm ? Assets.getFsm(this.fsm) : null;
    this._types.clear();
    if (this._fsmData)
      for (const p of this._fsmData.parameters) {
        this._types.set(p.name, p.type);
        if (!this._params.has(p.name) && p.type !== 'trigger') this._params.set(p.name, p.value ?? (p.type === 'bool' ? false : 0));
      }
  }

  update(): void {
    this.tick(Application.deltaTime);
  }

  /** Advances by `dt` seconds (play mode: every frame; editor: `updateInEdit`). */
  tick(dt: number): void {
    // an FSM assigned / loaded / edited after start (keeps the current state when it still exists)
    const shared = this.fsm ? Assets.getFsm(this.fsm) : null;
    if (shared && (shared !== this._fsmData || this._fsmPath !== this.fsm)) {
      const was = this._state?.name;
      this._fsmData = null;
      this.loadFsm();
      const d = this._fsmData as MotionFsmData | null;
      if (d) {
        const keep = was && d.states.some((s) => s.name === was);
        this.setState(keep ? was! : d.initial, 0);
      }
    } else if (!this.fsm && this._fsmData) {
      this._fsmData = null;
      this._state = null;
    }
    if (!this.layers.length && !this._fsmData && this.clip && this.playOnStart) this.play(this.clip, 0);
    const k = dt * this.speed;
    for (const l of this.layers) {
      l.time += k * l.speed;
      const len = this.clipLength(l.clip);
      if (len > 0) l.time = l.loop ? l.time % len : Math.min(l.time, len);
    }
    if (this._fadeDuration > 0 && this.layers.length > 1) {
      this._fadeTime += dt;
      const w = Math.min(1, this._fadeTime / this._fadeDuration);
      this.layers[this.layers.length - 1].weight = w;
      this.layers[0].weight = 1 - w;
      if (w >= 1) {
        this.layers.splice(0, this.layers.length - 1);
        this._fadeDuration = 0;
      }
    }
    this._stateTime += k;
    this.evaluateFsm();
  }

  private evaluateFsm(): void {
    const d = this._fsmData;
    const cur = this._state;
    if (!d || !cur) {
      this._triggers.clear();
      return;
    }
    // time in the state in clip lengths (not wrapped: exitTime 1 on a looping clip = one full loop)
    const stateNorm = (this._stateTime * (cur.speed ?? 1)) / (this.clipLength(cur.clip) || 1);
    for (const t of d.transitions) {
      if (t.from !== '*' && t.from !== cur.name) continue;
      if (t.to === cur.name && t.from === '*') continue;
      if (t.exitTime !== undefined && t.exitTime !== null && t.exitTime >= 0 && stateNorm < t.exitTime) continue;
      if (!conditionsMet(t, this._params, this._triggers, this._types)) continue;
      for (const c of t.conditions) if (this._types.get(c.param) === 'trigger') this._triggers.delete(c.param);
      this.setState(t.to, t.duration ?? this.crossFade);
      break;
    }
    // unused triggers last one frame
    this._triggers.clear();
  }
}

Types.register(Motion, 'Motion', 'component', { menu: 'Animation/Motion', single: true });
