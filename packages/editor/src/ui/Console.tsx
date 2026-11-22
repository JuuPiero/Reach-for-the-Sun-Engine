import { useEffect, useRef, useState } from 'react';
import { editor } from '../editor/Editor';
import { useEditor } from './hooks';

/** Log output (Debug.log / warn / error, script exceptions). Click a line about an object to select it. */
export function Console() {
  useEditor('log');
  const [show, setShow] = useState({ log: true, warn: true, error: true });
  const [, clear] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const logs = editor.logs.filter((l) => show[l.level]);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);
  const count = (lv: 'log' | 'warn' | 'error') => editor.logs.filter((l) => l.level === lv).length;
  return (
    <div className="rs-panel rs-console">
      <div className="rs-assets-bar">
        <button
          className="rs-btn small"
          onClick={() => {
            editor.logs.length = 0;
            clear((n) => n + 1);
          }}
        >
          Clear
        </button>
        {(['log', 'warn', 'error'] as const).map((lv) => (
          <label key={lv} className={`rs-console-filter ${lv}`}>
            <input type="checkbox" checked={show[lv]} onChange={(e) => setShow({ ...show, [lv]: e.target.checked })} /> {lv} ({count(lv)})
          </label>
        ))}
      </div>
      <div className="rs-console-lines" ref={ref}>
        {logs.map((l, i) => (
          <div key={i} className={`rs-log ${l.level}`} onClick={() => l.objectId && editor.select([l.objectId])}>
            <span className="rs-log-time">{new Date(l.time).toLocaleTimeString()}</span>
            <span className="rs-log-msg">{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
