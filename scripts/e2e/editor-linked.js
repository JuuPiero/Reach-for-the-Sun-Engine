// Linked folders / additive scenes (scratch copy of examples/Demo — writes files): Props is a linked scene; edit + save writes
// it back; undo; play / stop; unload; link another scene; SceneManager.loadAdditive in play.
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
  const readFile = async (p) => (await fetch(`/project/${p}`, { cache: 'no-cache' })).json();
  const PROPS = 'Assets/Scenes/Props.scn.json';

  const props = E.scene.root.findFolder('Props');
  check('Props is a loaded linked folder', props.scenePath === PROPS && props.sceneLoaded && !!E.scene.find('Crate_00'));
  check('Hierarchy badge', await until(() => [...document.querySelectorAll('.rs-row-badge.linked')].some((b) => b.title === PROPS)));
  E.selectFolder('Props');
  await wait(300);
  check('folder Inspector shows the linked scene', document.querySelector('.rs-linked-path')?.textContent === PROPS);
  // edit inside the linked folder + save
  const crate = E.scene.find('Crate_00');
  E.select([crate.id]);
  E.recordUndo('Move');
  crate.transform.localPosition.x = -6;
  crate.transform.markDirty();
  E.changed();
  await E.saveScene();
  const pj = await readFile(PROPS);
  const mj = await readFile(E.scene.path);
  check('linked content saved to its own file', pj.root.gameObjects.find((g) => g.name === 'Crate_00')?.transform.p[0] === -6);
  const pf = mj.root.folders.find((f) => f.name === 'Props');
  check('the main scene keeps only the link', pf.scene === PROPS && !pf.folders.length && !pf.gameObjects.length && !pf.loaded, pf);
  E.undo();
  check('undo restores linked content', E.scene.find('Crate_00').transform.localPosition.x === -4 && E.scene.root.findFolder('Props').sceneLoaded);
  // play / stop
  E.play();
  await wait(1500);
  check('linked objects simulate in play', !!E.scene.find('Ball') && E.scene.find('Ball').transform.position.y < 2.5);
  E.stop();
  await wait(300);
  check('stop restores the linked content', E.scene.root.findFolder('Props').sceneLoaded && E.scene.find('Ball').transform.position.y === 3);
  // unload in the editor: content gone, the file untouched on save
  await E.setLinkedLoaded(E.scene.root.findFolder('Props'), false);
  check('unload removes the content', !E.scene.find('Crate_00') && !E.scene.root.findFolder('Props').sceneLoaded);
  await E.saveScene();
  const pj2 = await readFile(PROPS);
  check('unloaded linked file left as it is', pj2.root.gameObjects.some((g) => g.name === 'Crate_00'));
  await E.setLinkedLoaded(E.scene.root.findFolder('Props'), true);
  check('load again', !!E.scene.find('Crate_00'));
  // link another scene (Hierarchy drop does this)
  const f = await E.linkScene('Assets/Scenes/Title.scn.json');
  check('link a scene into a folder', f?.sceneLoaded && !!E.scene.find('Title/Menu') === false && !!f && [...f.allFolders()].some((x) => x.gameObjects.some((g) => g.name === 'Menu')));
  E.undo();
  check('undo removes the link', !E.scene.root.findFolder('Title'));
  // additive load from a script while playing
  E.play();
  await wait(500);
  const fa = await core.SceneManager.loadAdditive('Assets/Scenes/Title.scn.json');
  check('loadAdditive adds the scene content in play', fa.sceneLoaded && [...fa.allFolders()].some((x) => x.gameObjects.some((g) => g.name === 'Menu')));
  check('additive UI is drawn', await until(() => [...document.querySelectorAll('.rs-ui-el')].some((e) => e.textContent.includes('ROBOT COIN RUN'))));
  core.SceneManager.unloadAdditive('Assets/Scenes/Title.scn.json');
  check('unloadAdditive removes it', await until(() => !E.scene.root.findFolder('Title') && ![...document.querySelectorAll('.rs-ui-el')].some((e) => e.textContent.includes('ROBOT COIN RUN'))));
  E.stop();
  return out.join('\n');
})();
