import { Debug } from '../Debug';
import { Component, type GameObject } from '../GameObject';
import { Color3 } from '../math';
import { field, Types } from '../reflection';

/**
 * In-game UI (HUD, menus) drawn over the game view by the UI renderer (runtime/src/UIRenderer.ts, DOM). Every UI component
 * places its GameObject in a rectangle: `anchor` (a corner / edge / centre of the parent rectangle, or Stretch), `x` / `y`
 * offset and `width` / `height`, in reference pixels (`UI.referenceHeight` tall screen; the UI scales with the window). The parent
 * rectangle is the nearest parent GameObject with a UI component, else the screen. Later objects draw on top.
 */
export const UI_ANCHORS = ['TopLeft', 'Top', 'TopRight', 'Left', 'Center', 'Right', 'BottomLeft', 'Bottom', 'BottomRight', 'Stretch'] as const;
export type UIAnchor = (typeof UI_ANCHORS)[number];

export const UI = {
  /** The UI is laid out for a screen this many pixels tall, then scaled. */
  referenceHeight: 720,
};

export abstract class UIComponent extends Component {
  @field({ type: 'enum', options: UI_ANCHORS, header: 'Layout' }) anchor: UIAnchor = 'Center';
  x = 0;
  y = 0;
  @field({ min: 0 }) width = 200;
  @field({ min: 0 }) height = 50;
  /** 0..1 */
  @field({ min: 0, max: 1, step: 0.01 }) opacity = 1;
}

export const TEXT_ALIGN = ['left', 'center', 'right'] as const;

export class UIText extends UIComponent {
  @field({ header: 'Text' }) text = 'Text';
  @field({ min: 1 }) fontSize = 24;
  color = new Color3(1, 1, 1);
  bold = false;
  @field({ type: 'enum', options: TEXT_ALIGN }) align: (typeof TEXT_ALIGN)[number] = 'center';
  /** Outline / shadow for readability over the game. */
  shadow = true;
}

export class UIImage extends UIComponent {
  @field({ type: 'asset', assetKind: ['png', 'jpg', 'jpeg', 'webp'], header: 'Image' }) image = '';
  /** Tint (multiplies the image; the fill colour without an image). */
  color = new Color3(1, 1, 1);
}

export class UIPanel extends UIComponent {
  @field({ header: 'Panel' }) color = new Color3(0.08, 0.08, 0.09);
  @field({ min: 0, max: 1, step: 0.01 }) backgroundOpacity = 0.8;
  @field({ min: 0 }) cornerRadius = 6;
  borderColor = new Color3(1, 0.54, 0.12);
  @field({ min: 0 }) borderWidth = 0;
}

export class UIButton extends UIComponent {
  @field({ header: 'Button' }) text = 'Button';
  @field({ min: 1 }) fontSize = 22;
  textColor = new Color3(0.07, 0.04, 0.01);
  color = new Color3(1, 0.54, 0.12);
  hoverColor = new Color3(1, 0.68, 0.36);
  @field({ min: 0 }) cornerRadius = 6;
  interactable = true;
  /** On click: call `method` on the components of `target` (RE / Unity-style persistent event). */
  @field({ type: 'gameobject', header: 'On Click' }) target: GameObject | null = null;
  method = '';
  private _handlers: (() => void)[] = [];
  /** @internal hovered / pressed state (renderer). */
  _hover = false;

  /** Adds a click handler from a script. */
  onClick(handler: () => void): () => void {
    this._handlers.push(handler);
    return () => (this._handlers = this._handlers.filter((h) => h !== handler));
  }

  /** Clicks the button (the renderer calls it; scripts can too). */
  click(): void {
    if (!this.interactable) return;
    for (const h of [...this._handlers]) {
      try {
        h();
      } catch (e) {
        Debug.exception(e, this);
      }
    }
    if (this.target && this.method) {
      let called = false;
      for (const c of this.target.components) {
        const f = (c as unknown as Record<string, unknown>)[this.method];
        if (typeof f === 'function') {
          called = true;
          try {
            (f as () => void).call(c);
          } catch (e) {
            Debug.exception(e, c);
          }
        }
      }
      if (!called) Debug.warn(`${this.gameObject.name}: no method '${this.method}' on ${this.target.name}`);
    }
  }
}

Types.register(UIText, 'UIText', 'component', { menu: 'UI/Text', single: true });
Types.register(UIImage, 'UIImage', 'component', { menu: 'UI/Image', single: true });
Types.register(UIPanel, 'UIPanel', 'component', { menu: 'UI/Panel', single: true });
Types.register(UIButton, 'UIButton', 'component', { menu: 'UI/Button', single: true });
