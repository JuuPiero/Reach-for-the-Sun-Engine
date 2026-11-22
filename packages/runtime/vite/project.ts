import fs from 'node:fs';
import path from 'node:path';

/** `rs.project.json` at the project root. */
export interface ProjectSettings {
  name: string;
  /** Scene the game starts with (`Assets/Scenes/Main.scn.json`). */
  startScene: string;
  /** Scene the editor opens. */
  editorScene?: string;
}

export const PROJECT_FILE = 'rs.project.json';

export function readProject(root: string): ProjectSettings {
  const file = path.join(root, PROJECT_FILE);
  let j: Partial<ProjectSettings> = {};
  try {
    j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    /* defaults */
  }
  return { ...j, name: j.name ?? path.basename(root), startScene: j.startScene ?? 'Assets/Scenes/Main.scn.json', editorScene: j.editorScene };
}

export const toPosix = (p: string) => p.split(path.sep).join('/');

/** Every file below `Assets/` (project-relative posix paths). */
export function listAssetFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else out.push(toPosix(path.relative(root, abs)));
    }
  };
  walk(path.join(root, 'Assets'));
  return out.sort();
}

/** Project scripts: `Assets/**\/*.ts` (not `.d.ts`). */
export function listScripts(root: string): string[] {
  return listAssetFiles(root).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
}

/** Resolves a project-relative path, refusing anything outside the project. */
export function resolveInProject(root: string, rel: string): string | null {
  if (!rel || rel.includes('\0')) return null;
  const abs = path.resolve(root, rel);
  const r = path.resolve(root);
  if (abs !== r && !abs.startsWith(r + path.sep)) return null;
  return abs;
}
