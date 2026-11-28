// RE-style editor chrome (read-only on examples/Demo, nothing is saved): Macro Shelf two-row tabs + one-click component
// buttons, Group, Hierarchies tools (collapse / expand / lock / interval), lock = not pickable, undo history labels,
// Rendering modes, perf overlay, Asset Browser history / type filter / status badges. Returns a list of checks.
(async () => {
  const E = window.__rsEditor;
  const V = window.__rsView;
  const out = [];
  const check = (name, ok, extra) => out.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ` (${JSON.stringify(extra)})` : ''}`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
  const byText = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === text);

  // ---- chrome
  const menus = [...document.querySelectorAll('.rs-menubar-item')].map((m) => m.textContent);
  check('menubar', menus.join(',') === 'File,Edit,View,GameObject,Component,Project,Windows,Develop,Help', menus);
  check('toolbar target + boxed play', !!document.querySelector('.rs-toolbar-target') && !!document.querySelector('.rs-tool.play.boxed'));
  check('panel title buttons (? / pin / close)', document.querySelectorAll('.rs-frame-btns').length >= 4, document.querySelectorAll('.rs-frame-btns').length);
  const tabs = [...document.querySelectorAll('.rs-shelf-tab')];
  const tops = new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top)));
  check('macro shelf: two rows of tabs', tabs.length >= 16 && tops.size === 2, { n: tabs.length, rows: tops.size });

  // ---- Collision shelf adds a box Collider to the selection
  const crate = E.scene.find('Spinner_A');
  E.select([crate.id]);
  await wait(50);
  const before = crate.components.length;
  click(byText('.rs-shelf-tab', 'Collision'));
  await wait(80);
  click(byText('.rs-shelf-btn', 'Trigger'));
  await wait(80);
  const added = E.scene.find('Spinner_A').components.at(-1);
  check('shelf: Trigger adds a trigger Collider', E.scene.find('Spinner_A').components.length === before + 1 && added.constructor.name === 'Collider' && added.isTrigger === true);
  check('undo history label', E.undoLabels[0] === 'Add Collider', E.undoLabels[0]);
  E.undo();
  check('undo shelf add', E.scene.find('Spinner_A').components.length === before);

  // ---- Group (Ctrl+G)
  const a = E.scene.find('Crate_00');
  const b = E.scene.find('Crate_01');
  const pa = a.transform.position.clone();
  E.select([a.id, b.id]);
  const g = E.groupSelection();
  const a2 = E.scene.find('Crate_00');
  check('group: parent + world pose kept', a2.parent && a2.parent.name.startsWith('Group') && a2.transform.position.subtract(pa).length() < 1e-4, a2.parent?.name);
  E.undo();
  check('undo group', !E.scene.find('Crate_00').parent);

  // ---- collapse / expand all
  click(document.querySelector('.rs-hier-tools .rs-tool[title="Collapse all"]'));
  await wait(80);
  const collapsedRows = document.querySelectorAll('.rs-hierarchies .rs-row').length;
  click(document.querySelector('.rs-hier-tools .rs-tool[title="Expand all"]'));
  await wait(80);
  const expandedRows = document.querySelectorAll('.rs-hierarchies .rs-row').length;
  check('collapse / expand all', collapsedRows === E.scene.root.folders.length + E.scene.root.gameObjects.length && expandedRows > collapsedRows, { collapsedRows, expandedRows });

  // ---- lock: the lock box of a row, then picking goes through the locked object
  const ball = E.scene.find('Ball');
  const box = document.querySelector(`.rs-row[data-key="g:${ball.id}"] .rs-row-box`);
  box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await wait(80);
  check('lock box', E.isLockedSelf(ball) && !!document.querySelector(`.rs-row[data-key="g:${ball.id}"] .rs-row-box.on`));
  // project the ball centre to the view and pick there with / without the lock filter
  const bs = V.backend.scene;
  const node = V.backend.nodeOf(ball);
  const { Vector3, Matrix } = { Vector3: node.position.constructor, Matrix: node.getWorldMatrix().constructor };
  const eng = V.backend.engine;
  const vp = bs.activeCamera.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight());
  const p = Vector3.Project(node.getAbsolutePosition(), Matrix.Identity(), bs.getTransformMatrix(), vp);
  const sx = eng.getRenderingCanvas().clientWidth / eng.getRenderWidth();
  const hitFree = V.backend.pick(p.x * sx, p.y * sx);
  const hitLocked = V.backend.pick(p.x * sx, p.y * sx, (o) => !E.isLocked(o));
  check('locked object not pickable', hitFree === ball && hitLocked !== ball, { free: hitFree?.name, locked: hitLocked?.name ?? null });
  E.setLocked(ball, false);

  // ---- hierarchy refresh interval
  const sel = document.querySelector('.rs-hier-interval');
  check('interval drop-down', sel && sel.value === String(E.view.hierarchyInterval), sel?.value);

  // ---- rendering modes + overlay
  const until = async (f) => {
    for (let i = 0; i < 40 && !f(); i++) await wait(50);
    return f();
  };
  E.setView({ render: 'wireframe' });
  const wire = await until(() => bs.forceWireframe);
  E.setView({ render: 'bounds' });
  const bounds = await until(() => bs.forceShowBoundingBoxes && !bs.forceWireframe);
  E.setView({ render: 'default' });
  await until(() => !bs.forceShowBoundingBoxes);
  check('rendering modes', wire && bounds && !bs.forceWireframe && !bs.forceShowBoundingBoxes);
  E.setView({ stats: true });
  await wait(900);
  const stats = document.querySelector('.rs-view-stats')?.textContent ?? '';
  check('perf overlay', /FPS/.test(stats) && /Tris/.test(stats) && /Render/.test(stats), stats.slice(0, 60));

  // ---- Asset Browser: navigation history, type filter, badges
  E.setAssetFolder('Assets');
  await wait(50);
  const tile = document.querySelector('.rs-tile[data-path="Assets/Scripts"]');
  tile.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await wait(80);
  const inScripts = E.assetFolder === 'Assets/Scripts';
  click(document.querySelector('.rs-assets-bar .rs-tool[title="Back"]'));
  await wait(80);
  check('asset history back', inScripts && E.assetFolder === 'Assets', E.assetFolder);
  click(document.querySelector('.rs-assets-bar .rs-tool[title="Forward"]'));
  await wait(80);
  check('asset history forward', E.assetFolder === 'Assets/Scripts', E.assetFolder);
  const badges = document.querySelectorAll('.rs-tiles .rs-tile-badge').length;
  check('status badges', badges === document.querySelectorAll('.rs-tiles .rs-tile:not(.dir)').length && badges > 0, badges);
  E.setAssetFolder('Assets');
  await wait(50);
  const filter = document.querySelector('.rs-type-filter');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  check('type filter lists kinds', [...filter.options].some((o) => o.value === 'Script'));
  check('total footer', /Total: \d+ Assets/.test(document.querySelector('.rs-assets-status').textContent));
  void setter;
  return out;
})();
