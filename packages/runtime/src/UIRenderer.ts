import { Assets, Types, UI, UIButton, UIComponent, UIImage, UIPanel, UIText, type Color3, type GameObject, type Scene, type UIAnchor } from '@rs/core';

/**
 * DOM renderer of the in-game UI components (core components/ui.ts), mirrored every frame like the 3D backend: one absolutely
 * positioned element per GameObject with UI components, nested like the GameObjects, inside a root laid out at the reference
 * resolution (`UI.referenceHeight` tall, as wide as the view's aspect) and CSS-scaled to the view. One GameObject = one element:
 * its first UI component gives the layout; a Panel / Image fills it, a Text writes in it, a Button is clickable.
 */
interface Entry {
  el: HTMLDivElement;
  text: HTMLSpanElement;
  gen: number;
  parent: HTMLElement | null;
}

const css = (c: Color3, a = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;

/** Anchor → fractions of the parent rectangle (x from the left, y from the top). */
function anchorOf(a: UIAnchor): [number, number] {
  switch (a) {
    case 'TopLeft':
      return [0, 0];
    case 'Top':
      return [0.5, 0];
    case 'TopRight':
      return [1, 0];
    case 'Left':
      return [0, 0.5];
    case 'Right':
      return [1, 0.5];
    case 'BottomLeft':
      return [0, 1];
    case 'Bottom':
      return [0.5, 1];
    case 'BottomRight':
      return [1, 1];
    default:
      return [0.5, 0.5];
  }
}

export interface UIRendererOptions {
  /** Buttons react (play mode); otherwise clicks pick objects (`onPick`, editor). */
  interactive: () => boolean;
  onPick?: (go: GameObject, additive: boolean) => void;
  /** Outline the picked / selected objects (editor). */
  isSelected?: (go: GameObject) => boolean;
}

export class UIRenderer {
  readonly root: HTMLDivElement;
  private readonly entries = new Map<GameObject, Entry>();
  private gen = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly opts: UIRendererOptions,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'rs-ui-root';
    Object.assign(this.root.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0', pointerEvents: 'none', overflow: 'hidden', fontFamily: "'Segoe UI', system-ui, sans-serif", userSelect: 'none' });
    host.appendChild(this.root);
  }

  sync(scene: Scene): void {
    const gen = ++this.gen;
    const H = UI.referenceHeight;
    const scale = (this.host.clientHeight || H) / H;
    const W = (this.host.clientWidth || H) / scale;
    this.root.style.width = `${W}px`;
    this.root.style.height = `${H}px`;
    this.root.style.transform = `scale(${scale})`;
    const interactive = this.opts.interactive();
    let order = 0;
    for (const go of scene.allGameObjects()) {
      const comps = go.components.filter((c): c is UIComponent => c instanceof UIComponent);
      if (!comps.length) continue;
      let e = this.entries.get(go);
      if (!e) e = this.create(go);
      e.gen = gen;
      const layout = comps[0];
      // parent element: nearest parent object with UI
      let parentEl: HTMLElement = this.root;
      let pw = W;
      let ph = H;
      for (let p = go.parent; p; p = p.parent) {
        const pe = this.entries.get(p);
        if (pe && p.components.some((c) => c instanceof UIComponent)) {
          parentEl = pe.el;
          const pl = p.components.find((c): c is UIComponent => c instanceof UIComponent)!;
          pw = parseFloat(pe.el.style.width) || pl.width;
          ph = parseFloat(pe.el.style.height) || pl.height;
          break;
        }
      }
      if (e.parent !== parentEl) {
        parentEl.appendChild(e.el);
        e.parent = parentEl;
      }
      e.el.style.zIndex = String(++order);
      // rectangle (reference pixels; y offset is upwards)
      let left: number;
      let top: number;
      let w: number;
      let h: number;
      if (layout.anchor === 'Stretch') {
        left = layout.x;
        top = layout.y;
        w = Math.max(0, pw - 2 * layout.x);
        h = Math.max(0, ph - 2 * layout.y);
      } else {
        const [ax, ay] = anchorOf(layout.anchor);
        w = layout.width;
        h = layout.height;
        left = ax * pw + layout.x - ax * w;
        top = ay * ph - layout.y - ay * h;
      }
      const s = e.el.style;
      s.left = `${left}px`;
      s.top = `${top}px`;
      s.width = `${w}px`;
      s.height = `${h}px`;
      s.display = go.visibleInHierarchy && comps.some((c) => c.enabled) ? 'flex' : 'none';
      s.opacity = String(layout.opacity);
      // looks
      const panel = go.getComponent(UIPanel);
      const image = go.getComponent(UIImage);
      const text = go.getComponent(UIText);
      const button = go.getComponent(UIButton);
      let bg = 'transparent';
      let bgImage = 'none';
      let radius = 0;
      let border = 'none';
      if (panel?.enabled) {
        bg = css(panel.color, panel.backgroundOpacity);
        radius = panel.cornerRadius;
        border = panel.borderWidth > 0 ? `${panel.borderWidth}px solid ${css(panel.borderColor)}` : 'none';
      }
      if (image?.enabled) {
        if (image.image) bgImage = `url("${Assets.url(image.image)}")`;
        bg = image.image ? css(image.color) : css(image.color);
      }
      if (button?.enabled) {
        bg = css(button._hover && interactive && button.interactable ? button.hoverColor : button.color, button.interactable ? 1 : 0.5);
        radius = button.cornerRadius;
      }
      s.backgroundColor = bg;
      s.backgroundImage = bgImage;
      s.backgroundBlendMode = image?.image ? 'multiply' : 'normal';
      s.borderRadius = `${radius}px`;
      s.border = border;
      s.cursor = button?.enabled && interactive ? 'pointer' : 'default';
      s.pointerEvents = interactive ? (button?.enabled ? 'auto' : 'none') : this.opts.onPick ? 'auto' : 'none';
      s.outline = this.opts.isSelected?.(go) ? '2px solid #3a9cff' : 'none';
      // text
      const label = button?.enabled ? button.text : text?.enabled ? text.text : '';
      if (e.text.textContent !== label) e.text.textContent = label;
      const ts = e.text.style;
      if (button?.enabled) {
        ts.fontSize = `${button.fontSize}px`;
        ts.color = css(button.textColor);
        ts.fontWeight = '600';
        ts.textAlign = 'center';
        ts.textShadow = 'none';
        s.justifyContent = 'center';
      } else if (text?.enabled) {
        ts.fontSize = `${text.fontSize}px`;
        ts.color = css(text.color);
        ts.fontWeight = text.bold ? '700' : '400';
        ts.textAlign = text.align;
        ts.textShadow = text.shadow ? '0 1px 2px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.9)' : 'none';
        s.justifyContent = text.align === 'left' ? 'flex-start' : text.align === 'right' ? 'flex-end' : 'center';
      }
    }
    for (const [go, e] of this.entries)
      if (e.gen !== gen) {
        e.el.remove();
        this.entries.delete(go);
      }
  }

  private create(go: GameObject): Entry {
    const el = document.createElement('div');
    el.className = 'rs-ui-el';
    el.dataset.rsObject = String(go.id);
    Object.assign(el.style, { position: 'absolute', boxSizing: 'border-box', alignItems: 'center', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', transition: 'background-color 0.08s' });
    const text = document.createElement('span');
    Object.assign(text.style, { width: '100%', padding: '0 6px', whiteSpace: 'pre-wrap', lineHeight: '1.15', pointerEvents: 'none' });
    el.appendChild(text);
    el.addEventListener('pointerenter', () => {
      const b = go.getComponent(UIButton);
      if (b) b._hover = true;
    });
    el.addEventListener('pointerleave', () => {
      const b = go.getComponent(UIButton);
      if (b) b._hover = false;
    });
    el.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      if (this.opts.interactive()) return;
      ev.preventDefault();
      this.opts.onPick?.(go, ev.ctrlKey || ev.shiftKey);
    });
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (this.opts.interactive()) go.getComponent(UIButton)?.click();
    });
    const e: Entry = { el, text, gen: 0, parent: null };
    this.entries.set(go, e);
    return e;
  }

  dispose(): void {
    this.root.remove();
    this.entries.clear();
  }
}

export { Types };
