import { useEffect, useRef, useState } from 'react';
import { editor, type CreateKind } from '../editor/Editor';
import { AssetBrowser } from './AssetBrowser';
import { Console } from './Console';
import { createItems, Hierarchies } from './Hierarchies';
import { useEditor } from './hooks';
import { Icons } from './icons';
import { Inspector } from './Inspector';
import { ContextMenuHost, MenuBar, type MenuItem } from './Menu';
import { RuntimeView, setGizmo } from './RuntimeView';

const LAYOUT_KEY = 'rs.layout';

export function App() {
  useEditor('mode', 'dirty', 'scene', 'selection');
  const [layout, setLayout] = useState(() => {
    try {
      return { left: 280, right: 380, bottom: 300, ...(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as object) };
    } catch {
      return { left: 280, right: 380, bottom: 300 };
    }
  });
  const [bottomTab, setBottomTab] = useState<'assets' | 'console'>('assets');
  useEffect(() => localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)), [layout]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === 's') (e.preventDefault(), void editor.saveScene(e.shiftKey));
      else if (ctrl && k === 'z' && !e.shiftKey) (e.preventDefault(), editor.undo());
      else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) (e.preventDefault(), editor.redo());
      else if (ctrl && k === 'd') (e.preventDefault(), editor.duplicateSelection());
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

  const menus: { label: string; items: () => MenuItem[] }[] = [
    {
      label: 'File',
      items: () => [
        { label: 'New Scene', action: () => editor.newScene() },
        { label: 'Save Scene', shortcut: 'Ctrl+S', action: () => void editor.saveScene() },
        { label: 'Reload Scene', action: () => editor.scene.path && void editor.openScene(editor.scene.path), disabled: !editor.scene.path },
        { label: 'Save Scene As…', shortcut: 'Ctrl+Shift+S', action: () => void editor.saveScene(true) },
        { separator: true },
        { label: 'Build Game (Web)', action: () => void editor.buildGame() },
      ],
    },
    {
      label: 'Edit',
      items: () => [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: () => editor.undo(), disabled: !editor.canUndo },
        { label: 'Redo', shortcut: 'Ctrl+Y', action: () => editor.redo(), disabled: !editor.canRedo },
        { separator: true },
        { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => editor.duplicateSelection(), disabled: !editor.selection.length },
        { label: 'Delete', shortcut: 'Del', action: () => editor.deleteSelection(), disabled: !editor.selection.length && !editor.selectedFolder },
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
      label: 'Play',
      items: () => [
        { label: editor.mode === 'edit' ? 'Play' : 'Stop', shortcut: 'Ctrl+P', action: () => (editor.mode === 'edit' ? editor.play() : editor.stop()) },
        { label: 'Pause', action: () => editor.pause(), disabled: editor.mode === 'edit' },
        { label: 'Step Frame', action: () => editor.stepFrame() },
      ],
    },
    { label: 'Help', items: () => [{ label: 'RS Engine 0.1 — RE-style editor on Babylon.js', disabled: true }] },
  ];

  return (
    <div className={`rs-app mode-${editor.mode}`}>
      <MenuBar menus={menus} right={<span className="rs-project-name">{editor.projectName}</span>} />
      <Toolbar />
      <div className="rs-main" style={{ gridTemplateColumns: `${layout.left}px 4px 1fr 4px ${layout.right}px`, gridTemplateRows: `1fr 4px ${layout.bottom}px` }}>
        <PanelFrame title="Hierarchies" style={{ gridColumn: 1, gridRow: '1 / span 1' }}>
          <Hierarchies />
        </PanelFrame>
        <Splitter axis="x" style={{ gridColumn: 2, gridRow: '1 / span 3' }} onDrag={(d) => setLayout((l) => ({ ...l, left: Math.max(160, Math.min(600, l.left + d)) }))} />
        <div className="rs-center" style={{ gridColumn: 3, gridRow: 1 }}>
          <MacroShelf />
          <PanelFrame title="Runtime" grow>
            <RuntimeView />
          </PanelFrame>
        </div>
        <Splitter axis="x" style={{ gridColumn: 4, gridRow: '1 / span 3' }} onDrag={(d) => setLayout((l) => ({ ...l, right: Math.max(240, Math.min(700, l.right - d)) }))} />
        <PanelFrame title={null} style={{ gridColumn: 5, gridRow: '1 / span 3' }}>
          <Inspector />
        </PanelFrame>
        <Splitter axis="y" style={{ gridColumn: '1 / span 3', gridRow: 2 }} onDrag={(d) => setLayout((l) => ({ ...l, bottom: Math.max(120, Math.min(700, l.bottom - d)) }))} />
        <div className="rs-bottom" style={{ gridColumn: '1 / span 3', gridRow: 3 }}>
          <div className="rs-tabs">
            <div className={`rs-tab${bottomTab === 'assets' ? ' active' : ''}`} onClick={() => setBottomTab('assets')}>
              <Icons.Folder size={12} /> AssetBrowser
            </div>
            <div className={`rs-tab${bottomTab === 'console' ? ' active' : ''}`} onClick={() => setBottomTab('console')}>
              <Icons.Console size={12} /> Console
            </div>
          </div>
          {bottomTab === 'assets' ? <AssetBrowser /> : <Console />}
        </div>
      </div>
      <ContextMenuHost />
    </div>
  );
}

