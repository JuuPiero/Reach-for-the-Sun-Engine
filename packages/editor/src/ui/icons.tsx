import type { CSSProperties, JSX, ReactNode } from 'react';

/** Small stroke icons (own drawings, 16×16 grid). */
function I({ children, size = 14, style, className }: { children: ReactNode; size?: number; style?: CSSProperties; className?: string }) {
  return (
    <svg className={`rs-icon ${className ?? ''}`} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {children}
    </svg>
  );
}
type P = { size?: number; style?: CSSProperties; className?: string };

export const Icons = {
  Folder: (p: P) => (
    <I {...p}>
      <path d="M1.5 4.5v8h13v-7h-6.5l-1.5-1.5h-5z" />
    </I>
  ),
  FolderOpen: (p: P) => (
    <I {...p}>
      <path d="M1.5 12.5v-8.5h4.5l1.5 1.5h5v2" />
      <path d="M1.5 12.5l2-5h11l-2 5z" />
    </I>
  ),
  Cube: (p: P) => (
    <I {...p}>
      <path d="M8 1.5l5.5 3v7l-5.5 3-5.5-3v-7z" />
      <path d="M2.5 4.5l5.5 3 5.5-3M8 7.5v7" />
    </I>
  ),
  Sphere: (p: P) => (
    <I {...p}>
      <circle cx="8" cy="8" r="6" />
      <ellipse cx="8" cy="8" rx="6" ry="2.3" />
    </I>
  ),
  Cylinder: (p: P) => (
    <I {...p}>
      <ellipse cx="8" cy="3.5" rx="5" ry="2" />
      <path d="M3 3.5v9c0 1.1 2.2 2 5 2s5-.9 5-2v-9" />
    </I>
  ),
  Capsule: (p: P) => (
    <I {...p}>
      <rect x="4.5" y="1.5" width="7" height="13" rx="3.5" />
    </I>
  ),
  Plane: (p: P) => (
    <I {...p}>
      <path d="M1.5 10.5l4-5h9l-4 5z" />
    </I>
  ),
  Torus: (p: P) => (
    <I {...p}>
      <ellipse cx="8" cy="8" rx="6.5" ry="4" />
      <ellipse cx="8" cy="8" rx="2.5" ry="1.4" />
    </I>
  ),
  Sun: (p: P) => (
    <I {...p}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" />
    </I>
  ),
  Bulb: (p: P) => (
    <I {...p}>
      <path d="M5.5 10.5c-1.3-1-2-2.3-2-3.8a4.5 4.5 0 019 0c0 1.5-.7 2.8-2 3.8v1.5h-5z" />
      <path d="M6 14.5h4" />
    </I>
  ),
  Spot: (p: P) => (
    <I {...p}>
      <path d="M6 2h4l1 4H5z" />
      <path d="M5 6l-3 8h12l-3-8" />
    </I>
  ),
  Ambient: (p: P) => (
    <I {...p}>
      <path d="M2 9a6 6 0 0112 0" />
      <path d="M1.5 12.5h13" />
    </I>
  ),
  Camera: (p: P) => (
    <I {...p}>
      <rect x="1.5" y="4.5" width="9" height="7" rx="1" />
      <path d="M10.5 7l4-2v6l-4-2" />
    </I>
  ),
  Empty: (p: P) => (
    <I {...p}>
      <path d="M8 2v12M2 8h12" />
      <circle cx="8" cy="8" r="2" />
    </I>
  ),
  Eye: (p: P) => (
    <I {...p}>
      <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z" />
      <circle cx="8" cy="8" r="2" />
    </I>
  ),
  EyeOff: (p: P) => (
    <I {...p}>
      <path d="M2 2l12 12M6.5 4C7 3.8 7.5 3.5 8 3.5c4.5 0 7 4.5 7 4.5s-.7 1.3-2 2.5M4 5.3C2 6.6 1 8 1 8s2.5 4.5 7 4.5c1 0 1.9-.2 2.7-.6" />
    </I>
  ),
  Update: (p: P) => (
    <I {...p}>
      <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9" />
      <path d="M13.5 2v3h-3" />
    </I>
  ),
  UpdateOff: (p: P) => (
    <I {...p} style={{ ...p.style, opacity: 0.35 }}>
      <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9" />
      <path d="M13.5 2v3h-3" />
    </I>
  ),
  Play: (p: P) => (
    <I {...p}>
      <path d="M4.5 2.5l9 5.5-9 5.5z" fill="currentColor" />
    </I>
  ),
  Pause: (p: P) => (
    <I {...p}>
      <path d="M5 3v10M11 3v10" strokeWidth={2.4} />
    </I>
  ),
  Step: (p: P) => (
    <I {...p}>
      <path d="M3 3l7 5-7 5z" fill="currentColor" />
      <path d="M12.5 3v10" strokeWidth={2} />
    </I>
  ),
  Stop: (p: P) => (
    <I {...p}>
      <rect x="3.5" y="3.5" width="9" height="9" fill="currentColor" />
    </I>
  ),
  Save: (p: P) => (
    <I {...p}>
      <path d="M2.5 2.5h9l2 2v9h-11z" />
      <path d="M5 2.5v4h5v-4M5 13.5v-4h6v4" />
    </I>
  ),
  NewFile: (p: P) => (
    <I {...p}>
      <path d="M3.5 1.5h6l3 3v10h-9z" />
      <path d="M8 7v5M5.5 9.5h5" />
    </I>
  ),
  Open: (p: P) => (
    <I {...p}>
      <path d="M1.5 12.5v-8.5h4.5l1.5 1.5h5v2" />
      <path d="M1.5 12.5l2-5h11l-2 5z" />
    </I>
  ),
  Undo: (p: P) => (
    <I {...p}>
      <path d="M4 6.5h6a3.5 3.5 0 010 7H6" />
      <path d="M6.5 4L4 6.5 6.5 9" />
    </I>
  ),
  Redo: (p: P) => (
    <I {...p}>
      <path d="M12 6.5H6a3.5 3.5 0 000 7h4" />
      <path d="M9.5 4L12 6.5 9.5 9" />
    </I>
  ),
  Move: (p: P) => (
    <I {...p}>
      <path d="M8 1.5v13M1.5 8h13M8 1.5L6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2" />
    </I>
  ),
  Rotate: (p: P) => (
    <I {...p}>
      <path d="M13 8A5 5 0 113.6 5.5" />
      <path d="M1.5 3l2 2.5 2.5-1.5" />
    </I>
  ),
  Scale: (p: P) => (
    <I {...p}>
      <rect x="2" y="7" width="7" height="7" />
      <path d="M8 8l6-6M10 2h4v4" />
    </I>
  ),
  Plus: (p: P) => (
    <I {...p}>
      <path d="M8 3v10M3 8h10" />
    </I>
  ),
  Search: (p: P) => (
    <I {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5l3.5 3.5" />
    </I>
  ),
  Chevron: (p: P) => (
    <I {...p}>
      <path d="M6 4l4 4-4 4" />
    </I>
  ),
  Trash: (p: P) => (
    <I {...p}>
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 10h6.6L12 4" />
    </I>
  ),
  Script: (p: P) => (
    <I {...p}>
      <path d="M3.5 1.5h6l3 3v10h-9z" />
      <path d="M6 8l-1.5 1.5L6 11M10 8l1.5 1.5L10 11" />
    </I>
  ),
  Scene: (p: P) => (
    <I {...p}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M1.5 10l4-3.5 3 2.5 2-1.5 4 3" />
    </I>
  ),
  Prefab: (p: P) => (
    <I {...p}>
      <path d="M8 1.5l5.5 3v7l-5.5 3-5.5-3v-7z" />
      <path d="M2.5 4.5l5.5 3 5.5-3M8 7.5v7" />
    </I>
  ),
  UserData: (p: P) => (
    <I {...p}>
      <path d="M8 1.5l6.5 6.5L8 14.5 1.5 8z" />
      <path d="M5.5 7h5M5.5 9h5" />
    </I>
  ),
  Model: (p: P) => (
    <I {...p}>
      <path d="M8 1.5l5.5 3v7l-5.5 3-5.5-3v-7z" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </I>
  ),
  Image: (p: P) => (
    <I {...p}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <circle cx="5.5" cy="6" r="1.3" />
      <path d="M1.5 11.5l4-3 3 2 2-1.5 4 3" />
    </I>
  ),
  File: (p: P) => (
    <I {...p}>
      <path d="M3.5 1.5h6l3 3v10h-9z" />
      <path d="M9.5 1.5v3h3" />
    </I>
  ),
  Fsm: (p: P) => (
    <I {...p}>
      <circle cx="4" cy="4" r="2.2" />
      <circle cx="12" cy="6" r="2.2" />
      <circle cx="6" cy="12.5" r="2.2" />
      <path d="M6.2 4.4l3.6 1M10.8 7.8l-3.6 3.2M4.4 6.2l1 4.1" />
    </I>
  ),
  Console: (p: P) => (
    <I {...p}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M4 6l2.5 2L4 10M8 10.5h4" />
    </I>
  ),
  Build: (p: P) => (
    <I {...p}>
      <path d="M2 14l6-6M9.5 2.5a3 3 0 004 4l-2 2-4-4z" />
    </I>
  ),
  Grid: (p: P) => (
    <I {...p}>
      <path d="M1.5 5.5h13M1.5 10.5h13M5.5 1.5v13M10.5 1.5v13" />
    </I>
  ),
  Focus: (p: P) => (
    <I {...p}>
      <path d="M1.5 5V1.5H5M11 1.5h3.5V5M14.5 11v3.5H11M5 14.5H1.5V11" />
      <circle cx="8" cy="8" r="2" />
    </I>
  ),
};

/** Icon of a GameObject from its components. */
export function objectIcon(kinds: string[]): (p: P) => JSX.Element {
  if (kinds.includes('Camera')) return Icons.Camera;
  if (kinds.includes('DirectionalLight')) return Icons.Sun;
  if (kinds.includes('PointLight')) return Icons.Bulb;
  if (kinds.includes('SpotLight')) return Icons.Spot;
  if (kinds.includes('AmbientLight')) return Icons.Ambient;
  if (kinds.includes('Mesh')) return Icons.Cube;
  return Icons.Empty;
}

/** Icon + accent colour of a project file. */
export function assetVisual(path: string, dir: boolean): { icon: (p: P) => JSX.Element; color: string; kind: string } {
  if (dir) return { icon: Icons.Folder, color: '#d6a24a', kind: 'Folder' };
  const p = path.toLowerCase();
  if (p.endsWith('.scn.json')) return { icon: Icons.Scene, color: '#b07cff', kind: 'Scene' };
  if (p.endsWith('.pfb.json')) return { icon: Icons.Prefab, color: '#3fa7ff', kind: 'Prefab' };
  if (p.endsWith('.user.json')) return { icon: Icons.UserData, color: '#ff6fa6', kind: 'UserData' };
  if (p.endsWith('.fsm.json')) return { icon: Icons.Fsm, color: '#ff5d73', kind: 'MotionFsm' };
  if (p.endsWith('.ts')) return { icon: Icons.Script, color: '#62d26f', kind: 'Script' };
  if (/\.(glb|gltf)$/.test(p)) return { icon: Icons.Model, color: '#4fd1c5', kind: 'Model' };
  if (/\.(png|jpe?g|webp)$/.test(p)) return { icon: Icons.Image, color: '#e7c35a', kind: 'Texture' };
  return { icon: Icons.File, color: '#9aa0a6', kind: 'File' };
}
