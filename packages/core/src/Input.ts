import { AudioEngine } from './Audio';
/**
 * Keyboard / mouse input for play mode. Keys are DOM `KeyboardEvent.code` names (`KeyW`, `Space`, `ArrowLeft`).
 * The host attaches it to the game view element; state is per frame (`getKeyDown` = pressed this frame).
 */
const held = new Set<string>();
const down = new Set<string>();
const up = new Set<string>();
const mouseHeld = new Set<number>();
const mouseDown = new Set<number>();
const mouseUp = new Set<number>();
let detach: (() => void) | null = null;
let lockElement: HTMLElement | null = null;

/** Standard gamepad mapping (W3C "standard" layout). */
export const GAMEPAD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LS', 'RS', 'Up', 'Down', 'Left', 'Right', 'Home'] as const;
export type GamepadButton = (typeof GAMEPAD_BUTTONS)[number];
const GAMEPAD_AXES = { LeftX: 0, LeftY: 1, RightX: 2, RightY: 3 } as const;
export type GamepadAxis = keyof typeof GAMEPAD_AXES | 'LT' | 'RT';
interface PadState {
  held: Set<string>;
  down: Set<string>;
  up: Set<string>;
  axes: number[];
  triggers: [number, number];
  connected: boolean;
}
const pads: PadState[] = [0, 1, 2, 3].map(() => ({ held: new Set(), down: new Set(), up: new Set(), axes: [0, 0, 0, 0], triggers: [0, 0], connected: false }));

/** A finger on the game view (CSS pixels from the top-left). */
export interface Touch {
  id: number;
  x: number;
  y: number;
  /** Began this frame / moving or resting / ended this frame. */
  phase: 'began' | 'moved' | 'ended';
}
const touches = new Map<number, Touch>();

/**
 * Named input action (Project Settings ▸ Input): a button (any of its keys / gamepad buttons / mouse buttons) or an axis
 * (negative / positive keys + a gamepad axis).
 */
export interface InputAction {
  name: string;
  /** Button sources. */
  keys?: string[];
  buttons?: GamepadButton[];
  mouse?: number[];
  /** Axis sources (value -1..1). */
  negative?: string[];
  positive?: string[];
  gamepadAxis?: GamepadAxis;
  /** Flip the gamepad axis (sticks report down as positive: Vertical uses it). */
  invert?: boolean;
}
export const DEFAULT_INPUT_ACTIONS: InputAction[] = [
  { name: 'Horizontal', negative: ['KeyA', 'ArrowLeft'], positive: ['KeyD', 'ArrowRight'], gamepadAxis: 'LeftX' },
  { name: 'Vertical', negative: ['KeyS', 'ArrowDown'], positive: ['KeyW', 'ArrowUp'], gamepadAxis: 'LeftY', invert: true },
  { name: 'Jump', keys: ['Space'], buttons: ['A'] },
  { name: 'Fire', keys: [], buttons: ['RT', 'X'], mouse: [0] },
  { name: 'Submit', keys: ['Enter'], buttons: ['A'] },
  { name: 'Cancel', keys: ['Escape'], buttons: ['B'] },
];
const actions = new Map<string, InputAction>(DEFAULT_INPUT_ACTIONS.map((a) => [a.name, a]));
const anyOf = (codes: readonly string[] | undefined, set: Set<string>) => !!codes?.some((c) => set.has(c));

