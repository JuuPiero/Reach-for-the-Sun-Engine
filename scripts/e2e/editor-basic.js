// Editor smoke test (run with driver.mjs evalfile on a scratch copy of examples/Demo): selection, Inspector edit, create,
// add component, undo / redo, duplicate, play / stop restores the scene. Returns a list of checks.
(async () => {
  const E = window.__rsEditor;
  const out = [];
  const check = (name, ok, extra) => out.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ` (${JSON.stringify(extra)})` : ''}`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const s0 = E.scene;
  const N0 = s0.allGameObjects().length;
  check('scene loaded', s0.name === 'Main' && N0 >= 19, N0);
  check('folders', s0.root.folders.map((f) => f.name).join(',') === 'Environment,Player,Props,Gimmick,UI');
  const player = s0.find('Player');
  check('script component deserialized', player.components.map((c) => c.constructor.name).length === 3 && !!player.getComponent('PlayerController'));
  const pc = player.getComponent('PlayerController');
  check('userdata reference resolved', pc.param && pc.param.moveSpeed === 3.5, pc.param && pc.param.moveSpeed);
  check('gameobject reference resolved', pc.followCamera && pc.followCamera.name === 'MainCamera');
  // select via the Hierarchies row
  const row = document.querySelector('.rs-row[data-key="g:30"]');
  row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await wait(100);
  check('select from Hierarchies', E.selection.join() === '30');
  check('Inspector shows it', document.querySelector('.rs-inspector-title').textContent.startsWith('Spinner_A'));
  // edit a field through the editor API and undo it
  const mesh = E.scene.findById(30).getComponent('Mesh');
  E.setField(mesh, 'shape', 'Sphere', false);
  check('field edit', E.scene.findById(30).getComponent('Mesh').shape === 'Sphere');
  E.undo();
  check('undo field', E.scene.findById(30).getComponent('Mesh').shape === 'Box');
  E.redo();
  check('redo field', E.scene.findById(30).getComponent('Mesh').shape === 'Sphere');
  // create + add component + duplicate
  const box = E.create('Box');
  E.addComponent(box, 'Rotator');
  check('create + add script component', !!box.getComponent('Rotator') && box.folder === E.scene.findById(30).folder);
  E.duplicateSelection();
  const dup = E.selectedObjects[0];
  check('duplicate', dup && dup !== box && dup.name !== box.name && !!dup.getComponent('Rotator'), dup && dup.name);
  const count = E.scene.allGameObjects().length;
  // play mode: lifecycle runs, Stop restores the edit scene
  const rotBefore = E.scene.findById(30).transform.localRotation.clone();
  E.play();
  await wait(3500);
  const spun = !E.scene.findById(30).transform.localRotation.equalsWithEpsilon(rotBefore, 1e-4);
  const coins = E.scene.findWithTag('Coin').length;
  check('play runs behaviors', spun);
  check('spawner instantiates the prefab in play', coins > 0, coins);
  E.stop();
  await wait(100);
  check('stop restores the scene', E.scene.allGameObjects().length === count && E.scene.findWithTag('Coin').length === 0 && E.scene.findById(30).transform.localRotation.equalsWithEpsilon(rotBefore, 1e-6));
  check('selection survives play', E.selection.length === 1);
  // undo everything back to the file
  while (E.canUndo) E.undo();
  check('undo to the start', E.scene.allGameObjects().length === N0 && E.scene.findById(30).getComponent('Mesh').shape === 'Box');
  // folder ops
  const f = E.createFolder('');
  E.rename(f, 'Enemies');
  check('folder create + rename', E.scene.root.findFolder('Enemies') === f && E.selectedFolder === 'Enemies');
  E.moveObjects([31], { folder: f });
  check('move object into folder', E.scene.findById(31).folder === f);
  f.active = false;
  check('inactive folder hides objects', !E.scene.findById(31).activeInHierarchy);
  E.undo();
  E.undo();
  E.undo();
  check('undo folder ops', !E.scene.root.findFolder('Enemies'));
  return out;
})();
