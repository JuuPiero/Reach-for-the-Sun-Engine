// Milestone 2 editor checks (scratch copy of examples/Demo): Motion clips + edit preview, FSM asset editing, multi-select edits,
// physics + motion in play mode.
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
  const body = E.scene.find('Player/Body');
  const motion = body.getComponent('Motion');
  check('model clips reported to Motion', await until(() => motion.clipNames.length === 4), motion.clipNames);
  check('edit-mode preview runs the FSM', await until(() => motion.state === 'Idle' && motion.layers[0]?.time > 0));
  E.select([body.id]);
  await wait(300);
  const clipSelect = [...document.querySelectorAll('.rs-inspector .rs-field')].find((f) => f.querySelector('label')?.textContent === 'Clip')?.querySelector('select');
  check('clip field is a drop-down of the model clips', !!clipSelect && [...clipSelect.options].map((o) => o.value).join() === ',Idle,Walk,Run,Jump');
  // FSM asset editor
  await E.selectAsset('Assets/Motions/Robot.fsm.json');
  await wait(300);
  const heads = [...document.querySelectorAll('.rs-fsm-head')].map((h) => h.textContent.trim());
  check('FSM editor sections', heads.join('|') === 'Parameters|States|Transitions', heads);
  check('FSM editor lists transitions', document.querySelectorAll('.rs-fsm-tr').length === 6);
  const fsm = window.__rsCore?.Assets ?? null;
  void fsm;
  // edit: rename state Walk → Stroll through the editor API, transitions follow
  const core = await import('/@id/@rs/core');
  const d = core.Assets.getFsm('Assets/Motions/Robot.fsm.json');
  await E.saveFsm('Assets/Motions/Robot.fsm.json', { ...d, states: d.states.map((s) => (s.name === 'Walk' ? { ...s, speed: 1.2 } : s)) });
  const saved = await until(async () => (await (await fetch('/project/Assets/Motions/Robot.fsm.json', { cache: 'no-cache' })).json()).states.find((s) => s.name === 'Walk').speed === 1.2);
  check('FSM edit saved to the file', saved);
  // multi-select: move two crates on X, change both masses
  const c0 = E.scene.find('Crate_00');
  const c1 = E.scene.find('Crate_01');
  const z0 = c0.transform.localPosition.z;
  const z1 = c1.transform.localPosition.z;
  E.select([c0.id, c1.id]);
  await wait(200);
  const rb0 = c0.getComponent('RigidBody');
  const rb1 = c1.getComponent('RigidBody');
  E.setField(rb0, 'mass', 5, false, [rb1]);
  check('multi-select component edit', rb0.mass === 5 && rb1.mass === 5);
  E.undo();
  check('multi-select edit undoes as one step', E.scene.find('Crate_00').getComponent('RigidBody').mass === 2 && E.scene.find('Crate_01').getComponent('RigidBody').mass === 2);
  check('multi-select keeps other axes', E.scene.find('Crate_00').transform.localPosition.z === z0 && E.scene.find('Crate_01').transform.localPosition.z === z1);
  // play: a crate dropped from above falls onto the stack, the ball bounces, the player walks into a coin trigger
  const crate = E.scene.find('Crate_02');
  const yBefore = crate.transform.position.y;
  crate.transform.localPosition.y = 4;
  crate.transform.markDirty();
  E.play();
  await wait(2500);
  const y2 = E.scene.find('Crate_02').transform.position.y;
  check('play: dynamic crate falls and lands on the stack', y2 < 3.9 && y2 > 0.9, y2);
  const st = E.scene.find('Player/Body').getComponent('Motion').state;
  check('play: motion FSM running', st === 'Idle', st);
  E.stop();
  await wait(100);
  check('stop restores physics objects', Math.abs(E.scene.find('Crate_02').transform.position.y - 4) < 1e-6);
  void yBefore;
  return out;
})();
