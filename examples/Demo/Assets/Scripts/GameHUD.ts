import { Application, AudioSource, Behavior, Input, SaveData, SceneManager, Tween, UIButton, UIText, Ease, field, type GameObject } from '@rs/core';
import { PlayerController } from './PlayerController';

/**
 * In-game HUD: coin counter (with a pop tween), play time, best score (SaveData), and a pause menu (Esc / P) whose buttons
 * resume or go back to the title scene.
 */
export class GameHUD extends Behavior {
  @field({ type: 'gameobject' }) player: GameObject | null = null;
  @field({ type: 'gameobject', header: 'Widgets' }) coinText: GameObject | null = null;
  @field({ type: 'gameobject' }) timeText: GameObject | null = null;
  @field({ type: 'gameobject' }) bestText: GameObject | null = null;
  @field({ type: 'gameobject' }) pausePanel: GameObject | null = null;
  @field({ type: 'gameobject' }) resumeButton: GameObject | null = null;
  @field({ type: 'gameobject' }) menuButton: GameObject | null = null;
  @field({ type: 'asset', assetKind: ['wav', 'mp3', 'ogg'], header: 'Sounds' }) clickSound = '';
  menuScene = 'Assets/Scenes/Title.scn.json';

  private _pc: PlayerController | null = null;
  private _shown = -1;
  private _best = 0;
  private _paused = false;
  private _audio: AudioSource | null = null;

  start(): void {
    this._pc = this.player?.getComponent(PlayerController) ?? null;
    this._audio = this.getComponent(AudioSource);
    this._best = SaveData.getNumber('bestCoins', 0);
    this.setPaused(false);
    this.resumeButton?.getComponent(UIButton)?.onClick(() => this.setPaused(false));
    this.menuButton?.getComponent(UIButton)?.onClick(() => {
      this.click();
      Application.timeScale = 1;
      void SceneManager.load(this.menuScene);
    });
  }

  update(): void {
    if (Input.getKeyDown('Escape') || Input.getKeyDown('KeyP')) this.setPaused(!this._paused);
    const coins = this._pc?.coins ?? 0;
    if (coins !== this._shown) {
      const label = this.coinText?.getComponent(UIText);
      if (label) {
        label.text = `COINS  ${coins}`;
        if (this._shown >= 0) {
          label.fontSize = 40;
          Tween.to(label, { fontSize: 30 }, 0.25, { ease: Ease.outBack });
        }
      }
      this._shown = coins;
      if (coins > this._best) {
        this._best = coins;
        SaveData.setNumber('bestCoins', coins);
      }
      const best = this.bestText?.getComponent(UIText);
      if (best) best.text = `BEST  ${this._best}`;
    }
    const time = this.timeText?.getComponent(UIText);
    if (time) {
      const t = Math.floor(Application.time);
      time.text = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    }
  }

  setPaused(paused: boolean): void {
    if (paused !== this._paused) this.click();
    this._paused = paused;
    Application.timeScale = paused ? 0 : 1;
    if (this.pausePanel) this.pausePanel.active = paused;
  }

  private click(): void {
    if (this.clickSound) this._audio?.playOneShot(this.clickSound, 0.6);
  }
}
