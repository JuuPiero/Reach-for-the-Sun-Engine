# RS Engine architecture

## 1. Core (`packages/core`)
- **Reflection** (`reflection.ts`): `@field(options)` records metadata per prototype; `getFields(ctor)` merges base → derived
  decorated fields with plain public values of a default instance (`new ctor()`), in instance key (declaration) order, cached per
  class. `Types` is the registry of component / UserData classes by name (`Types.register(ctor, name, kind, options, script)`);
  `Types.nameOf(ctor)` is what files store.
- **GameObject / Transform / Component** (`GameObject.ts`): Transform holds local position / rotation (quaternion) / scale, parent
  and children; `worldMatrix` is cached per frame (`_nextTransformFrame`, bumped by `Scene.step`; `markDirty()` after mid-frame
  edits). World setters (`position`, `rotation`) convert through the parent. Components get `gameObject` on attach;
  lifecycle methods are optional (`awake`, `start`, `update`, `lateUpdate`, `onDestroy`, `onValidate`). `Behavior` is the script base.
- **Folder / Scene** (`Scene.ts`): `Scene.root` is a Folder tree; root GameObjects live in folders, children under their parent's
  Transform. `activeInHierarchy` = every parent updates + every folder active; `visibleInHierarchy` uses `drawSelf`. Play:
  `begin()` awakes everything and queues start; `step(dt)` runs start (for runnable components), update, lateUpdate, then deferred
  destroys and `Input._endFrame()`; components added while playing awake immediately and start next frame; `end()` calls onDestroy.
  Script exceptions go to `Debug.exception` (Console) and never stop the loop.
- **Files** (`serialization.ts`, contract): scene `{ format: 1, root: FolderJson }`, prefab `{ format: 1, gameObject }`, UserData
  `{ format: 1, type, fields }`. Field encodings: vec3 / color arrays, GameObject refs = ids resolved after the whole read
  (`ReadContext.pending`), prefab / userdata / asset = paths. `deserializeScene` keeps ids (`_reserveIds`), `cloneGameObject` gives
  fresh ones and remaps references inside the copy. Unknown component types → `MissingComponent { typeName, data }`.
- **Assets** (`assets.ts`): path-addressed, `Assets.baseUrl` prefix (editor `/project/`, games `./`). JSON cache; one shared
  UserData instance per file; `prefabRef(path)` returns the shared Prefab object (loaded later by `loadPrefab`).
  `preloadReferences(json)` loads every `.user.json` / `.pfb.json` string recursively. `sceneLoader.ts` wires UserData reading and
  `Prefab.instantiate` (avoids import cycles) and provides `loadScene(path)` / `sceneFromJson(json, path)`.
- **Scripts** (`scripts.ts`): `syncScripts({ path: module })` registers exported Component / UserData subclasses under their export
  names (menu `Scripts/<Name>`), replacing previous classes of the same name (live reload).

## 2. Renderer (`packages/render-babylon`)
`BabylonBackend(canvas)` owns a Babylon Engine + Scene. `sync(scene, { camera?, defaultLight? })` walks `scene.allGameObjects()`:
one TransformNode per GameObject (local TRS copied, parent set after the walk), Mesh → primitive builders or a glTF instance
(`LoadAssetContainerAsync` cached per path, `instantiateModelsToScene`), StandardMaterial (color, texture + tiling, emissive,
specular), lights (Directional with a PCF ShadowGenerator whose render list = every `castShadows` mesh, Point, Spot, Hemispheric for
AmbientLight), cameras (FreeCamera per Camera component; the first enabled `main` camera of an active object draws the game and gives
the clear colour). Entries not seen in a sync are disposed. `pick(x, y)` maps Babylon meshes back to GameObjects through
`mesh.metadata.rsObject`; `nodeOf` / `meshesOf` serve the editor (gizmos, outlines).

## 3. Runtime + build (`packages/runtime`)
- `rsProjectPlugin` (Vite): aliases `@rs/*`, decorators, `virtual:rs/scripts` (imports every `Assets/**/*.ts`, calls `syncScripts`,
  self-accepts and dispatches `rs:scripts-reloaded`), `virtual:rs/project` (rs.project.json), `/project/<path>` serving in dev,
  watcher → `rs:assets-changed` custom HMR event (new / deleted scripts reload the scripts module); game builds copy every non-script
  project file next to `index.html` plus `rs.project.json`.
