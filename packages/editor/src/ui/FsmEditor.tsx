import { Assets, normalizeFsm, type FsmCondition, type FsmParameter, type FsmState, type FsmTransition, type MotionFsmData } from '@rs/core';
import { editor } from '../editor/Editor';
import { NumberInput, TextInput } from './fields';
import { Icons } from './icons';

const OPS = ['>', '<', '>=', '<=', '==', '!='] as const;

/** MotionFsm asset editor (Inspector): parameters, states, transitions with conditions. Every edit saves the file. */
export function FsmEditor({ path }: { path: string }) {
  const data = Assets.getFsm(path);
  if (!data) return <div className="rs-hint">Loading…</div>;
  const d = normalizeFsm(data);
  const save = (next: MotionFsmData) => void editor.saveFsm(path, next);
  const upd = <K extends keyof MotionFsmData>(k: K, v: MotionFsmData[K]) => save({ ...d, [k]: v });
  const clips = editor.knownClips();
  const stateNames = d.states.map((s) => s.name);
  const params = d.parameters;

  const setParam = (i: number, p: Partial<FsmParameter>) => upd('parameters', params.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const setState = (i: number, s: Partial<FsmState>) => {
    const old = d.states[i].name;
    const states = d.states.map((x, j) => (j === i ? { ...x, ...s } : x));
    // renaming a state renames its transitions / the initial state
    if (s.name && s.name !== old) {
      save({ ...d, states, initial: d.initial === old ? s.name : d.initial, transitions: d.transitions.map((t) => ({ ...t, from: t.from === old ? s.name! : t.from, to: t.to === old ? s.name! : t.to })) });
    } else upd('states', states);
  };
  const setTr = (i: number, t: Partial<FsmTransition>) => upd('transitions', d.transitions.map((x, j) => (j === i ? { ...x, ...t } : x)));
  const setCond = (i: number, k: number, c: Partial<FsmCondition>) => setTr(i, { conditions: d.transitions[i].conditions.map((x, j) => (j === k ? { ...x, ...c } : x)) });
  const unique = (base: string, taken: string[]) => {
    if (!taken.includes(base)) return base;
    for (let n = 1; ; n++) if (!taken.includes(`${base}${n}`)) return `${base}${n}`;
  };

  return (
    <div className="rs-fsm">
      <datalist id="rs-clips">
        {clips.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="rs-field">
        <label>Initial State</label>
        <div className="rs-field-value">
          <select value={d.initial} onChange={(e) => upd('initial', e.target.value)}>
            {stateNames.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rs-fsm-head">
        Parameters
        <button className="rs-mini" title="Add parameter" onClick={() => upd('parameters', [...params, { name: unique('param', params.map((p) => p.name)), type: 'float', value: 0 }])}>
          <Icons.Plus size={11} />
        </button>
      </div>
      {params.map((p, i) => (
        <div key={i} className="rs-fsm-row">
          <TextInput value={p.name} onChange={(s) => setParam(i, { name: s.trim() || p.name })} />
          <select value={p.type} onChange={(e) => setParam(i, { type: e.target.value as FsmParameter['type'], value: e.target.value === 'bool' ? false : e.target.value === 'float' ? 0 : undefined })}>
            <option value="float">float</option>
            <option value="bool">bool</option>
            <option value="trigger">trigger</option>
          </select>
          {p.type === 'float' ? <NumberInput value={Number(p.value ?? 0)} onChange={(v) => setParam(i, { value: v })} /> : p.type === 'bool' ? <input type="checkbox" checked={p.value === true} onChange={(e) => setParam(i, { value: e.target.checked })} /> : <span className="rs-hint">—</span>}
          <button className="rs-mini" title="Remove" onClick={() => upd('parameters', params.filter((_, j) => j !== i))}>
            <Icons.Trash size={11} />
          </button>
        </div>
      ))}

      <div className="rs-fsm-head">
        States
        <button className="rs-mini" title="Add state" onClick={() => upd('states', [...d.states, { name: unique('State', stateNames), clip: clips[0] ?? '', loop: true }])}>
          <Icons.Plus size={11} />
        </button>
      </div>
      <div className="rs-fsm-row rs-fsm-cols">
        <span>Name</span>
        <span>Clip</span>
        <span>Speed</span>
        <span>Loop</span>
        <span />
      </div>
      {d.states.map((s, i) => (
        <div key={i} className={`rs-fsm-row${s.name === d.initial ? ' initial' : ''}`}>
          <TextInput value={s.name} onChange={(v) => v.trim() && !stateNames.includes(v.trim()) && setState(i, { name: v.trim() })} />
          <input className="rs-text" list="rs-clips" defaultValue={s.clip} key={`${s.name}:${s.clip}`} onBlur={(e) => e.target.value !== s.clip && setState(i, { clip: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          <NumberInput value={s.speed ?? 1} step={0.05} onChange={(v) => setState(i, { speed: v })} />
          <input type="checkbox" checked={s.loop !== false} onChange={(e) => setState(i, { loop: e.target.checked })} />
          <button className="rs-mini" title="Remove" disabled={d.states.length < 2} onClick={() => save({ ...d, states: d.states.filter((_, j) => j !== i), transitions: d.transitions.filter((t) => t.from !== s.name && t.to !== s.name), initial: d.initial === s.name ? d.states.find((_, j) => j !== i)!.name : d.initial })}>
            <Icons.Trash size={11} />
          </button>
        </div>
      ))}

      <div className="rs-fsm-head">
        Transitions
        <button className="rs-mini" title="Add transition" onClick={() => upd('transitions', [...d.transitions, { from: stateNames[0], to: stateNames[1] ?? stateNames[0], conditions: [], duration: 0.2 }])}>
          <Icons.Plus size={11} />
        </button>
      </div>
      {d.transitions.map((t, i) => (
        <div key={i} className="rs-fsm-tr">
          <div className="rs-fsm-row">
            <select value={t.from} onChange={(e) => setTr(i, { from: e.target.value })}>
              <option value="*">Any State</option>
              {stateNames.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <span className="rs-fsm-arrow">→</span>
            <select value={t.to} onChange={(e) => setTr(i, { to: e.target.value })}>
              {stateNames.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button className="rs-mini" title="Remove transition" onClick={() => upd('transitions', d.transitions.filter((_, j) => j !== i))}>
              <Icons.Trash size={11} />
            </button>
          </div>
          <div className="rs-fsm-row">
            <span className="rs-hint">Fade</span>
            <NumberInput value={t.duration ?? 0.2} step={0.05} min={0} onChange={(v) => setTr(i, { duration: v })} />
            <label className="rs-hint">
              <input type="checkbox" checked={t.exitTime !== undefined && t.exitTime >= 0} onChange={(e) => setTr(i, { exitTime: e.target.checked ? 1 : undefined })} /> Exit Time
            </label>
            {t.exitTime !== undefined && t.exitTime >= 0 ? <NumberInput value={t.exitTime} step={0.05} min={0} onChange={(v) => setTr(i, { exitTime: v })} /> : null}
          </div>
          {t.conditions.map((c, k) => {
            const type = params.find((p) => p.name === c.param)?.type;
            return (
              <div key={k} className="rs-fsm-row rs-fsm-cond">
                <select value={c.param} onChange={(e) => setCond(i, k, { param: e.target.value })}>
                  {!params.some((p) => p.name === c.param) ? <option value={c.param}>{c.param} (missing)</option> : null}
                  {params.map((p) => (
                    <option key={p.name}>{p.name}</option>
                  ))}
                </select>
                {type === 'trigger' ? (
                  <span className="rs-hint">is set</span>
                ) : type === 'bool' ? (
                  <select value={String(c.value ?? true)} onChange={(e) => setCond(i, k, { op: '==', value: e.target.value === 'true' })}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <>
                    <select value={c.op ?? '>'} onChange={(e) => setCond(i, k, { op: e.target.value as FsmCondition['op'] })}>
                      {OPS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                    <NumberInput value={Number(c.value ?? 0)} onChange={(v) => setCond(i, k, { value: v })} />
                  </>
                )}
                <button className="rs-mini" title="Remove condition" onClick={() => setTr(i, { conditions: t.conditions.filter((_, j) => j !== k) })}>
                  <Icons.Trash size={11} />
                </button>
              </div>
            );
          })}
          <button className="rs-btn small rs-fsm-add" disabled={!params.length} onClick={() => setTr(i, { conditions: [...t.conditions, { param: params[0].name, op: params[0].type === 'float' ? '>' : '==', value: params[0].type === 'bool' ? true : 0 }] })}>
            <Icons.Plus size={10} /> Condition
          </button>
        </div>
      ))}
      <div className="rs-hint">Clip suggestions come from models with a Motion in the open scene.</div>
    </div>
  );
}
