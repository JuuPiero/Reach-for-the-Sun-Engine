import { Application, Assets, Debug, Input, loadScene, Prefab, type Scene } from '@rs/core';
import { BabylonBackend } from '@rs/render-babylon';

/**
 * Runs a scene in a canvas: play mode lifecycle + Babylon rendering, one requestAnimationFrame loop. Used by the packaged game
 * (`main.ts`); the editor drives the same `scene.step` / `backend.sync` / `render` itself.
 */
export class Player {
  readonly backend: BabylonBackend;
  scene: Scene | null = null;
  private raf = 0;
  private last = 0;
  private readonly onResize = () => this.backend.resize();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.backend = new BabylonBackend(canvas);
    Input.attach(canvas);
    window.addEventListener('resize', this.onResize);
  }

  async start(scenePath: string): Promise<void> {
    const scene = await loadScene(scenePath);
    this.scene = scene;
    Prefab.activeScene = scene;
    Application._reset();
    scene.begin();
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = (now - this.last) / 1000;
      this.last = now;
      try {
        scene.step(dt);
      } catch (e) {
        Debug.error(e);
      }
      this.backend.sync(scene);
      this.backend.render();
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.scene?.end();
    Input.detach();
    window.removeEventListener('resize', this.onResize);
    this.backend.dispose();
  }

  static set baseUrl(url: string) {
    Assets.baseUrl = url;
  }
}
