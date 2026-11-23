import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Types, type Folder, type GameObject } from '@rs/core';
import { editor, isAncestor, type CreateKind } from '../editor/Editor';
import { useEditor, useTicker } from './hooks';
import { Icons, objectIcon } from './icons';
import { showContextMenu, type MenuItem } from './Menu';

/** Create menu items (Hierarchies right-click, GameObject menu). */
export function createItems(where: () => Folder | GameObject | null): MenuItem[] {
  const c = (kind: CreateKind) => () => editor.create(kind, where());
  return [
    { label: 'Empty GameObject', action: c('Empty'), shortcut: 'Ctrl+Shift+N' },
    { label: 'Folder', action: () => editor.createFolder() },
    { separator: true },
    { label: 'Primitive', submenu: (['Box', 'Sphere', 'Cylinder', 'Capsule', 'Plane', 'Ground', 'Torus'] as const).map((k) => ({ label: k, action: c(k) })) },
    { label: 'Light', submenu: [{ label: 'Directional Light', action: c('DirectionalLight') }, { label: 'Point Light', action: c('PointLight') }, { label: 'Spot Light', action: c('SpotLight') }, { label: 'Ambient Light', action: c('AmbientLight') }] },
    { label: 'Camera', action: c('Camera') },
  ];
}

const DT_OBJECTS = 'application/rs-objects';
const DT_FOLDER = 'application/rs-folder';
export const DT_ASSET = 'application/rs-asset';

type Row = { kind: 'folder'; folder: Folder; depth: number; key: string } | { kind: 'object'; go: GameObject; depth: number; key: string };

