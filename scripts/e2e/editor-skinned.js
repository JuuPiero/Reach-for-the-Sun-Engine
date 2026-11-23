// Skinned meshes (read-only on examples/Demo): a glTF with a skin loads with its skeleton, Motion drives its clips in edit
// preview and in play, the deformation is visible (bone matrices / bounding box change), clip switch via the FSM-less Motion.
(async () => {
  const E = window.__rsEditor;
  const V = window.__rsView;
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
  const go = E.scene.find('Tentacle') ?? E.create('Model');
  go.name = 'Tentacle';
  go.transform.localPosition.set(1.5, 0, -1);
  go.transform.markDirty();
  const mesh = go.getComponent('Mesh');
  mesh.model = 'Assets/Models/Tentacle.glb';
  const motion = go.getComponent('Motion') ?? go.addComponent('Motion');
  motion.clip = 'Wiggle';
  motion.updateInEdit = true;
  const skinned = () => V.backend.meshesOf(go).find((m) => m.skeleton);
  check('model loads with a skeleton', await until(() => !!skinned()));
  const sk = skinned().skeleton;
  check('4 bones', sk.bones.length === 4, sk.bones.map((b) => b.name));
  check('Motion knows the clips', await until(() => motion.clipNames.join() === 'Idle,Wiggle'), motion.clipNames);
  const tip = () => {
    const b = sk.bones[3];
    b.computeAbsoluteMatrices?.();
    const m = b.getAbsoluteMatrix ? b.getAbsoluteMatrix() : b.getWorldMatrix();
    return [m.m[12], m.m[13], m.m[14]].map((v) => +v.toFixed(3));
  };
  const a = tip();
  await wait(400);
  const b = tip();
  check('edit preview animates the bones', a.some((v, i) => Math.abs(v - b[i]) > 0.01), [a, b]);
  // play: Motion keeps animating, clip switch
  E.play();
  await wait(300);
  const p1 = tip();
  await wait(350);
  check('bones animate in play', p1.some((v, i) => Math.abs(v - tip()[i]) > 0.01));
  const live = E.scene.find('Tentacle').getComponent('Motion');
  live.play('Idle', 0.2);
  check('cross-fade to Idle', await until(() => live.state === 'Idle' || live.layers.some((l) => l.clip === 'Idle' && l.weight > 0.9)), live.layers.map((l) => `${l.clip}:${l.weight.toFixed(2)}`));
  E.stop();
  await wait(300);
  E.undo(); // created / edited without saving
  return out.join('\n');
})();
