import { useState } from 'react';
import { AudioEngine, MissingComponent, Physics, Quaternion, Types, Vector3, eulerDegFromQuat, quatFromEulerDeg, scriptTypes, type Component, type GameObject, type Material } from '@rs/core';
import { editor } from '../editor/Editor';
import { assetVisual, Icons } from './icons';
import { FieldRow, TextInput, Vec3Input } from './fields';
import { FsmEditor } from './FsmEditor';
import { useEditor, useTicker } from './hooks';
import { MenuList, showContextMenu, type MenuItem } from './Menu';

export function Inspector() {
  useEditor('selection', 'inspector', 'scene', 'mode', 'files');
  useTicker(editor.mode === 'play', 120);
  const objs = editor.selectedObjects;
  let title = 'Inspector';
  let body: React.ReactNode = <div className="rs-empty">Nothing selected</div>;
  if (editor.selectedAsset) {
    title = `${editor.selectedAsset.slice(editor.selectedAsset.lastIndexOf('/') + 1)} - Inspector`;
    body = <AssetInspector path={editor.selectedAsset} />;
  } else if (editor.selectedFolder !== null) {
    const f = editor.scene.root.findFolder(editor.selectedFolder);
    if (f) {
      title = `${f.name || 'Root'} - Inspector`;
      body = (
        <div className="rs-section">
          <div className="rs-field">
            <label>Name</label>
            <div className="rs-field-value">
              <TextInput value={f.name} onChange={(s) => editor.rename(f, s)} />
            </div>
          </div>
          <div className="rs-field">
            <label>Active</label>
            <div className="rs-field-value">
              <input
                type="checkbox"
                checked={f.active}
                onChange={(e) => {
                  editor.recordUndo('Folder Active');
                  f.active = e.target.checked;
                  editor.changed(true);
                }}
              />
            </div>
          </div>
          <div className="rs-hint">
            {f.gameObjects.length} objects, {f.folders.length} folders
          </div>
        </div>
      );
    }
  } else if (objs.length) {
    const go = objs[0];
    title = `${go.name} - Inspector`;
    body = <ObjectInspector go={go} count={objs.length} />;
  }
  return (
    <div className="rs-panel rs-inspector">
      <div className="rs-inspector-title">{title}</div>
      <div className="rs-inspector-body">{body}</div>
    </div>
  );
}

function Section({ title, children, defaultOpen = true, right, onContext }: { title: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; right?: React.ReactNode; onContext?: (e: React.MouseEvent) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rs-section">
      <div className="rs-section-head" onClick={() => setOpen(!open)} onContextMenu={onContext}>
        <span className={`rs-arrow${open ? ' open' : ''}`}>
          <Icons.Chevron size={10} />
        </span>
        <span className="rs-section-title">{title}</span>
        <span className="rs-section-right" onClick={(e) => e.stopPropagation()}>
          {right}
        </span>
      </div>
      {open ? <div className="rs-section-body">{children}</div> : null}
    </div>
  );
}