export function Hierarchies() {
  useEditor('scene', 'selection', 'mode');
  useTicker(editor.mode === 'play', 500);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState('');
  useEffect(() => {
    const f = (e: Event) => setFilter(String((e as CustomEvent).detail ?? ''));
    window.addEventListener('rs:search', f);
    return () => window.removeEventListener('rs:search', f);
  }, []);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ key: string; zone: 'before' | 'into' | 'after' } | null>(null);
  const scene = editor.scene;

  const rows = useMemo(() => {
    const out: Row[] = [];
    const f = filter.trim().toLowerCase();
    if (f) {
      for (const g of scene.allGameObjects()) if (g.name.toLowerCase().includes(f)) out.push({ kind: 'object', go: g, depth: 0, key: `g:${g.id}` });
      return out;
    }
    const addObj = (g: GameObject, depth: number) => {
      const key = `g:${g.id}`;
      out.push({ kind: 'object', go: g, depth, key });
      if (!collapsed.has(key)) for (const c of g.children) addObj(c, depth + 1);
    };
    const addFolder = (fo: Folder, depth: number) => {
      const key = `f:${fo.path}`;
      out.push({ kind: 'folder', folder: fo, depth, key });
      if (collapsed.has(key)) return;
      for (const sub of fo.folders) addFolder(sub, depth + 1);
      for (const g of fo.gameObjects) addObj(g, depth + 1);
    };
    for (const sub of scene.root.folders) addFolder(sub, 0);
    for (const g of scene.root.gameObjects) addObj(g, 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, scene.version, collapsed, filter, editor.selection, editor.mode]);

  const toggle = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const clickRow = (r: Row, e: React.MouseEvent) => {
    if (r.kind === 'folder') return editor.selectFolder(r.folder.path);
    if (e.shiftKey && editor.selection.length) {
      const objs = rows.filter((x): x is Extract<Row, { kind: 'object' }> => x.kind === 'object');
      const a = objs.findIndex((x) => x.go.id === editor.selection[editor.selection.length - 1]);
      const b = objs.findIndex((x) => x.go.id === r.go.id);
      if (a >= 0 && b >= 0) return editor.select(objs.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.go.id));
    }
    editor.select([r.go.id], e.ctrlKey || e.metaKey);
  };

  const rowMenu = (r: Row | null, e: React.MouseEvent) => {
    if (r && r.kind === 'object' && !editor.selection.includes(r.go.id)) editor.select([r.go.id]);
    if (r && r.kind === 'folder') editor.selectFolder(r.folder.path);
    const items: MenuItem[] = [{ label: 'Create', submenu: createItems(() => (r?.kind === 'object' ? r.go : r?.kind === 'folder' ? r.folder : null)) }];
    if (r) {
      items.push(
        { separator: true },
        { label: 'Rename', shortcut: 'F2', action: () => setRenaming(r.key) },
        ...(r.kind === 'object'
          ? [
              { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => editor.duplicateSelection() },
              { label: 'Create Prefab', action: () => void editor.createPrefab(r.go) },
              { label: 'Unparent', disabled: !r.go.parent, action: () => editor.moveObjects(editor.selection, { folder: r.go.folder ?? scene.root }) },
            ]
          : []),
        { label: 'Delete', shortcut: 'Del', action: () => editor.deleteSelection(), disabled: r.kind === 'folder' && !r.folder.parent },
      );
    }
    showContextMenu(e, items);
  };

  // ---- drag & drop
  const onDragStart = (r: Row, e: DragEvent) => {
    if (r.kind === 'object') {
      const ids = editor.selection.includes(r.go.id) ? editor.selection : [r.go.id];
      if (!editor.selection.includes(r.go.id)) editor.select([r.go.id]);
      e.dataTransfer.setData(DT_OBJECTS, JSON.stringify(ids));
    } else e.dataTransfer.setData(DT_FOLDER, r.folder.path);
    e.dataTransfer.effectAllowed = 'copyMove';
  };
  const zoneOf = (e: DragEvent): 'before' | 'into' | 'after' => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into';
  };
  const onDragOver = (r: Row | null, e: DragEvent) => {
    const t = e.dataTransfer.types;
    if (!t.includes(DT_OBJECTS) && !t.includes(DT_FOLDER) && !t.includes(DT_ASSET)) return;
    e.preventDefault();
    e.stopPropagation();
    setDrop(r ? { key: r.key, zone: zoneOf(e) } : { key: '', zone: 'into' });
  };
  const onDrop = (r: Row | null, e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const zone = r ? zoneOf(e) : 'into';
    setDrop(null);
    // target container + index
    let target: { parent: GameObject } | { folder: Folder } = { folder: scene.root };
    let index = -1;
    if (r?.kind === 'folder') {
      if (zone === 'into' || !r.folder.parent) target = { folder: r.folder };
      else {
        target = { folder: r.folder.parent };
        index = -1;
      }
    } else if (r?.kind === 'object') {
      if (zone === 'into') target = { parent: r.go };
      else {
        const p = r.go.parent;
        const list = p ? p.children : (r.go.folder ?? scene.root).gameObjects;
        target = p ? { parent: p } : { folder: r.go.folder ?? scene.root };
        index = list.indexOf(r.go) + (zone === 'after' ? 1 : 0);
      }
    }
    const asset = e.dataTransfer.getData(DT_ASSET);
    if (asset) {
      if (asset.endsWith('.pfb.json')) void editor.instantiatePrefab(asset, 'parent' in target ? target.parent : target.folder);
      else if (asset.endsWith('.scn.json') && 'folder' in target) void editor.linkScene(asset, target.folder);
      return;
    }
    const folderPath = e.dataTransfer.getData(DT_FOLDER);
    if (folderPath) {
      if ('folder' in target) editor.moveFolder(folderPath, target.folder);
      return;
    }
    const ids = JSON.parse(e.dataTransfer.getData(DT_OBJECTS) || '[]') as number[];
    if (ids.length) {
      // dropping before / after a sibling of the same container: the index shifts once the objects leave it
      if (index >= 0 && 'folder' in target)
        index -= target.folder.gameObjects.slice(0, index).filter((g) => ids.includes(g.id)).length;
      if (index >= 0 && 'parent' in target) index -= target.parent.children.slice(0, index).filter((g) => ids.includes(g.id)).length;
      editor.moveObjects(ids, target, index);
    }
  };

  return (
    <div className="rs-panel rs-hierarchies">
      <div className="rs-panel-tools">
        <div className="rs-search">
          <Icons.Search size={12} />
          <input placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
      </div>
      <div className="rs-scene-tab">
        <Icons.Scene size={12} />
        <span>
          {scene.name}
          {editor.dirty ? '*' : ''}
        </span>
      </div>
      <div className="rs-tree" onContextMenu={(e) => rowMenu(null, e)} onDragOver={(e) => onDragOver(null, e)} onDrop={(e) => onDrop(null, e)} onMouseDown={(e) => e.target === e.currentTarget && editor.select([])} tabIndex={0} onKeyDown={(e) => {
        if (e.key === 'F2') {
          const g = editor.selectedObjects[0];
          if (g) setRenaming(`g:${g.id}`);
          else if (editor.selectedFolder) setRenaming(`f:${editor.selectedFolder}`);
        }
      }}>
        {rows.map((r) => {
          const selected = r.kind === 'object' ? editor.selection.includes(r.go.id) : editor.selectedFolder === r.folder.path;
          const hasKids = r.kind === 'object' ? r.go.children.length > 0 : r.folder.folders.length + r.folder.gameObjects.length > 0;
          const off = r.kind === 'object' ? !r.go.activeInHierarchy : !r.folder.activeInHierarchy;
          const Icon = r.kind === 'folder' ? (r.folder.scenePath ? Icons.Scene : collapsed.has(r.key) ? Icons.Folder : Icons.FolderOpen) : objectIcon(r.go.components.map((c) => Types.nameOf(c.constructor)));
          const dz = drop?.key === r.key ? ` drop-${drop.zone}` : '';
          const pf = r.kind === 'object' ? (r.go.prefab ? ' prefab-root' : editor.prefabRootOf(r.go) ? ' prefab-part' : '') : '';
          return (
            <div
              key={r.key}
              className={`rs-row ${r.kind}${selected ? ' selected' : ''}${off ? ' off' : ''}${dz}${pf}`}
              draggable={renaming !== r.key}
              onDragStart={(e) => onDragStart(r, e)}
              onDragOver={(e) => onDragOver(r, e)}
              onDragLeave={() => setDrop(null)}
              onDrop={(e) => onDrop(r, e)}
              onMouseDown={(e) => e.button === 0 && clickRow(r, e)}
              onDoubleClick={() => setRenaming(r.key)}
              onContextMenu={(e) => rowMenu(r, e)}
              data-key={r.key}
            >
              <RowToggles row={r} />
              <span className={`rs-row-box${selected ? " on" : ""}`} />
              <span className="rs-indent" style={{ width: r.depth * 14 }} />
              <span className={`rs-arrow${hasKids ? '' : ' empty'}${collapsed.has(r.key) ? '' : ' open'}`} onMouseDown={(e) => (e.stopPropagation(), hasKids && toggle(r.key))}>
                {hasKids ? <Icons.Chevron size={10} /> : null}
              </span>
              <Icon size={13} className="rs-row-icon" />
              {renaming === r.key ? (
                <input
                  className="rs-rename"
                  autoFocus
                  defaultValue={r.kind === 'object' ? r.go.name : r.folder.name}
                  onMouseDown={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    editor.rename(r.kind === 'object' ? r.go : r.folder, e.currentTarget.value);
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenaming(null);
                    e.stopPropagation();
                  }}
                />
              ) : (
                <span className="rs-row-name">{r.kind === 'object' ? r.go.name : r.folder.name}</span>
              )}
              {r.kind === 'object' && r.go.prefab ? <span className="rs-row-badge" title={r.go.prefab}>pfb</span> : null}
              {r.kind === 'object' && r.go._nestedPrefab ? <span className="rs-row-badge nested" title={`nested prefab ${r.go._nestedPrefab}`}>pfb</span> : null}
              {r.kind === 'folder' && r.folder.scenePath ? <span className={`rs-row-badge linked${r.folder.sceneLoaded ? '' : ' unloaded'}`} title={r.folder.scenePath}>{r.folder.sceneLoaded ? 'scn' : 'scn (unloaded)'}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Update / draw switches of a row (RE's two toggles; folders: one activation for both). */
function RowToggles({ row }: { row: Row }) {
  if (row.kind === 'folder') {
    const f = row.folder;
    const set = () => {
      editor.recordUndo('Folder Active');
      f.active = !f.active;
      editor.changed(true);
    };
    return (
      <span className="rs-toggles">
        <span className="rs-toggle" title="Active (update + draw)" onMouseDown={(e) => (e.stopPropagation(), set())}>
          {f.active ? <Icons.Update size={12} /> : <Icons.UpdateOff size={12} />}
        </span>
        <span className="rs-toggle" onMouseDown={(e) => (e.stopPropagation(), set())}>
          {f.active ? <Icons.Eye size={12} /> : <Icons.EyeOff size={12} />}
        </span>
      </span>
    );
  }
  const g = row.go;
  const flip = (k: 'updateSelf' | 'drawSelf') => {
    editor.recordUndo(k === 'updateSelf' ? 'Update Self' : 'Draw Self');
    g[k] = !g[k];
    editor.changed(true);
  };
  return (
    <span className="rs-toggles">
      <span className="rs-toggle" title="Update Self" onMouseDown={(e) => (e.stopPropagation(), flip('updateSelf'))}>
        {g.updateSelf ? <Icons.Update size={12} /> : <Icons.UpdateOff size={12} />}
      </span>
      <span className="rs-toggle" title="Draw Self" onMouseDown={(e) => (e.stopPropagation(), flip('drawSelf'))}>
        {g.drawSelf ? <Icons.Eye size={12} /> : <Icons.EyeOff size={12} />}
      </span>
    </span>
  );
}

export { isAncestor };
