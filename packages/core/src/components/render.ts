import { Component } from '../GameObject';
import { Color3 } from '../math';
import { field, Types } from '../reflection';

/** Built-in components drawn by the renderer (render-babylon mirrors them every frame). */

export const MESH_SHAPES = ['Box', 'Sphere', 'Cylinder', 'Capsule', 'Plane', 'Ground', 'Torus', 'Model'] as const;
export type MeshShape = (typeof MESH_SHAPES)[number];

export class Mesh extends Component {
  @field({ type: 'enum', options: MESH_SHAPES }) shape: MeshShape = 'Box';
  /** glTF / GLB file (shape = Model). */
  @field({ type: 'asset', assetKind: ['glb', 'gltf'] }) model = '';
  @field({ header: 'Material' }) color = new Color3(0.8, 0.8, 0.8);
  @field({ type: 'asset', assetKind: ['png', 'jpg', 'jpeg', 'webp'] }) texture = '';
  /** Texture repeat (UV scale). */
  @field({ min: 0.01, step: 0.1 }) tiling = 1;
  emissive = new Color3(0, 0, 0);
  @field({ min: 0, max: 1, step: 0.01 }) specular = 0.2;
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
