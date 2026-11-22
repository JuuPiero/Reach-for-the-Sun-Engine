import { Application, Assets, Debug, Input, loadScene, SaveData, SceneManager, Screen, type Scene } from '@rs/core';
import { BabylonBackend } from '@rs/render-babylon';
import { initPhysics } from 'virtual:rs/physics';
import { UIRenderer } from './UIRenderer';

/**
 * Runs scenes in a canvas: play mode lifecycle, Babylon rendering, the UI overlay, scene switching (SceneManager.load), one
 * requestAnimationFrame loop. Used by the packaged game (`main.ts`); the editor drives the same pieces itself.
 */
export class Player {
  readonly backend: BabylonBackend;
  readonly ui: UIRenderer;
  scene: Scene | null = null;
  private raf = 0;
  private last = 0;
  private pending: { path: string; resolve: (s: Scene) => void; reject: (e: unknown) => void } | null = null;
  private readonly onResize = () => {
    this.backend.resize();
    Screen._set(this.canvas.clientWidth, this.canvas.clientHeight, window.devicePixelRatio || 1);
  };

  constructor(readonly canvas: HTMLCanvasElement, projectName = 'game') {
    this.backend = new BabylonBackend(canvas);
    const host = canvas.parentElement ?? document.body;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    this.ui = new UIRenderer(host, { interactive: () => true });
    Input.attach(canvas);
    SaveData.namespace = projectName;
    window.addEventListener('resize', this.onResize);
    this.onResize();
    SceneManager._setHost({
      load: (path) =>
        new Promise<Scene>((resolve, reject) => {
          this.pending = { path, resolve, reject };
        }),
    });
  }

  async start(scenePath: string): Promise<void> {
    await initPhysics();
    this.setScene(await loadScene(scenePath));
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = (now - this.last) / 1000;
      this.last = now;
      const scene = this.scene;
      if (!scene) return;
      try {
        scene.step(dt);
      } catch (e) {
        Debug.error(e);
      }
      this.backend.sync(scene);
      this.ui.sync(scene);
      this.backend.render();
      if (this.pending) void this.switchScene();
    };
    this.raf = requestAnimationFrame(frame);
  }

  private setScene(scene: Scene): void {
    this.scene = scene;
    SceneManager._setActive(scene);
    Application._reset();
    scene.begin();
  }

  /** SceneManager.load: end the current scene, start the new one (between frames). */
  private async switchScene(): Promise<void> {
    const p = this.pending!;
    this.pending = null;
    try {
      const next = await loadScene(p.path);
      const keep = this.scene?._takePersistent() ?? [];
      this.scene?.end();
      this.setScene(next);
      SceneManager._carry(keep, next);
      p.resolve(next);
    } catch (e) {
      Debug.error(`SceneManager.load(${p.path}): ${(e as Error).message}`);
      p.reject(e);
    }
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.scene?.end();
    Input.detach();
    window.removeEventListener('resize', this.onResize);
    this.ui.dispose();
    this.backend.dispose();
  }

  static set baseUrl(url: string) {
    Assets.baseUrl = url;
  }
}
