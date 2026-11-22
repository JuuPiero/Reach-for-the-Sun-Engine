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
                         components/render.ts (Mesh, Camera, Directional / Point / Spot / Ambient light), Input, Application, Debug
packages/render-babylon  BabylonBackend: mirrors a Scene into Babylon every frame (sync → render), picking, model loading
packages/runtime         src/ = game player (Player, main.ts); vite/ = rsProjectPlugin (virtual:rs/scripts, virtual:rs/project,
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
