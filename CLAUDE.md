# RS Engine — notes for Claude

RS Engine ("Reach for the Sun") is a web game engine in TypeScript with an RE-Engine-style workflow: scenes are trees of
**Folders** holding **GameObjects** (Transform + components, `updateSelf` / `drawSelf` flags), scripts are `rs.Behavior`
components, data assets are **UserData** (`.user.json`), prefabs are `.pfb.json`, scenes `.scn.json`. Rendering is Babylon.js
(v9). The web editor has the RE layout: Hierarchies, Macro Shelf, Runtime view, Inspector (Global / Local transform),
AssetBrowser, Console. Sister engines by the same owner: PiaEngine (Unity-like, F:\Workspace\ts\PiaEngine) and Undot
(UE-like, E:\Workspace\ts\Undot) — same conventions where they apply.

## Working with the owner
- Reply in **Vietnamese**. User docs (README.md) are Vietnamese; code, comments, CLAUDE.md and docs/ai are English.
- Commits: local commits at verified milestones are allowed; there is no remote yet (don't push). End messages with the
  Co-Authored-By line. Never force / amend.
- Mirror RE Engine concepts and workflow under **original names** (`rs.*`, no Capcom names, logos or UI art).
- Verify for real: `node scripts/test.mjs`, typecheck, the editor and builds in headless Chrome (docs/ai/testing.md).

## Where to look
| Need | Read |
|---|---|
| How things work inside (formats, lifecycle, renderer, editor, build) | [docs/ai/architecture.md](docs/ai/architecture.md) |
| Running / testing | [docs/ai/testing.md](docs/ai/testing.md) |
| User-facing behaviour (Vietnamese) | [README.md](README.md) |

## Repo map
```
packages/core            @rs/core — math (Babylon's Vector3 / Quaternion / Color3), reflection.ts (@field, Types registry),
                         GameObject.ts (GameObject, Transform, Component, Behavior), Scene.ts (Folder, Scene, play lifecycle),
                         serialization.ts (scene / prefab / UserData JSON, MissingComponent), assets.ts (Assets: paths, caches),
                         Prefab.ts, UserData.ts, sceneLoader.ts, scripts.ts (registerScriptModule / syncScripts),
                         components/render.ts (Mesh, Camera, lights), components/physics.ts (Collider, RigidBody, CharacterController),
                         Physics.ts (API + PhysicsProvider interface, fixed step in Scene.step), components/motion.ts (Motion) +
                         MotionFsm.ts (.fsm.json state machines), Input (keys / mouse / gamepad / pointer lock), Application,
                         Debug, SceneManager.ts (SceneManager + Screen), Tween.ts, Audio.ts + components/audio.ts, components/ui.ts
                         (UIText / UIImage / UIPanel / UIButton data), SaveData.ts, Material.ts (.mat.json = built-in UserData type),
                         components/environment.ts (sky / fog / post), components/particles.ts (ParticleSystem settings + play state),
                         ProjectSettings.ts (rs.project.json → Physics / Input); serialization.ts also holds prefab instances (compact
                         overrides: expandInstance / collapseInstance / canonicalPrefab)
packages/render-babylon  BabylonBackend: mirrors a Scene into Babylon every frame (sync → render), picking, model loading, Motion → AnimationGroups;
                         materials.ts (Material → StandardMaterial), environment.ts (sky dome, fog, image processing, bloom / FXAA),
                         particles.ts (ParticleSystem → Babylon particles), debugLines.ts (Debug.drawLine)
packages/physics         @rs/physics — RapierPhysics (PhysicsProvider: bodies / colliders from components, character controller,
                         queries, collision / trigger callbacks), initPhysics()
packages/runtime         src/ = game player (Player, main.ts) + UIRenderer.ts (DOM UI overlay, also used by the editor); vite/ = rsProjectPlugin (virtual:rs/scripts, virtual:rs/project,
                         /project/ file serving, asset copy), build.ts (game build), cli.ts (rs.mjs commands), project.ts
packages/editor          src/editor/Editor.ts (singleton `editor`: scene, selection, undo, play, assets), src/ui/* (React panels),
                         server/ (start.ts = Vite dev server, projectApi.ts = /__rs/api file routes)
examples/Demo            sample project (rs.project.json, Assets/Scenes|Scripts|Prefabs|UserData)
scripts/rs.mjs           CLI: editor / build / create (bundles packages/runtime/vite/cli.ts with esbuild on each run)
scripts/test.mjs         unit tests (packages/*/tests/*.test.ts, node --test)
scripts/e2e/             headless Chrome driver (driver.mjs) + editor / game checks
```

## Commands (repo root; on the owner's Windows machine run node through PowerShell)
- Typecheck: `npx tsc -p tsconfig.json --noEmit`. Unit tests: `node scripts/test.mjs [filter]`.
- Editor: `node scripts/rs.mjs editor examples/Demo [--port 5180]` (`RS_NO_OPEN=1` = no browser window).
- Build: `node scripts/rs.mjs build examples/Demo` → `examples/Demo/Build/Web`. New project: `node scripts/rs.mjs create <dir>`.

## Conventions that matter
- **Serialized data is a contract** (scenes, prefabs, UserData saved by users): don't rename / retype fields without migration.
  Scene format 1 (serialization.ts header). Unknown component types load as `MissingComponent` and save back unchanged.
- **Assets are referenced by project path** (`Assets/UserData/Player.user.json`), RE-style. Scenes preload every `.user.json` /
  `.pfb.json` string they contain (`Assets.preloadReferences`) before being built.
- Fields: public plain values (number, string, boolean, Vector3, Color3) are serialized automatically; `@field({...})` adds metadata
  (`type: 'userdata' | 'prefab' | 'gameobject' | 'asset' | 'enum' | 'int'`, min / max / step / header). `_name` members are private.
  Fields are listed in declaration order.
- Project scripts register by **export name** (`syncScripts`): exported Component subclasses = components, UserData subclasses =
  data types. Never key behaviour on `cls.name` of engine classes registered by `Types.register(…, name)`.
- Babylon is left-handed, +Y up, +Z forward; engine math is Babylon's own classes (deep imports keep builds tree-shakable).
- Renderers never own game state: `BabylonBackend.sync(scene)` creates / updates / removes Babylon objects per GameObject each frame.
- Editor changes: `editor.recordUndo(label)` before mutating (scene JSON snapshot; `coalesce` for drags), `editor.changed(structure?)`
  after. Play mode snapshots the scene on Play and rebuilds it on Stop — edits made while playing are lost (RE behaviour).
- GameObject ids are unique per scene and kept by scene files / undo / play snapshots (selection survives them); prefab instances
  and duplicates get fresh ids with internal references remapped (`cloneGameObject`).

## Gotchas
- The Bash tool on the owner's machine has no `node`: use PowerShell. Use Edit / Write for code (heredocs / sed eat backslashes).
- Vite here is 7.x with esbuild transforms (decorators via `esbuild.tsconfigRaw`); the editor has no React refresh plugin: an edited
  editor source reloads the page. Project scripts reload live (`virtual:rs/scripts` self-accepts → `rs:scripts-reloaded` → the
  editor rebuilds the scene from JSON so components are instances of the new classes).
- SwiftShader (headless Chrome) clips long lines crossing the camera plane wrongly: the editor grid is made of short segments.
- HTML5 drag & drop (Hierarchies rows, AssetBrowser tiles) needs the driver's `dndjs` step (CDP drag events), not `drag`.
- Physics (`@rs/physics`, Rapier compat = WASM inlined in JS): games import `virtual:rs/physics` (real only when the project names a
  physics class / API — `projectUsesPhysics`), the editor always loads it; `await initPhysics()` before play. Bodies follow the
  components every fixed step (signatures recreate changed bodies / colliders); dynamic bodies write their pose back to the Transform;
  kinematic / static ones follow it. Never create Rapier objects outside the provider. Forces are cleared after each step (Unity-like).
- Motion: the model's clips are Babylon AnimationGroups started + paused at load; `syncMotion` sets frame + weight from
  `Motion.layers` every sync (no Motion = weights 0 = rest pose). Clip names reach the component through `_setClips`. Babylon's glTF
  import keeps glTF's −Z front as the back: models must face +Z after import (the demo generator turns its root 180°).
- MotionFsm edits go through `editor.saveFsm` (replaces the shared `Assets.setFsm` data, then writes the file); Motions compare the
  shared object every tick and switch to it (keeping the state when it still exists).
- The editor reloads the open scene when its file changes on disk and nothing is unsaved — another editor process saving the same
  project overwrites in-memory work otherwise (two editors on one project = last save wins).
- Theme: colours are CSS variables in styles.css `:root` (black + orange `--accent`); controls (select, checkbox, range, colour) are
  restyled with `appearance: none` — new controls must use them, not browser defaults.
- Rapier 0.21's character-controller snap-to-ground sometimes returns the full downward displacement for a resting character
  (it sinks into the ground and then falls); it is disabled — scripts keep a small downward velocity while grounded. The
  character body is re-placed from the Transform before every move; the first move of a world steps it once (new colliders reach
  the query structures only through a step). Repro harness: `packages/physics/tests/demo.test.ts` (real Demo scene in Node).
- Hosts (Player, Editor) own scene switching: `SceneManager._setHost` + `_setActive` (never set `Prefab.activeScene` directly).
  Editor play mode: `SceneManager.load` swaps `editor.scene`; Stop restores the play snapshot with the edited scene's path.
- Timers / tweens live on the Scene and use scaled time (`Application.timeScale = 0` freezes them); `Scene.end` drops them.
- In-game UI is DOM (UIRenderer), not Babylon GUI: it follows `visibleInHierarchy`, buttons click only while `interactive()`
  (editor: play mode). Hide menus with `go.active = false` (saved as `update` / `draw` false).
- Browsers start the AudioContext suspended: `Input` resumes it on the first key / mouse press. Demo sounds are generated by
  `scripts/gen-demo-sounds.mjs` (regenerate instead of editing the wavs).
- Babylon StandardMaterial *adds* emissiveColor to the emissive texture (white sky bug): when a texture provides the colour, set
  emissiveColor black and use `texture.level` for intensity.
- Babylon `ParticleSystem.dispose()` disposes its texture by default — particle textures are shared: always `dispose(false)`.
- New UserData-like asset kinds: register a UserData class with `fileExt` (like Material) instead of adding a new loader; editor
  code must test `isUserDataPath(path)`, never `.endsWith('.user.json')`.
- Textures in render-babylon come from `MaterialCache.texture(path, tiling, alpha)` (cached per combination); don't mutate
  `uScale` / `hasAlpha` on a cached texture.
- Prefab instances save as diffs against `canonicalPrefab(data)`: anything that swaps a prefab's data must serialize the scene
  *before* (old data) and rebuild after (new data) — see `Editor.prefabFileChanged` / `applyPrefab`. Never set
  `Assets.prefabRef(p).data = null` while instances exist (use `Assets.reloadPrefab`, which swaps in one step).
- New per-object state that users can change on instance children must be added to the instance diff (`collapseInstance` /
  `expandInstance`, like `layer`), or it is lost on reload.
- Collider signatures in RapierPhysics include the collision groups: anything that affects filtering must be in the signature.
- The editor's dev server (packages/editor/server, runtime/vite) is Node code: restart the editor after changing it (Vite doesn't
  reload it), e.g. `readProject`.
