import { useReducer, useState } from 'react';
import { GAMEPAD_BUTTONS, Input, LAYER_COUNT, Physics, Vector3, type GamepadAxis, type GamepadButton, type InputAction } from '@rs/core';
import { editor } from '../editor/Editor';
import { NumberInput, TextInput, Vec3Input } from './fields';

const TABS = ['General', 'Physics', 'Input'] as const;
const AXES: GamepadAxis[] = ['LeftX', 'LeftY', 'RightX', 'RightY', 'LT', 'RT'];
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

/**
 * Project Settings window (Edit ▸ Project Settings): start scene, physics (gravity, fixed step, layer names, collision matrix),
 * input actions. Edits apply to the engine at once; Save writes rs.project.json.
 */
export function ProjectSettingsWindow({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('General');
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [startScene, setStartScene] = useState(editor.projectSettings.startScene ?? editor.startScene);
  const [dirty, setDirty] = useState(false);
  const changed = () => (setDirty(true), bump());
  const scenes = editor.files.filter((f) => f.path.endsWith('.scn.json')).map((f) => f.path);
  const named = Physics.layers.map((n, i) => ({ n, i })).filter((l) => l.n);

  const setAction = (i: number, patch: Partial<InputAction>) => {
    const acts = Input.actions;
    acts[i] = { ...acts[i], ...patch };
    Input.setActions(acts);
    changed();
  };

  return (
    <div className="rs-overlay rs-modal-back" onMouseDown={onClose}>
      <div className="rs-modal rs-settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="rs-modal-head">
          <span>Project Settings</span>
          <span className="rs-grow" />
          <button className="rs-btn small" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="rs-settings-body">
          <div className="rs-settings-tabs">
            {TABS.map((t) => (
              <div key={t} className={`rs-settings-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {t}
              </div>
            ))}
          </div>
          <div className="rs-settings-page">
            {tab === 'General' ? (
              <>
                <div className="rs-field">
                  <label>Project</label>
                  <div className="rs-field-value">{editor.projectName}</div>
                </div>
                <div className="rs-field">
                  <label>Start Scene</label>
                  <div className="rs-field-value">
                    <select value={startScene} onChange={(e) => (setStartScene(e.target.value), setDirty(true))}>
                      {[...new Set([startScene, ...scenes])].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="rs-hint">The scene a built game opens first (SceneManager.load switches to the others).</div>
              </>
            ) : null}
            {tab === 'Physics' ? (
              <>
                <div className="rs-field">
                  <label>Gravity</label>
                  <div className="rs-field-value">
                    <Vec3Input value={Physics.gravity} onChange={(v: Vector3) => (Physics.gravity.copyFrom(v), changed())} />
                  </div>
                </div>
                <div className="rs-field">
                  <label>Fixed Step (s)</label>
                  <div className="rs-field-value">
                    <NumberInput value={Physics.fixedDeltaTime} step={0.001} min={0.002} onChange={(v) => ((Physics.fixedDeltaTime = v), changed())} />
                  </div>
                </div>
                <div className="rs-field-header">Layers</div>
                {Physics.layers.map((n, i) => (
                  <div className="rs-field" key={i}>
                    <label>Layer {i}</label>
                    <div className="rs-field-value">
                      {i < 2 ? (
                        <span className="rs-dim">{n}</span>
                      ) : (
                        <TextInput
                          value={n}
                          placeholder="(unused)"
                          onChange={(s) => {
                            Physics.layers[i] = s.trim();
                            Physics.layersVersion++;
                            changed();
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}
                <div className="rs-field-header">Layer Collision Matrix</div>
                <table className="rs-matrix">
                  <thead>
                    <tr>
                      <th />
                      {[...named].reverse().map((l) => (
                        <th key={l.i} className="rs-matrix-col">
                          <span>{l.n}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {named.map((a) => (
                      <tr key={a.i}>
                        <td className="rs-matrix-row">{a.n}</td>
                        {[...named].reverse().map((b) =>
                          b.i < a.i ? (
                            <td key={b.i} />
                          ) : (
                            <td key={b.i}>
                              <input type="checkbox" title={`${a.n} ↔ ${b.n}`} checked={Physics.getLayerCollision(a.i, b.i)} onChange={(e) => (Physics.setLayerCollision(a.i, b.i, e.target.checked), changed())} />
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="rs-hint">Unchecked pairs pass through each other (no collisions, no triggers). Queries take a layer mask: Physics.raycast(o, d, max, {'{'} layerMask: Physics.layerMask('Ground') {'}'}).</div>
              </>
            ) : null}
            {tab === 'Input' ? (
              <>
                <div className="rs-hint">Scripts read actions with Input.getAction('Jump'), getActionDown / Up, getActionValue('Horizontal'). Keys are KeyboardEvent codes (KeyW, Space, ArrowLeft…), comma separated.</div>
                {Input.actions.map((a, i) => {
                  const axis = !!(a.negative || a.positive || a.gamepadAxis);
                  return (
                    <div className="rs-action" key={i}>
                      <div className="rs-action-head">
                        <TextInput value={a.name} onChange={(s) => setAction(i, { name: s.trim() })} />
                        <select
                          value={axis ? 'Axis' : 'Button'}
                          onChange={(e) =>
                            setAction(i, e.target.value === 'Axis' ? { keys: undefined, buttons: undefined, mouse: undefined, negative: [], positive: [], gamepadAxis: 'LeftX' } : { negative: undefined, positive: undefined, gamepadAxis: undefined, invert: undefined, keys: [], buttons: [] })
                          }
                        >
                          <option>Button</option>
                          <option>Axis</option>
                        </select>
                        <button
                          className="rs-btn small"
                          title="Remove"
                          onClick={() => {
                            const acts = Input.actions;
                            acts.splice(i, 1);
                            Input.setActions(acts);
                            changed();
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      {axis ? (
                        <>
                          <div className="rs-field">
                            <label>Negative Keys</label>
                            <div className="rs-field-value">
                              <TextInput value={(a.negative ?? []).join(', ')} onChange={(s) => setAction(i, { negative: list(s) })} />
                            </div>
                          </div>
                          <div className="rs-field">
                            <label>Positive Keys</label>
                            <div className="rs-field-value">
                              <TextInput value={(a.positive ?? []).join(', ')} onChange={(s) => setAction(i, { positive: list(s) })} />
                            </div>
                          </div>
                          <div className="rs-field">
                            <label>Gamepad Axis</label>
                            <div className="rs-field-value">
                              <select value={a.gamepadAxis ?? ''} onChange={(e) => setAction(i, { gamepadAxis: (e.target.value || undefined) as GamepadAxis | undefined })}>
                                <option value="">(none)</option>
                                {AXES.map((x) => (
                                  <option key={x}>{x}</option>
                                ))}
                              </select>
                              <label className="rs-inline-check">
                                <input type="checkbox" checked={!!a.invert} onChange={(e) => setAction(i, { invert: e.target.checked })} /> Invert
                              </label>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="rs-field">
                            <label>Keys</label>
                            <div className="rs-field-value">
                              <TextInput value={(a.keys ?? []).join(', ')} onChange={(s) => setAction(i, { keys: list(s) })} />
                            </div>
                          </div>
                          <div className="rs-field">
                            <label>Gamepad</label>
                            <div className="rs-field-value">
                              <TextInput value={(a.buttons ?? []).join(', ')} placeholder={GAMEPAD_BUTTONS.slice(0, 8).join(', ')} onChange={(s) => setAction(i, { buttons: list(s).filter((b) => (GAMEPAD_BUTTONS as readonly string[]).includes(b)) as GamepadButton[] })} />
                            </div>
                          </div>
                          <div className="rs-field">
                            <label>Mouse Buttons</label>
                            <div className="rs-field-value">
                              <TextInput value={(a.mouse ?? []).join(', ')} placeholder="0 = left, 1 = middle, 2 = right" onChange={(s) => setAction(i, { mouse: list(s).map(Number).filter((n) => n >= 0 && n <= 4) })} />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                <button
                  className="rs-btn"
                  onClick={() => {
                    Input.setActions([...Input.actions, { name: `Action${Input.actions.length + 1}`, keys: [] }]);
                    changed();
                  }}
                >
                  + Add Action
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="rs-modal-foot">
          <span className="rs-dim">{dirty ? 'Unsaved changes (already applied in the editor)' : `${LAYER_COUNT} layers · ${Input.actions.length} actions`}</span>
          <span className="rs-grow" />
          <button
            className="rs-btn"
            onClick={() => {
              void editor.saveProjectSettings({ startScene }).then(() => setDirty(false));
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