export const Input = {
  /** Mouse position in the game view, CSS pixels from the top-left. */
  mouseX: 0,
  mouseY: 0,
  /** Mouse movement since the previous frame. */
  mouseDeltaX: 0,
  mouseDeltaY: 0,
  wheel: 0,

  getKey: (code: string) => held.has(code),
  getKeyDown: (code: string) => down.has(code),
  getKeyUp: (code: string) => up.has(code),
  getMouseButton: (b = 0) => mouseHeld.has(b),
  getMouseButtonDown: (b = 0) => mouseDown.has(b),
  getMouseButtonUp: (b = 0) => mouseUp.has(b),
  /** -1..1 from two keys (`axis('KeyA', 'KeyD')`). */
  axis(negative: string, positive: string): number {
    return (held.has(positive) ? 1 : 0) - (held.has(negative) ? 1 : 0);
  },

  /** Listens to keys on the window and the mouse on `element`. */
  attach(element: HTMLElement): void {
    lockElement = element;
    detach?.();
    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      AudioEngine.resume();
      if (!held.has(e.code)) down.add(e.code);
      held.add(e.code);
    };
    const ku = (e: KeyboardEvent) => {
      held.delete(e.code);
      up.add(e.code);
    };
    const md = (e: MouseEvent) => {
      AudioEngine.resume();
      if (Input.lockOnClick && lockElement && document.pointerLockElement !== lockElement) void lockElement.requestPointerLock?.();
      mouseHeld.add(e.button);
      mouseDown.add(e.button);
    };
    const mu = (e: MouseEvent) => {
      mouseHeld.delete(e.button);
      mouseUp.add(e.button);
    };
    const mm = (e: MouseEvent) => {
      const r = element.getBoundingClientRect();
      Input.mouseDeltaX += e.movementX;
      Input.mouseDeltaY += e.movementY;
      Input.mouseX = e.clientX - r.left;
      Input.mouseY = e.clientY - r.top;
    };
    const wh = (e: WheelEvent) => {
      Input.wheel += Math.sign(e.deltaY);
    };
    const blur = () => held.clear();
    // touches; the first finger also acts as mouse button 0 (games written for the mouse work on phones)
    let primary: number | null = null;
    const pos = (t: { clientX: number; clientY: number }) => {
      const r = element.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    const ts = (e: TouchEvent) => {
      e.preventDefault();
      AudioEngine.resume();
      for (const t of Array.from(e.changedTouches)) {
        const p = pos(t);
        touches.set(t.identifier, { id: t.identifier, x: p.x, y: p.y, phase: 'began' });
        if (primary === null) {
          primary = t.identifier;
          Input.mouseX = p.x;
          Input.mouseY = p.y;
          mouseHeld.add(0);
          mouseDown.add(0);
        }
      }
    };
    const tm = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        const cur = touches.get(t.identifier);
        if (!cur) continue;
        const p = pos(t);
        if (t.identifier === primary) {
          Input.mouseDeltaX += p.x - cur.x;
          Input.mouseDeltaY += p.y - cur.y;
          Input.mouseX = p.x;
          Input.mouseY = p.y;
        }
        cur.x = p.x;
        cur.y = p.y;
        if (cur.phase !== 'began') cur.phase = 'moved';
      }
    };
    const te = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const cur = touches.get(t.identifier);
        if (cur) cur.phase = 'ended';
        if (t.identifier === primary) {
          primary = null;
          mouseHeld.delete(0);
          mouseUp.add(0);
        }
      }
    };
    element.addEventListener('touchstart', ts, { passive: false });
    element.addEventListener('touchmove', tm, { passive: false });
    element.addEventListener('touchend', te);
    element.addEventListener('touchcancel', te);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    element.addEventListener('mousedown', md);
    window.addEventListener('mouseup', mu);
    window.addEventListener('mousemove', mm);
    element.addEventListener('wheel', wh, { passive: true });
    window.addEventListener('blur', blur);
    detach = () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      element.removeEventListener('mousedown', md);
      window.removeEventListener('mouseup', mu);
      window.removeEventListener('mousemove', mm);
      element.removeEventListener('wheel', wh);
      window.removeEventListener('blur', blur);
      element.removeEventListener('touchstart', ts);
      element.removeEventListener('touchmove', tm);
      element.removeEventListener('touchend', te);
      element.removeEventListener('touchcancel', te);
      detach = null;
    };
  },
  detach(): void {
    detach?.();
    Input.reset();
  },
  reset(): void {
    held.clear();
    down.clear();
    up.clear();
    mouseHeld.clear();
    mouseDown.clear();
    mouseUp.clear();
    touches.clear();
    Input.mouseDeltaX = Input.mouseDeltaY = Input.wheel = 0;
  },

  // ---- touch ------------------------------------------------------------------------------------------------------------------
  /** Fingers on the game view this frame (ended ones are listed for the frame they lift). */
  get touches(): Touch[] {
    return [...touches.values()];
  },
  get touchCount(): number {
    let n = 0;
    for (const t of touches.values()) if (t.phase !== 'ended') n++;
    return n;
  },

  // ---- actions ----------------------------------------------------------------------------------------------------------------
  /** Replaces the action table (Project Settings ▸ Input). */
  setActions(list: InputAction[]): void {
    actions.clear();
    for (const a of list) if (a.name) actions.set(a.name, a);
  },
  get actions(): InputAction[] {
    return [...actions.values()];
  },
  /** An action's button is held (any key / gamepad button / mouse button), or its axis is pushed. */
  getAction(name: string, pad = 0): boolean {
    const a = actions.get(name);
    if (!a) return false;
    return anyOf(a.keys, held) || !!a.buttons?.some((b) => Input.getButton(b, pad)) || !!a.mouse?.some((b) => mouseHeld.has(b)) || (!!(a.negative || a.positive || a.gamepadAxis) && Input.getActionValue(name, pad) !== 0);
  },
  getActionDown(name: string, pad = 0): boolean {
    const a = actions.get(name);
    return !!a && (anyOf(a.keys, down) || !!a.buttons?.some((b) => Input.getButtonDown(b, pad)) || !!a.mouse?.some((b) => mouseDown.has(b)) || anyOf(a.positive, down) || anyOf(a.negative, down));
  },
  getActionUp(name: string, pad = 0): boolean {
    const a = actions.get(name);
    return !!a && (anyOf(a.keys, up) || !!a.buttons?.some((b) => Input.getButtonUp(b, pad)) || !!a.mouse?.some((b) => mouseUp.has(b)) || anyOf(a.positive, up) || anyOf(a.negative, up));
  },
  /** -1..1 for axis actions (keys win over the stick), 0 / 1 for buttons. */
  getActionValue(name: string, pad = 0): number {
    const a = actions.get(name);
    if (!a) return 0;
    if (a.negative || a.positive || a.gamepadAxis) {
      const k = (anyOf(a.positive, held) ? 1 : 0) - (anyOf(a.negative, held) ? 1 : 0);
      if (k !== 0) return k;
      if (a.gamepadAxis) {
        const v = Input.getAxis(a.gamepadAxis, pad);
        return v === 0 ? 0 : a.invert ? -v : v;
      }
      return 0;
    }
    return anyOf(a.keys, held) || !!a.buttons?.some((b) => Input.getButton(b, pad)) || !!a.mouse?.some((b) => mouseHeld.has(b)) ? 1 : 0;
  },

  // ---- gamepads (standard mapping, polled once per play frame) -----------------------------------------------------------
  /** A gamepad button is held (`'A'`, `'LB'`, `'Start'`, `'Up'`… see GAMEPAD_BUTTONS). */
  getButton: (b: GamepadButton, pad = 0) => pads[pad]?.held.has(b) ?? false,
  getButtonDown: (b: GamepadButton, pad = 0) => pads[pad]?.down.has(b) ?? false,
  getButtonUp: (b: GamepadButton, pad = 0) => pads[pad]?.up.has(b) ?? false,
  /** -1..1 stick axes (`LeftX`, `LeftY` = down positive like the API, `RightX`, `RightY`), 0..1 triggers (`LT`, `RT`); dead zone applied. */
  getAxis(a: GamepadAxis, pad = 0): number {
    const p = pads[pad];
    if (!p) return 0;
    if (a === 'LT') return p.triggers[0];
    if (a === 'RT') return p.triggers[1];
    const v = p.axes[GAMEPAD_AXES[a]] ?? 0;
    return Math.abs(v) < Input.deadZone ? 0 : v;
  },
  gamepadConnected: (pad = 0) => pads[pad]?.connected ?? false,
  deadZone: 0.15,

  // ---- cursor ---------------------------------------------------------------------------------------------------------------
  /** Lock the cursor (mouse look; mouseDeltaX / Y keep coming) on the next click when true. */
  lockOnClick: false,
  get cursorLocked(): boolean {
    return typeof document !== 'undefined' && !!lockElement && document.pointerLockElement === lockElement;
  },
  /** Locks / releases the cursor now (browsers need a recent user gesture to lock). */
  lockCursor(lock: boolean): void {
    if (typeof document === 'undefined' || !lockElement) return;
    if (lock) void lockElement.requestPointerLock?.();
    else if (document.pointerLockElement) document.exitPointerLock();
  },

  /** @internal start of a play frame: gamepads polled. */
  _beginFrame(): void {
    const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      const g = list[i];
      p.down.clear();
      p.up.clear();
      p.connected = !!g?.connected;
      if (!g) {
        for (const b of p.held) p.up.add(b);
        p.held.clear();
        continue;
      }
      g.buttons.forEach((btn, bi) => {
        const name = GAMEPAD_BUTTONS[bi];
        if (!name) return;
        const pressed = btn.pressed || btn.value > 0.5;
        if (pressed && !p.held.has(name)) (p.held.add(name), p.down.add(name));
        else if (!pressed && p.held.has(name)) (p.held.delete(name), p.up.add(name));
      });
      for (let a = 0; a < 4; a++) p.axes[a] = g.axes[a] ?? 0;
      p.triggers[0] = g.buttons[6]?.value ?? 0;
      p.triggers[1] = g.buttons[7]?.value ?? 0;
    }
  },

  /** @internal end of a play frame. */
  _endFrame(): void {
    down.clear();
    up.clear();
    mouseDown.clear();
    mouseUp.clear();
    Input.mouseDeltaX = Input.mouseDeltaY = Input.wheel = 0;
    for (const [id, t] of touches) {
      if (t.phase === 'ended') touches.delete(id);
      else t.phase = 'moved';
    }
  },
};
