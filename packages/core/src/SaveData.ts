/**
 * Small persistent key / value storage (settings, high scores, progress): localStorage in browsers, memory elsewhere.
 * Keys are prefixed with `SaveData.namespace` (the player sets it to the project name) so games on one domain don't clash.
 */
const memory = new Map<string, string>();

function store(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

export const SaveData = {
  namespace: 'rs',
  key(k: string): string {
    return `${this.namespace}:${k}`;
  },
  setString(k: string, v: string): void {
    const s = store();
    if (s) s.setItem(this.key(k), v);
    else memory.set(this.key(k), v);
  },
  getString(k: string, fallback = ''): string {
    const s = store();
    const v = s ? s.getItem(this.key(k)) : (memory.get(this.key(k)) ?? null);
    return v ?? fallback;
  },
  setNumber(k: string, v: number): void {
    this.setString(k, String(v));
  },
  getNumber(k: string, fallback = 0): number {
    const v = Number(this.getString(k, ''));
    return this.has(k) && Number.isFinite(v) ? v : fallback;
  },
  setObject(k: string, v: unknown): void {
    this.setString(k, JSON.stringify(v));
  },
  getObject<T>(k: string, fallback: T): T {
    try {
      return this.has(k) ? (JSON.parse(this.getString(k)) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  has(k: string): boolean {
    const s = store();
    return s ? s.getItem(this.key(k)) !== null : memory.has(this.key(k));
  },
  delete(k: string): void {
    const s = store();
    if (s) s.removeItem(this.key(k));
    else memory.delete(this.key(k));
  },
  /** Deletes every key of this namespace. */
  clear(): void {
    const s = store();
    const prefix = `${this.namespace}:`;
    if (s) {
      for (let i = s.length - 1; i >= 0; i--) {
        const k = s.key(i);
        if (k?.startsWith(prefix)) s.removeItem(k);
      }
    } else for (const k of [...memory.keys()]) if (k.startsWith(prefix)) memory.delete(k);
  },
};
