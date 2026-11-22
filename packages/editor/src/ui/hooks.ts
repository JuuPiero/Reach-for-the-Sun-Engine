import { useEffect, useReducer } from 'react';
import { editor, type EditorEvent } from '../editor/Editor';

/** Re-renders the component when one of the editor events fires. */
export function useEditor(...kinds: EditorEvent[]): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offs = kinds.map((k) => editor.on(k, bump));
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinds.join(',')]);
}

/** Re-renders every `ms` while `active` (play mode values). */
export function useTicker(active: boolean, ms = 150): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(bump, ms);
    return () => clearInterval(t);
  }, [active, ms]);
}
