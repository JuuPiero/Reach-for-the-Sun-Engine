import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { Color4, Vector3 } from '@babylonjs/core/Maths/math';
import type { Scene as BScene } from '@babylonjs/core/scene';
import type { DebugLine } from '@rs/core';

/** `Debug.drawLine` & co: one LineSystem mesh rebuilt when the line count changes, updated in place otherwise. */
export class DebugLineRenderer {
  private mesh: LinesMesh | null = null;
  private count = 0;

  constructor(private readonly scene: BScene) {}

  sync(lines: readonly DebugLine[]): void {
    if (!lines.length) {
      this.mesh?.setEnabled(false);
      return;
    }
    const pts: Vector3[][] = new Array(lines.length);
    const cols: Color4[][] = new Array(lines.length);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      pts[i] = [new Vector3(l.a.x, l.a.y, l.a.z), new Vector3(l.b.x, l.b.y, l.b.z)];
      const c = new Color4(l.color.r, l.color.g, l.color.b, 1);
      cols[i] = [c, c];
    }
    if (this.mesh && this.count === lines.length) CreateLineSystem('__debugLines', { lines: pts, colors: cols, instance: this.mesh }, this.scene);
    else {
      this.mesh?.dispose();
      this.mesh = CreateLineSystem('__debugLines', { lines: pts, colors: cols, updatable: true }, this.scene);
      this.mesh.isPickable = false;
      this.mesh.layerMask = 0xffffffff;
      this.mesh.alwaysSelectAsActiveMesh = true;
      this.count = lines.length;
    }
    this.mesh.setEnabled(true);
  }

  dispose(): void {
    this.mesh?.dispose();
    this.mesh = null;
  }
}
