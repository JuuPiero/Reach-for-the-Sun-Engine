import { useEffect, useRef, useState } from 'react';
import type { Component } from '@rs/core';
import { editor, type CreateKind, type RenderMode } from '../editor/Editor';
import { AssetBrowser } from './AssetBrowser';
import { Console } from './Console';
import { createItems, Hierarchies } from './Hierarchies';
import { useEditor } from './hooks';
import { FrameButtons } from './Frame';
import { Icons } from './icons';
import { Inspector } from './Inspector';
import { ContextMenuHost, MenuBar, showContextMenu, type MenuItem } from './Menu';
import { RuntimeView, setGizmo } from './RuntimeView';
import { ProjectSettingsWindow } from './ProjectSettings';

const LAYOUT_KEY = 'rs.layout';
type Layout = { left: number; right: number; bottom: number; preset?: string };
/** Window layouts of the toolbar's Layout drop-down. */
const LAYOUTS: Record<string, Layout> = {
  General: { left: 280, right: 380, bottom: 300 },
  'Wide View': { left: 220, right: 330, bottom: 200 },
  'Asset Work': { left: 260, right: 380, bottom: 440 },
  Inspection: { left: 300, right: 520, bottom: 260 },
};

export function App() {
  useEditor('mode', 'dirty', 'scene', 'selection', 'gizmo', 'log');
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener('rs:project-settings', open);
    return () => window.removeEventListener('rs:project-settings', open);
  }, []);
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      return { ...LAYOUTS.General, preset: 'General', ...(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as object) };
    } catch {
      return { ...LAYOUTS.General, preset: 'General' };
    }
  });
  const [bottomTab, setBottomTab] = useState<'assets' | 'console'>('assets');
  useEffect(() => localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)), [layout]);
  useEffect(() => {
    const onLayout = (e: Event) => {
      const name = String((e as CustomEvent).detail);
      if (LAYOUTS[name]) setLayout({ ...LAYOUTS[name], preset: name });
    };
    const onTab = (e: Event) => setBottomTab((e as CustomEvent).detail === 'console' ? 'console' : 'assets');
    window.addEventListener('rs:layout', onLayout);
    window.addEventListener('rs:bottom-tab', onTab);
    return () => {
      window.removeEventListener('rs:layout', onLayout);
      window.removeEventListener('rs:bottom-tab', onTab);
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && e.altKey && k === 's') (e.preventDefault(), void editor.saveAll());
      else if (ctrl && k === 's') (e.preventDefault(), void editor.saveScene(e.shiftKey));
      else if (ctrl && k === 'z' && !e.shiftKey) (e.preventDefault(), editor.undo());
      else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) (e.preventDefault(), editor.redo());
      else if (ctrl && k === 'd') (e.preventDefault(), editor.duplicateSelection());
      else if (ctrl && k === 'g') (e.preventDefault(), editor.groupSelection());
      else if (ctrl && k === 'p') (e.preventDefault(), editor.mode === 'edit' ? editor.play() : editor.stop());
      else if (ctrl && e.shiftKey && k === 'n') (e.preventDefault(), editor.create('Empty'));
      else if (e.key === 'Delete' && editor.mode === 'edit' && !t?.closest('.rs-assets')) editor.deleteSelection();
      else if (e.key === 'Escape' && editor.mode !== 'edit' && !t?.closest('.rs-view-host')) editor.stop();
      // W / E / R: gizmo (not while flying the camera with the right button held)
      else if (!ctrl && !e.altKey && (k === 'w' || k === 'e' || k === 'r') && editor.mode === 'edit' && !editor.flying) {
        setGizmo(k === 'w' ? 'move' : k === 'e' ? 'rotate' : 'scale');
      }
    };
    window.addEventListener('keydown', onKey);
    const unload = (e: BeforeUnloadEvent) => {
      if (editor.dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', unload);
    };
  }, []);

  const v = editor.view;
  const check = (label: string, on: boolean, action: () => void): MenuItem => ({ label, checked: on, action });
  const scenes = () => editor.files.filter((f) => f.path.endsWith('.scn.json'));
  const menus: { label: string; items: () => MenuItem[] }[] = [
    {
      label: 'File',
      items: () => [
        { label: 'New Scene', action: () => editor.newScene() },
        { label: 'Open Scene', submenu: scenes().length ? scenes().map((f) => ({ label: f.path.replace(/^Assets\//, ''), action: () => void editor.openScene(f.path) })) : [{ label: '(no scenes)', disabled: true }] },
        { separator: true },
        { label: 'Save Scene', shortcut: 'Ctrl+S', action: () => void editor.saveScene() },
        { label: 'Save Scene As…', shortcut: 'Ctrl+Shift+S', action: () => void editor.saveScene(true) },
        { label: 'Save All', shortcut: 'Ctrl+Alt+S', action: () => void editor.saveAll() },
        { label: 'Reload Scene', action: () => editor.scene.path && void editor.openScene(editor.scene.path), disabled: !editor.scene.path },
        { separator: true },
        { label: 'Build Game (Web)', action: () => void editor.buildGame() },
      ],
    },
    {
      label: 'Edit',
      items: () => [
        { label: `Undo${editor.undoLabels[0] ? ` ${editor.undoLabels[0]}` : ''}`, shortcut: 'Ctrl+Z', action: () => editor.undo(), disabled: !editor.canUndo },
        { label: `Redo${editor.redoLabels[0] ? ` ${editor.redoLabels[0]}` : ''}`, shortcut: 'Ctrl+Y', action: () => editor.redo(), disabled: !editor.canRedo },
        { separator: true },
        { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => editor.duplicateSelection(), disabled: !editor.selection.length },
        { label: 'Group', shortcut: 'Ctrl+G', action: () => editor.groupSelection(), disabled: !editor.selection.length },
        { label: 'Delete', shortcut: 'Del', action: () => editor.deleteSelection(), disabled: !editor.selection.length && !editor.selectedFolder },
        { label: 'Select None', action: () => editor.select([]) },
      ],
    },
    {
      label: 'View',
      items: () => [
        { label: 'Rendering', submenu: RENDER_MODES.map(([m, label]) => check(label, v.render === m, () => editor.setView({ render: m }))) },
        { separator: true },
        check('Grid', v.grid, () => editor.setView({ grid: !v.grid })),
        check('Light / Camera Icons', v.icons, () => editor.setView({ icons: !v.icons })),
        check('All Colliders', v.colliders, () => editor.setView({ colliders: !v.colliders })),
        check('In-game UI', v.ui, () => editor.setView({ ui: !v.ui })),
        check('Performance Overlay', v.stats, () => editor.setView({ stats: !v.stats })),
        check('Mute Audio', v.muted, () => editor.setView({ muted: !v.muted })),
      ],
    },
    { label: 'GameObject', items: () => createItems(() => null) },
    {
      label: 'Component',
      items: () => {
        const go = editor.selectedObjects[0];
        if (!go) return [{ label: '(select a GameObject)', disabled: true }];
        return editor.componentTypes().map((t) => ({ label: t.options.menu ?? t.name, action: () => editor.addComponent(go, t.name) }));
      },
    },
    {
      label: 'Project',
      items: () => [
        { label: 'Project Settings…', action: () => setSettingsOpen(true) },
        { label: 'Refresh Assets', action: () => void editor.refreshFiles() },
        { separator: true },
        { label: 'Build Game (Web)', action: () => void editor.buildGame() },
      ],
    },
    {
      label: 'Windows',
      items: () => [
        { label: 'Asset Browser', action: () => setBottomTab('assets') },
        { label: 'Console', action: () => setBottomTab('console') },
        { label: 'Project Settings', action: () => setSettingsOpen(true) },
        { separator: true },
        { label: 'Layout', submenu: Object.keys(LAYOUTS).map((n) => check(n, layout.preset === n, () => setLayout({ ...LAYOUTS[n], preset: n }))) },
      ],
    },
    {
      label: 'Develop',
      items: () => [
        { label: editor.mode === 'edit' ? 'Play' : 'Stop', shortcut: 'Ctrl+P', action: () => (editor.mode === 'edit' ? editor.play() : editor.stop()) },
        { label: 'Pause', action: () => editor.pause(), disabled: editor.mode === 'edit' },
        { label: 'Step Frame', action: () => editor.stepFrame() },
        { separator: true },
        { label: 'Clear Console', action: () => editor.clearLogs() },
      ],
    },
    { label: 'Help', items: () => [{ label: 'RS Engine 0.1 — RE-style editor on Babylon.js', disabled: true }, { label: 'User guide: README.md of the engine', disabled: true }] },
  ];

  return (
    <div className={`rs-app mode-${editor.mode}`}>
      <MenuBar menus={menus} right={<span className="rs-project-name">{editor.projectName}</span>} />
      <Toolbar layout={layout} />
      <div className="rs-main" style={{ gridTemplateColumns: `${layout.left}px 4px 1fr 4px ${layout.right}px`, gridTemplateRows: `1fr 4px ${layout.bottom}px` }}>
        <PanelFrame title="Hierarchies" icon={<Icons.Scene size={12} />} help="Folders and GameObjects of the scene" style={{ gridColumn: 1, gridRow: '1 / span 1' }}>
          <Hierarchies />
        </PanelFrame>
        <Splitter axis="x" style={{ gridColumn: 2, gridRow: '1 / span 3' }} onDrag={(d) => setLayout((l) => ({ ...l, preset: undefined, left: Math.max(160, Math.min(600, l.left + d)) }))} />
        <div className="rs-center" style={{ gridColumn: 3, gridRow: 1 }}>
          <MacroShelf />
          {editor.prefabMode ? (
            <div className="rs-prefab-mode">
              <Icons.Prefab size={14} />
              <span>
                Prefab Mode: <b>{editor.prefabMode.path}</b>
                {editor.dirty ? ' *' : ''}
              </span>
              <span className="rs-grow" />
              <button className="rs-btn small" onClick={() => void editor.savePrefab()}>
                Save Prefab
              </button>
              <button className="rs-btn small" onClick={() => void editor.closePrefab()}>
                ◀ Back to {editor.prefabMode.back?.name ?? 'scene'}
              </button>
            </div>
          ) : null}
          <PanelFrame title="Runtime" tabbed help="Scene view while editing, game view while playing" grow>
            <RuntimeView />
          </PanelFrame>
        </div>
        <Splitter axis="x" style={{ gridColumn: 4, gridRow: '1 / span 3' }} onDrag={(d) => setLayout((l) => ({ ...l, preset: undefined, right: Math.max(240, Math.min(700, l.right - d)) }))} />
        <PanelFrame title={null} style={{ gridColumn: 5, gridRow: '1 / span 3' }}>
          <Inspector />
        </PanelFrame>
        <Splitter axis="y" style={{ gridColumn: '1 / span 3', gridRow: 2 }} onDrag={(d) => setLayout((l) => ({ ...l, preset: undefined, bottom: Math.max(120, Math.min(700, l.bottom - d)) }))} />
        <div className="rs-bottom rs-frame" style={{ gridColumn: '1 / span 3', gridRow: 3 }}>
          <div className="rs-tabs">
            <div className={`rs-tab${bottomTab === 'assets' ? ' active' : ''}`} onClick={() => setBottomTab('assets')}>
              <Icons.Folder size={12} /> Asset Browser
            </div>
            <div className={`rs-tab${bottomTab === 'console' ? ' active' : ''}`} onClick={() => setBottomTab('console')}>
              <Icons.Console size={12} /> Console
              {editor.logs.some((l) => l.level === 'error') ? <span className="rs-tab-badge err">!</span> : null}
            </div>
            <span className="rs-grow" />
            <FrameButtons help={bottomTab === 'assets' ? 'Project files: folders, scenes, prefabs, UserData, scripts…' : 'Log messages of the editor and the game'} />
          </div>
          {bottomTab === 'assets' ? <AssetBrowser /> : <Console />}
        </div>
      </div>
      <ContextMenuHost />
      {settingsOpen ? <ProjectSettingsWindow onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}

const RENDER_MODES: [RenderMode, string][] = [
  ['default', 'Default'],
  ['wireframe', 'Wireframe'],
  ['points', 'Points'],
  ['bounds', 'Bounding Boxes'],
  ['nopost', 'No Post Effects'],
];

function PanelFrame({ title, icon, help, children, style, grow, tabbed }: { title: string | null; icon?: React.ReactNode; help?: string; children: React.ReactNode; style?: React.CSSProperties; grow?: boolean; tabbed?: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [pinned, setPinned] = useState(false);
  return (
    <div className={`rs-frame${grow ? ' grow' : ''}${hidden ? ' folded' : ''}${tabbed ? ' tabbed' : ''}`} style={style}>
      {title ? (
        <div className="rs-tabs" onDoubleClick={() => setHidden(!hidden)}>
          <div className="rs-tab active">
            {icon}
            {title}
          </div>
          <span className="rs-grow" />
          <FrameButtons help={help ?? title} pinned={pinned} onPin={() => setPinned(!pinned)} onClose={() => !pinned && setHidden(!hidden)} />
        </div>
      ) : null}
      <div className="rs-frame-body" style={hidden ? { display: 'none' } : undefined}>
        {children}
      </div>
    </div>
  );
}

function Splitter({ axis, style, onDrag }: { axis: 'x' | 'y'; style: React.CSSProperties; onDrag: (d: number) => void }) {
  const last = useRef(0);
  return (
    <div
      className={`rs-splitter ${axis}`}
      style={style}
      onMouseDown={(e) => {
        e.preventDefault();
        last.current = axis === 'x' ? e.clientX : e.clientY;
        const move = (m: MouseEvent) => {
          const v = axis === 'x' ? m.clientX : m.clientY;
          onDrag(v - last.current);
          last.current = v;
        };
        const up = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      }}
    />
  );
}

/** Small ▾ next to a tool button: opens a menu under it. */
function DropArrow({ items, title, disabled }: { items: () => MenuItem[]; title: string; disabled?: boolean }) {
  return (
    <button
      className="rs-tool rs-drop"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        showContextMenu({ clientX: r.left - 20, clientY: r.bottom }, items());
      }}
    >
      <Icons.Chevron size={8} className="rs-drop-chev" />
    </button>
  );
}

function Toolbar({ layout }: { layout: Layout }) {
  useEditor('mode', 'dirty', 'scene', 'files', 'gizmo');
  const m = editor.mode;
  const scenes = editor.files.filter((f) => f.path.endsWith('.scn.json'));
  const history = (labels: string[], dir: 1 | -1): MenuItem[] =>
    labels.length ? labels.slice(0, 20).map((l, i) => ({ label: `${i + 1}. ${l}`, action: () => editor.undoSteps(dir * (i + 1)) })) : [{ label: '(empty)', disabled: true }];
  return (
    <div className="rs-toolbar">
      <button className="rs-tool" title="New Scene" onClick={() => editor.newScene()}>
        <Icons.NewFile size={16} />
      </button>
      <button
        className="rs-tool"
        title="Open Scene…"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          showContextMenu({ clientX: r.left, clientY: r.bottom }, scenes.length ? scenes.map((f) => ({ label: f.path.replace(/^Assets\//, ''), action: () => void editor.openScene(f.path) })) : [{ label: '(no scenes)', disabled: true }]);
        }}
      >
        <Icons.Open size={16} />
      </button>
      <button className="rs-tool" title="Save Scene (Ctrl+S)" onClick={() => void editor.saveScene()}>
        <Icons.Save size={16} />
      </button>
      <button className="rs-tool" title="Save All (Ctrl+Alt+S): scene, sub-scenes and pending UserData" onClick={() => void editor.saveAll()}>
        <Icons.SaveAll size={16} />
      </button>
      <span className="rs-sep" />
      <button className="rs-tool" title={`Undo ${editor.undoLabels[0] ?? ''} (Ctrl+Z)`} disabled={!editor.canUndo} onClick={() => editor.undo()}>
        <Icons.Undo size={16} />
      </button>
      <DropArrow title="Undo history" disabled={!editor.canUndo} items={() => history(editor.undoLabels, 1)} />
      <button className="rs-tool" title={`Redo ${editor.redoLabels[0] ?? ''} (Ctrl+Y)`} disabled={!editor.canRedo} onClick={() => editor.redo()}>
        <Icons.Redo size={16} />
      </button>
      <DropArrow title="Redo history" disabled={!editor.canRedo} items={() => history(editor.redoLabels, -1)} />
      <span className="rs-sep" />
      <button className={`rs-tool${editor.view.snap > 0 ? ' active' : ''}`} title="Snap gizmo moves to 0.5 m / rotations to 15°" onClick={() => editor.setView({ snap: editor.view.snap > 0 ? 0 : 0.5 })}>
        <Icons.Link size={16} />
      </button>
      <span className="rs-sep" />
      <span className="rs-toolbar-label">Target:</span>
      <select
        className="rs-toolbar-target"
        title="Scene being edited (pick another to open it)"
        value={editor.scene.path ?? ''}
        onChange={(e) => e.target.value && void editor.openScene(e.target.value)}
      >
        {editor.scene.path ? null : <option value="">★ (unsaved)</option>}
        {scenes.map((f) => (
          <option key={f.path} value={f.path}>
            ★ {f.path.slice(f.path.lastIndexOf('/') + 1).replace(/\.scn\.json$/, '')}
            {f.path === editor.scene.path && editor.dirty ? ' *' : ''}
          </option>
        ))}
      </select>
      <button className="rs-tool" title="Project Settings" onClick={() => window.dispatchEvent(new Event('rs:project-settings'))}>
        <Icons.Gear size={16} />
      </button>
      <DropArrow
        title="Settings"
        items={() => [
          { label: 'Project Settings…', action: () => window.dispatchEvent(new Event('rs:project-settings')) },
          { label: 'Refresh Assets', action: () => void editor.refreshFiles() },
        ]}
      />
      <button className="rs-tool" title="Reload Scene" disabled={!editor.scene.path} onClick={() => editor.scene.path && void editor.openScene(editor.scene.path)}>
        <Icons.Refresh size={16} />
      </button>
      <span className="rs-sep" />
      <button className="rs-tool stop" title="Stop (Esc)" disabled={m === 'edit'} onClick={() => editor.stop()}>
        <Icons.Stop size={16} />
      </button>
      <button className={`rs-tool play boxed${m === 'play' ? ' active' : ''}`} title="Play (Ctrl+P)" onClick={() => (m === 'edit' ? editor.play() : m === 'pause' ? editor.pause() : undefined)}>
        <Icons.Play size={16} />
      </button>
      <button className={`rs-tool${m === 'pause' ? ' active' : ''}`} title="Pause" disabled={m === 'edit'} onClick={() => editor.pause()}>
        <Icons.Pause size={16} />
      </button>
      <button className="rs-tool" title="Step Frame" onClick={() => editor.stepFrame()}>
        <Icons.Step size={16} />
      </button>
      <div style={{ flex: 1 }} />
      <button
        className="rs-toolbar-layout"
        title="Window layout"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          showContextMenu({ clientX: r.left, clientY: r.bottom }, Object.keys(LAYOUTS).map((n) => ({ label: n, checked: layout.preset === n, action: () => window.dispatchEvent(new CustomEvent('rs:layout', { detail: n })) })));
        }}
      >
        <Icons.Layout size={13} /> Layout({layout.preset ?? 'Custom'}) <Icons.Chevron size={8} className="rs-drop-chev" />
      </button>
      <button className={`rs-tool${editor.view.stats ? ' active' : ''}`} title="Performance overlay" onClick={() => editor.setView({ stats: !editor.view.stats })}>
        <Icons.Chart size={16} />
      </button>
      <button className="rs-tool" title="Build Game (Web)" onClick={() => void editor.buildGame()}>
        <Icons.Build size={16} />
      </button>
    </div>
  );
}

type ShelfItem = { label: string; icon: keyof typeof Icons; kind?: CreateKind; action?: () => void; title?: string };
const addComp = (type: string, init?: (c: Component) => void) => () => void editor.addToSelection(type, init);
const set = (o: Record<string, unknown>) => (c: Component) => void Object.assign(c, o);
/** Macro Shelf: two rows of category tabs, square buttons that create / add / toggle in one click. */
const SHELVES: { name: string; items: ShelfItem[] }[] = [
  {
    name: 'Common',
    items: [
      { label: 'Empty', icon: 'Empty', kind: 'Empty' },
      { label: 'Folder', icon: 'Folder', action: () => editor.createFolder() },
      { label: 'Group', icon: 'CollapseAll', action: () => editor.groupSelection(), title: 'Put the selection under a new object (Ctrl+G)' },
      { label: 'Duplicate', icon: 'Prefab', action: () => editor.duplicateSelection() },
      { label: 'Delete', icon: 'Trash', action: () => editor.deleteSelection() },
    ],
  },
  {
    name: 'Primitive',
    items: [
      { label: 'Cube', icon: 'Cube', kind: 'Box' },
      { label: 'Sphere', icon: 'Sphere', kind: 'Sphere' },
      { label: 'Cylinder', icon: 'Cylinder', kind: 'Cylinder' },
      { label: 'Capsule', icon: 'Capsule', kind: 'Capsule' },
      { label: 'Plane', icon: 'Plane', kind: 'Plane' },
      { label: 'Floor', icon: 'Plane', kind: 'Ground' },
      { label: 'Torus', icon: 'Torus', kind: 'Torus' },
    ],
  },
  {
    name: 'Light',
    items: [
      { label: 'Direct', icon: 'Sun', kind: 'DirectionalLight' },
      { label: 'Point', icon: 'Bulb', kind: 'PointLight' },
      { label: 'Spot', icon: 'Spot', kind: 'SpotLight' },
      { label: 'Ambient', icon: 'Ambient', kind: 'AmbientLight' },
    ],
  },
  {
    name: 'Camera',
    items: [
      { label: 'Camera', icon: 'Camera', kind: 'Camera' },
      { label: 'To View', icon: 'Focus', action: () => window.dispatchEvent(new Event('rs:align-to-view')), title: 'Move the selected object to the editor camera' },
    ],
  },
  {
    name: 'Collision',
    items: [
      { label: 'Box', icon: 'Collider', action: addComp('Collider', set({ shape: 'Box' })), title: 'Add a box Collider to the selection' },
      { label: 'Sphere', icon: 'Sphere', action: addComp('Collider', set({ shape: 'Sphere' })), title: 'Add a sphere Collider to the selection' },
      { label: 'Capsule', icon: 'Capsule', action: addComp('Collider', set({ shape: 'Capsule' })), title: 'Add a capsule Collider to the selection' },
      { label: 'Trigger', icon: 'Collider', action: addComp('Collider', set({ shape: 'Box', isTrigger: true })), title: 'Add a trigger box to the selection' },
    ],
  },
  {
    name: 'Dynamics',
    items: [
      { label: 'Dynamic', icon: 'Body', action: addComp('RigidBody'), title: 'Add a Dynamic RigidBody to the selection' },
      { label: 'Kinematic', icon: 'Body', action: addComp('RigidBody', set({ bodyType: 'Kinematic' })), title: 'Add a Kinematic RigidBody to the selection' },
      { label: 'Character', icon: 'Capsule', action: addComp('CharacterController'), title: 'Add a CharacterController to the selection' },
      {
        label: 'Crate',
        icon: 'Cube',
        title: 'A cube with a box Collider and a Dynamic RigidBody',
        action: () => {
          editor.create('Box').name = 'Crate';
          editor.addToSelection('Collider');
          editor.addToSelection('RigidBody');
        },
      },
    ],
  },
  {
    name: 'Motion',
    items: [
      { label: 'Motion', icon: 'Play', action: addComp('Motion'), title: 'Add Motion (animation clips of the model) to the selection' },
      { label: 'FSM', icon: 'Fsm', action: () => void editor.createFsm(), title: 'New Motion FSM asset' },
    ],
  },
  {
    name: 'Material',
    items: [{ label: 'Material', icon: 'Material', action: () => void editor.createUserData('Material'), title: 'New material asset' }],
  },
  {
    name: 'VFX',
    items: [{ label: 'Particles', icon: 'Particles', kind: 'ParticleSystem' }],
  },
  {
    name: 'Env',
    items: [{ label: 'Environ.', icon: 'Environment', kind: 'Environment', title: 'Sky, fog, tone mapping, bloom' }],
  },
  {
    name: 'UI',
    items: [
      { label: 'Text', icon: 'Text', kind: 'UIText' },
      { label: 'Button', icon: 'Button', kind: 'UIButton' },
      { label: 'Image', icon: 'Image', kind: 'UIImage' },
      { label: 'Panel', icon: 'Panel', kind: 'UIPanel' },
    ],
  },
  {
    name: 'Sound',
    items: [
      { label: 'Source', icon: 'Audio', kind: 'AudioSource' },
      { label: 'Listener', icon: 'Speaker', action: addComp('AudioListener'), title: 'Add an AudioListener to the selection' },
    ],
  },
  {
    name: 'Asset',
    items: [
      { label: 'Script', icon: 'Script', action: () => void editor.createScript() },
      { label: 'Scene', icon: 'Scene', action: () => void editor.createSceneAsset() },
      { label: 'Prefab', icon: 'Prefab', action: () => editor.selectedObjects[0] && void editor.createPrefab(editor.selectedObjects[0]), title: 'Prefab from the selected object' },
    ],
  },
  {
    name: 'Render',
    items: RENDER_MODES.map(([m, label]) => ({
      label: label.split(' ')[0],
      icon: m === 'wireframe' ? 'Wire' : m === 'bounds' ? 'Collider' : m === 'points' ? 'Particles' : m === 'nopost' ? 'Environment' : 'Cube',
      action: () => editor.setView({ render: m }),
      title: `Rendering: ${label}`,
    })),
  },
  {
    name: 'Debug',
    items: [
      { label: 'Colliders', icon: 'Collider', action: () => editor.setView({ colliders: !editor.view.colliders }), title: 'Show every collider' },
      { label: 'Grid', icon: 'Grid', action: () => editor.setView({ grid: !editor.view.grid }) },
      { label: 'Icons', icon: 'Bulb2', action: () => editor.setView({ icons: !editor.view.icons }) },
      { label: 'Console', icon: 'Console', action: () => window.dispatchEvent(new CustomEvent('rs:bottom-tab', { detail: 'console' })) },
    ],
  },
  {
    name: 'Profiler',
    items: [{ label: 'Stats', icon: 'Chart', action: () => editor.setView({ stats: !editor.view.stats }), title: 'Performance overlay' }],
  },
  {
    name: 'Viewer',
    items: [
      { label: 'Focus', icon: 'Focus', action: () => window.dispatchEvent(new Event('rs:focus')), title: 'Frame the selection (F)' },
      { label: 'Mute', icon: 'Mute', action: () => editor.setView({ muted: !editor.view.muted }) },
    ],
  },
];

const SHELF_KEY = 'rs.shelfTab';

/** RE-style Macro Shelf: two rows of category tabs over one-click buttons. */
function MacroShelf() {
  const [tab, setTab] = useState(() => {
    try {
      return Math.max(0, SHELVES.findIndex((s) => s.name === localStorage.getItem(SHELF_KEY)));
    } catch {
      return 0;
    }
  });
  const [folded, setFolded] = useState(false);
  const shelf = SHELVES[tab] ?? SHELVES[0];
  const half = Math.ceil(SHELVES.length / 2);
  const pick = (i: number) => {
    setTab(i);
    localStorage.setItem(SHELF_KEY, SHELVES[i].name);
  };
  const row = (from: number, to: number) => (
    <div className="rs-shelf-row">
      {SHELVES.slice(from, to).map((s, j) => (
        <span key={s.name} className={`rs-shelf-tab${from + j === tab ? ' active' : ''}`} onClick={() => pick(from + j)}>
          {s.name}
        </span>
      ))}
    </div>
  );
  return (
    <div className="rs-shelf rs-frame">
      <div className="rs-tabs" onDoubleClick={() => setFolded(!folded)}>
        <div className="rs-tab active">Macro Shelf</div>
        <span className="rs-grow" />
        <FrameButtons help="One-click buttons grouped by category" onClose={() => setFolded(!folded)} />
      </div>
      {folded ? null : (
        <>
          <div className="rs-shelf-tabs">
            <div className="rs-shelf-rows" style={{ gridTemplateColumns: `repeat(${half}, auto)` }}>
              {row(0, half)}
              {row(half, SHELVES.length)}
            </div>
            <Icons.Search size={12} className="rs-dim" />
          </div>
          <div className="rs-shelf-buttons">
            {shelf.items.map((it) => {
              const I = Icons[it.icon];
              return (
                <button key={it.label} className="rs-shelf-btn" onClick={() => (it.kind ? editor.create(it.kind) : it.action?.())} title={it.title ?? it.label}>
                  <I size={18} />
                  <span>{it.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
