// Milestone 5 prefab workflow (scratch copy of examples/Demo — writes files): instance overrides, Apply / Revert / Unpack,
// prefab mode edit + save → instances update with overrides kept, external prefab change, compact scene save.
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
  const PF = 'Assets/Prefabs/Coin.pfb.json';

  // two instances of the coin
  const a = await E.instantiatePrefab(PF);
  const b = await E.instantiatePrefab(PF);
  check('instances linked', a.prefab === PF && a._prefabId !== null && b.prefab === PF);
  E.select([a.id]);
  await wait(300);
  check('Inspector prefab bar', !!document.querySelector('.rs-prefab-bar') && document.querySelector('.rs-prefab-name').textContent === 'Coin');
  check('no overrides yet', !E.hasOverrides(a));
  // override a field on instance a
  const rot = a.getComponent('Rotator');
  E.setField(rot, 'bobHeight', 0.6, false);
  check('override detected', E.hasOverrides(a));
  check('Hierarchy shows instances in blue', !!document.querySelector(`.rs-row.prefab-root[data-key="g:${a.id}"]`));
  // saved compactly
  await E.saveScene();
  const sj = await readFile(E.scene.path);
  const findJ = (list) => list.flatMap((f) => [...f.gameObjects, ...findJ(f.folders)]);
  const all = findJ([sj.root]);
  const aj = all.find((g) => g.id === a.id);
  check('scene stores the instance compactly', aj && aj.prefab === PF && aj.components.length === 0 && !!aj.overrides?.ids, aj && Object.keys(aj));
  check('only the changed field is stored', JSON.stringify(aj.overrides.objects?.['1']?.comps?.['Rotator#0']?.fields) === '{"bobHeight":0.6}', aj.overrides.objects);

  // prefab mode: change the rotator speed + mesh in the prefab
  await E.openPrefab(PF);
  check('prefab mode opened', !!E.prefabMode && E.scene.allGameObjects().length === 1, E.scene.allGameObjects().map((g) => g.name));
  check('prefab mode bar shown', await until(() => !!document.querySelector('.rs-prefab-mode')));
  const root = E.scene.allGameObjects()[0];
  E.setField(root.getComponent('Rotator'), 'speed', new core.Vector3(0, 360, 0), false);
  E.setField(root.getComponent('Rotator'), 'bobHeight', 0.3, false);
  E.create('Sphere', root); // new child in the prefab
  await E.savePrefab();
  const pj = await readFile(PF);
  check('prefab saved (flat, new child)', pj.gameObject.children.length === 1 && pj.gameObject.components.find((c) => c.type === 'Rotator').fields.speed[1] === 360);
  await E.closePrefab();
  check('back to the scene', !E.prefabMode && E.scene.path?.endsWith('.scn.json'));
  const a2 = E.scene.findById(a.id);
  const b2 = E.scene.findById(b.id);
  check('instances got the prefab change', a2.getComponent('Rotator').speed.y === 360 && b2.getComponent('Rotator').speed.y === 360);
  check('override kept on a, b follows the prefab', a2.getComponent('Rotator').bobHeight === 0.6 && b2.getComponent('Rotator').bobHeight === 0.3, [a2.getComponent('Rotator').bobHeight, b2.getComponent('Rotator').bobHeight]);
  check('new prefab child appears in instances', a2.children.length === 1 && b2.children.length === 1 && a2.children[0]._prefabId !== null);

  // revert a
  E.revertPrefab(a2);
  const a3 = E.scene.findById(a.id);
  check('revert drops the override', a3.getComponent('Rotator').bobHeight === 0.3 && !E.hasOverrides(a3));
  E.undo();
  check('undo restores the override', E.scene.findById(a.id).getComponent('Rotator').bobHeight === 0.6);

  // apply b: change its name of child + colour, apply → a gets it too (a keeps its own override)
  const bb = E.scene.findById(b.id);
  const mesh = bb.getComponent('Mesh');
  E.setField(mesh, 'castShadows', false, false);
  await E.applyPrefab(bb);
  const pj2 = await readFile(PF);
  check('apply writes the prefab', pj2.gameObject.components.find((c) => c.type === 'Mesh').fields.castShadows === false);
  const a4 = E.scene.findById(a.id);
  check('apply reaches other instances', a4.getComponent('Mesh').castShadows === false && a4.getComponent('Rotator').bobHeight === 0.6);
  check('applied instance has no overrides left', !E.hasOverrides(E.scene.findById(b.id)));

  // external prefab change (another tool writes the file)
  const ext = await readFile(PF);
  ext.gameObject.components.find((c) => c.type === 'Rotator').fields.bobSpeed = 7;
  await fetch(`/__rs/api/file?path=${encodeURIComponent(PF)}`, { method: 'PUT', body: JSON.stringify(ext, null, 2) }); // not through the editor: a file watcher event
  check('external prefab edit updates instances', await until(() => E.scene.findById(b.id)?.getComponent('Rotator').bobSpeed === 7, 6000), E.scene.findById(b.id)?.getComponent('Rotator').bobSpeed);
  check('override still kept after external edit', E.scene.findById(a.id).getComponent('Rotator').bobHeight === 0.6);

  // unpack
  const ua = E.scene.findById(a.id);
  E.unpackPrefab(ua);
  check('unpack makes a plain object', !ua.prefab && ua.children.every((c) => c._prefabId === null));
  // play: spawned coins (Spawner) are instances with the new data
  E.play();
  check('spawned instances use the new prefab data', await until(() => E.scene.allGameObjects().some((g) => g.prefab === PF && g.id !== b.id && g.getComponent('Rotator')?.bobSpeed === 7), 8000));
  E.stop();
  return out.join('\n');
})();
