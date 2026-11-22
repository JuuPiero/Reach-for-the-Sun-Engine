import { AudioSource, Behavior, Ease, Input, SaveData, SceneManager, Tween, UIButton, UIText, field, type GameObject } from '@rs/core';

/** Title screen: Start (or Enter) loads the game scene; shows the best score saved by GameHUD; the title text bobs. */
export class TitleMenu extends Behavior {
  @field({ type: 'gameobject' }) startButton: GameObject | null = null;
  @field({ type: 'gameobject' }) titleText: GameObject | null = null;
  @field({ type: 'gameobject' }) bestText: GameObject | null = null;
  @field({ type: 'asset', assetKind: ['wav', 'mp3', 'ogg'] }) clickSound = '';
  gameScene = 'Assets/Scenes/Main.scn.json';
  private _loading = false;

  start(): void {
    this.startButton?.getComponent(UIButton)?.onClick(() => this.play());
    const best = this.bestText?.getComponent(UIText);
    if (best) best.text = `BEST  ${SaveData.getNumber('bestCoins', 0)}`;
    const title = this.titleText?.getComponent(UIText);
    if (title) Tween.to(title, { y: title.y + 14 }, 1.2, { ease: Ease.inOutQuad, repeat: -1, yoyo: true });
  }

  update(): void {
    if (Input.getKeyDown('Enter') || Input.getButtonDown('A')) this.play();
  }

  play(): void {
    if (this._loading) return;
    this._loading = true;
    if (this.clickSound) this.getComponent(AudioSource)?.playOneShot(this.clickSound);
    void SceneManager.load(this.gameScene);
  }
}
