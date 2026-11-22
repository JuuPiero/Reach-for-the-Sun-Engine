import { Component } from '../GameObject';
import { Color3 } from '../math';
import { field, Types } from '../reflection';

export const SKY_MODES = ['Camera Color', 'Gradient', 'Texture'] as const;
export const FOG_MODES = ['None', 'Linear', 'Exponential'] as const;
export const TONE_MAPPINGS = ['None', 'Standard', 'ACES'] as const;

/**
 * Scene look (RE's environment / post-processing settings): sky, fog and image processing. One per scene — the renderer uses the
 * first enabled one on an active object; without one the camera's clear colour is the sky and nothing is post-processed.
 */
export class Environment extends Component {
  @field({ type: 'enum', options: SKY_MODES, header: 'Sky' }) sky: (typeof SKY_MODES)[number] = 'Gradient';
  @field({ visibleIf: (e: Environment) => e.sky === 'Gradient' }) skyTop = new Color3(0.24, 0.45, 0.82);
  @field({ visibleIf: (e: Environment) => e.sky === 'Gradient' }) skyHorizon = new Color3(0.72, 0.83, 0.95);
  @field({ visibleIf: (e: Environment) => e.sky === 'Gradient' }) skyBottom = new Color3(0.36, 0.34, 0.32);
  /** Equirectangular (360°) image. */
  @field({ type: 'asset', assetKind: ['png', 'jpg', 'jpeg', 'webp'], visibleIf: (e: Environment) => e.sky === 'Texture' }) skyTexture = '';
  @field({ min: 0, step: 0.05, visibleIf: (e: Environment) => e.sky !== 'Camera Color' }) skyIntensity = 1;

  @field({ type: 'enum', options: FOG_MODES, header: 'Fog' }) fog: (typeof FOG_MODES)[number] = 'None';
  @field({ visibleIf: (e: Environment) => e.fog !== 'None' }) fogColor = new Color3(0.72, 0.8, 0.9);
  @field({ min: 0, visibleIf: (e: Environment) => e.fog === 'Linear' }) fogStart = 20;
  @field({ min: 0, visibleIf: (e: Environment) => e.fog === 'Linear' }) fogEnd = 90;
  @field({ min: 0, step: 0.002, visibleIf: (e: Environment) => e.fog === 'Exponential' }) fogDensity = 0.02;

  @field({ type: 'enum', options: TONE_MAPPINGS, header: 'Image' }) toneMapping: (typeof TONE_MAPPINGS)[number] = 'None';
  @field({ min: 0, step: 0.05 }) exposure = 1;
  @field({ min: 0, step: 0.05 }) contrast = 1;
  vignette = false;
  @field({ min: 0, max: 10, step: 0.1, visibleIf: (e: Environment) => e.vignette }) vignetteWeight = 1.5;
  @field({ header: 'Post Processing' }) bloom = false;
  @field({ min: 0, max: 1, step: 0.01, visibleIf: (e: Environment) => e.bloom }) bloomThreshold = 0.75;
  @field({ min: 0, max: 3, step: 0.05, visibleIf: (e: Environment) => e.bloom }) bloomWeight = 0.4;
  /** Anti-aliasing of the final image (cheap, softens edges). */
  fxaa = false;
}

Types.register(Environment, 'Environment', 'component', { menu: 'Render/Environment', single: true });
