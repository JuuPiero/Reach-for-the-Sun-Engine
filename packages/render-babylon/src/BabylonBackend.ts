import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene as BScene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh as BMesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { DirectionalLight as BDirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { PointLight as BPointLight } from '@babylonjs/core/Lights/pointLight';
import { SpotLight as BSpotLight } from '@babylonjs/core/Lights/spotLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import type { Light } from '@babylonjs/core/Lights/light';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { Camera as BCamera } from '@babylonjs/core/Cameras/camera';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Culling/ray';
import { Color3, Color4, Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { AmbientLight, Application, Assets, Camera, Debug, DirectionalLight, Environment, Mesh, Motion, ParticleSystem, PointLight, SpotLight, type GameObject, type Material as RSMaterial, type Scene } from '@rs/core';
import type { Material as BMaterial } from '@babylonjs/core/Materials/material';
import { MaterialCache } from './materials';
import { EnvironmentRenderer } from './environment';
import { syncParticles, type ParticleEntry } from './particles';
import { DebugLineRenderer } from './debugLines';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import '@babylonjs/core/Animations/animatable';

/**
 * Babylon.js renderer of RS Engine scenes. The scene owns no Babylon objects: every frame `sync(scene)` creates / updates /
 * removes one TransformNode per GameObject and the Babylon meshes, lights and cameras of its components (keyed by component),
 * then `render()` draws. Editor views pass their own camera (`sync(scene, { camera })`).
 */

interface MeshEntry {
  key: string;
  root: TransformNode;
  meshes: AbstractMesh[];
  material: StandardMaterial | null;
  loading: boolean;
  /** Animation clips of a model (paused; driven by a Motion component). */
  anims: Map<string, { group: AnimationGroup; fps: number; from: number; length: number }>;
  clipsReported: object | null;
  /** A model's own materials (restored when its Material override is cleared). */
  ownMaterials: Map<AbstractMesh, BMaterial | null> | null;
}
interface Entry {
  node: TransformNode;
  gen: number;
  mesh?: MeshEntry;
  particles?: ParticleEntry;
  light?: { comp: object; light: Light; shadows: ShadowGenerator | null };
  camera?: { comp: Camera; camera: FreeCamera };
}

export interface SyncOptions {
  /** Draw through this camera instead of the scene's main camera (editor views). */
  camera?: BCamera | null;
  /** Light the view when the scene has no light (editor). */
  defaultLight?: boolean;
  /** Play mode (particle systems follow their play state); false = edit preview. Default true. */
  playing?: boolean;
  /** Simulation speed of particles (default Application.timeScale; the paused editor passes 0). */
  timeScale?: number;
  /** Frame time for edit previews (seconds). */
  dt?: number;
  /** Draw Debug.drawLine lines (default Debug.showLines). */
  debugLines?: boolean;
}

export class BabylonBackend {
  readonly engine: Engine;
  readonly scene: BScene;
  private readonly entries = new Map<GameObject, Entry>();
  private gen = 0;
  private readonly containers = new Map<string, Promise<AssetContainer | null>>();
  private readonly materials: MaterialCache;
  private readonly environment: EnvironmentRenderer;
  private readonly debugLines: DebugLineRenderer;
  private readonly fallbackCamera: FreeCamera;
  private defaultLight: HemisphericLight | null = null;
  /** Main camera of the scene in the last sync (play view), null if none. */
  mainCamera: FreeCamera | null = null;
  /** Count of models still loading (tests wait for 0). */
  pendingLoads = 0;

  constructor(canvas: HTMLCanvasElement, opts: { antialias?: boolean; preserveDrawingBuffer?: boolean } = {}) {
    this.engine = new Engine(canvas, opts.antialias ?? true, { preserveDrawingBuffer: opts.preserveDrawingBuffer ?? true, stencil: true }, true);
    this.scene = new BScene(this.engine);
    this.scene.useRightHandedSystem = false;
    this.fallbackCamera = new FreeCamera('__fallback', new Vector3(0, 2, -8), this.scene);
    this.fallbackCamera.setTarget(Vector3.Zero());
    this.materials = new MaterialCache(this.scene);
    this.environment = new EnvironmentRenderer(this.scene);
    this.debugLines = new DebugLineRenderer(this.scene);
  }

  /** The node mirroring a GameObject (gizmos attach to it). */
  nodeOf(go: GameObject): TransformNode | null {
    return this.entries.get(go)?.node ?? null;
  }

  /** Babylon meshes drawn for a GameObject's Mesh component (selection outlines). */
  meshesOf(go: GameObject): AbstractMesh[] {
    return this.entries.get(go)?.mesh?.meshes ?? [];
  }

  sync(scene: Scene, opts: SyncOptions = {}): void {
    const gen = ++this.gen;
    let lights = 0;
    this.mainCamera = null;
    let clear: Color3 | null = null;
    let env: Environment | null = null;
    this.materials.beginFrame();
    const pf = { playing: opts.playing ?? true, timeScale: opts.timeScale ?? Application.timeScale, dt: opts.dt ?? Application.unscaledDeltaTime, texture: (p: string) => this.materials.texture(p) };
    const shadowGens: ShadowGenerator[] = [];
    const casters: AbstractMesh[] = [];
    const receivers: AbstractMesh[] = [];
    for (const go of scene.allGameObjects()) {
      let e = this.entries.get(go);
      if (!e) {
        e = { node: new TransformNode(`go:${go.id}`, this.scene), gen };
        e.node.rotationQuaternion = new Quaternion();
        this.entries.set(go, e);
      }
      e.gen = gen;
      const t = go.transform;
      e.node.position.copyFrom(t.localPosition);
      e.node.rotationQuaternion!.copyFrom(t.localRotation);
      e.node.scaling.copyFrom(t.localScale);
      const visible = go.visibleInHierarchy;
      const active = go.activeInHierarchy;
      // components
      const mesh = go.getComponent(Mesh);
      if (mesh) {
        this.syncMesh(go, e, mesh, visible && mesh.enabled);
        if (e.mesh && visible && mesh.enabled)
          for (const m of e.mesh.meshes) {
            if (mesh.castShadows) casters.push(m);
            m.receiveShadows = mesh.receiveShadows;
            if (mesh.receiveShadows) receivers.push(m);
          }
      } else if (e.mesh) this.disposeMesh(e);
      const light = go.getComponent(DirectionalLight) ?? go.getComponent(PointLight) ?? go.getComponent(SpotLight) ?? go.getComponent(AmbientLight);
      if (light) {
        const on = active && light.enabled;
        this.syncLight(e, light, t.worldMatrix);
        e.light!.light.setEnabled(on);
        if (on) {
          lights++;
          if (e.light!.shadows) shadowGens.push(e.light!.shadows);
        }
      } else if (e.light) this.disposeLight(e);
      const cam = go.getComponent(Camera);
      if (cam) {
        if (!e.camera) {
          const c = new FreeCamera(`cam:${go.id}`, Vector3.Zero(), this.scene);
          c.rotationQuaternion = new Quaternion();
          e.camera = { comp: cam, camera: c };
        }
        e.camera.comp = cam;
        const c = e.camera.camera;
        c.fov = (cam.fov * Math.PI) / 180;
        c.minZ = cam.near;
        c.maxZ = cam.far;
        t.worldMatrix.decompose(undefined, c.rotationQuaternion!, c.position);
        if (!this.mainCamera && cam.enabled && cam.main && active) {
          this.mainCamera = c;
          clear = cam.clearColor;
        }
      } else if (e.camera) {
        e.camera.camera.dispose();
        e.camera = undefined;
      }
      const ps = go.getComponent(ParticleSystem);
      if (ps) e.particles = syncParticles(this.scene, e.node, ps, e.particles, visible && ps.enabled, pf);
      else if (e.particles) {
        e.particles.ps.dispose(false);
        e.particles = undefined;
      }
      if (!env) {
        const en = go.getComponent(Environment);
        if (en?.enabled && active) env = en;
      }
    }
    // parents (after every node exists)
    for (const [go, e] of this.entries) {
      if (e.gen !== gen) continue;
      const p = go.parent ? (this.entries.get(go.parent)?.node ?? null) : null;
      if (e.node.parent !== p) e.node.parent = p;
    }
    // removed objects
    for (const [go, e] of this.entries) if (e.gen !== gen) this.disposeEntry(go, e);
    // shadows: every caster in every shadow map
    for (const g of shadowGens) {
      const map = g.getShadowMap();
      if (map) map.renderList = casters;
    }
    // lights / camera / background
    if (opts.defaultLight && lights === 0) {
      if (!this.defaultLight) {
        this.defaultLight = new HemisphericLight('__default', new Vector3(0.3, 1, -0.4), this.scene);
        this.defaultLight.intensity = 0.9;
      }
      this.defaultLight.setEnabled(true);
    } else this.defaultLight?.setEnabled(false);
    const camera = opts.camera ?? this.mainCamera ?? this.fallbackCamera;
    if (this.scene.activeCamera !== camera) this.scene.activeCamera = camera;
    this.scene.clearColor = this.environment.sync(env, camera, clear ?? new Color3(0.16, 0.17, 0.2));
    this.materials.prune();
    this.debugLines.sync((opts.debugLines ?? Debug.showLines) ? Debug._lines : []);
    void receivers;
  }

  render(): void {
    this.scene.render();
  }

  resize(): void {
    this.engine.resize();
  }

  /** GameObject under a canvas point (CSS pixels), or null. */
  pick(x: number, y: number): GameObject | null {
    const r = this.scene.pick(x * (this.engine.getRenderWidth() / (this.engine.getRenderingCanvas()!.clientWidth || 1)), y * (this.engine.getRenderHeight() / (this.engine.getRenderingCanvas()!.clientHeight || 1)), (m) => m.isPickable && m.isEnabled() && m.isVisible);
    let n = r?.pickedMesh ?? null;
    while (n) {
      const go = (n.metadata as { rsObject?: GameObject } | null)?.rsObject;
      if (go) return go;
      n = n.parent as AbstractMesh | null;
    }
    return null;
  }

  dispose(): void {
    this.materials.dispose();
    this.environment.dispose();
    this.debugLines.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  // ---- meshes -----------------------------------------------------------------------------------------------------------

  private syncMesh(go: GameObject, e: Entry, c: Mesh, visible: boolean): void {
    const key = c.shape === 'Model' ? `Model:${c.model}` : c.shape;
    if (e.mesh && e.mesh.key !== key) this.disposeMesh(e);
    if (!e.mesh) {
      const root = new TransformNode(`mesh:${go.id}`, this.scene);
      root.parent = e.node;
      e.mesh = { key, root, meshes: [], material: null, loading: false, anims: new Map(), clipsReported: null, ownMaterials: null };
      if (c.shape === 'Model') this.loadModel(go, e.mesh, c.model);
      else {
        const m = this.primitive(c.shape, `prim:${go.id}`);
        m.parent = root;
        e.mesh.meshes.push(m);
        this.tagMesh(m, go);
      }
    }
    const me = e.mesh;
    me.root.setEnabled(visible);
    this.syncMotion(me, go.getComponent(Motion));
    const asset = c.material as RSMaterial | null;
    if (asset) {
      // Material asset: shared Babylon material (models remember their own to restore later)
      const mat = this.materials.get(asset);
      if (c.shape === 'Model' && !me.ownMaterials) me.ownMaterials = new Map(me.meshes.map((m) => [m, m.material]));
      for (const m of me.meshes) {
        if (me.ownMaterials && !me.ownMaterials.has(m)) me.ownMaterials.set(m, m.material);
        if (m.material !== mat) m.material = mat;
      }
    } else if (c.shape === 'Model') {
      if (me.ownMaterials) {
        for (const [m, own] of me.ownMaterials) m.material = own;
        me.ownMaterials = null;
      }
    } else {
      if (!me.material) me.material = new StandardMaterial(`mat:${go.id}`, this.scene);
      const mat = me.material;
      mat.diffuseColor.copyFrom(c.color);
      mat.emissiveColor.copyFrom(c.emissive);
      mat.specularColor.set(c.specular, c.specular, c.specular);
      const tex = c.texture ? this.materials.texture(c.texture, c.tiling) : null;
      if (mat.diffuseTexture !== tex) mat.diffuseTexture = tex;
      for (const m of me.meshes) if (m.material !== mat) m.material = mat;
    }
  }

  private primitive(shape: string, name: string): BMesh {
    switch (shape) {
      case 'Sphere':
        return CreateSphere(name, { diameter: 1, segments: 24 }, this.scene);
      case 'Cylinder':
        return CreateCylinder(name, { height: 1, diameter: 1, tessellation: 32 }, this.scene);
      case 'Capsule':
        return CreateCapsule(name, { height: 2, radius: 0.5, tessellation: 24 }, this.scene);
      case 'Plane':
        return CreatePlane(name, { size: 1, sideOrientation: BMesh.DOUBLESIDE }, this.scene);
      case 'Ground':
        return CreateGround(name, { width: 1, height: 1 }, this.scene);
      case 'Torus':
        return CreateTorus(name, { diameter: 1, thickness: 0.3, tessellation: 32 }, this.scene);
      default:
        return CreateBox(name, { size: 1 }, this.scene);
    }
  }

  private tagMesh(m: AbstractMesh, go: GameObject): void {
    m.metadata = { ...(m.metadata ?? {}), rsObject: go };
    m.isPickable = true;
  }

  private loadModel(go: GameObject, me: MeshEntry, path: string): void {
    if (!path) return;
    let p = this.containers.get(path);
    if (!p) {
      this.pendingLoads++;
      p = LoadAssetContainerAsync(Assets.url(path), this.scene)
        .catch((err) => {
          console.error(`Model ${path}: ${err?.message ?? err}`);
          return null;
        })
        .finally(() => this.pendingLoads--);
      this.containers.set(path, p);
    }
    me.loading = true;
    this.pendingLoads++;
    void p.then((container) => {
      this.pendingLoads--;
      me.loading = false;
      if (!container || me.root.isDisposed()) return;
      const inst = container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
      for (const n of inst.rootNodes) n.parent = me.root;
      for (const n of inst.rootNodes) for (const m of n.getChildMeshes(false)) (me.meshes.push(m), this.tagMesh(m, go));
      for (const n of inst.rootNodes) if ((n as AbstractMesh).getTotalVertices) (me.meshes.push(n as AbstractMesh), this.tagMesh(n as AbstractMesh, go));
      // clips: started and paused; a Motion component sets their frame / weight every sync
      for (const g of inst.animationGroups) {
        const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 60;
        g.start(true, 1, g.from, g.to, false);
        g.pause();
        g.weight = 0;
        me.anims.set(g.name, { group: g, fps, from: g.from, length: (g.to - g.from) / fps });
      }
      me.clipsReported = null;
    });
  }

  /** Applies a Motion's layers to the model's clips (frame + weight); without Motion the model keeps its rest pose. */
  private syncMotion(me: MeshEntry, motion: Motion | null): void {
    if (!me.anims.size) return;
    if (motion && me.clipsReported !== motion) {
      motion._setClips(new Map([...me.anims].map(([n, a]) => [n, a.length])));
      me.clipsReported = motion;
    }
    for (const [name, a] of me.anims) {
      const layer = motion?.enabled ? motion.layers.find((l) => l.clip === name) : undefined;
      const w = layer ? layer.weight : 0;
      if (a.group.weight !== w) a.group.weight = w;
      if (layer) a.group.goToFrame(a.from + Math.min(layer.time, a.length) * a.fps);
    }
  }

  private disposeMesh(e: Entry): void {
    if (!e.mesh) return;
    e.mesh.root.dispose(false, false);
    e.mesh.material?.dispose();
    e.mesh = undefined;
  }

  // ---- lights -----------------------------------------------------------------------------------------------------------

  private syncLight(e: Entry, c: DirectionalLight | PointLight | SpotLight | AmbientLight, world: Matrix): void {
    if (e.light && e.light.comp.constructor !== c.constructor) this.disposeLight(e);
    const node = e.node;
    if (!e.light) {
      let light: Light;
      let shadows: ShadowGenerator | null = null;
      if (c instanceof DirectionalLight) {
        const l = new BDirectionalLight(`dir:${node.name}`, new Vector3(0, -1, 0), this.scene);
        l.position = new Vector3(0, 30, 0);
        light = l;
      } else if (c instanceof SpotLight) light = new BSpotLight(`spot:${node.name}`, Vector3.Zero(), Vector3.Forward(), Math.PI / 4, 2, this.scene);
      else if (c instanceof PointLight) light = new BPointLight(`point:${node.name}`, Vector3.Zero(), this.scene);
      else light = new HemisphericLight(`amb:${node.name}`, Vector3.Up(), this.scene);
      e.light = { comp: c, light, shadows };
    }
    const L = e.light.light;

    const pos = Vector3.TransformCoordinates(Vector3.Zero(), world);
    const fwd = Vector3.TransformNormal(Vector3.Forward(), world).normalize();
    if (c instanceof AmbientLight) {
      const h = L as HemisphericLight;
      h.diffuse.copyFrom(c.skyColor);
      h.groundColor.copyFrom(c.groundColor);
      h.specular.set(0, 0, 0);
      h.intensity = c.intensity;
      return;
    }
    L.diffuse.copyFrom(c.color);
    L.specular.copyFrom(c.color);
    L.intensity = c.intensity;
    if (c instanceof DirectionalLight) {
      const d = L as BDirectionalLight;
      d.direction.copyFrom(fwd);
      d.position.copyFrom(fwd.scale(-40));
      this.ensureShadows(e, c.shadows);
    } else if (c instanceof SpotLight) {
      const s = L as BSpotLight;
      s.position.copyFrom(pos);
      s.direction.copyFrom(fwd);
      s.angle = (c.angle * Math.PI) / 180;
      s.range = c.range;
      this.ensureShadows(e, c.shadows);
    } else {
      const p = L as BPointLight;
      p.position.copyFrom(pos);
      p.range = (c as PointLight).range;
    }
  }

  private ensureShadows(e: Entry, on: boolean): void {
    const l = e.light!;
    if (on && !l.shadows) {
      const g = new ShadowGenerator(2048, l.light as BDirectionalLight);
      g.usePercentageCloserFiltering = true;
      g.bias = 0.0005;
      g.normalBias = 0.01;
      l.shadows = g;
    } else if (!on && l.shadows) {
      l.shadows.dispose();
      l.shadows = null;
    }
  }

  private disposeLight(e: Entry): void {
    e.light?.shadows?.dispose();
    e.light?.light.dispose();
    e.light = undefined;
  }

  private disposeEntry(go: GameObject, e: Entry): void {
    this.disposeMesh(e);
    this.disposeLight(e);
    e.particles?.ps.dispose(false);
    e.camera?.camera.dispose();
    e.node.dispose();
    this.entries.delete(go);
  }
}

export { Matrix };
