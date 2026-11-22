// State of a running game (window.__rs.player) for the e2e driver.
(() => {
  const p = window.__rs?.player;
  const s = p?.scene;
  if (!s) return { ready: false, loading: document.getElementById('rs-loading')?.textContent ?? null };
  const r = (v) => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
  const player = s.find('Player');
  const body = s.find('Player/Body');
  const motion = body?.components.find((c) => c.constructor.name === 'Motion' || 'layers' in c);
  const cc = player?.components.find((c) => 'isGrounded' in c);
  const crates = s.allGameObjects().filter((g) => g.name.startsWith('Crate_')).map((g) => r(g.transform.position));
  return {
    ready: true,
    scene: s.name,
    objects: s.allGameObjects().length,
    coins: s.findWithTag('Coin').length,
    collected: player?.components.find((c) => 'coins' in c)?.coins ?? null,
    player: player ? r(player.transform.position) : null,
    grounded: cc?.isGrounded ?? null,
    state: motion?.state ?? null,
    clips: motion?.clipNames ?? null,
    layers: motion?.layers.map((l) => `${l.clip}:${Math.round(l.weight * 100) / 100}`) ?? null,
    crates,
    ball: s.find('Ball') ? r(s.find('Ball').transform.position) : null,
    meshes: p.backend.scene.meshes.length,
    pending: p.backend.pendingLoads,
  };
})();
