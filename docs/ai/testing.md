# Testing RS Engine

## Unit tests
`node scripts/test.mjs [filter]` — bundles `packages/*/tests/*.test.ts` with esbuild (decorators, `@rs/*` → sources, Babylon bundled,
other npm packages external) and runs `node --test`. `packages/physics/tests/physics.test.ts` (Rapier in Node: falling body + collision callback, impulses / gravity off, triggers + raycast + overlap, CharacterController walls / steps / landing); `packages/core/tests/core.test.ts`: Motion FSM, fields, transforms, scene round trip
(folders, flags, references, MissingComponent), clone remapping, play lifecycle, asset preloading + prefab instantiation (fake fetch).

## Headless Chrome driver
Setup once: `cd scripts/e2e; npm install` (puppeteer-core; Chrome via `RS_CHROME` or the usual install paths).
```powershell
node scripts/e2e/driver.mjs http://localhost:5180/ <outPrefix> "wait|1000;evalfile|scripts/e2e/x.js;shot|after"
```
Steps: `wait`, `waitfor|expr`, `shot|name`, `click|css`, `clickxy|x,y`, `rclick`, `dblclick`, `drag|x1,y1,x2,y2` (mouse),
`dragjs|file` (mouse drag between computed points), `dndjs|file` (HTML5 drag & drop), `key`, `hold|Key,ms`,
`holduntil|Key,min,max,expr`, `evalfile|file`. Editor pages: set `RS_E2E_WAITUNTIL=load` (Vite keeps a socket open).
Software WebGL (SwiftShader) runs ~25–40 FPS: wait for states, not fixed times.

## Suites
| What | How |
|---|---|
| Game build | `node scripts/rs.mjs build examples/Demo`, `node scripts/e2e/serve.mjs examples/Demo/Build/Web 5301`, driver on `http://localhost:5301/` with `evalfile|scripts/e2e/game-state.js` (scene, objects, coins, player position; hold `KeyW` to move) |
| Editor (read-only) | `RS_NO_OPEN=1 node scripts/rs.mjs editor examples/Demo --port 5310`, `evalfile|scripts/e2e/editor-basic.js` (selection, field edit + undo / redo, create, add component, duplicate, play runs scripts + spawns prefabs, stop restores, folder ops) — nothing is saved |
| Editor (writes files) | on a scratch copy only: `node scripts/rs.mjs create <scratch>`, editor on it, `evalfile|scripts/e2e/editor-files.js` (save, new script → live registration, edited script → scene rebuilt, UserData create / edit saved, prefab create / instantiate, asset rename / delete) |
| Milestone 2 (scratch copy) | `evalfile|scripts/e2e/editor-m2.js`: clips reported to Motion, edit preview, clip drop-down, FSM editor + save, multi-select edit / undo, crate falls in play, FSM running, stop restores; game: `game-state.js` reports motion state / grounded / crates (hold `KeyW`, `key|Space` to jump) |
| Milestone 3 (read-only) | `evalfile|scripts/e2e/editor-m3.js` on examples/Demo: UI overlay + picking + outline, UI creation nests under the selected UI object, HUD in play, Esc pause (timeScale 0) + Resume / Title Screen buttons, SceneManager.load Title ↔ Main, Stop restores; game build: `evalfile|scripts/e2e/game-m3.js` (HUD, pause, Title, Enter, music). Unit: `packages/core/tests/gameplay.test.ts` (timers, tweens, UI button, SaveData, camera rays, SceneManager host) |
| Milestone 4 (read-only) | `evalfile|scripts/e2e/editor-m4.js` on examples/Demo: material references + shared Babylon materials + tiling, inline fields hidden, Material asset inspector + live edit, sky / fog / ACES / FXAA, Environment off, particle edit preview + undo, coin sparkles + burst in play, debug lines; unit: gameplay.test.ts (Material asset + preload, Debug line lifetimes, ParticleSystem states) |
| Mouse | pick `clickxy` on an object, gizmo `drag` along the red arrow, Hierarchies `dndjs` (rows by `.rs-row[data-key="g:<id>"]`), Play button + `holduntil|KeyW` in the view, `scripts/e2e/probe.js` for the state |
| Milestone 5 prefab (scratch copy) | `evalfile|scripts/e2e/editor-m5-prefab.js`: instances, override detection, compact scene file, prefab mode edit / save / back, instances updated with overrides kept, revert + undo, apply, external prefab edit, unpack, spawned instances; `editor-m5-settings.js` (scratch): Project Settings window, layer names, matrix, action add, save to rs.project.json, Inspector layer, matrix in play, raycast mask. Unit: prefab.test.ts, physics layers, input actions / touch / ProjectSettings / dontDestroyOnLoad in gameplay.test.ts. Restart the editor server after changing server-side code (readProject) |

Stop the servers you start (kill only your PIDs) and delete scratch projects.
