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
    detach?.();
    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!held.has(e.code)) down.add(e.code);
      held.add(e.code);
    };
    const ku = (e: KeyboardEvent) => {
      held.delete(e.code);
      up.add(e.code);
    };
    const md = (e: MouseEvent) => {
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
  /** @internal end of a play frame. */
  _endFrame(): void {
    down.clear();
    up.clear();
    mouseDown.clear();
    mouseUp.clear();
    Input.mouseDeltaX = Input.mouseDeltaY = Input.wheel = 0;
  },
};