function ObjectInspector({ go, count }: { go: GameObject; count: number }) {
  const [addOpen, setAddOpen] = useState<{ x: number; y: number } | null>(null);
  const t = go.transform;
  const flag = (k: 'updateSelf' | 'drawSelf', v: boolean) => {
    editor.recordUndo(k);
    go[k] = v;
    editor.changed(true);
  };
  // transform edits apply to every selected object: only the axes changed on the first one are copied
  const objs = editor.selectedObjects;
  const multiT = (label: string, get: (g: GameObject) => Vector3, set: (g: GameObject, v: Vector3) => void) => (v: Vector3) => {
    editor.recordUndo(label, true);
    const ref = get(go);
    const axes = (['x', 'y', 'z'] as const).filter((k) => Math.abs(v[k] - ref[k]) > 1e-9);
    for (const g of objs) {
      const nv = get(g).clone();
      for (const k of axes) nv[k] = v[k];
      set(g, nv);
      g.transform.markDirty();
    }
    editor.changed();
  };
  const worldEuler = eulerDegFromQuat(t.rotation);
  const localEuler = eulerDegFromQuat(t.localRotation);
  const ws = new Vector3();
  t.worldMatrix.decompose(ws);
  const addItems = (): MenuItem[] => {
    const groups = new Map<string, MenuItem[]>();
    for (const ty of editor.componentTypes()) {
      const path = (ty.options.menu ?? `Scripts/${ty.name}`).split('/');
      const leaf = path.pop()!;
      const g = path.join('/') || 'Other';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push({ label: leaf, action: () => editor.addComponent(go, ty.name), disabled: !!ty.options.single && !!go.getComponent(ty.name) });
    }
    return [...groups].map(([label, submenu]) => ({ label, submenu }));
  };
  return (
    <>
      <div className="rs-object-head">
        <span className="rs-toggle" title="Update Self" onClick={() => flag('updateSelf', !go.updateSelf)}>
          {go.updateSelf ? <Icons.Update size={13} /> : <Icons.UpdateOff size={13} />}
        </span>
        <span className="rs-toggle" title="Draw Self" onClick={() => flag('drawSelf', !go.drawSelf)}>
          {go.drawSelf ? <Icons.Eye size={13} /> : <Icons.EyeOff size={13} />}
        </span>
        <Icons.Cube size={13} />
        <TextInput value={go.name} onChange={(s) => editor.rename(go, s)} />
        {count > 1 ? <span className="rs-hint">+{count - 1}</span> : null}
      </div>
      <div className="rs-object-bar">
        <button className="rs-btn rs-add" onClick={(e) => setAddOpen({ x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().bottom })}>
          <Icons.Plus size={12} /> Add Component
        </button>
        <TextInput
          value={go.tag}
          placeholder="(Tag)"
          onChange={(s) => {
            editor.recordUndo('Tag');
            go.tag = s.trim();
            editor.changed();
          }}
        />
        <select
          className="rs-layer-select"
          title="Physics layer"
          value={go.layer}
          onChange={(e) => {
            editor.recordUndo('Layer');
            for (const g of editor.selectedObjects) g.layer = +e.target.value;
            editor.changed();
          }}
        >
          {Physics.layers.map((n, i) =>
            n || i === go.layer ? (
              <option key={i} value={i}>
                {n || `Layer ${i}`}
              </option>
            ) : null,
          )}
        </select>
      </div>
      {addOpen ? (
        <div className="rs-overlay" onMouseDown={() => setAddOpen(null)}>
          <MenuList items={addItems()} x={addOpen.x} y={addOpen.y} onClose={() => setAddOpen(null)} />
        </div>
      ) : null}
      <PrefabBar go={go} />
      <Section title="Global">
        <div className="rs-field">
          <label>Position</label>
          <div className="rs-field-value">
            <Vec3Input value={t.position} onChange={multiT('Position', (g) => g.transform.position, (g, v) => (g.transform.position = v))} />
          </div>
        </div>
        <div className="rs-field">
          <label>Rotation</label>
          <div className="rs-field-value">
            <Vec3Input value={worldEuler} step={1} onChange={multiT('Rotation', (g) => eulerDegFromQuat(g.transform.rotation), (g, v) => (g.transform.rotation = quatFromEulerDeg(v.x, v.y, v.z)))} />
          </div>
        </div>
        <div className="rs-field">
          <label>Scale</label>
          <div className="rs-field-value">
            <Vec3Input value={ws} disabled onChange={() => {}} />
          </div>
        </div>
      </Section>
      <Section title="Local">
        <div className="rs-field">
          <label>LocalPosition</label>
          <div className="rs-field-value">
            <Vec3Input value={t.localPosition} onChange={multiT('Position', (g) => g.transform.localPosition, (g, v) => g.transform.localPosition.copyFrom(v))} />
          </div>
        </div>
        <div className="rs-field">
          <label>LocalRotation</label>
          <div className="rs-field-value">
            <Vec3Input value={localEuler} step={1} onChange={multiT('Rotation', (g) => eulerDegFromQuat(g.transform.localRotation), (g, v) => quatFromEulerDeg(v.x, v.y, v.z, g.transform.localRotation))} />
          </div>
        </div>
        <div className="rs-field">
          <label>LocalScale</label>
          <div className="rs-field-value">
            <Vec3Input value={t.localScale} onChange={multiT('Scale', (g) => g.transform.localScale, (g, v) => g.transform.localScale.copyFrom(v))} />
          </div>
        </div>
      </Section>
      <Section title="General" defaultOpen={false}>
        <div className="rs-hint">
          Id {go.id} · {go.children.length} children · folder {go.folder?.path || 'Root'}
        </div>
      </Section>
      {go.components.map((c, i) => {
        // the same component (type + rank among that type) on the other selected objects
        const type = Types.nameOf(c.constructor);
        const rank = go.components.slice(0, i).filter((x) => Types.nameOf(x.constructor) === type).length;
        const others = objs.slice(1).flatMap((g) => g.components.filter((x) => Types.nameOf(x.constructor) === type)[rank] ?? []);
        if (objs.length > 1 && others.length < objs.length - 1) return null; // not shared by every selected object
        return <ComponentView key={`${go.id}:${i}:${type}`} c={c} others={others} />;
      })}
    </>
  );
}

