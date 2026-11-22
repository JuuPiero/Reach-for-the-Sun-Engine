import { ParticleSystem as BParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Particles/particleSystemComponent';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color4, Vector3 } from '@babylonjs/core/Maths/math';
import type { Scene as BScene } from '@babylonjs/core/scene';
import type { ParticleSystem } from '@rs/core';

/** Babylon side of one ParticleSystem component. */
export interface ParticleEntry {
  ps: BParticleSystem;
  capacity: number;
  shapeKey: string;
  sizeKey: string;
  clearVersion: number;
  burstPending: boolean;
  previewTime: number;
}

export interface ParticleFrame {
  /** Play mode (the component's play state drives emission) vs edit preview. */
  playing: boolean;
  /** Simulation speed (0 = frozen: paused editor, timeScale 0). */
  timeScale: number;
  dt: number;
  texture: (path: string) => Texture;
}

let softDot: DynamicTexture | null = null;
function dotTexture(scene: BScene): DynamicTexture {
  if (softDot && softDot.getScene() === scene) return softDot;
  const t = new DynamicTexture('__particleDot', { width: 64, height: 64 }, scene, false);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  t.hasAlpha = true;
  t.update(true);
  softDot = t;
  return t;
}

/** Creates / updates the Babylon particle system of a component. `visible` false hides it (particles keep their state). */
export function syncParticles(scene: BScene, node: TransformNode, c: ParticleSystem, existing: ParticleEntry | undefined, visible: boolean, f: ParticleFrame): ParticleEntry {
  let e = existing;
  const capacity = Math.max(1, Math.floor(c.maxParticles));
  if (e && e.capacity !== capacity) {
    e.ps.dispose(false);
    e = undefined;
  }
  if (!e) {
    const ps = new BParticleSystem(`ps:${node.name}`, capacity, scene);
    ps.emitter = node as unknown as AbstractMesh;
    ps.updateSpeed = 0;
    ps.start();
    e = { ps, capacity, shapeKey: '', sizeKey: '', clearVersion: c._clearVersion, burstPending: false, previewTime: -1 };
  }
  const ps = e.ps;
  // shape
  const shapeKey = `${c.shape}|${c.radius}|${c.angle}|${c.boxSize.x},${c.boxSize.y},${c.boxSize.z}`;
  if (shapeKey !== e.shapeKey) {
    e.shapeKey = shapeKey;
    const r = Math.max(0, c.radius);
    switch (c.shape) {
      case 'Point':
        ps.createPointEmitter(new Vector3(-0.15, 1, -0.15), new Vector3(0.15, 1, 0.15));
        break;
      case 'Sphere':
        ps.createSphereEmitter(r, 0);
        break;
      case 'Hemisphere':
        ps.createHemisphericEmitter(r, 0);
        break;
      case 'Box': {
        const h = c.boxSize.scale(0.5);
        ps.createBoxEmitter(new Vector3(0, 1, 0), new Vector3(0, 1, 0), h.negate(), h);
        break;
      }
      default:
        ps.createConeEmitter(Math.max(0.001, r), (Math.min(89, Math.max(0, c.angle)) * Math.PI) / 180);
    }
  }
  // size over life
  const sizeKey = `${c.endSize}`;
  if (sizeKey !== e.sizeKey) {
    e.sizeKey = sizeKey;
    ps.removeSizeGradient(0);
    ps.removeSizeGradient(1);
    if (c.endSize !== 1) {
      ps.addSizeGradient(0, 1);
      ps.addSizeGradient(1, c.endSize);
    }
  }
  ps.minLifeTime = Math.max(0.01, Math.min(c.lifetimeMin, c.lifetimeMax));
  ps.maxLifeTime = Math.max(0.01, c.lifetimeMin, c.lifetimeMax);
  ps.minEmitPower = Math.min(c.speedMin, c.speedMax);
  ps.maxEmitPower = Math.max(c.speedMin, c.speedMax);
  ps.minSize = Math.min(c.sizeMin, c.sizeMax);
  ps.maxSize = Math.max(c.sizeMin, c.sizeMax);
  ps.color1 = new Color4(c.startColor.r, c.startColor.g, c.startColor.b, c.startAlpha);
  ps.color2 = ps.color1;
  ps.colorDead = new Color4(c.endColor.r, c.endColor.g, c.endColor.b, c.endAlpha);
  ps.gravity.copyFrom(c.gravity);
  const spin = (c.spin * Math.PI) / 180;
  ps.minAngularSpeed = -spin;
  ps.maxAngularSpeed = spin;
  ps.blendMode = c.blend === 'Additive' ? BParticleSystem.BLENDMODE_ADD : BParticleSystem.BLENDMODE_STANDARD;
  ps.isLocal = c.localSpace;
  const tex = c.texture ? f.texture(c.texture) : dotTexture(scene);
  if (ps.particleTexture !== tex) ps.particleTexture = tex;
  ps.layerMask = visible ? 0x0fffffff : 0;
  // emission
  if (c._clearVersion !== e.clearVersion) {
    e.clearVersion = c._clearVersion;
    ps.reset();
  }
  let emitting: boolean;
  if (f.playing) emitting = c._emitting;
  else {
    emitting = c.simulateInEdit;
    // edit preview: bursts once per cycle
    const start = e.previewTime < 0;
    e.previewTime = Math.max(0, e.previewTime) + f.dt * f.timeScale;
    if (c.simulateInEdit && c.burst > 0 && (start || e.previewTime >= c.duration)) {
      e.previewTime %= Math.max(0.05, c.duration);
      c._pendingBurst += c.burst;
    }
    if (!c.simulateInEdit && ps.getActiveCount() > 0) ps.reset();
  }
  if (e.burstPending) {
    // the burst was emitted last frame: back to rate emission
    ps.manualEmitCount = -1;
    e.burstPending = false;
  }
  if (c._pendingBurst > 0 && f.timeScale > 0) {
    ps.manualEmitCount = Math.min(capacity, c._pendingBurst);
    c._pendingBurst = 0;
    e.burstPending = true;
  }
  ps.emitRate = emitting && visible ? Math.max(0, c.rate) : 0;
  // Babylon ages particles by updateSpeed × (frame time / 16.7 ms): 1/60 makes lifetimes and rates seconds
  ps.updateSpeed = f.timeScale / 60;
  c._count = ps.getActiveCount();
  return e;
}
