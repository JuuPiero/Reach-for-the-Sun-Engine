import { useEffect, useRef, useState } from 'react';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Mesh as BMesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4, Plane, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import '@babylonjs/core/Rendering/outlineRenderer';
import { AmbientLight, Camera, DirectionalLight, PointLight, SpotLight, type GameObject } from '@rs/core';
import { BabylonBackend } from '@rs/render-babylon';
import { editor } from '../editor/Editor';
import { DT_ASSET } from './Hierarchies';
import { useEditor } from './hooks';
import { Icons } from './icons';

const EDITOR_LAYER = 0x10000000;
const CAM_KEY = 'rs.editorCamera';

/** The Runtime view: edit-mode scene view (editor camera, gizmos, grid) and the game view in play mode. */
export function RuntimeView() {
  useEditor('mode', 'gizmo', 'selection');
  const host = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState('');
  const [view, setView] = useState<'auto' | 'editor' | 'game'>('auto');
  const [showGrid, setShowGrid] = useState(true);
  const viewRef = useRef(view);
  viewRef.current = view;
  const gridRef = useRef(showGrid);
  gridRef.current = showGrid;
  const focusRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current!;
    const backend = new BabylonBackend(canvas);
    const bscene = backend.scene;
    editor.gameElement = canvas;
    // ---- editor camera
    const cam = new FreeCamera('__editorCamera', new Vector3(0, 6, -12), bscene);
    cam.minZ = 0.05;
    cam.maxZ = 5000;
    cam.fov = 1;
    cam.layerMask = 0x0fffffff | EDITOR_LAYER;
    cam.rotationQuaternion = new Quaternion();
    let yaw = 0;
    let pitch = 0.4;
    let pivot = new Vector3(0, 0, 0);
    try {
      const s = JSON.parse(localStorage.getItem(`${CAM_KEY}:${editor.projectRoot}`) ?? 'null');
      if (s) {
        cam.position.set(s.p[0], s.p[1], s.p[2]);
        yaw = s.yaw;
        pitch = s.pitch;
      }
    } catch {
      /* default */
    }
    const applyCam = () => {
      Quaternion.RotationYawPitchRollToRef(yaw, pitch, 0, cam.rotationQuaternion!);
    };
    applyCam();
    const forward = () => Vector3.TransformNormal(Vector3.Forward(), cam.getWorldMatrix()).normalize();
    const saveCam = () => localStorage.setItem(`${CAM_KEY}:${editor.projectRoot}`, JSON.stringify({ p: [cam.position.x, cam.position.y, cam.position.z], yaw, pitch }));
    editor.spawnPoint = () => {
      const f = forward();
      const p = cam.position.add(f.scale(8));
      if (f.y < -0.05) {
        const t = -cam.position.y / f.y;
        if (t > 0 && t < 40) return cam.position.add(f.scale(t));
      }
      return new Vector3(Math.round(p.x * 2) / 2, 0, Math.round(p.z * 2) / 2);
    };
    // ---- grid (editor layer only)
    // two line systems (1 m lines, 10 m lines + axes), plain colours
    const N = 40;
    const minor: Vector3[][] = [];
    const major: Vector3[][] = [];
    // short segments: a long line crossing the camera plane is clipped wrongly by some GPUs / SwiftShader
    for (let i = -N; i <= N; i++) {
      const list = i % 10 === 0 ? major : minor;
      for (let a = -N; a < N; a += 4) {
        list.push([new Vector3(i, 0, a), new Vector3(i, 0, a + 4)]);
        list.push([new Vector3(a, 0, i), new Vector3(a + 4, 0, i)]);
      }
    }
    const grid = new TransformNode('__grid', bscene);
    grid.position.y = 0.004; // above floors at y = 0 (no z-fighting)
    for (const [list, color, alpha] of [
      [minor, new Color3(0.32, 0.34, 0.37), 0.35],
      [major, new Color3(0.45, 0.48, 0.52), 0.6],
    ] as const) {
      const ls = CreateLineSystem('__gridLines', { lines: list as Vector3[][] }, bscene);
      ls.color = color;
      ls.alpha = alpha;
      ls.layerMask = EDITOR_LAYER;
      ls.isPickable = false;
      ls.parent = grid;
    }
    void Color4;
    // ---- light / camera markers (editor layer, pickable)
    const markerMat = new StandardMaterial('__marker', bscene);
    markerMat.emissiveColor = new Color3(1, 0.85, 0.3);
    markerMat.disableLighting = true;
    const camMat = new StandardMaterial('__markerCam', bscene);
    camMat.emissiveColor = new Color3(0.75, 0.8, 0.9);
    camMat.disableLighting = true;
    const markers = new Map<GameObject, BMesh>();
    // ---- gizmos
    const gizmos = new GizmoManager(bscene);
    gizmos.usePointerToAttachGizmos = false;
    gizmos.positionGizmoEnabled = true;
    gizmos.rotationGizmoEnabled = true;
    gizmos.scaleGizmoEnabled = true;
    let dragging = false;
    let attached: GameObject | null = null;
    const hookGizmo = (g: { onDragStartObservable: { add(f: () => void): unknown }; onDragObservable: { add(f: () => void): unknown }; onDragEndObservable: { add(f: () => void): unknown } } | null) => {
      if (!g) return;
      g.onDragStartObservable.add(() => {
        dragging = true;
        editor.recordUndo('Transform');
      });
      g.onDragObservable.add(() => {
        const go = attached;
        const node = go ? backend.nodeOf(go) : null;
        if (!go || !node) return;
        go.transform.localPosition.copyFrom(node.position);
        if (node.rotationQuaternion) go.transform.localRotation.copyFrom(node.rotationQuaternion);
        go.transform.localScale.copyFrom(node.scaling);
        go.transform.markDirty();
        editor.changed();
      });
      g.onDragEndObservable.add(() => {
        dragging = false;
      });
    };
    hookGizmo(gizmos.gizmos.positionGizmo);
    hookGizmo(gizmos.gizmos.rotationGizmo);
    hookGizmo(gizmos.gizmos.scaleGizmo);
    const outlined = new Set<AbstractMesh>();

    // ---- input
    const keys = new Set<string>();
    let rmb = false;
    let mmb = false;
    let orbit = false;
    let down: { x: number; y: number } | null = null;
    let speed = 6;
    const usingEditorCam = () => viewRef.current === 'editor' || (viewRef.current === 'auto' && editor.mode === 'edit');
    const onDown = (e: PointerEvent) => {
      canvas.focus();
      if (!usingEditorCam()) return;
      if (e.button === 2) rmb = editor.flying = true;
      else if (e.button === 1) {
        mmb = true;
        e.preventDefault();
      } else if (e.button === 0 && e.altKey) orbit = true;
      else if (e.button === 0) down = { x: e.clientX, y: e.clientY };
      if (rmb || mmb || orbit) canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!usingEditorCam()) return;
      const dx = e.movementX;
      const dy = e.movementY;
      if (rmb) {
        yaw += dx * 0.004;
        pitch = Math.max(-1.55, Math.min(1.55, pitch + dy * 0.004));
        applyCam();
      } else if (orbit) {
        const dist = Vector3.Distance(cam.position, pivot);
        yaw += dx * 0.006;
        pitch = Math.max(-1.55, Math.min(1.55, pitch + dy * 0.006));
        applyCam();
        cam.computeWorldMatrix();
        cam.position.copyFrom(pivot.subtract(forward().scale(dist)));
      } else if (mmb) {
        const m = cam.getWorldMatrix();
        const k = 0.01 * Math.max(1, Vector3.Distance(cam.position, pivot) * 0.15);
        cam.position.addInPlace(Vector3.TransformNormal(new Vector3(-dx * k, dy * k, 0), m));
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.button === 2) rmb = editor.flying = false;
      if (e.button === 1) mmb = false;
      if (e.button === 0) orbit = false;
      if (e.button === 0 && down && !dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4 && usingEditorCam()) {
        const r = canvas.getBoundingClientRect();
        const go = backend.pick(e.clientX - r.left, e.clientY - r.top) ?? pickMarker(e.clientX - r.left, e.clientY - r.top);
        editor.select(go ? [go.id] : [], e.ctrlKey || e.shiftKey);
      }
      down = null;
      saveCam();
    };
    const pickMarker = (x: number, y: number): GameObject | null => {
      const sx = backend.engine.getRenderWidth() / (canvas.clientWidth || 1);
      const hit = bscene.pick(x * sx, y * sx, (m) => !!(m.metadata as { marker?: GameObject } | null)?.marker, false, cam);
      return (hit?.pickedMesh?.metadata as { marker?: GameObject } | undefined)?.marker ?? null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!usingEditorCam()) return;
      e.preventDefault();
      if (rmb) {
        speed = Math.max(0.5, Math.min(200, speed * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
        return;
      }
      cam.position.addInPlace(forward().scale((e.deltaY < 0 ? 1 : -1) * Math.max(0.5, Vector3.Distance(cam.position, pivot) * 0.12)));
      saveCam();
    };
    const onKey = (e: KeyboardEvent, isDown: boolean) => {
      if (isDown) keys.add(e.code);
      else keys.delete(e.code);
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => keys.clear());
    focusRef.current = () => {
      const go = editor.selectedObjects[0];
      if (!go) return;
      const p = go.transform.position;
      const s = go.transform.worldMatrix.getRow(0)!.length() + 2;
      pivot = p.clone();
      cam.computeWorldMatrix();
      cam.position.copyFrom(p.subtract(forward().scale(Math.max(3, s * 2.5))));
      saveCam();
    };

    // ---- prefab / model drops
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes(DT_ASSET)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const path = e.dataTransfer?.getData(DT_ASSET);
      if (!path) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const sx = backend.engine.getRenderWidth() / (canvas.clientWidth || 1);
      const ray = bscene.createPickingRay((e.clientX - r.left) * sx, (e.clientY - r.top) * sx, null, cam);
      const hit = bscene.pickWithRay(ray, (m) => m.isPickable && m.layerMask !== EDITOR_LAYER);
      let point = hit?.pickedPoint ?? null;
      if (!point) {
        const d = ray.intersectsPlane(Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up()));
        point = d !== null && d > 0 ? ray.origin.add(ray.direction.scale(d)) : editor.spawnPoint();
      }
      if (path.endsWith('.pfb.json')) void editor.instantiatePrefab(path, null, point);
      else if (/\.(glb|gltf)$/i.test(path)) {
        const go = editor.create('Model');
        go.name = path.slice(path.lastIndexOf('/') + 1).replace(/\.\w+$/, '');
        const m = go.getComponent<import('@rs/core').Mesh>('Mesh');
        if (m) m.model = path;
        go.transform.localPosition.copyFrom(point);
        editor.changed(true);
      } else if (path.endsWith('.scn.json')) void editor.openScene(path);
    };
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', onDrop);

    // ---- frame loop
    let last = performance.now();
    let statT = 0;
    backend.engine.runRenderLoop(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const scene = editor.scene;
      if (editor.mode === 'play') scene.step(dt);
      else scene.step(0);
      const editorView = usingEditorCam();
      // fly with RMB held
      if (editorView && rmb) {
        const m = cam.getWorldMatrix();
        const v = new Vector3((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0), (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0));
        if (v.lengthSquared() > 0) cam.position.addInPlace(Vector3.TransformNormal(v, m).scale(speed * dt * (keys.has('ShiftLeft') ? 3 : 1)));
      }
      backend.sync(scene, { camera: editorView ? cam : null, defaultLight: editor.mode === 'edit' });
      grid.setEnabled(editorView && gridRef.current);
      // markers for lights / cameras
      const seen = new Set<GameObject>();
      if (editorView)
        for (const go of scene.allGameObjects()) {
          const isCam = !!go.getComponent(Camera);
          const isLight = !!(go.getComponent(DirectionalLight) ?? go.getComponent(PointLight) ?? go.getComponent(SpotLight) ?? go.getComponent(AmbientLight));
          if (!isCam && !isLight) continue;
          const node = backend.nodeOf(go);
          if (!node) continue;
          seen.add(go);
          let mk = markers.get(go);
          if (!mk) {
            mk = isCam ? CreateBox('__mk', { width: 0.5, height: 0.35, depth: 0.7 }, bscene) : CreateSphere('__mk', { diameter: 0.4, segments: 8 }, bscene);
            mk.material = isCam ? camMat : markerMat;
            mk.layerMask = EDITOR_LAYER;
            mk.metadata = { marker: go };
            markers.set(go, mk);
          }
          if (mk.parent !== node) mk.parent = node;
          mk.scaling.set(1 / (go.transform.localScale.x || 1), 1 / (go.transform.localScale.y || 1), 1 / (go.transform.localScale.z || 1));
        }
      for (const [go, mk] of markers)
        if (!seen.has(go)) {
          mk.dispose();
          markers.delete(go);
        }
      // gizmo + outlines on the selection
      const sel = editor.selectedObjects;
      const target = editorView ? (sel[0] ?? null) : null;
      if (target !== attached) {
        attached = target;
        gizmos.attachToNode(target ? backend.nodeOf(target) : null);
      } else if (target && gizmos.gizmos.positionGizmo?.attachedNode !== backend.nodeOf(target)) gizmos.attachToNode(backend.nodeOf(target));
      gizmos.positionGizmoEnabled = !!target && editor.gizmo === 'move';
      gizmos.rotationGizmoEnabled = !!target && editor.gizmo === 'rotate';
      gizmos.scaleGizmoEnabled = !!target && editor.gizmo === 'scale';
      const local = editor.gizmoSpace === 'local';
      if (gizmos.gizmos.positionGizmo) gizmos.gizmos.positionGizmo.updateGizmoRotationToMatchAttachedMesh = local;
      if (gizmos.gizmos.rotationGizmo) gizmos.gizmos.rotationGizmo.updateGizmoRotationToMatchAttachedMesh = local;
      const want = new Set<AbstractMesh>();
      if (editorView) for (const g of sel) for (const d of g.selfAndDescendants()) for (const m of backend.meshesOf(d)) want.add(m);
      for (const m of outlined)
        if (!want.has(m)) {
          if (!m.isDisposed()) m.renderOutline = false;
          outlined.delete(m);
        }
      for (const m of want)
        if (!outlined.has(m)) {
          m.renderOutline = true;
          m.outlineColor = new Color3(1, 0.62, 0.15);
          m.outlineWidth = 0.02;
          outlined.add(m);
        }
      backend.render();
      statT += dt;
      if (statT > 0.5) {
        statT = 0;
        setStats(`FPS ${backend.engine.getFps().toFixed(1)}  ·  ${(dt * 1000).toFixed(1)} ms  ·  objects ${scene.allGameObjects().length}  ·  meshes ${bscene.getActiveMeshes().length}  ·  ${editor.mode.toUpperCase()}${backend.pendingLoads ? `  ·  loading ${backend.pendingLoads}` : ''}`);
      }
    });
    const ro = new ResizeObserver(() => backend.resize());
    ro.observe(host.current!);
    (window as unknown as { __rsView: unknown }).__rsView = { backend, cam, gizmos };
    return () => {
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keyup', ku);
      gizmos.dispose();
      backend.dispose();
      editor.gameElement = null;
    };
  }, []);

  return (
    <div className="rs-panel rs-runtime">
      <div className="rs-view-bar">
        <span className="rs-view-label">View:</span>
        <select value={view} onChange={(e) => setView(e.target.value as typeof view)}>
          <option value="auto">Default</option>
          <option value="editor">Editor Camera</option>
          <option value="game">Game Camera</option>
        </select>
        <span className="rs-sep" />
        <button className={`rs-tool${editor.gizmo === 'move' ? ' active' : ''}`} title="Move (W)" onClick={() => setGizmo('move')}>
          <Icons.Move size={14} />
        </button>
        <button className={`rs-tool${editor.gizmo === 'rotate' ? ' active' : ''}`} title="Rotate (E)" onClick={() => setGizmo('rotate')}>
          <Icons.Rotate size={14} />
        </button>
        <button className={`rs-tool${editor.gizmo === 'scale' ? ' active' : ''}`} title="Scale (R)" onClick={() => setGizmo('scale')}>
          <Icons.Scale size={14} />
        </button>
        <button className={`rs-seg${editor.gizmoSpace === 'local' ? ' active' : ''}`} onClick={() => setSpace('local')}>
          Local
        </button>
        <button className={`rs-seg${editor.gizmoSpace === 'global' ? ' active' : ''}`} onClick={() => setSpace('global')}>
          Global
        </button>
        <span className="rs-sep" />
        <button className={`rs-tool${showGrid ? ' active' : ''}`} title="Grid" onClick={() => setShowGrid(!showGrid)}>
          <Icons.Grid size={14} />
        </button>
        <button className="rs-tool" title="Focus selection (F)" onClick={() => focusRef.current()}>
          <Icons.Focus size={14} />
        </button>
      </div>
      <div className="rs-view-host" ref={host}>
        <canvas ref={canvasRef} className="rs-view-canvas" tabIndex={0} data-focus-key="F" onKeyDown={(e) => e.code === 'KeyF' && !e.ctrlKey && focusRef.current()} />
        <div className="rs-view-stats">{stats}</div>
        {editor.mode !== 'edit' ? <div className="rs-play-frame" /> : null}
      </div>
    </div>
  );
}

function setGizmo(g: 'move' | 'rotate' | 'scale') {
  editor.gizmo = g;
  editor.emit('gizmo');
}
function setSpace(s: 'local' | 'global') {
  editor.gizmoSpace = s;
  editor.emit('gizmo');
}
export { setGizmo };
