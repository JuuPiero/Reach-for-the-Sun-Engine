// Milestone 5 Project Settings + layers (scratch project — writes rs.project.json): window from Edit menu, layer names, collision
// matrix, input action edit, save → file, layer dropdown in the Inspector, physics respects the matrix in play.
(async () => { const __out = []; try { return await (async () => {
  const E = window.__rsEditor;
  const out = (window.__m5out = []);
  const check = (name, ok, extra) => out.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ` (${JSON.stringify(extra)})` : ''}`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms = 6000) => {
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
  const mouse = (el, type) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }));
  const setInput = async (el, v) => {
    el.focus();
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(60); // React re-renders with the typed text before the blur commits it
    el.blur();
    await wait(30);
  };

  // open from the Edit menu
  const editMenu = [...document.querySelectorAll('.rs-menubar-item')].find((m) => m.textContent.trim() === 'Edit');
  mouse(editMenu, 'mousedown');
  await wait(150);
  const item = [...document.querySelectorAll('.rs-menu-item')].find((i) => i.textContent.includes('Project Settings'));
  check('Edit ▸ Project Settings… exists', !!item);
  item.click();
  check('window opens', await until(() => !!document.querySelector('.rs-settings')));
  const tab = (name) => [...document.querySelectorAll('.rs-settings-tab')].find((t) => t.textContent === name).click();
  tab('Physics');
  await wait(200);
  // name layers 2 and 3
  const layerInput = (i) => [...document.querySelectorAll('.rs-settings-page .rs-field')].find((f) => f.querySelector('label')?.textContent === `Layer ${i}`)?.querySelector('input');
  await setInput(layerInput(2), 'Player');
  await wait(100);
  await setInput(layerInput(3), 'Ghost');
  check('layer names applied', await until(() => core.Physics.layers[2] === 'Player' && core.Physics.layers[3] === 'Ghost'), core.Physics.layers.slice(0, 4));
  check('matrix shows named layers', await until(() => document.querySelectorAll('.rs-matrix tbody tr').length === 4));
  // uncheck Default ↔ Ghost
  const box = [...document.querySelectorAll('.rs-matrix input')].find((i) => i.title === 'Default ↔ Ghost');
  box.click();
  check('matrix edit applied', core.Physics.getLayerCollision(0, 3) === false);
  // input: add an action
  tab('Input');
  await wait(200);
  const before = core.Input.actions.length;
  [...document.querySelectorAll('.rs-settings-page .rs-btn')].find((b) => b.textContent.includes('Add Action')).click();
  check('action added', await until(() => core.Input.actions.length === before + 1));
  // save
  [...document.querySelectorAll('.rs-modal-foot .rs-btn')].find((b) => b.textContent === 'Save').click();
  const saved = await until(async () => {
    const j = await (await fetch('/project/rs.project.json', { cache: 'no-cache' })).json();
    return j.physics?.layers?.[3] === 'Ghost' && j.physics.collisions?.[0] === (0xffff & ~(1 << 3)) && j.input?.actions?.length === before + 1 && j.startScene && j.name;
  });
  check('saved to rs.project.json (name / start scene kept)', saved);
  document.querySelector('.rs-modal-head .rs-btn').click();
  await wait(200);
  check('window closes', !document.querySelector('.rs-settings'));

  // layer dropdown: put Crate_00 on Ghost, it falls through the ground in play
  const crate = E.scene.find('Crate_00');
  E.select([crate.id]);
  await wait(300);
  const sel = document.querySelector('.rs-layer-select');
  check('layer dropdown lists named layers', !!sel && [...sel.options].map((o) => o.textContent).join() === 'Default,Ignore Raycast,Player,Ghost', sel && [...sel.options].map((o) => o.textContent));
  await setInput(sel, '3');
  check('layer set from the Inspector', crate.layer === 3);
  E.play();
  check('Ghost crate falls through the ground (matrix)', await until(() => E.scene.find('Crate_00').transform.position.y < -3, 6000), E.scene.find('Crate_00')?.transform.position.y);
  check('Default crates still rest', E.scene.find('Crate_03').transform.position.y > 0.2);
  const hit = core.Physics.raycast(new core.Vector3(-4, 5, -2.1), new core.Vector3(0, -1, 0), 20, { layerMask: core.Physics.layerMask('Ghost') });
  check('raycast with a Ghost-only mask misses default objects', !hit || hit.gameObject.layer === 3);
  E.stop();
  return out.join('\n');
})(); } catch (e) { return `ERROR ${e.stack}\n` + (window.__m5out ?? []).join('\n'); } })();