- Player (`src/Player.ts`): loads the start scene, `begin()`, rAF loop `step → sync → render`, `Input.attach(canvas)`.
- `vite/build.ts` `gameBuildConfig` / `buildGame` → `<project>/Build/Web`; `vite/cli.ts` = commands of `scripts/rs.mjs`.

## 4. Editor (`packages/editor`)
- Server (`server/start.ts`): Vite dev server rooted at packages/editor with `rsProjectPlugin` (editor mode) + `projectApiPlugin`
  (`/__rs/api/files | project | file (PUT) | mkdir | delete | rename`, writes confined to `Assets/` and `rs.project.json`) +
  `/__rs/api/build`.
- `Editor` (`src/editor/Editor.ts`): open scene, selection (object ids | folder path | asset path), undo / redo stacks of scene
  JSON (`recordUndo(label, coalesce)`), play / pause / step / stop (scene snapshot), asset operations (scripts from a template,
  UserData from a type, scenes, prefabs from objects, instantiate, rename, delete), UserData editing (shared instance, file written
  300 ms after the last change), file-change handling (own writes ignored, external edits invalidate caches), live script reload.
  Events: scene, selection, inspector, mode, files, dirty, log, gizmo (`useEditor(...)` hook).
- UI (`src/ui`): `App` (menu bar, toolbar, CSS-grid layout with splitters saved in localStorage, global shortcuts), `Hierarchies`
  (folder / object tree, update / draw toggles, HTML5 drag & drop with before / into / after zones, inline rename, context menu),
  `MacroShelf` (creation buttons), `RuntimeView` (BabylonBackend + editor FreeCamera: RMB look + WASD/QE fly, MMB pan, wheel dolly,
  Alt+LMB orbit, F focus; GizmoManager move / rotate / scale writing back node TRS on drag; grid + light / camera markers on an
  editor-only layer mask; selection outlines; asset drops), `Inspector` (object header, Add Component menu, Global / Local
  transform, components with enable checkbox / remove, UserData / scene / prefab / script / texture asset inspectors), `fields.tsx`
  (number with scrub / arrows / expressions, vec3, color, enum, asset / prefab / userdata dropdowns with drop targets, GameObject
  references), `AssetBrowser` (folder tree, breadcrumbs, tiles, create menu, favorites, drops: objects → prefab, tiles → move),
  `Console`.

## 5. Physics (`packages/core/src/Physics.ts`, `components/physics.ts`, `packages/physics`)
`Physics` (gravity, fixedDeltaTime 1/60, maxSubSteps 4, raycast / overlapSphere) forwards to the installed `PhysicsProvider`.
`Scene.step` (play) accumulates time and runs per fixed step: `fixedUpdate` of runnable components → `provider.step(scene, dt)`.
`RapierPhysics` keeps one Rapier World per scene: `sync` walks active objects — owner of a body = object with RigidBody /
CharacterController, colliders without one attach to the nearest RigidBody ancestor (compound) or get a fixed body; collider shapes
are computed in the owner's space with |scale| applied to sizes (box size × scale, sphere radius × max scale, capsule / cylinder
radius × max(x, z), height × y); signature strings recreate changed bodies / colliders; kinematic → next kinematic pose, static /
character → setTranslation when the Transform moved. After `world.step(eventQueue)` dynamic poses go back to Transforms (through the
parent), forces / torques reset, collision events become `onCollisionEnter/Exit` (Collision with first solver contact) or
`onTriggerEnter/Exit` (either collider a sensor) on the owners' components. CharacterController.move → `moveCharacter`: Rapier
KinematicCharacterController (slope / autostep / snap to ground, sensors excluded), body teleported, Transform updated, grounded
returned. `dispose(scene)` on `Scene.end`.

## 6. Motion (`components/motion.ts`, `MotionFsm.ts`)
Motion keeps `layers` (clip, time, weight, speed, loop): `play(clip, fade)` keeps the current clip as the outgoing layer and fades
weights over `fade` seconds; `tick(dt)` advances times (wrap / clamp by clip length), fades, then evaluates the FSM: transitions
from the current state or `*` (skipping `* → current`), exitTime against the time in the state in clip lengths (unwrapped),
conditions on parameters (`conditionsMet`), triggers consumed when used and cleared after every evaluation. `.fsm.json` files are
loaded by `Assets.loadFsm` (normalized, shared, preloaded with scenes). Renderer side: `BabylonBackend.syncMotion`. Editor: Motion
`updateInEdit` is ticked by the Runtime view in edit mode (restart when the fsm / clip field changes); FsmEditor (Inspector) edits
parameters / states (renames follow into transitions / initial) / transitions / conditions.

