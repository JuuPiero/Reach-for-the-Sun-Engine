import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Assets, Color3, Debug, GameObject, Types, Vector3, niceName, type FieldInfo, type UserData } from '@rs/core';
import { editor } from '../editor/Editor';
import { DT_ASSET } from './Hierarchies';

const fmt = (v: number) => {
  if (!Number.isFinite(v)) return String(v);
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** A number box: type, Enter / blur commits, ↑ / ↓ steps, drag the label (or the box with Alt) to scrub. */
export function NumberInput({ value, onChange, step = 0.1, min, max, int, axis, disabled }: { value: number; onChange: (v: number, final: boolean) => void; step?: number; min?: number; max?: number; int?: boolean; axis?: 'x' | 'y' | 'z'; disabled?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const clampV = (v: number) => {
    if (int) v = Math.round(v);
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  const commit = (s: string) => {
    const expr = s.trim();
    let v = Number(expr);
    if (!Number.isFinite(v) && /^[\d+\-*/.() ]+$/.test(expr)) {
      try {
        v = Number(Function(`"use strict";return (${expr})`)());
      } catch {
        v = NaN;
      }
    }
    if (Number.isFinite(v)) onChange(clampV(v), true);
    setText(null);
  };
  const scrub = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    const x0 = e.clientX;
    const v0 = value;
    let moved = false;
    const move = (m: MouseEvent) => {
      const dx = m.clientX - x0;
      if (Math.abs(dx) > 2) moved = true;
      if (moved) onChange(clampV(v0 + dx * (int ? Math.max(1, step) * 0.2 : step * 0.25) * (m.shiftKey ? 10 : m.ctrlKey ? 0.1 : 1)), false);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <div className={`rs-num${axis ? ` axis-${axis}` : ''}${disabled ? ' disabled' : ''}`}>
      {axis ? (
        <span className="rs-num-axis" onMouseDown={scrub}>
          {axis.toUpperCase()}
        </span>
      ) : null}
      <input
        value={text ?? fmt(value)}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => text !== null && commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          else if (e.key === 'Escape') setText(null);
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const s = (int ? Math.max(1, step) : step) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
            onChange(clampV(value + s), true);
            setText(null);
          }
          e.stopPropagation();
        }}
      />
    </div>
  );
}

export function Vec3Input({ value, onChange, step = 0.1, disabled }: { value: Vector3; onChange: (v: Vector3, final: boolean) => void; step?: number; disabled?: boolean }) {
  const set = (k: 'x' | 'y' | 'z') => (n: number, final: boolean) => {
    const v = value.clone();
    v[k] = n;
    onChange(v, final);
  };
  return (
    <div className="rs-vec3">
      <NumberInput axis="x" value={value.x} onChange={set('x')} step={step} disabled={disabled} />
      <NumberInput axis="y" value={value.y} onChange={set('y')} step={step} disabled={disabled} />
      <NumberInput axis="z" value={value.z} onChange={set('z')} step={step} disabled={disabled} />
    </div>
  );
}

const hex = (c: Color3) => c.toHexString();

export function ColorInput({ value, onChange }: { value: Color3; onChange: (c: Color3) => void }) {
  return (
    <div className="rs-color">
      <input type="color" value={hex(value)} onChange={(e) => onChange(Color3.FromHexString(e.target.value))} />
      <span className="rs-color-hex">{hex(value)}</span>
    </div>
  );
}

/** Files of the project matching extensions (for asset fields). */
function filesWith(exts: string[]): string[] {
  return editor.files.filter((f) => !f.dir && exts.some((x) => f.path.toLowerCase().endsWith(x))).map((f) => f.path);
}

