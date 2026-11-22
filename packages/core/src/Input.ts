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
    Input.mouseDeltaX = Input.mouseDeltaY = Input.wheel = 0;
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
  },
};
