import { Scene as BScene } from '@babylonjs/core/scene';
import type { Camera as BCamera } from '@babylonjs/core/Cameras/camera';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Mesh as BMesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { Color3, Color4 } from '@babylonjs/core/Maths/math';
import { Assets, type Environment } from '@rs/core';

/** Layer of helper meshes every camera sees (editor cameras included). */
const ALL_LAYERS = 0xffffffff;

/**
 * The scene's Environment component → Babylon: a sky dome (gradient drawn into a small texture, or an equirectangular image) that
 * follows the camera, scene fog, image processing (tone mapping / exposure / contrast / vignette) and an optional
 * DefaultRenderingPipeline (bloom, FXAA) on the camera being drawn.
 */
export class EnvironmentRenderer {
  private dome: BMesh | null = null;
  private domeMat: StandardMaterial | null = null;
  private gradient: DynamicTexture | null = null;
  private gradientKey = '';
  private skyTex: Texture | null = null;
  private skyTexPath = '';
  private reflGradient: DynamicTexture | null = null;
  private reflSky: Texture | null = null;
  private pipeline: DefaultRenderingPipeline | null = null;
  /** Equirectangular reflection of the sky for materials (null without a sky): MaterialCache reads it. */
  reflection: Texture | null = null;
  private pipelineCamera: BCamera | null = null;

  constructor(private readonly scene: BScene) {}

  /** Applies the environment (null = none: camera clear colour, no fog, default image). Returns the clear colour to use. */
  sync(env: Environment | null, camera: BCamera, cameraClear: Color3): Color4 {
    const s = this.scene;
    const ip = s.imageProcessingConfiguration;
    if (!env) {
      this.reflection = null;
      this.dome?.setEnabled(false);
      s.fogMode = BScene.FOGMODE_NONE;
      ip.toneMappingEnabled = false;
      ip.exposure = 1;
      ip.contrast = 1;
      ip.vignetteEnabled = false;
      this.syncPipeline(false, false, camera, env);
      return new Color4(cameraClear.r, cameraClear.g, cameraClear.b, 1);
    }
    // fog
    if (env.fog === 'None') s.fogMode = BScene.FOGMODE_NONE;
    else {
      s.fogMode = env.fog === 'Linear' ? BScene.FOGMODE_LINEAR : BScene.FOGMODE_EXP2;
      s.fogColor.copyFrom(env.fogColor);
      s.fogStart = env.fogStart;
      s.fogEnd = Math.max(env.fogEnd, env.fogStart + 0.01);
      s.fogDensity = env.fogDensity;
    }
    // image processing (applied by the materials)
    ip.toneMappingEnabled = env.toneMapping !== 'None';
    ip.toneMappingType = env.toneMapping === 'ACES' ? ImageProcessingConfiguration.TONEMAPPING_ACES : ImageProcessingConfiguration.TONEMAPPING_STANDARD;
    ip.exposure = env.exposure;
    ip.contrast = env.contrast;
    ip.vignetteEnabled = env.vignette;
    ip.vignetteWeight = env.vignetteWeight;
    // sky
    let clear = cameraClear;
    if (env.sky === 'Camera Color') {
      this.dome?.setEnabled(false);
      this.reflection = null;
    }
    else {
      const mat = this.ensureDome();
      this.dome!.setEnabled(true);
      if (env.sky === 'Gradient') {
        mat.emissiveTexture = this.gradientTexture(env);
        this.reflection = this.reflGradient;
        clear = env.skyHorizon;
      } else {
        mat.emissiveTexture = this.skyTexture(env.skyTexture);
        this.reflection = this.reflSky;
        clear = env.skyHorizon;
      }
      // StandardMaterial adds emissiveColor to the emissive texture: keep it black, the texture level is the intensity
      mat.emissiveColor.set(0, 0, 0);
      if (mat.emissiveTexture) mat.emissiveTexture.level = env.skyIntensity;
    }
    if (env.fog !== 'None' && env.sky === 'Camera Color') clear = env.fogColor;
    this.syncPipeline(env.bloom, env.fxaa, camera, env);
    return new Color4(clear.r, clear.g, clear.b, 1);
  }

