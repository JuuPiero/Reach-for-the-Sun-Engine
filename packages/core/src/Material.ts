import { Color3 } from './math';
import { field, Types } from './reflection';
import { UserData } from './UserData';

export const MATERIAL_BLEND_MODES = ['Opaque', 'Cutout', 'Transparent', 'Additive'] as const;
export type MaterialBlendMode = (typeof MATERIAL_BLEND_MODES)[number];
const IMAGES = ['png', 'jpg', 'jpeg', 'webp'];

/**
 * Material asset (`.mat.json`, RE's .mdf material settings): a physically based surface shared by every Mesh that references it
 * (`Mesh.material`). It is a built-in UserData type stored with its own extension, so the Inspector edits it like any UserData
 * and every renderer using it updates live.
 */
export class Material extends UserData {
  @field({ header: 'Surface' }) color = new Color3(1, 1, 1);
  @field({ type: 'asset', assetKind: IMAGES }) texture = '';
  @field({ min: 0, max: 1, step: 0.01 }) metallic = 0;
  @field({ min: 0, max: 1, step: 0.01 }) roughness = 0.6;
  @field({ type: 'asset', assetKind: IMAGES }) normalMap = '';
  @field({ min: 0, max: 3, step: 0.05 }) normalStrength = 1;
  /** Texture repeat (UV scale). */
  @field({ min: 0.01, step: 0.1 }) tiling = 1;
  @field({ header: 'Emission' }) emissive = new Color3(0, 0, 0);
  @field({ min: 0, step: 0.1 }) emissiveIntensity = 1;
  @field({ type: 'asset', assetKind: IMAGES }) emissiveMap = '';
  @field({ type: 'enum', options: MATERIAL_BLEND_MODES, header: 'Rendering' }) blend: MaterialBlendMode = 'Opaque';
  @field({ min: 0, max: 1, step: 0.01 }) opacity = 1;
  /** Cutout: pixels with texture alpha below this are discarded. */
  @field({ min: 0, max: 1, step: 0.01 }) alphaCutoff = 0.5;
  /** No lighting: shows color × texture as is. */
  unlit = false;
  doubleSided = false;
}

Types.register(Material, 'Material', 'userdata', { fileExt: '.mat.json' });
