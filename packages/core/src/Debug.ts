import type { Component } from './GameObject';
import { Color3, Vector3 } from './math';
import { Application } from './Application';

export type LogLevel = 'log' | 'warn' | 'error';
export interface LogEntry {
  level: LogLevel;
  message: string;
  time: number;
  /** GameObject the message is about (click in the Console selects it). */
  objectId?: number;
}

type Listener = (e: LogEntry) => void;
const listeners = new Set<Listener>();

function emit(level: LogLevel, args: unknown[], objectId?: number): void {
  const message = args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? (a.stack ?? a.message) : safe(a))).join(' ');
  const e: LogEntry = { level, message, time: Date.now(), objectId };
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(message);
  for (const l of listeners) l(e);
}
function safe(v: unknown): string {
  try {
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  } catch {
    return String(v);
  }
}

/** Log output (the editor's Console listens). */
export const Debug = {
  log: (...a: unknown[]) => emit('log', a),
  warn: (...a: unknown[]) => emit('warn', a),
  error: (...a: unknown[]) => emit('error', a),
  /** An exception thrown by a component's lifecycle method. */
  exception(e: unknown, c?: Component): void {
    const where = c ? `${c.gameObject?.name ?? '?'} (${c.constructor.name}): ` : '';
    emit('error', [where + (e instanceof Error ? (e.stack ?? e.message) : String(e))], c?.gameObject?.id);
  },
  onLog(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  // ---- debug drawing (lines drawn by the renderer over the scene) -------------------------------------------------------
  /** Draw debug lines in game builds too (the editor always draws them). */
  showLines: false,
  /** Line from `a` to `b` (world). duration 0 = this frame only; scripts call it every frame. */
  drawLine(a: Vector3, b: Vector3, color: Color3 = RED, duration = 0): void {
    lines.push({ a: a.clone(), b: b.clone(), color, frame: Application.frameCount, until: Application.time + duration, once: duration <= 0 });
  },
  /** Line from `origin` along `dir` (its length = the line's length). */
  drawRay(origin: Vector3, dir: Vector3, color: Color3 = RED, duration = 0): void {
    Debug.drawLine(origin, origin.add(dir), color, duration);
  },
  /** Wire box (axis-aligned, `size` = full extents). */
  drawBox(center: Vector3, size: Vector3, color: Color3 = RED, duration = 0): void {
    const h = size.scale(0.5);
    const c = (x: number, y: number, z: number) => new Vector3(center.x + x * h.x, center.y + y * h.y, center.z + z * h.z);
    const s = [-1, 1];
    for (const y of s) for (const z of s) Debug.drawLine(c(-1, y, z), c(1, y, z), color, duration);
    for (const x of s) for (const z of s) Debug.drawLine(c(x, -1, z), c(x, 1, z), color, duration);
    for (const x of s) for (const y of s) Debug.drawLine(c(x, y, -1), c(x, y, 1), color, duration);
  },
  /** Wire sphere (three circles). */
  drawSphere(center: Vector3, radius: number, color: Color3 = RED, duration = 0): void {
    const N = 24;
    for (let axis = 0; axis < 3; axis++)
      for (let i = 0; i < N; i++) {
        const p = (k: number) => {
          const t = (k / N) * Math.PI * 2;
          const u = Math.cos(t) * radius;
          const v = Math.sin(t) * radius;
          return axis === 0 ? new Vector3(center.x, center.y + u, center.z + v) : axis === 1 ? new Vector3(center.x + u, center.y, center.z + v) : new Vector3(center.x + u, center.y + v, center.z);
        };
        Debug.drawLine(p(i), p(i + 1), color, duration);
      }
  },
  /** @internal lines to draw this frame (renderers read it). */
  get _lines(): readonly DebugLine[] {
    return lines;
  },
  /** @internal start of a play frame: drop expired lines. */
  _beginFrame(): void {
    const f = Application.frameCount;
    const t = Application.time;
    let n = 0;
    for (const l of lines) if (l.once ? l.frame >= f : l.until >= t) lines[n++] = l;
    lines.length = n;
  },
  /** @internal end of a play session. */
  _clearLines(): void {
    lines.length = 0;
  },
};

export interface DebugLine {
  a: Vector3;
  b: Vector3;
  color: Color3;
  frame: number;
  until: number;
  once: boolean;
}
const RED = new Color3(1, 0.2, 0.2);
const lines: DebugLine[] = [];
