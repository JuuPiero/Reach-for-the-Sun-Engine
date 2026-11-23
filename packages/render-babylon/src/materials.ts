import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math';
import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters';
import type { Scene as BScene } from '@babylonjs/core/scene';
import { Assets, type Material } from '@rs/core';

/**
 * Material assets → Babylon StandardMaterials (one per Material, shared by every mesh using it, refreshed from the asset's fields
 * once per frame). Metallic / roughness are mapped onto Blinn-Phong (specular colour / power) so materials match the inline mesh
 * surfaces and the scene's lights without an environment map.
 */
export class MaterialCache {
  private readonly mats = new Map<Material, { mat: StandardMaterial; gen: number }>();
  private readonly textures = new Map<string, Texture>();
  private gen = 0;
  /** Sky reflection (EnvironmentRenderer.reflection), applied to glossy / metallic materials. */
  reflection: Texture | null = null;

  constructor(private readonly scene: BScene) {}

  /** Call at the start of each sync. */
  beginFrame(): void {
    this.gen++;
  }

  /** Shared texture of a path at a tiling (textures with different tilings are separate objects). */
  texture(path: string, tiling = 1, hasAlpha = false): Texture {
    const key = `${path}|${tiling}|${hasAlpha ? 1 : 0}`;
    let t = this.textures.get(key);
    if (!t) {
      t = new Texture(Assets.url(path), this.scene);
      t.uScale = t.vScale = tiling;
      t.hasAlpha = hasAlpha;
      this.textures.set(key, t);
    }
    return t;
  }

  get(m: Material): StandardMaterial {
    let e = this.mats.get(m);
    if (!e) {
      e = { mat: new StandardMaterial(`mat:${m.path ?? 'material'}`, this.scene), gen: 0 };
      this.mats.set(m, e);
    }
    if (e.gen !== this.gen) {
      e.gen = this.gen;
      apply(e.mat, m, this);
    }
    return e.mat;
  }

  /** Forget materials no longer referenced (after a sync). */
  prune(): void {
    for (const [m, e] of this.mats)
      if (e.gen !== this.gen) {
        e.mat.dispose();
        this.mats.delete(m);
      }
  }

  dispose(): void {
    for (const e of this.mats.values()) e.mat.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.mats.clear();
    this.textures.clear();
  }
}

const tmp = new Color3();
function apply(mat: StandardMaterial, m: Material, cache: MaterialCache): void {
  const cutout = m.blend === 'Cutout';
  const tex = m.texture ? cache.texture(m.texture, m.tiling, cutout || m.blend === 'Transparent') : null;
  const rough = Math.min(1, Math.max(0, m.roughness));
  const metal = Math.min(1, Math.max(0, m.metallic));
  const gloss = (1 - rough) * (1 - rough);
  mat.disableLighting = m.unlit;
  if (m.unlit) {
    // unlit: the colour shows as is; with a texture, the texture shows (StandardMaterial adds emissive colour + texture)
    mat.diffuseColor.set(0, 0, 0);
    if (tex) mat.emissiveColor.set(0, 0, 0);
    else mat.emissiveColor.copyFrom(m.color);
    mat.emissiveTexture = tex;
    mat.diffuseTexture = null;
    mat.specularColor.set(0, 0, 0);
  } else {
    // metals get their look from reflections when the scene has a sky: less diffuse then
    mat.diffuseColor.copyFrom(m.color).scaleToRef(1 - metal * (cache.reflection ? 0.85 : 0.5), mat.diffuseColor);
    mat.diffuseTexture = tex;
    // dielectrics: faint white highlights; metals: tinted, strong
    Color3.LerpToRef(tmp.set(0.5, 0.5, 0.5), m.color, metal, tmp);
    tmp.scaleToRef(gloss * (0.35 + metal * 0.9), mat.specularColor);
    mat.specularPower = 4 + gloss * 252;
    m.emissive.scaleToRef(m.emissiveIntensity, mat.emissiveColor);
    mat.emissiveTexture = m.emissiveMap ? cache.texture(m.emissiveMap, m.tiling) : null;
  }
  // environment reflection: metals reflect strongly (tinted), smooth dielectrics a little, mostly at grazing angles;
  // the intensity is per material through Fresnel colours (the reflection texture is shared)
  const refl = !m.unlit ? cache.reflection : null;
  const strength = refl ? metal * (1 - rough * 0.85) + (1 - metal) * 0.12 * gloss : 0;
  if (refl && strength > 0.01) {
    mat.reflectionTexture = refl;
    const f = (mat.reflectionFresnelParameters ??= new FresnelParameters());
    f.bias = 0.05;
    f.power = metal > 0.5 ? 1 : 3;
    f.leftColor.set(strength, strength, strength).scaleInPlace(1.2);
    if (metal > 0.5) m.color.scaleToRef(strength, f.rightColor);
    else f.rightColor.set(strength * 0.25, strength * 0.25, strength * 0.25);
    mat.useReflectionFresnelFromSpecular = false;
  } else if (mat.reflectionTexture) mat.reflectionTexture = null;
  const bump = m.normalMap && !m.unlit ? cache.texture(m.normalMap, m.tiling) : null;
  if (mat.bumpTexture !== bump) mat.bumpTexture = bump;
  if (bump) bump.level = m.normalStrength;
  mat.backFaceCulling = !m.doubleSided;
  mat.twoSidedLighting = m.doubleSided;
  // blending
  mat.alpha = m.blend === 'Transparent' || m.blend === 'Additive' ? m.opacity : 1;
  mat.alphaMode = m.blend === 'Additive' ? 1 /* ALPHA_ADD */ : 2; /* ALPHA_COMBINE */
  mat.transparencyMode = m.blend === 'Opaque' ? 0 : cutout ? 1 : 2; // OPAQUE / ALPHATEST / ALPHABLEND
  mat.alphaCutOff = m.alphaCutoff;
  mat.useAlphaFromDiffuseTexture = !!tex && (cutout || m.blend === 'Transparent');
  if (m.blend === 'Additive') mat.disableDepthWrite = true;
  else mat.disableDepthWrite = false;
}
