// State of a running game (window.__rs.player) for the e2e driver.
(() => {
  const p = window.__rs?.player;
  const s = p?.scene;
  if (!s) return { ready: false, loading: document.getElementById('rs-loading')?.textContent ?? null };
  const r = (v) => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
  const player = s.find('Player');
  return {
    ready: true,
    scene: s.name,
    objects: s.allGameObjects().length,
    coins: s.findWithTag('Coin').length,
    player: player ? r(player.transform.position) : null,
    behaviors: s.behaviors.map((b) => b.constructor.name),
    meshes: p.backend.scene.meshes.length,
    camera: p.backend.scene.activeCamera?.name ?? null,
    pending: p.backend.pendingLoads,
  };
})();
