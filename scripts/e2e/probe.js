// Editor state for the mouse tests.
(() => {
  const E = window.__rsEditor;
  const r = (v) => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
  const g = (id) => E.scene.findById(id);
  return {
    mode: E.mode,
    selection: E.selection,
    a: g(30) ? r(g(30).transform.localPosition) : null,
    bFolder: g(31) ? (g(31).folder?.name ?? null) : null,
    bParent: g(31)?.parent?.name ?? null,
    player: E.scene.find('Player') ? r(E.scene.find('Player').transform.position) : null,
    comps: g(30) ? g(30).components.map((c) => c.constructor.name) : null,
    objects: E.scene.allGameObjects().length,
    dirty: E.dirty,
  };
})();