  private ensureDome(): StandardMaterial {
    if (!this.dome) {
      const d = CreateSphere('__sky', { diameter: 800, segments: 24, sideOrientation: 1 /* BACKSIDE */ }, this.scene);
      d.infiniteDistance = true;
      d.isPickable = false;
      d.applyFog = false;
      d.layerMask = ALL_LAYERS;
      d.alwaysSelectAsActiveMesh = true;
      const m = new StandardMaterial('__skyMat', this.scene);
      m.disableLighting = true;
      m.diffuseColor.set(0, 0, 0);
      m.specularColor.set(0, 0, 0);
      m.backFaceCulling = false;
      m.fogEnabled = false;
      m.disableDepthWrite = true;
      d.material = m;
      d.renderingGroupId = 0;
      this.dome = d;
      this.domeMat = m;
    }
    return this.domeMat!;
  }

  private gradientTexture(env: Environment): DynamicTexture {
    const key = [env.skyTop, env.skyHorizon, env.skyBottom].map((c) => `${c.r.toFixed(3)},${c.g.toFixed(3)},${c.b.toFixed(3)}`).join('|');
    if (this.gradient && key === this.gradientKey) return this.gradient;
    if (!this.gradient) this.gradient = new DynamicTexture('__skyGradient', { width: 4, height: 256 }, this.scene, false);
    this.gradientKey = key;
    // the same picture as an equirectangular reflection map (a separate texture: its sampling mode differs)
    if (!this.reflGradient) {
      this.reflGradient = new DynamicTexture('__skyReflection', { width: 4, height: 256 }, this.scene, false);
      this.reflGradient.coordinatesMode = Texture.EQUIRECTANGULAR_MODE;
    }
    this.drawGradient(this.reflGradient, env, true);
    this.drawGradient(this.gradient, env, false);
    this.gradient.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.gradient.wrapV = Texture.CLAMP_ADDRESSMODE;
    return this.gradient;
  }

  private drawGradient(tex: DynamicTexture, env: Environment, reflection: boolean): void {
    const ctx = tex.getContext();
    const css = (c: Color3) => `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
    // dome: the canvas bottom row (y = 256) maps to the top of the sphere; reflection maps run top-down
    const g = reflection ? ctx.createLinearGradient(0, 0, 0, 256) : ctx.createLinearGradient(0, 256, 0, 0);
    // the top colour takes over quickly above the horizon (a thin bright band, like a real sky)
    const mid = Color3.Lerp(env.skyTop, env.skyHorizon, 0.45);
    g.addColorStop(0, css(env.skyTop));
    g.addColorStop(0.3, css(Color3.Lerp(env.skyTop, mid, 0.5)));
    g.addColorStop(0.44, css(mid));
    g.addColorStop(0.495, css(env.skyHorizon));
    g.addColorStop(0.52, css(env.skyHorizon));
    g.addColorStop(1, css(env.skyBottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    tex.update(true);
  }

  private skyTexture(path: string): Texture | null {
    if (!path) return null;
    if (this.skyTex && this.skyTexPath === path) return this.skyTex;
    this.skyTex?.dispose();
    this.reflSky?.dispose();
    this.skyTex = new Texture(Assets.url(path), this.scene);
    this.skyTex.uScale = -1; // seen from inside
    this.reflSky = new Texture(Assets.url(path), this.scene);
    this.reflSky.coordinatesMode = Texture.EQUIRECTANGULAR_MODE;
    this.skyTexPath = path;
    return this.skyTex;
  }

  private syncPipeline(bloom: boolean, fxaa: boolean, camera: BCamera, env: Environment | null): void {
    if (!bloom && !fxaa) {
      if (this.pipeline) {
        this.pipeline.dispose();
        this.pipeline = null;
        this.pipelineCamera = null;
      }
      return;
    }
    if (!this.pipeline || this.pipelineCamera !== camera) {
      this.pipeline?.dispose();
      this.pipeline = new DefaultRenderingPipeline('__rsPipeline', false, this.scene, [camera]);
      this.pipeline.imageProcessingEnabled = false; // materials apply the scene's image processing
      this.pipelineCamera = camera;
    }
    const p = this.pipeline;
    p.fxaaEnabled = fxaa;
    p.bloomEnabled = bloom;
    if (bloom && env) {
      p.bloomThreshold = env.bloomThreshold;
      p.bloomWeight = env.bloomWeight;
      p.bloomKernel = 64;
      p.bloomScale = 0.5;
    }
  }

  dispose(): void {
    this.pipeline?.dispose();
    this.dome?.dispose();
    this.domeMat?.dispose();
    this.gradient?.dispose();
    this.reflGradient?.dispose();
    this.reflSky?.dispose();
    this.skyTex?.dispose();
  }
}