## 7. Gameplay services (milestone 3)
- **Scene switching** (`SceneManager.ts`): `SceneManager._setHost({ load })` is installed by the host — `Player` (game: the load is
  queued and applied between frames: end old scene, `_setActive`, `Application._reset`, begin) and `Editor` (`loadSceneInPlay`:
  same, but Stop deserializes the play snapshot back with the edited scene's path / name). `_setActive` also sets
  `Prefab.activeScene`; `Camera.main` reads `SceneManager.active`. `Screen` (CSS pixels of the game view) is set by the hosts on resize.
- **Timers / tweens** (`Scene.ts`, `Tween.ts`): per-scene lists advanced after `update`, before `lateUpdate`, with scaled time
  (`scene.time`); `Component.wait` / `invoke` push `SceneTimer`s owned by the component (dropped when it is destroyed);
  `Scene.end` kills tweens and drops timers (pending `wait` promises never resolve). Tweens lerp numbers / Vector3 / Color3 fields by
  name and call `target.markDirty?.()` (Transform).
- **Audio** (`Audio.ts`, `components/audio.ts`): one lazy AudioContext (`AudioEngine`), resumed by `Input` on the first key / mouse
  press; buffers cached per path (`invalidate` on file change). AudioSource = buffer source → gain → (panner when spatial) → master;
  `AudioListener` / spatial sources copy world poses every frame (`setPannerPosition` mirrors Z: Babylon / RS is left-handed, WebAudio
  right-handed). Node: everything no-ops without `AudioContext`.
- **UI** (`components/ui.ts` data, `packages/runtime/src/UIRenderer.ts` drawing): DOM overlay, one absolutely positioned div per
  GameObject with UI components, nested under the nearest UI ancestor's div, inside a root of `UI.referenceHeight` (720) CSS px
  scaled to the host. Anchor fractions give left / top (y up). Buttons: `pointerenter/leave` → `_hover`, click → `UIButton.click()`
  only when `interactive()` (game always, editor in play); otherwise `pointerdown` → `onPick` (editor selection, orange outline).
  Display follows `visibleInHierarchy` (`go.active` = update + draw).
- **Input** additions: gamepads polled in `Input._beginFrame` (standard mapping, `GAMEPAD_BUTTONS`), pointer lock on the attached
  element. **SaveData**: localStorage keys `<namespace>:<key>` (namespace = project name; the editor uses `editor:<name>` so play sessions do not touch the game's saves).

## 8. Looks: materials, environment, particles, debug lines (milestone 4)
- **Material** (`core/src/Material.ts`) is a built-in UserData type registered with `fileExt: '.mat.json'` (`userDataExt`,
  `isUserDataPath` in reflection.ts): loading, preloading (`Assets.preloadReferences`), the Inspector (UserData editing, saved
  through `saveUserDataSoon`), field drop-downs (`exts` from the field's `userDataType`) and creation (`createUserData`) all reuse
  the UserData paths. `Mesh.material` is a userdata field; `visibleIf` (new FieldOption) hides the inline surface fields.
- render-babylon `materials.ts` (`MaterialCache`): one StandardMaterial per Material object, refreshed once per sync (`beginFrame` /
  `prune`); metallic / roughness → diffuse scale, specular colour / power (no environment reflections). Textures are cached per
  (path, tiling, alpha) — never set `uScale` on a shared texture. A model keeps its own materials in `MeshEntry.ownMaterials` while
  overridden.
- `environment.ts` (`EnvironmentRenderer`): sky dome = inside-out sphere (`infiniteDistance`, no fog, no depth write) with a 4×256
  DynamicTexture gradient (rows run bottom → top of the sphere) or an equirect texture, as the *emissive texture* with emissiveColor
  black (StandardMaterial adds emissiveColor + emissive texture) and `level` = intensity; scene fog; `imageProcessingConfiguration`
  (tone mapping, exposure, contrast, vignette, applied by materials); `DefaultRenderingPipeline` (bloom / FXAA) only when enabled,
  re-created when the drawn camera changes, `imageProcessingEnabled = false`.
- `particles.ts`: one Babylon ParticleSystem per component, emitter = the GameObject's TransformNode, updated from the component
  every sync (shape / size gradients re-created on signature change). Time: `updateSpeed = timeScale / 60` (Babylon ages particles
  by updateSpeed × frame-time ratio → seconds). Emission: play mode follows `ParticleSystem._emitting` (component update tracks
  duration / loop / bursts), edit mode previews when `simulateInEdit`. Bursts: `manualEmitCount = n` for one frame, then back to −1.
  Dispose with `dispose(false)` — textures are shared (soft dot, cached files).
- Debug lines: `Debug.drawLine` & co push into a frame-scoped list (`_beginFrame` in `Scene.step` drops duration-0 lines of past
  frames and expired timed ones, `_clearLines` on `Scene.end`); `debugLines.ts` draws them as one LineSystem (updated in place
  while the count is unchanged). `SyncOptions.debugLines` (editor true) / `Debug.showLines` (builds, default false).
- `SyncOptions.playing / timeScale / dt`: the editor passes play state (pause → timeScale 0, edit → playing false).

## 9. Prefab instances, layers, project settings (milestone 5)
- **Prefab instances** (serialization.ts): every object of an instance carries `_prefabId` (the id of its object in the prefab
  file, "pid"); the root has `prefab`. Saving an instance root writes it **compactly**: `{ id, name, prefab, transform, components: [],
  children: [], overrides: PrefabOverrides }` — `ids` (pid → scene id, keeps references stable), per-pid `objects` mods (name / tag /
  layer / update / draw / transform of non-root objects; components keyed `Type#n` with changed fields only), `addedComps`,
  `removedComps`, `added` children (full JSON, may be other instances), `removed` pids. Diff base = `canonicalPrefab(data)`
  (the prefab read + written once with every field, cached per data object; nested instances flattened; pids = file ids).
  Loading: `deserializeGameObject` expands compact nodes (`expandInstance`: canonical → scene id space (unknown pids get fresh ids)
  → internal refs remapped → mods applied). A prefab not loaded keeps the compact JSON in `_prefabCompact` and writes it back.
  Full-tree instances (older files, freshly created prefabs) are linked by structure (`linkInstance`). `instanceJson` = new
  instance (pids set) for `Prefab.instantiate`. Objects added to an instance have `_prefabId` null; another instance's root inside
  one is "added" (`ownedBy` = pid set and not a root).
- Editor: `openPrefab` (prefab mode: the prefab's root in its own Scene with file ids, `back` = scene JSON + undo stacks),
  `savePrefab` (flatten write + `Assets.prefabRef(path).data = data`), `closePrefab` (rebuild the scene JSON → expands with the new
  data), `applyPrefab` (instance → prefab ids: own objects keep pids, added get max+1; the instance node in the scene JSON is
  replaced by a clean `{ overrides: { ids } }`), `revertPrefab` (keep only `ids`), `unpackPrefab`, `prefabFileChanged` (external
  edit: serialize scene with the old data, `Assets.reloadPrefab` swaps data atomically, rebuild). Order matters everywhere:
  **serialize with the old prefab data before swapping it**.
- **Layers** (Physics.ts): `GameObject.layer` 0–15 (saved as `layer` when ≠ 0), `Physics.layers` names, `collisionMatrix` (per layer
  mask, symmetric via `setLayerCollision`). Rapier: collision + solver groups `(1 << layer) << 16 | matrix[layer]` (in the collider
  signature so edits recreate colliders), character moves pass the same groups; queries filter by `layerMask` in the predicate
  (default all but layer 1 "Ignore Raycast").
- **ProjectSettings** (core/ProjectSettings.ts): `apply(rs.project.json)` → gravity, fixed step, layers, matrix, Input actions (player
  main.ts and editor init); `capture(base)` → JSON the editor writes (`saveProjectSettings`). The vite `readProject` keeps every key.
- **Input**: actions table (`InputAction`: keys / buttons / mouse or negative / positive / gamepadAxis + invert), touches (first finger
  = mouse button 0), all reset per frame in `_endFrame`.
- **dontDestroyOnLoad**: root objects flagged `_dontDestroy`; hosts call `old._takePersistent()` (removed without onDestroy) before
  `old.end()`, then `SceneManager._carry(keep, next)` after `next.begin()` (already awoken / started components are not restarted).
