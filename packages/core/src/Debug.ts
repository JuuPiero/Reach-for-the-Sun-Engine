import type { Component } from './GameObject';

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
};
