declare module 'virtual:rs/scripts' {
  export const scripts: string[];
}
declare module 'virtual:rs/project' {
  export const project: { name: string; startScene: string; editorScene?: string };
  /** Absolute project folder (editor only, '' in games). */
  export const projectRoot: string;
}
declare module 'virtual:rs/physics' {
  /** Loads the physics provider (no-op in games that don't use physics). */
  export function initPhysics(): Promise<void>;
}
