import { DEFAULT_INPUT_ACTIONS, Input, type InputAction } from './Input';
import { LAYER_COUNT, Physics } from './Physics';

/** `rs.project.json` (Project Settings): read by the editor and the packaged game. */
export interface ProjectSettingsJson {
  name?: string;
  /** Scene the game starts with. */
  startScene?: string;
  /** Scene the editor opens. */
  editorScene?: string;
  physics?: {
    gravity?: number[];
    fixedDeltaTime?: number;
    /** 16 layer names ('' = unused). */
    layers?: string[];
    /** Per layer: mask of the layers it collides with. */
    collisions?: number[];
  };
  input?: { actions?: InputAction[] };
}

export const ProjectSettings = {
  /** Applies a project's settings to the engine (player and editor at start, the editor after Project Settings edits). */
  apply(j: ProjectSettingsJson): void {
    const p = j.physics ?? {};
    const g = p.gravity;
    Physics.gravity.set(+(g?.[0] ?? 0) || 0, g ? +g[1] || 0 : -9.81, +(g?.[2] ?? 0) || 0);
    Physics.fixedDeltaTime = p.fixedDeltaTime && p.fixedDeltaTime > 0 ? p.fixedDeltaTime : 1 / 60;
    for (let i = 0; i < LAYER_COUNT; i++) {
      Physics.layers[i] = i === 0 ? 'Default' : i === 1 ? 'Ignore Raycast' : String(p.layers?.[i] ?? '');
      Physics.collisionMatrix[i] = typeof p.collisions?.[i] === 'number' ? p.collisions[i] & 0xffff : 0xffff;
    }
    Physics.layersVersion++;
    Input.setActions(j.input?.actions?.length ? j.input.actions : DEFAULT_INPUT_ACTIONS);
  },

  /** The engine's current physics / input settings as JSON (merged into `base`; the editor saves it). */
  capture(base: ProjectSettingsJson): ProjectSettingsJson {
    const g = Physics.gravity;
    const full = Physics.collisionMatrix.every((m) => (m & 0xffff) === 0xffff);
    return {
      ...base,
      physics: {
        gravity: [g.x, g.y, g.z],
        fixedDeltaTime: Physics.fixedDeltaTime,
        layers: Physics.layers.map((n, i) => (i < 2 ? n : n || '')),
        ...(full ? {} : { collisions: [...Physics.collisionMatrix] }),
      },
      input: { actions: Input.actions },
    };
  },
};