function PanelFrame({ title, children, style, grow }: { title: string | null; children: React.ReactNode; style?: React.CSSProperties; grow?: boolean }) {
  return (
    <div className={`rs-frame${grow ? ' grow' : ''}`} style={style}>
      {title ? (
        <div className="rs-tabs">
          <div className="rs-tab active">{title}</div>
        </div>
      ) : null}
      <div className="rs-frame-body">{children}</div>
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

function Toolbar() {
  useEditor('mode', 'dirty', 'scene');
  const m = editor.mode;
  return (
    <div className="rs-toolbar">
      <button className="rs-tool" title="New Scene" onClick={() => editor.newScene()}>
        <Icons.NewFile size={16} />
      </button>
      <button className="rs-tool" title="Save Scene (Ctrl+S)" onClick={() => void editor.saveScene()}>
        <Icons.Save size={16} />
      </button>
      <span className="rs-sep" />
      <button className="rs-tool" title="Undo (Ctrl+Z)" disabled={!editor.canUndo} onClick={() => editor.undo()}>
        <Icons.Undo size={16} />
      </button>
      <button className="rs-tool" title="Redo (Ctrl+Y)" disabled={!editor.canRedo} onClick={() => editor.redo()}>
        <Icons.Redo size={16} />
      </button>
      <span className="rs-sep" />
      <span className="rs-toolbar-label">Scene:</span>
      <span className="rs-toolbar-scene">
        {editor.scene.path ?? '(unsaved)'}
        {editor.dirty ? ' *' : ''}
      </span>
      <div style={{ flex: 1 }} />
      <button className={`rs-tool play${m === 'play' ? ' active' : ''}`} title="Play (Ctrl+P)" onClick={() => (m === 'edit' ? editor.play() : m === 'pause' ? editor.pause() : undefined)}>
        <Icons.Play size={16} />
      </button>
      <button className={`rs-tool${m === 'pause' ? ' active' : ''}`} title="Pause" disabled={m === 'edit'} onClick={() => editor.pause()}>
        <Icons.Pause size={16} />
      </button>
      <button className="rs-tool" title="Step Frame" onClick={() => editor.stepFrame()}>
        <Icons.Step size={16} />
      </button>
      <button className="rs-tool stop" title="Stop" disabled={m === 'edit'} onClick={() => editor.stop()}>
        <Icons.Stop size={16} />
      </button>
      <div style={{ flex: 1 }} />
      <button className="rs-tool" title="Build Game (Web)" onClick={() => void editor.buildGame()}>
        <Icons.Build size={16} />
      </button>
    </div>
  );
}

const SHELVES: { name: string; items: { label: string; icon: keyof typeof Icons; kind?: CreateKind; action?: () => void }[] }[] = [
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
    name: 'Level',
    items: [
      { label: 'Empty', icon: 'Empty', kind: 'Empty' },
      { label: 'Folder', icon: 'Folder', action: () => editor.createFolder() },
      { label: 'Camera', icon: 'Camera', kind: 'Camera' },
    ],
  },
  {
    name: 'Asset',
    items: [
      { label: 'Script', icon: 'Script', action: () => void editor.createScript() },
      { label: 'Scene', icon: 'Scene', action: () => void editor.createSceneAsset() },
      { label: 'Prefab', icon: 'Prefab', action: () => editor.selectedObjects[0] && void editor.createPrefab(editor.selectedObjects[0]) },
    ],
  },
];

/** RE-style Macro Shelf: tabs of one-click creation buttons. */
function MacroShelf() {
  const [tab, setTab] = useState(0);
  const shelf = SHELVES[tab];
  return (
    <div className="rs-shelf">
      <div className="rs-tabs">
        <div className="rs-tab active">Macro Shelf</div>
      </div>
      <div className="rs-shelf-tabs">
        {SHELVES.map((s, i) => (
          <span key={s.name} className={`rs-shelf-tab${i === tab ? ' active' : ''}`} onClick={() => setTab(i)}>
            {s.name}
          </span>
        ))}
      </div>
      <div className="rs-shelf-buttons">
        {shelf.items.map((it) => {
          const I = Icons[it.icon];
          return (
            <button key={it.label} className="rs-shelf-btn" onClick={() => (it.kind ? editor.create(it.kind) : it.action?.())} title={it.label}>
              <I size={18} />
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
