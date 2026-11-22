// Milestone 4 editor checks (read-only on examples/Demo): materials, Environment (sky / fog / post), particles in edit + play,
// Debug lines, Material asset inspector, material drop. Nothing is saved.
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
  const core = await import('/@id/@rs/core');
  const bs = V.backend.scene;
  // materials
  const ground = E.scene.find('Ground');
  const gm = ground.getComponent('Mesh');
  check('Ground references the Floor material', gm.material instanceof core.Material && gm.material.path === 'Assets/Materials/Floor.mat.json');
  const groundMesh = () => V.backend.meshesOf(ground)[0];
  check('Ground mesh drawn with the shared material', await until(() => groundMesh()?.material?.name === 'mat:Assets/Materials/Floor.mat.json'));
  check('material texture tiled', groundMesh().material.diffuseTexture?.uScale === 15);
  const crates = ['Crate_00', 'Crate_01'].map((n) => V.backend.meshesOf(E.scene.find(n))[0].material);
  check('crates share one material', crates[0] === crates[1] && crates[0].name.includes('Crate.mat.json'));
  // inspector hides inline surface fields when a material is set
  E.select([ground.id]);
  await wait(300);
  const labels = [...document.querySelectorAll('.rs-inspector .rs-field label')].map((l) => l.textContent);
  check('inline colour hidden when a Material is set', labels.includes('Material') && !labels.includes('Color'), labels.slice(0, 12));
  // material asset edit → live
  await E.selectAsset('Assets/Materials/Metal.mat.json');
  await wait(300);
  const heads = [...document.querySelectorAll('.rs-inspector .rs-field-header')].map((h) => h.textContent);
  check('Material asset inspector', heads.includes('Surface') && heads.includes('Rendering'), heads);
  const metal = E.editedUserData;
  const spinner = V.backend.meshesOf(E.scene.find('Spinner_A'))[0];
  const before = spinner.material.diffuseColor.g;
  const old = metal.color.clone();
  metal.color = new core.Color3(0.2, 0.9, 0.2); // not saved through setField: in-memory only
  check('material edit shows live', await until(() => spinner.material.diffuseColor.g > before + 0.1));
  metal.color = old;
  // environment
  check('sky dome on', await until(() => bs.getMeshByName('__sky')?.isEnabled()));
  check('fog linear from the Environment', bs.fogMode === 3 && bs.fogStart === 25 && bs.fogEnd === 70, { mode: bs.fogMode, s: bs.fogStart, e: bs.fogEnd });
  check('ACES tone mapping', bs.imageProcessingConfiguration.toneMappingEnabled && bs.imageProcessingConfiguration.toneMappingType === 1);
  check('FXAA pipeline', !!bs.postProcessRenderPipelineManager.supportedPipelines.find((p) => p._name === '__rsPipeline'));
  const envGo = E.scene.find('Environment');
  envGo.getComponent('Environment').enabled = false;
  check('disabled Environment = camera colour, no fog', await until(() => bs.fogMode === 0 && !bs.getMeshByName('__sky').isEnabled()));
  envGo.getComponent('Environment').enabled = true;
  // particles: coin prefab sparkles in edit? (coins spawn in play) — CoinBurst has simulateInEdit off
  // create a particle system from the shelf kind: previews in edit mode
  const fx = E.create('ParticleSystem');
  const fxc = fx.getComponent('ParticleSystem');
  check('new particle system previews in edit mode', await until(() => fxc.particleCount > 5), fxc.particleCount);
  E.undo();
  check('undo removes it (particles disposed)', await until(() => !bs.particleSystems.some((p) => p.name === `ps:go:${fx.id}`)));
  // play: coins sparkle, pickup burst
  E.play();
  check('spawned coins sparkle', await until(() => E.scene.allGameObjects().some((g) => g.name.startsWith('Coin') && g.getComponent('ParticleSystem')?.particleCount > 0), 10000), E.scene.allGameObjects().filter((g) => g.name.startsWith('Coin')).map((g) => { const p = g.getComponent('ParticleSystem'); return p ? [p._emitting, p.particleCount, p.enabled] : 'none'; }));
  const burst = E.scene.find('Player/CoinBurst').getComponent('ParticleSystem');
  burst.emit(30);
  check('burst emits on demand', await until(() => burst.particleCount >= 20), burst.particleCount);
  check('burst particles die out', await until(() => burst.particleCount === 0, 4000), burst.particleCount);
  // Debug lines from a script
  const pc = E.scene.find('Player').getComponent('PlayerController');
  core.Debug.drawLine(new core.Vector3(0, 1, 0), new core.Vector3(3, 1, 0), new core.Color3(1, 0, 0), 2);
  check('debug lines drawn', await until(() => bs.getMeshByName('__debugLines')?.isEnabled()));
  void pc;
  // pause freezes particles
  E.pause?.();
  E.stop();
  await wait(300);
  check('stop: back to edit, debug lines cleared', E.mode === 'edit' && core.Debug._lines.length === 0);
  return out.join('\n');
})();
