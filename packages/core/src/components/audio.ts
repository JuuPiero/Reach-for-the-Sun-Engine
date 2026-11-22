import { AudioEngine, setPannerPosition } from '../Audio';
import { Component } from '../GameObject';
import { field, Types } from '../reflection';

/**
 * AudioSource — plays a clip (wav / mp3 / ogg) from its GameObject: 2D or spatial (3D, attenuated by distance from the
 * AudioListener). `playOnStart` starts it when play mode begins; `play()`, `stop()`, `pause()`, `playOneShot(path)` from scripts.
 */
export class AudioSource extends Component {
  @field({ type: 'asset', assetKind: ['wav', 'mp3', 'ogg'] }) clip = '';
  @field({ min: 0, max: 1, step: 0.01 }) volume = 1;
  @field({ min: 0.1, max: 3, step: 0.05 }) pitch = 1;
  loop = false;
  playOnStart = false;
  /** 3D: positioned at the object, quieter with distance. */
  spatial = true;
  @field({ min: 0.01, step: 0.5 }) minDistance = 2;
  @field({ min: 0.1, step: 1 }) maxDistance = 40;

  private _src: AudioBufferSourceNode | null = null;
  private _gain: GainNode | null = null;
  private _panner: PannerNode | null = null;
  private _startedAt = 0;
  private _offset = 0;
  private _playing = false;
  private _token = 0;

  get isPlaying(): boolean {
    return this._playing;
  }

  start(): void {
    if (this.playOnStart && this.clip) this.play();
  }

  /** Plays the clip from the start (or from where `pause()` stopped). */
  play(): void {
    const ctx = AudioEngine.context;
    const out = AudioEngine.output;
    if (!ctx || !out || !this.clip) return;
    this.stopNode();
    const token = ++this._token;
    this._playing = true;
    void AudioEngine.load(this.clip).then((buf) => {
      if (!buf || token !== this._token || !this._playing) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = this.loop;
      src.playbackRate.value = this.pitch;
      const g = ctx.createGain();
      g.gain.value = this.volume;
      src.connect(g);
      if (this.spatial) {
        const p = ctx.createPanner();
        p.panningModel = 'HRTF';
        p.distanceModel = 'inverse';
        p.refDistance = this.minDistance;
        p.maxDistance = this.maxDistance;
        p.rolloffFactor = 1;
        g.connect(p).connect(out);
        this._panner = p;
        this.updatePanner();
      } else g.connect(out);
      src.onended = () => {
        if (this._src === src && !src.loop) {
          this._playing = false;
          this._offset = 0;
        }
      };
      const offset = this._offset % buf.duration;
      src.start(0, offset);
      this._startedAt = ctx.currentTime - offset / this.pitch;
      this._src = src;
      this._gain = g;
    });
  }

  /** Stops and rewinds. */
  stop(): void {
    this._token++;
    this.stopNode();
    this._playing = false;
    this._offset = 0;
  }

  /** Stops, remembering the position (`play()` resumes). */
  pause(): void {
    const ctx = AudioEngine.context;
    if (ctx && this._src) this._offset = (ctx.currentTime - this._startedAt) * this.pitch;
    this._token++;
    this.stopNode();
    this._playing = false;
  }

  /** A one-off sound at this object (doesn't interrupt the clip). */
  playOneShot(path: string, volume = 1): void {
    void AudioEngine.playClip(path, volume * this.volume, this.spatial ? this.transform.position : undefined, this.pitch);
  }

  update(): void {
    if (this._gain) this._gain.gain.value = this.volume;
    if (this._src) {
      this._src.playbackRate.value = this.pitch;
      this._src.loop = this.loop;
    }
    this.updatePanner();
  }

  onDestroy(): void {
    this.stop();
  }

  private updatePanner(): void {
    if (!this._panner) return;
    const p = this.transform.position;
    setPannerPosition(this._panner, p.x, p.y, p.z);
  }

  private stopNode(): void {
    if (this._src) {
      try {
        this._src.onended = null;
        this._src.stop();
      } catch {
        /* not started */
      }
      this._src.disconnect();
    }
    this._gain?.disconnect();
    this._panner?.disconnect();
    this._src = null;
    this._gain = null;
    this._panner = null;
  }
}

/** The ears of the scene (usually on the main camera): spatial sounds are heard from its position / orientation. */
export class AudioListener extends Component {
  update(): void {
    this.apply();
  }
  start(): void {
    this.apply();
  }
  private apply(): void {
    const ctx = AudioEngine.context;
    if (!ctx) return;
    const l = ctx.listener;
    const p = this.transform.position;
    const f = this.transform.forward;
    const u = this.transform.up;
    // mirror Z (Web Audio is right-handed)
    if (l.positionX) {
      l.positionX.value = p.x;
      l.positionY.value = p.y;
      l.positionZ.value = -p.z;
      l.forwardX.value = f.x;
      l.forwardY.value = f.y;
      l.forwardZ.value = -f.z;
      l.upX.value = u.x;
      l.upY.value = u.y;
      l.upZ.value = -u.z;
    } else {
      l.setPosition(p.x, p.y, -p.z);
      l.setOrientation(f.x, f.y, -f.z, u.x, u.y, -u.z);
    }
  }
}

Types.register(AudioSource, 'AudioSource', 'component', { menu: 'Audio/AudioSource' });
Types.register(AudioListener, 'AudioListener', 'component', { menu: 'Audio/AudioListener', single: true });