/** A lit-ball look of a Material (CSS: colour, texture, roughness → highlight size, metallic → contrast, emission glow). */
function MaterialPreview({ m }: { m: Material }) {
  useTicker(true, 300); // follows edits
  const css = (r: number, g: number, b: number, a = 1) => `rgba(${Math.round(Math.min(1, r) * 255)},${Math.round(Math.min(1, g) * 255)},${Math.round(Math.min(1, b) * 255)},${a})`;
  const c = m.color;
  const rough = Math.min(1, Math.max(0, m.roughness));
  const metal = Math.min(1, Math.max(0, m.metallic));
  const spot = 6 + rough * 30; // highlight size (%)
  const hl = metal > 0.5 ? css(Math.min(1, c.r + 0.6), Math.min(1, c.g + 0.6), Math.min(1, c.b + 0.6), 1 - rough * 0.7) : `rgba(255,255,255,${0.85 - rough * 0.7})`;
  const shade = 0.25 - metal * 0.2;
  const e = m.emissive;
  const glow = m.emissiveIntensity * Math.max(e.r, e.g, e.b);
  const layers = [
    `radial-gradient(circle at 35% 30%, ${hl} 0%, transparent ${spot}%)`,
    `radial-gradient(circle at 40% 35%, transparent 30%, rgba(0,0,0,${0.55 + metal * 0.25}) 100%)`,
  ];
  if (m.texture) layers.push(`url("/project/${m.texture}") center / ${100 / Math.max(0.01, m.tiling)}% repeat`);
  return (
    <div className="rs-mat-preview-wrap">
      <div
        className="rs-mat-preview"
        style={{
          background: `${layers.join(', ')}, ${css(c.r * (1 - shade), c.g * (1 - shade), c.b * (1 - shade))}`,
          backgroundBlendMode: m.texture ? 'normal, normal, multiply, normal' : undefined,
          opacity: m.blend === 'Transparent' || m.blend === 'Additive' ? Math.max(0.15, m.opacity) : 1,
          boxShadow: glow > 0.01 ? `0 0 ${10 + glow * 30}px ${css(e.r, e.g, e.b, Math.min(1, glow))}` : undefined,
        }}
      />
      <div className="rs-hint">
        {m.blend}
        {m.unlit ? ' · Unlit' : ''} · metallic {metal.toFixed(2)} · roughness {rough.toFixed(2)}
      </div>
    </div>
  );
}

/** Play / stop an audio file (WebAudio, the same engine the game uses). */
function AudioPreview({ path, head, size }: { path: string; head: React.ReactNode; size: number }) {
  const [playing, setPlaying] = useState<{ stop: () => void } | null>(null);
  const [info, setInfo] = useState('');
  const play = async () => {
    playing?.stop();
    AudioEngine.resume();
    const buf = await AudioEngine.load(path);
    const ctx = AudioEngine.context;
    if (!buf || !ctx) return setInfo('Cannot decode this file');
    setInfo(`${buf.duration.toFixed(2)} s · ${buf.numberOfChannels === 1 ? 'mono' : 'stereo'} · ${buf.sampleRate} Hz`);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => setPlaying((p) => (p?.stop === stop ? null : p));
    const stop = () => {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    };
    src.start();
    setPlaying({ stop });
  };
  return (
    <>
      {head}
      <div className="rs-btn-row">
        <button className="rs-btn" onClick={() => void play()}>
          <Icons.Play size={12} /> Play
        </button>
        <button className="rs-btn" disabled={!playing} onClick={() => (playing?.stop(), setPlaying(null))}>
          <Icons.Stop size={12} /> Stop
        </button>
      </div>
      <div className="rs-hint">
        {info || 'Audio clip'} · {(size / 1024).toFixed(1)} KB — assign it to an AudioSource's Clip, or play it from a script with audioSource.playOneShot(path).
      </div>
    </>
  );
}

/** Prefab instance bar: the prefab, Open / Select, and for the instance root Apply / Revert / Unpack. */
function PrefabBar({ go }: { go: GameObject }) {
  useTicker(true, 700); // override state follows edits
  const root = editor.prefabRootOf(go);
  if (!root?.prefab) return null;
  const path = root.prefab;
  const isRoot = root === go;
  const overrides = isRoot && editor.hasOverrides(go);
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.pfb\.json$/, '');
  return (
    <div className="rs-prefab-bar">
      <Icons.Prefab size={13} />
      <span className="rs-prefab-name" title={path}>
        {isRoot ? name : `${name} (part of)`}
      </span>
      {overrides ? <span className="rs-prefab-mod" title="This instance differs from the prefab">overrides</span> : null}
      <span className="rs-grow" />
      <button className="rs-btn small" onClick={() => void editor.openPrefab(path)}>
        Open
      </button>
      <button className="rs-btn small" onClick={() => void editor.selectAsset(path)}>
        Select
      </button>
      {isRoot ? (
        <>
          <button className="rs-btn small" disabled={!overrides} title="Write this instance into the prefab (every instance changes)" onClick={() => void editor.applyPrefab(go)}>
            Apply
          </button>
          <button className="rs-btn small" disabled={!overrides} title="Drop this instance's changes" onClick={() => editor.revertPrefab(go)}>
            Revert
          </button>
          <button className="rs-btn small" title="Make it a plain object (no longer linked to the prefab)" onClick={() => editor.unpackPrefab(go)}>
            Unpack
          </button>
        </>
      ) : null}
    </div>
  );
}

