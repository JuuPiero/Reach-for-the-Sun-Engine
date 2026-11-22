// Editor file operations on a SCRATCH project (writes files): save scene, new script → live reload, UserData edit,
// prefab create / instantiate, asset rename / delete, Inspector widgets. Returns checks.
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
  const read = async (p) => (await fetch('/project/' + p, { cache: 'no-cache' })).text();
  const core = await import('/@id/@rs/core').catch(() => null);
  // save
  const sp = E.scene.findById(31);
  E.select([31]);
  E.rename(sp, 'Renamed_B');
  await E.saveScene();
  const saved = JSON.parse(await read('Assets/Scenes/Main.scn.json'));
  check('save scene', JSON.stringify(saved).includes('Renamed_B') && !E.dirty);
  // inspector widgets
  E.select([30]);
  await wait(200);
  const labels = [...document.querySelectorAll('.rs-inspector .rs-field > label')].map((l) => l.textContent);
  check('inspector shows transform + Mesh + Rotator fields', ['Position', 'LocalScale', 'Shape', 'Color', 'Speed', 'Bob Height'].every((x) => labels.includes(x)), labels.slice(0, 12));
  // new script → registered after the live reload
  const before = E.logs.length;
  const sp2 = await E.createScript('Assets/Scripts', 'Mover');
  check('script file created', sp2 === 'Assets/Scripts/Mover.ts' && (await read(sp2)).includes('class Mover extends Behavior'));
  const reg = await until(() => E.componentTypes().some((t) => t.name === 'Mover'));
  check('new script registers (live reload)', reg);
  // edit a script: new field appears on existing components
  await fetch('/__rs/api/file?path=Assets/Scripts/Mover.ts', {
    method: 'PUT',
    body: "import { Behavior, field } from '@rs/core';\nexport class Mover extends Behavior {\n  @field({ min: 0 }) speed = 1;\n  extra = 42;\n}\n",
  });
  const box = E.scene.findById(30);
  E.addComponent(box, 'Mover');
  const reloaded = await until(() => {
    const m = E.scene.findById(30).getComponent('Mover');
    return m && m.extra === 42;
  });
  check('edited script: scene rebuilt with the new class', reloaded);
  check('scripts reloaded logged', E.logs.slice(before).some((l) => l.message === 'Scripts reloaded'));
  // UserData create + edit → file
  const ud = await E.createUserData('PlayerParam', 'Assets/UserData');
  check('userdata created', !!ud && JSON.parse(await read(ud)).type === 'PlayerParam');
  E.setField(E.editedUserData, 'moveSpeed', 12);
  const udSaved = await until(async () => JSON.parse(await read(ud)).fields.moveSpeed === 12);
  check('userdata edit saved', udSaved);
  // prefab from an object, then instantiate it
  const pfb = await E.createPrefab(E.scene.findById(30), 'Assets/Prefabs');
  check('prefab created', JSON.parse(await read(pfb)).gameObject.name === 'Spinner_A' && E.scene.findById(30).prefab === pfb);
  const inst = await E.instantiatePrefab(pfb);
  check('prefab instantiated', inst && inst.prefab === pfb && inst.id !== 30 && !!inst.getComponent('Mesh'));
  // rename + delete an asset
  await E.renameAsset(ud, 'Tuned.user.json');
  check('rename asset', E.files.some((f) => f.path === 'Assets/UserData/Tuned.user.json') && !E.files.some((f) => f.path === ud));
  window.confirm = () => true;
  await E.deleteAsset('Assets/UserData/Tuned.user.json');
  check('delete asset', !E.files.some((f) => f.path === 'Assets/UserData/Tuned.user.json'));
  void core;
  return out;
})();
