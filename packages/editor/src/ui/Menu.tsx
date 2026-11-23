import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icons } from './icons';

export interface MenuItem {
  label?: string;
  action?: () => void;
  submenu?: MenuItem[];
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
}

type Listener = () => void;
let current: { items: MenuItem[]; x: number; y: number } | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

/** Opens the global right-click menu at a screen point. */
export function showContextMenu(e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void }, items: MenuItem[]): void {
  e.preventDefault?.();
  e.stopPropagation?.();
  current = { items, x: e.clientX, y: e.clientY };
  emit();
}
export function closeContextMenu(): void {
  current = null;
  emit();
}

export function MenuList({ items, x, y, onClose, flipX }: { items: MenuItem[]; x: number; y: number; onClose: () => void; flipX?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [open, setOpen] = useState<{ i: number; x: number; y: number; right: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + r.width > innerWidth - 4) left = flipX !== undefined ? flipX - r.width : innerWidth - r.width - 4;
    if (top + r.height > innerHeight - 4) top = Math.max(4, innerHeight - r.height - 4);
    setPos({ left: Math.max(4, left), top });
  }, [x, y, items, flipX]);
  return (
    <div className="rs-menu" ref={ref} style={pos} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="rs-menu-sep" />
        ) : (
          <div
            key={i}
            className={`rs-menu-item${it.disabled ? ' disabled' : ''}${open?.i === i ? ' open' : ''}`}
            onMouseEnter={(e) => {
              if (it.submenu) {
                const r = e.currentTarget.getBoundingClientRect();
                setOpen({ i, x: r.right - 2, y: r.top - 3, right: r.left + 2 });
              } else setOpen(null);
            }}
            onClick={() => {
              if (it.disabled || it.submenu) return;
              onClose();
              it.action?.();
            }}
          >
            <span className="rs-menu-check">{it.checked ? '✓' : ''}</span>
            <span className="rs-menu-label">{it.label}</span>
            <span className="rs-menu-shortcut">{it.shortcut ?? ''}</span>
            <span className="rs-menu-arrow">{it.submenu ? <Icons.Chevron size={11} /> : null}</span>
          </div>
        ),
      )}
      {open && items[open.i]?.submenu && <MenuList items={items[open.i].submenu!} x={open.x} y={open.y} flipX={open.right} onClose={onClose} />}
    </div>
  );
}

export function ContextMenuHost() {
  const [, set] = useState(0);
  useEffect(() => {
    const l = () => set((n) => n + 1);
    listeners.add(l);
    const close = () => current && closeContextMenu();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', key);
    return () => {
      listeners.delete(l);
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', key);
    };
  }, []);
  return current ? <MenuList items={current.items} x={current.x} y={current.y} onClose={closeContextMenu} /> : null;
}

/** Menu bar entries (File, Edit...) opening drop-down lists. */
export function MenuBar({ menus, right }: { menus: { label: string; items: () => MenuItem[] }[]; right?: React.ReactNode }) {
  const [open, setOpen] = useState<{ i: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const at = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setOpen({ i, x: r.left, y: r.bottom });
  };
  return (
    <div className="rs-menubar" onMouseDown={(e) => e.stopPropagation()}>
      <div className="rs-logo" title="RS Engine">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="#e6e6e6" strokeWidth="1.6" />
          <circle cx="8" cy="8" r="2.6" fill="#4aa8ff" />
        </svg>
      </div>
      {menus.map((m, i) => (
        <div key={m.label} className={`rs-menubar-item${open?.i === i ? ' open' : ''}`} onMouseDown={(e) => (open?.i === i ? setOpen(null) : at(i, e.currentTarget))} onMouseEnter={(e) => open && open.i !== i && at(i, e.currentTarget)}>
          {m.label}
        </div>
      ))}
      {open && <MenuList items={menus[open.i].items()} x={open.x} y={open.y} onClose={() => setOpen(null)} />}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}