function ComponentView({ c, others }: { c: Component; others: Component[] }) {
  const name = c instanceof MissingComponent ? `${c.typeName} (missing script)` : Types.nameOf(c.constructor);
  const info = Types.of(c.constructor);
  const menu = (e: React.MouseEvent) =>
    showContextMenu(e, [
      { label: 'Remove Component', action: () => editor.removeComponent(c) },
      ...(info?.script ? [{ label: `Open ${info.script}`, action: () => openInIde(info.script!) }] : []),
    ]);
  return (
    <Section
      title={
        <>
          <input
            type="checkbox"
            checked={c.enabled}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              editor.recordUndo('Enable');
              c.enabled = e.target.checked;
              editor.changed();
            }}
          />
          <span className={c instanceof MissingComponent ? 'rs-missing' : ''}>{name}</span>
        </>
      }
      right={
        <button className="rs-mini" title="Remove" onClick={() => editor.removeComponent(c)}>
          <Icons.Trash size={11} />
        </button>
      }
      onContext={menu}
    >
      {c instanceof MissingComponent ? (
        <div className="rs-hint">The script defining '{c.typeName}' is missing or does not compile; its data is kept.</div>
      ) : (
        editor.fieldsOf(c).filter((f) => !f.hidden && (!f.visibleIf || f.visibleIf(c))).map((f) => <FieldRow key={f.name} target={c} f={f} others={others} />)
      )}
    </Section>
  );
}

function openInIde(path: string): void {
  window.open(`vscode://file/${editor.projectRoot}/${path}`, '_self');
}

function AssetInspector({ path }: { path: string }) {
  const file = editor.files.find((f) => f.path === path);
  const v = assetVisual(path, !!file?.dir);
  const head = (
    <div className="rs-object-head">
      <v.icon size={14} style={{ color: v.color }} />
      <span className="rs-asset-name">{path}</span>
    </div>
  );
  if (v.kind === 'UserData' || v.kind === 'Material') {
    const u = editor.editedUserData;
    return (
      <>
        {head}
        {u && v.kind === 'Material' ? <MaterialPreview m={u as Material} /> : null}
        {u ? (
          <Section title={Types.nameOf(u.constructor)}>
            {editor.fieldsOf(u).filter((f) => !f.hidden && (!f.visibleIf || f.visibleIf(u))).map((f) => <FieldRow key={f.name} target={u} f={f} />)}
            <div className="rs-hint">Changes are saved to the file.</div>
          </Section>
        ) : (
          <div className="rs-hint">Unknown UserData type (its script is missing or does not compile).</div>
        )}
      </>
    );
  }
  if (v.kind === 'MotionFsm')
    return (
      <>
        {head}
        <FsmEditor path={path} />
      </>
    );
  if (v.kind === 'Scene')
    return (
      <>
        {head}
        <button className="rs-btn" onClick={() => void editor.openScene(path)}>
          Open Scene
        </button>
      </>
    );
  if (v.kind === 'Prefab')
    return (
      <>
        {head}
        <div className="rs-btn-row">
          <button className="rs-btn" onClick={() => void editor.instantiatePrefab(path)}>
            Add to Scene
          </button>
          <button className="rs-btn" onClick={() => void editor.openPrefab(path)}>
            Open Prefab
          </button>
        </div>
        <div className="rs-hint">Drag it into the Hierarchies or the Runtime view to place it; double-click to edit it.</div>
      </>
    );
  if (v.kind === 'Script') {
    const types = scriptTypes(path);
    return (
      <>
        {head}
        <div className="rs-hint">Defines: {types.length ? types.join(', ') : '(no exported Behavior / UserData)'}</div>
        <button className="rs-btn" onClick={() => openInIde(path)}>
          Open in VS Code
        </button>
      </>
    );
  }
  if (v.kind === 'Texture')
    return (
      <>
        {head}
        <img className="rs-preview" src={`/project/${path}`} alt="" />
      </>
    );
  if (v.kind === 'Audio') return <AudioPreview path={path} head={head} size={file?.size ?? 0} />;
  return (
    <>
      {head}
      <div className="rs-hint">{file ? `${(file.size / 1024).toFixed(1)} KB` : ''}</div>
    </>
  );
}

export { Quaternion };
