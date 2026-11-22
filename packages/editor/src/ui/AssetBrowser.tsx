import { useMemo, useState, type DragEvent } from 'react';
import { editor } from '../editor/Editor';
import { DT_ASSET } from './Hierarchies';
import { useEditor } from './hooks';
import { assetVisual, Icons } from './icons';
import { showContextMenu, type MenuItem } from './Menu';

const FAV_KEY = 'rs.favorites';
function loadFavs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]');
  } catch {
    return [];
  }
}

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const parentOf = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf('/')));

export function AssetBrowser() {
  useEditor('files', 'selection');
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [tab, setTab] = useState<'assets' | 'favorites'>('assets');
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<string | null>(null);
  const folder = editor.assetFolder;
  const files = editor.files;

  const dirs = useMemo(() => ['Assets', ...files.filter((f) => f.dir).map((f) => f.path)].sort(), [files]);
  const items = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (tab === 'favorites') return files.filter((x) => favs.includes(x.path));
    if (f) return files.filter((x) => x.path.startsWith(folder + '/') && baseName(x.path).toLowerCase().includes(f));
    return files.filter((x) => parentOf(x.path) === folder).sort((a, b) => (a.dir === b.dir ? baseName(a.path).localeCompare(baseName(b.path)) : a.dir ? -1 : 1));
  }, [files, folder, filter, tab, favs]);

  const toggleFav = (p: string) => {
    const n = favs.includes(p) ? favs.filter((x) => x !== p) : [...favs, p];
    setFavs(n);
    localStorage.setItem(FAV_KEY, JSON.stringify(n));
  };

  const createMenu = (dir: string): MenuItem[] => [
    { label: 'Folder', action: () => void editor.createAssetFolder(dir).then((p) => setRenaming(p)) },
    { label: 'Scene', action: () => void editor.createSceneAsset(dir).then((p) => setRenaming(p)) },
    { label: 'Script (Behavior)', action: () => void editor.createScript(dir).then((p) => setRenaming(p)) },
    { label: 'Motion FSM', action: () => void editor.createFsm(dir).then((p) => setRenaming(p)) },
    { label: 'Material', action: () => void editor.createUserData('Material', dir).then((p) => p && setRenaming(p)) },
    {
      label: 'UserData',
      submenu: editor.userDataTypes().length ? editor.userDataTypes().filter((t) => !t.options.fileExt).map((t) => ({ label: t.name, action: () => void editor.createUserData(t.name, dir) })) : [{ label: '(no UserData class in the scripts)', disabled: true }],
    },
  ];

  const open = (p: string, dir: boolean) => {
    if (dir) return editor.setAssetFolder(p);
    if (p.endsWith('.scn.json')) return void editor.openScene(p);
    if (p.endsWith('.ts')) return window.open(`vscode://file/${editor.projectRoot}/${p}`, '_self');
  };

  const tileMenu = (p: string, dir: boolean, e: React.MouseEvent) => {
    void editor.selectAsset(p);
    showContextMenu(e, [
      { label: dir ? 'Open' : p.endsWith('.scn.json') ? 'Open Scene' : 'Open', action: () => open(p, dir) },
      ...(p.endsWith('.pfb.json') ? [{ label: 'Add to Scene', action: () => void editor.instantiatePrefab(p) }] : []),
      { separator: true },
      { label: 'Rename', shortcut: 'F2', action: () => setRenaming(p) },
      { label: favs.includes(p) ? 'Remove from Favorites' : 'Add to Favorites', action: () => toggleFav(p) },
      { label: 'Copy Path', action: () => void navigator.clipboard?.writeText(p) },
      { separator: true },
      { label: 'Delete', shortcut: 'Del', action: () => void editor.deleteAsset(p) },
    ]);
  };

  // drops: Hierarchies objects → prefab in that folder; asset tiles → move into the folder
  const dropOn = (dir: string, e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    const ids = JSON.parse(e.dataTransfer.getData('application/rs-objects') || '[]') as number[];
    if (ids.length) {
      for (const id of ids) {
        const g = editor.scene.findById(id);
        if (g) void editor.createPrefab(g, dir);
      }
      return;
    }
    const asset = e.dataTransfer.getData(DT_ASSET);
    if (asset && parentOf(asset) !== dir && !dir.startsWith(asset + '/')) void moveAsset(asset, dir);
  };
  const canDrop = (e: DragEvent) => e.dataTransfer.types.includes('application/rs-objects') || e.dataTransfer.types.includes(DT_ASSET);

  const crumbs = folder.split('/');
  return (
    <div className="rs-panel rs-assets">
      <div className="rs-assets-bar">
        <button className="rs-mini" title="Up" disabled={folder === 'Assets'} onClick={() => editor.setAssetFolder(parentOf(folder) || 'Assets')}>
          ↑
        </button>
        <div className="rs-crumbs">
          {crumbs.map((c, i) => (
            <span key={i}>
              <span className="rs-crumb" onClick={() => editor.setAssetFolder(crumbs.slice(0, i + 1).join('/'))} onDragOver={(e) => canDrop(e) && e.preventDefault()} onDrop={(e) => dropOn(crumbs.slice(0, i + 1).join('/'), e)}>
                {c}
              </span>
              {i < crumbs.length - 1 ? <span className="rs-crumb-sep">›</span> : null}
            </span>
          ))}
        </div>
        <button className="rs-mini" title="Refresh" onClick={() => void editor.refreshFiles()}>
          ⟳
        </button>
      </div>
      <div className="rs-assets-main">
        <div className="rs-assets-side">
          <div className="rs-tabs small">
            <div className={`rs-tab${tab === 'assets' ? ' active' : ''}`} onClick={() => setTab('assets')}>
              Assets
            </div>
            <div className={`rs-tab${tab === 'favorites' ? ' active' : ''}`} onClick={() => setTab('favorites')}>
              Favorites
            </div>
          </div>
          <div className="rs-folder-tree">
            {dirs
              .filter((d) => !dirs.some((p) => p !== d && d.startsWith(p + '/') && collapsed.has(p)))
              .map((d) => {
                const depth = d.split('/').length - 1;
                const kids = dirs.some((x) => parentOf(x) === d);
                return (
                  <div
                    key={d}
                    className={`rs-row${d === folder ? ' selected' : ''}${over === d ? ' drop-into' : ''}`}
                    style={{ paddingLeft: 4 + depth * 12 }}
                    onClick={() => {
                      setTab('assets');
                      editor.setAssetFolder(d);
                    }}
                    onContextMenu={(e) => showContextMenu(e, [{ label: 'Create', submenu: createMenu(d) }])}
                    onDragOver={(e) => {
                      if (!canDrop(e)) return;
                      e.preventDefault();
                      setOver(d);
                    }}
                    onDragLeave={() => setOver(null)}
                    onDrop={(e) => dropOn(d, e)}
                  >
                    <span
                      className={`rs-arrow${kids ? '' : ' empty'}${collapsed.has(d) ? '' : ' open'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const n = new Set(collapsed);
                        if (n.has(d)) n.delete(d);
                        else n.add(d);
                        setCollapsed(n);
                      }}
                    >
                      {kids ? <Icons.Chevron size={10} /> : null}
                    </span>
                    <Icons.Folder size={12} style={{ color: '#d6a24a' }} />
                    <span className="rs-row-name">{baseName(d)}</span>
                  </div>
                );
              })}
          </div>
        </div>
        <div className="rs-assets-content">
          <div className="rs-assets-tools">
            <button className="rs-btn small" onClick={(e) => showContextMenu({ clientX: e.currentTarget.getBoundingClientRect().left, clientY: e.currentTarget.getBoundingClientRect().bottom }, createMenu(folder))}>
              <Icons.Plus size={11} /> Create
            </button>
            <div className="rs-search">
              <Icons.Search size={12} />
              <input placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
          </div>
          <div
            className="rs-tiles"
            onContextMenu={(e) => e.target === e.currentTarget && showContextMenu(e, [{ label: 'Create', submenu: createMenu(folder) }])}
            onMouseDown={(e) => e.target === e.currentTarget && void editor.selectAsset(null)}
            onDragOver={(e) => canDrop(e) && e.preventDefault()}
            onDrop={(e) => dropOn(folder, e)}
            tabIndex={0}
            onKeyDown={(e) => {
              const sel = editor.selectedAsset;
              if (!sel) return;
              if (e.key === 'F2') setRenaming(sel);
              if (e.key === 'Delete') void editor.deleteAsset(sel);
              if (e.key === 'Enter') open(sel, !!files.find((f) => f.path === sel)?.dir);
            }}
          >
            {items.map((f) => {
              const v = assetVisual(f.path, f.dir);
              const sel = editor.selectedAsset === f.path;
              return (
                <div
                  key={f.path}
                  className={`rs-tile${sel ? ' selected' : ''}${over === f.path ? ' drop-into' : ''}`}
                  draggable={renaming !== f.path}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DT_ASSET, f.path);
                    e.dataTransfer.effectAllowed = 'copyMove';
                  }}
                  onDragOver={(e) => {
                    if (f.dir && canDrop(e)) {
                      e.preventDefault();
                      e.stopPropagation();
                      setOver(f.path);
                    }
                  }}
                  onDragLeave={() => setOver(null)}
                  onDrop={(e) => f.dir && dropOn(f.path, e)}
                  onMouseDown={() => void editor.selectAsset(f.path)}
                  onDoubleClick={() => open(f.path, f.dir)}
                  onContextMenu={(e) => tileMenu(f.path, f.dir, e)}
                  title={f.path}
                  data-path={f.path}
                >
                  <div className="rs-tile-icon" style={{ borderColor: v.color, color: v.color }}>
                    {v.kind === 'Texture' ? <img src={`/project/${f.path}`} alt="" /> : <v.icon size={30} />}
                    {favs.includes(f.path) ? <span className="rs-tile-fav">★</span> : null}
                  </div>
                  {renaming === f.path ? (
                    <input
                      className="rs-rename"
                      autoFocus
                      defaultValue={baseName(f.path)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onFocus={(e) => {
                        const n = e.currentTarget.value;
                        const dot = f.dir ? -1 : n.indexOf('.');
                        e.currentTarget.setSelectionRange(0, dot > 0 ? dot : n.length);
                      }}
                      onBlur={(e) => {
                        const n = e.currentTarget.value.trim();
                        setRenaming(null);
                        if (n && n !== baseName(f.path)) void editor.renameAsset(f.path, n);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') setRenaming(null);
                        e.stopPropagation();
                      }}
                    />
                  ) : (
                    <div className="rs-tile-name">{baseName(f.path).replace(/\.(scn|pfb|user|fsm|mat)\.json$/, '')}</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="rs-assets-status">Total: {items.length} Assets</div>
        </div>
      </div>
    </div>
  );
}

async function moveAsset(from: string, dir: string): Promise<void> {
  const to = `${dir}/${baseName(from)}`;
  const { api } = await import('../editor/client');
  try {
    await api.rename(from, to);
  } catch (e) {
    console.error(e);
  }
  await editor.refreshFiles();
}