/** A project path field: dropdown of matching files, drop target for Asset Browser tiles. */
export function AssetInput({ value, exts, onChange }: { value: string; exts: string[]; onChange: (path: string) => void }) {
  const [over, setOver] = useState(false);
  const accept = (p: string) => exts.some((x) => p.toLowerCase().endsWith(x));
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const p = e.dataTransfer.getData(DT_ASSET);
    if (p && accept(p)) onChange(p);
  };
  const files = filesWith(exts);
  return (
    <div
      className={`rs-asset-input${over ? ' over' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DT_ASSET)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">(None)</option>
        {value && !files.includes(value) ? <option value={value}>{value} (missing)</option> : null}
        {files.map((f) => (
          <option key={f} value={f}>
            {f.replace(/^Assets\//, '')}
          </option>
        ))}
      </select>
      {value ? (
        <button className="rs-mini" title="Show in Asset Browser" onClick={() => editor.setAssetFolder(value.slice(0, value.lastIndexOf('/')))}>
          ⌕
        </button>
      ) : null}
    </div>
  );
}

/** GameObject reference: dropdown of scene objects, drop target for Hierarchies rows. */
export function ObjectInput({ value, onChange }: { value: GameObject | null; onChange: (g: GameObject | null) => void }) {
  const objs = editor.scene.allGameObjects();
  return (
    <div
      className="rs-asset-input"
      onDragOver={(e) => e.dataTransfer.types.includes('application/rs-objects') && e.preventDefault()}
      onDrop={(e) => {
        const ids = JSON.parse(e.dataTransfer.getData('application/rs-objects') || '[]') as number[];
        const g = ids.length ? editor.scene.findById(ids[0]) : null;
        if (g) onChange(g);
      }}
    >
      <select value={value?.id ?? ''} onChange={(e) => onChange(e.target.value ? editor.scene.findById(Number(e.target.value)) : null)}>
        <option value="">(None)</option>
        {objs.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} #{g.id}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Draws one reflected field of a component / UserData. */
export function FieldRow({ target, f, others = [] }: { target: object; f: FieldInfo; others?: readonly object[] }) {
  const o = target as Record<string, unknown>;
  const v = o[f.name];
  const set = (val: unknown, _final = true) => editor.setField(target, f.name, val, true, others);
  let control: React.ReactNode;
  switch (f.type) {
    case 'number':
    case 'int':
      control = <NumberInput value={(v as number) ?? 0} int={f.type === 'int'} step={f.step ?? (f.type === 'int' ? 1 : 0.1)} min={f.min} max={f.max} onChange={(n, final) => set(n, final)} />;
      if (f.min !== undefined && f.max !== undefined && f.type === 'number')
        control = (
          <div className="rs-slider">
            <input type="range" min={f.min} max={f.max} step={f.step ?? (f.max - f.min) / 100} value={(v as number) ?? 0} onChange={(e) => set(Number(e.target.value), false)} />
            {control}
          </div>
        );
      break;
    case 'boolean':
      control = <input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} />;
      break;
    case 'string':
      if (f.choices) {
        const list = [...f.choices(target)];
        const cur = (v as string) ?? '';
        control = (
          <select value={cur} onChange={(e) => set(e.target.value)}>
            <option value="">(None)</option>
            {cur && !list.includes(cur) ? <option value={cur}>{cur}</option> : null}
            {list.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        );
      } else control = <TextInput value={(v as string) ?? ''} onChange={(s) => set(s)} />;
      break;
    case 'vec3':
      control = <Vec3Input value={(v as Vector3) ?? new Vector3()} step={f.step ?? 0.1} onChange={(n, final) => set(n, final)} />;
      break;
    case 'color':
      control = <ColorInput value={(v as Color3) ?? new Color3(1, 1, 1)} onChange={(c) => set(c)} />;
      break;
    case 'enum':
      control = (
        <select value={String(v ?? '')} onChange={(e) => set(e.target.value)}>
          {(f.options ?? []).map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      );
      break;
    case 'asset': {
      const kinds = typeof f.assetKind === 'string' ? [f.assetKind] : (f.assetKind ?? []);
      control = <AssetInput value={(v as string) ?? ''} exts={kinds.map((k) => `.${k}`)} onChange={(p) => set(p)} />;
      break;
    }
    case 'prefab':
      control = (
        <AssetInput
          value={(v as { path?: string } | null)?.path ?? ''}
          exts={['.pfb.json']}
          onChange={(p) => {
            if (!p) return set(null);
            const ref = Assets.prefabRef(p);
            void Assets.loadPrefab(p);
            set(ref);
          }}
        />
      );
      break;
    case 'userdata':
      control = (
        <AssetInput
          value={(v as UserData | null)?.path ?? ''}
          exts={['.user.json']}
          onChange={(p) => {
            if (!p) return set(null);
            void Assets.loadUserData(p).then((u) => {
              const type = u ? Types.nameOf(u.constructor) : '';
              if (u && f.userDataType && type !== f.userDataType) Debug.warn(`${p} is a ${type}, the field expects ${f.userDataType}`);
              set(u);
            });
          }}
        />
      );
      break;
    case 'gameobject':
      control = <ObjectInput value={v instanceof GameObject ? v : null} onChange={(g) => set(g)} />;
      break;
  }
  return (
    <>
      {f.header ? <div className="rs-field-header">{f.header}</div> : null}
      <div className="rs-field" title={f.tooltip}>
        <label>{f.label ?? niceName(f.name)}</label>
        <div className="rs-field-value">{control}</div>
      </div>
    </>
  );
}

export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  const [text, setText] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setText(null), [value]);
  return (
    <input
      ref={ref}
      className="rs-text"
      value={text ?? value}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== null && text !== value) onChange(text);
        setText(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') ref.current?.blur();
        if (e.key === 'Escape') setText(null);
        e.stopPropagation();
      }}
    />
  );
}
