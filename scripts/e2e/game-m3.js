// Game build checks for milestone 3: HUD, pause menu (Esc), Title scene via SceneManager.load and back, music.
(async () => {
  const P = window.__rs.player;
  const out = [];
  const check = (name, ok, extra) => out.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ` (${JSON.stringify(extra)})` : ''}`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms = 10000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try {
        if (await f()) return true;
      } catch {}
      await wait(100);
    }
    return false;
  };
  const elOf = (name) => {
    const go = P.scene?.find(name);
    return go ? document.querySelector(`.rs-ui-el[data-rs-object="${go.id}"]`) : null;
  };
  const visible = (el) => !!el && el.style.display !== 'none' && el.getBoundingClientRect().width > 0;
  const key = (code) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code })), 60);
  };
  check('HUD shown', await until(() => elOf('HUD/TopBar/CoinText')?.textContent === 'COINS  0' && !visible(elOf('HUD/PauseMenu'))));
  check('timer runs', await until(() => /^\d+:\d\d$/.test(elOf('HUD/TimeText')?.textContent ?? '') && elOf('HUD/TimeText').textContent !== '0:00'), elOf('HUD/TimeText')?.textContent);
  key('Escape');
  check('Esc opens the pause menu', await until(() => visible(elOf('HUD/PauseMenu/Window/MenuButton'))));
  elOf('HUD/PauseMenu/Window/MenuButton').click();
  check('Title scene loaded', await until(() => P.scene.path === 'Assets/Scenes/Title.scn.json' && visible(elOf('Menu/StartButton'))));
  check('old HUD removed', ![...document.querySelectorAll('.rs-ui-el')].some((e) => e.textContent.includes('COINS')));
  key('Enter');
  check('Enter starts the game', await until(() => P.scene.path === 'Assets/Scenes/Main.scn.json' && elOf('HUD/TopBar/CoinText')?.textContent === 'COINS  0'));
  const music = P.scene.find('HUD').getComponent('AudioSource');
  out.push(`INFO music playing: ${music.isPlaying}`);
  const missing = performance.getEntriesByType('resource').filter((r) => r.responseStatus === 404).map((r) => r.name);
  out.push(`INFO 404: ${missing.join(', ') || 'none'}`);
  return out.join('\n');
})();
