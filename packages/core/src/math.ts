// Math types are Babylon.js's own (tree-shakable deep imports): the renderer uses them as they are.
export { Vector2, Vector3, Vector4, Quaternion, Matrix } from '@babylonjs/core/Maths/math.vector';
export { Color3, Color4 } from '@babylonjs/core/Maths/math.color';

import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';

export const DEG = Math.PI / 180;

/** Euler angles in degrees (Babylon YXZ order) → quaternion. */
export function quatFromEulerDeg(x: number, y: number, z: number, out = new Quaternion()): Quaternion {
  return Quaternion.RotationYawPitchRollToRef(y * DEG, x * DEG, z * DEG, out);
}

/** Quaternion → Euler angles in degrees (Babylon YXZ order). */
export function eulerDegFromQuat(q: Quaternion, out = new Vector3()): Vector3 {
  q.toEulerAnglesToRef(out);
  out.x /= DEG;
  out.y /= DEG;
  out.z /= DEG;
  return out;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
