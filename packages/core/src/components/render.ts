import { Component } from '../GameObject';
import { Color3, Vector3 } from '../math';
import { SceneManager, Screen } from '../SceneManager';
import { field, Types } from '../reflection';
import type { Material } from '../Material';

/** Built-in components drawn by the renderer (render-babylon mirrors them every frame). */

export const MESH_SHAPES = ['Box', 'Sphere', 'Cylinder', 'Capsule', 'Plane', 'Ground', 'Torus', 'Model'] as const;
export type MeshShape = (typeof MESH_SHAPES)[number];

/** Inline surface fields: primitives without a Material asset. */
const inline = (m: Mesh) => !m.material && m.shape !== 'Model';

export class Mesh extends Component {
  @field({ type: 'enum', options: MESH_SHAPES }) shape: MeshShape = 'Box';
  /** glTF / GLB file (shape = Model). */
  @field({ type: 'asset', assetKind: ['glb', 'gltf'], visibleIf: (m: Mesh) => m.shape === 'Model' }) model = '';
  /** Material asset (`.mat.json`); when set it replaces the colour / texture below (and a model's own materials). */
  @field({ type: 'userdata', userDataType: 'Material', header: 'Material' }) material: Material | null = null;
  @field({ visibleIf: inline }) color = new Color3(0.8, 0.8, 0.8);
  @field({ type: 'asset', assetKind: ['png', 'jpg', 'jpeg', 'webp'], visibleIf: inline }) texture = '';
  /** Texture repeat (UV scale). */
  @field({ min: 0.01, step: 0.1, visibleIf: inline }) tiling = 1;
  @field({ visibleIf: inline }) emissive = new Color3(0, 0, 0);
  @field({ min: 0, max: 1, step: 0.01, visibleIf: inline }) specular = 0.2;
  @field({ header: 'Shadows' }) castShadows = true;
  receiveShadows = true;
}

export class Camera extends Component {
  /** Vertical field of view, degrees. */
  @field({ min: 1, max: 179 }) fov = 60;
  @field({ min: 0.001 }) near = 0.1;
  far = 1000;
  clearColor = new Color3(0.16, 0.17, 0.2);
  /** The camera the game draws through (the first enabled main camera). */
  main = true;

  /** World ray through a game-view point (CSS pixels from the top-left, like Input.mouseX / mouseY). */
  screenPointToRay(x: number, y: number): { origin: Vector3; direction: Vector3 } {
    const t = Math.tan((this.fov * Math.PI) / 360);
    const nx = (x / Screen.width) * 2 - 1;
    const ny = 1 - (y / Screen.height) * 2;
    const m = this.transform.worldMatrix;
    const direction = Vector3.TransformNormal(new Vector3(nx * t * Screen.aspect, ny * t, 1), m).normalize();
    return { origin: this.transform.position, direction };
  }

  /** Game-view point (CSS pixels) of a world position, and whether it is in front of the camera. */
  worldToScreenPoint(p: Vector3): { x: number; y: number; visible: boolean } {
    const inv = this.transform.worldMatrix.clone().invert();
    const v = Vector3.TransformCoordinates(p, inv);
    const t = Math.tan((this.fov * Math.PI) / 360);
    const nx = v.x / (v.z * t * Screen.aspect);
    const ny = v.y / (v.z * t);
    return { x: ((nx + 1) / 2) * Screen.width, y: ((1 - ny) / 2) * Screen.height, visible: v.z > 0 };
  }

  /** The camera the game draws through (first enabled main camera of an active object). */
  static get main(): Camera | null {
    const s = SceneManager.active;
    if (!s) return null;
    return s.findComponents(Camera).find((c) => c.enabled && c.main && c.gameObject.activeInHierarchy) ?? null;
  }
}

export class DirectionalLight extends Component {
  color = new Color3(1, 0.97, 0.9);
  @field({ min: 0, step: 0.1 }) intensity = 1.5;
  shadows = true;
}

export class PointLight extends Component {
  color = new Color3(1, 1, 1);
  @field({ min: 0, step: 0.1 }) intensity = 1;
  @field({ min: 0 }) range = 10;
}

export class SpotLight extends Component {
  color = new Color3(1, 1, 1);
  @field({ min: 0, step: 0.1 }) intensity = 1;
  @field({ min: 0 }) range = 15;
  /** Cone angle, degrees. */
  @field({ min: 1, max: 179 }) angle = 45;
  shadows = false;
}

/** Sky / ground ambient light (hemispheric). */
export class AmbientLight extends Component {
  skyColor = new Color3(0.75, 0.8, 0.9);
  groundColor = new Color3(0.25, 0.22, 0.2);
  @field({ min: 0, step: 0.05 }) intensity = 0.5;
}

Types.register(Mesh, 'Mesh', 'component', { menu: 'Render/Mesh', single: true });
Types.register(Camera, 'Camera', 'component', { menu: 'Render/Camera', single: true });
Types.register(DirectionalLight, 'DirectionalLight', 'component', { menu: 'Light/Directional Light', single: true });
Types.register(PointLight, 'PointLight', 'component', { menu: 'Light/Point Light', single: true });
Types.register(SpotLight, 'SpotLight', 'component', { menu: 'Light/Spot Light', single: true });
Types.register(AmbientLight, 'AmbientLight', 'component', { menu: 'Light/Ambient Light', single: true });
