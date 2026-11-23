// Nested prefabs in the editor (scratch copy of examples/Demo — writes files): a prefab made from an object holding a Coin
// instance keeps the Coin nested; editing Coin.pfb reaches the outer instances; Apply keeps the nesting.
(async () => {
  const E = window.__rsEditor;
  const out = [];
  const check = (name, ok, extra) => out.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ` (${JSON.stringify(extra)})` : ''}`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const core = await import('/@id/@rs/core');
  const readFile = async (p) => (await fetch(`/project/${p}`, { cache: 'no-cache' })).json();
  const COIN = 'Assets/Prefabs/Coin.pfb.json';

  // a pedestal holding a coin instance → prefab "Pedestal"
  const ped = E.create('Cylinder');
  ped.name = 'Pedestal';
  const coin = await E.instantiatePrefab(COIN, ped);
  check('coin instance under the pedestal', coin.parent === ped && coin.prefab === COIN);
  const PED = await E.createPrefab(E.scene.findById(ped.id));
  const pj = await readFile(PED);
  const nestedJ = pj.gameObject.children.find((c) => c.prefab === COIN);
  check('prefab file keeps the coin as a compact nested instance', !!nestedJ && !!nestedJ.overrides && nestedJ.components.length === 0);
  const inst = E.scene.findById(ped.id);
  const nested = inst.children[0];
  check('scene object is an instance with the coin nested inside', inst.prefab === PED && nested._nestedPrefab === COIN && nested.prefab === null);
  check('no overrides right after creating', !E.hasOverrides(inst));
  // a second instance
  const inst2 = await E.instantiatePrefab(PED);
  check('second instance has the nested coin', inst2.children[0]._nestedPrefab === COIN && !!inst2.children[0].getComponent('Rotator'));
  // edit Coin.pfb in prefab mode: faster spin
  await E.openPrefab(COIN);
  const root = E.scene.allGameObjects()[0];
  E.setField(root.getComponent('Rotator'), 'speed', new core.Vector3(0, 720, 0), false);
  await E.savePrefab();
  await E.closePrefab();
  const n1 = E.scene.findById(inst.id).children[0];
  const n2 = E.scene.findById(inst2.id).children[0];
  check('Coin change reaches coins nested in Pedestal instances', n1.getComponent('Rotator').speed.y === 720 && n2.getComponent('Rotator').speed.y === 720, [n1.getComponent('Rotator').speed.y, n2.getComponent('Rotator').speed.y]);
  // override the nested coin on instance 2 and Apply it to Pedestal: stays nested, override goes into Pedestal's file
  E.setField(n2.getComponent('Rotator'), 'bobHeight', 0.9, false);
  check('override on a nested object detected', E.hasOverrides(E.scene.findById(inst2.id)));
  await E.applyPrefab(E.scene.findById(inst2.id));
  const pj2 = await readFile(PED);
  const nj2 = pj2.gameObject.children.find((c) => c.prefab === COIN);
  check('Apply keeps the coin nested, with the override in Pedestal', !!nj2 && JSON.stringify(Object.values(nj2.overrides.objects ?? {})).includes('"bobHeight":0.9'), nj2?.overrides);
  check('instance 1 gets it through Pedestal', E.scene.findById(inst.id).children[0].getComponent('Rotator').bobHeight === 0.9);
  check('both coins still follow Coin.pfb', E.scene.findById(inst.id).children[0].getComponent('Rotator').speed.y === 720);
  return out.join('\n');
})();
