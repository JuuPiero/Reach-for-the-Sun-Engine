// Milestone 3 editor checks (read-only on examples/Demo, nothing saved): UI overlay + picking, UI creation nesting, HUD in play,
// pause menu via Esc + UI button clicks, SceneManager.load to the Title scene and back, Stop restores the edited scene.
(async () => {
  const E = window.__rsEditor;
  const out = [];
  const check = (name, ok, extra) => out.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ` (${JSON.stringify(extra)})` : ''}`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try {
        if (await f()) return true;
      } catch {}
      await wait(100);
    }
    return false;
  };
  const core = await import('/@id/@rs/core');
  const canvas = document.querySelector('.rs-view-canvas');
  const elOf = (name) => {
    const go = E.scene.find(name);
    return go ? document.querySelector(`.rs-ui-el[data-rs-object="${go.id}"]`) : null;
  };
  const visible = (el) => !!el && el.style.display !== 'none' && el.getBoundingClientRect().width > 0;
  const key = (code) => {
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    setTimeout(() => canvas.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })), 60);
  };

  check('UI overlay draws the HUD in edit mode', await until(() => visible(elOf('HUD/TopBar')) && elOf('HUD/TopBar/CoinText')?.textContent === 'COINS  0'));
  const top = elOf('HUD/TopBar').getBoundingClientRect();
  const host = document.querySelector('.rs-view-host').getBoundingClientRect();
  check('TopLeft anchor lays out near the top-left corner', top.left - host.left < 60 && top.top - host.top < 60, { x: top.left - host.left, y: top.top - host.top });
  // picking a UI element selects its object
  const coinEl = elOf('HUD/TopBar/CoinText');
  coinEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  await wait(150);
  const coinGo = E.scene.find('HUD/TopBar/CoinText');
  check('click on a UI element selects it', E.selection.length === 1 && E.selection[0] === coinGo.id);
  check('selected UI element is outlined', await until(() => coinEl.style.outline.includes('solid')));
  // creating UI under a selected UI object nests it
  E.select([E.scene.find('HUD/TopBar').id]);
  const made = E.create('UIText');
  check('new UI Text goes under the selected UI object', made.parent?.name === 'TopBar');
  check('new UI Text is drawn', await until(() => visible(document.querySelector(`.rs-ui-el[data-rs-object="${made.id}"]`))));
  E.undo();
  check('undo removes it', !E.scene.find('HUD/TopBar/UIText'));
  // the pause menu is saved hidden (update / draw off); the HUD script shows it
  check('hidden pause menu not drawn in edit mode', !visible(elOf('HUD/PauseMenu')));

  // ---- play
  const scenePath = E.scene.path;
  E.dirty = false; // create + undo above marked it
  E.play();
  check('play: HUD runs, pause menu hidden', await until(() => elOf('HUD/TimeText')?.textContent === '0:00' && !visible(elOf('HUD/PauseMenu'))));
  check('play: time text counts', await until(() => elOf('HUD/TimeText')?.textContent === '0:01', 6000), elOf('HUD/TimeText')?.textContent);
  const music = E.scene.find('HUD').getComponent('AudioSource');
  out.push(`INFO music playing: ${music.isPlaying} (audio context ${core.AudioEngine?.context?.state ?? 'n/a'})`);
  key('Escape');
  check('Esc pauses (timeScale 0, menu shown)', await until(() => core.Application.timeScale === 0 && visible(elOf('HUD/PauseMenu/Window/ResumeButton'))));
  check('still playing after Esc in the view', E.mode === 'play');
  const t0 = core.Application.time;
  await wait(400);
  check('time frozen while paused', core.Application.time === t0);
  const resume = elOf('HUD/PauseMenu/Window/ResumeButton');
  resume.dispatchEvent(new PointerEvent('pointerenter'));
  await wait(100);
  const hoverBg = resume.style.backgroundColor;
  resume.click();
  check('Resume button unpauses', await until(() => core.Application.timeScale === 1 && !visible(elOf('HUD/PauseMenu'))));
  check('button hover colour', /255, 179, 89|rgb\(255, 179, 89/.test(hoverBg), hoverBg);
  key('KeyP');
  await until(() => visible(elOf('HUD/PauseMenu/Window/MenuButton')));
  elOf('HUD/PauseMenu/Window/MenuButton').click();
  check('Title Screen button loads the Title scene', await until(() => E.scene.path === 'Assets/Scenes/Title.scn.json' && core.SceneManager.active === E.scene));
  check('title UI drawn, HUD gone', await until(() => visible(elOf('Menu/StartButton')) && ![...document.querySelectorAll('.rs-ui-el')].some((e) => e.textContent.includes('COINS'))));
  check('timeScale reset after leaving pause', core.Application.timeScale === 1);
  check('Title script runs (camera pivot turns)', await until(() => Math.abs(E.scene.find('CameraPivot').transform.localRotation.y) > 0.01));
  elOf('Menu/StartButton').click();
  check('Start loads the game scene again', await until(() => E.scene.path === 'Assets/Scenes/Main.scn.json' && !!E.scene.find('Player')));
  check('back in game: HUD running', await until(() => elOf('HUD/TopBar/CoinText')?.textContent === 'COINS  0' && !visible(elOf('HUD/PauseMenu'))));
  E.stop();
  await wait(300);
  check('stop restores the edited scene', E.mode === 'edit' && E.scene.path === scenePath && !!E.scene.find('HUD/PauseMenu'));
  check('pause menu hidden again after stop', !E.scene.find('HUD/PauseMenu').active && !visible(elOf('HUD/PauseMenu')));
  check('scene not marked dirty by play', !E.dirty);
  return out.join('\n');
})();
