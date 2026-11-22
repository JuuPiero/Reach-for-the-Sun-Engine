/** Frame time of play mode (RE's via.Application: DeltaTime, UpTime, FrameCount). */
export const Application = {
  /** Seconds since the previous frame × timeScale (clamped to 0.1 s). */
  deltaTime: 0,
  /** Unscaled frame time. */
  unscaledDeltaTime: 0,
  /** Seconds of play (scaled). */
  time: 0,
  frameCount: 0,
  timeScale: 1,
  /** @internal */
  _tick(dt: number): void {
    const d = Math.min(Math.max(dt, 0), 0.1);
    this.unscaledDeltaTime = d;
    this.deltaTime = d * this.timeScale;
    this.time += this.deltaTime;
    this.frameCount++;
  },
  /** @internal new play session. */
  _reset(): void {
    this.deltaTime = this.unscaledDeltaTime = this.time = 0;
    this.frameCount = 0;
    this.timeScale = 1;
  },
};
