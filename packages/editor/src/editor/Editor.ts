import {
  AmbientLight,
  Application,
  Assets,
  Camera,
  cloneGameObject,
  Debug,
  deserializeScene,
  DirectionalLight,
  Folder,
  GameObject,
  getFields,
  Input,
  Mesh,
  PointLight,
  Prefab,
  quatFromEulerDeg,
  Scene,
  sceneFromJson,
  serializeGameObject,
  serializeScene,
  serializeUserData,
  SpotLight,
  Types,
  UserData,
  Vector3,
  Motion,
  AudioListener,
  AudioSource,
  UIComponent,
  SaveData,
  SceneManager,
  loadScene,
  isUserDataPath,
  userDataExt,
  emptyFsm,
  serializeLinkedFolder,
  serializePrefabTree,
  remapJsonIds,
  ProjectSettings,
  type ProjectSettingsJson,
  newReadContext,
  deserializeGameObject,
  resolveReferences,
  unpackInstance,
  linkInstance,
  canonicalPrefab,
  type PrefabJson,
  type GameObjectJson,
  type MotionFsmData,
  type Component,
  type LogEntry,
  type MeshShape,
  type SceneJson,
} from '@rs/core';
import { api, type FileEntry } from './client';
import { initPhysics } from 'virtual:rs/physics';

/**
 * The editor (singleton `editor`): the open scene, selection, undo / redo (scene JSON snapshots taken by `recordUndo` before a
 * change), play mode (the scene is snapshotted on Play and rebuilt on Stop), project files and asset operations.
 * UI code listens with `useEditor('scene', 'selection', ...)`; every mutation calls `recordUndo(label)` first and `changed()` after.
 */

export type EditorEvent = 'scene' | 'selection' | 'inspector' | 'mode' | 'files' | 'dirty' | 'log' | 'gizmo';
export type PlayMode = 'edit' | 'play' | 'pause';
export type GizmoMode = 'move' | 'rotate' | 'scale';
export type CreateKind = 'Empty' | MeshShape | 'DirectionalLight' | 'PointLight' | 'SpotLight' | 'AmbientLight' | 'Camera' | 'UIText' | 'UIButton' | 'UIImage' | 'UIPanel' | 'AudioSource' | 'ParticleSystem' | 'Environment';

interface UndoEntry {
  label: string;
  scene: SceneJson;
  selection: number[];
  time: number;
}

/** In-memory snapshots (undo, play, rebuilds) keep linked folders' content inline. */
const INLINE = { inlineLinked: true };

export class Editor {
  projectName = '';
  projectRoot = '';
  startScene = '';
  /** rs.project.json (Project Settings window). */
  projectSettings: ProjectSettingsJson = {};
  files: FileEntry[] = [];
  scene: Scene = new Scene('Untitled');
  dirty = false;
  mode: PlayMode = 'edit';
  gizmo: GizmoMode = 'move';
  gizmoSpace: 'local' | 'global' = 'local';
  /** Selected GameObject ids (scene ids survive undo / play snapshots). */
  selection: number[] = [];
  /** Selected folder (path below Root, '' = Root) — exclusive with objects. */
  selectedFolder: string | null = null;
  /** Selected project file (Asset Browser) — exclusive with scene selection in the Inspector. */
  selectedAsset: string | null = null;
  /** UserData being edited (selectedAsset is a .user.json). */
  editedUserData: UserData | null = null;
  readonly logs: LogEntry[] = [];
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private playSnapshot: SceneJson | null = null;
  private listeners = new Map<EditorEvent, Set<() => void>>();
  private ownWrites = new Map<string, number>();
  /** Where new objects appear (the Runtime view sets it to a point in front of its camera). */
  spawnPoint: () => Vector3 = () => new Vector3(0, 0, 0);
  /** The Runtime view camera is flying (right button held): W / E / R move it instead of switching gizmos. */
  flying = false;
  /** Canvas of the Runtime view (play mode input). */
  gameElement: HTMLElement | null = null;

  constructor() {
    Debug.onLog((e) => {
      this.logs.push(e);
      if (this.logs.length > 500) this.logs.splice(0, this.logs.length - 500);
      this.emit('log');
    });
  }

  // ---- events -----------------------------------------------------------------------------------------------------------
  on(kind: EditorEvent, f: () => void): () => void {
    let s = this.listeners.get(kind);
    if (!s) this.listeners.set(kind, (s = new Set()));
    s.add(f);
    return () => s!.delete(f);
  }
  emit(...kinds: EditorEvent[]): void {
    for (const k of kinds) for (const f of this.listeners.get(k) ?? []) f();
  }

  // ---- project ----------------------------------------------------------------------------------------------------------
  async init(): Promise<void> {
    Assets.baseUrl = '/project/';
    await initPhysics();
    const p = await api.project();
    const { root: _root, ...settings } = p;
    this.projectSettings = settings;
    ProjectSettings.apply(settings);
    this.projectName = p.name;
    SaveData.namespace = `editor:${p.name}`;
    SceneManager._setHost({ load: (path) => this.loadSceneInPlay(path) });
    this.projectRoot = p.root;
    this.startScene = p.startScene;
    await this.refreshFiles();
    const first = [p.editorScene, p.startScene].find((s) => s && this.files.some((f) => f.path === s));
    if (first) await this.openScene(first, true);
    else this.newScene(true);
    if (import.meta.hot) {
      import.meta.hot.on('rs:assets-changed', (d: { path: string; kind: string }) => this.onFileChanged(d.path, d.kind));
    }
    window.addEventListener('rs:scripts-reloaded', () => void this.reloadScripts());
  }

  private refreshTimer = 0;
  private onFileChanged(path: string, kind: string): void {
    const own = this.ownWrites.get(path);
    if (own && Date.now() - own < 1500) {
      this.ownWrites.delete(path);
    } else if (kind === 'change' && path.endsWith('.pfb.json')) {
      void this.prefabFileChanged(path);
    } else if (kind === 'change' && (isUserDataPath(path) || path.endsWith('.fsm.json'))) {
      Assets.invalidate(path);
      if (path === this.selectedAsset) void this.selectAsset(path);
    } else if (kind === 'change' && (path === this.scene.path || [...this.scene.root.allFolders()].some((f) => f.scenePath === path && f.sceneLoaded))) {
      // the open scene was written by someone else (another editor, a text editor, git)
      if (this.dirty || this.mode !== 'edit') Debug.warn(`${path} changed on disk; saving now would overwrite those changes (File ▸ Reload Scene to take them)`);
      else if (this.scene.path) void this.openScene(this.scene.path, true).then(() => Debug.log(`${path} changed on disk: scene reloaded`));
    }
    clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => void this.refreshFiles(), 120);
  }

  async refreshFiles(): Promise<void> {
    this.files = await api.files();
    this.emit('files');
  }

  private async write(path: string, data: unknown): Promise<void> {
    this.ownWrites.set(path, Date.now());
    await api.writeJson(path, data);
  }

  /** Project scripts were edited / added: rebuild the scene so its components are instances of the new classes. */
  private async reloadScripts(): Promise<void> {
    if (this.mode !== 'edit') this.stop();
    const j = serializeScene(this.scene, INLINE);
    const path = this.scene.path;
    Assets.invalidate();
    const s = await sceneFromJson(j, path, { loadAllLinked: true });
    this.setScene(s, false);
    if (this.selectedAsset) await this.selectAsset(this.selectedAsset);
    Debug.log('Scripts reloaded');
  }

  // ---- scenes -----------------------------------------------------------------------------------------------------------
  private setScene(s: Scene, resetUndo: boolean): void {
    this.scene = s;
    SceneManager._setActive(s);
    if (resetUndo) {
      this.undoStack = [];
      this.redoStack = [];
      this.selection = [];
      this.selectedFolder = null;
    } else this.selection = this.selection.filter((id) => !!s.findById(id));
    this.emit('scene', 'selection', 'inspector');
  }

  newScene(force = false): void {
    if (!force && !this.confirmDiscard()) return;
    this.prefabMode = null;
    if (this.mode !== 'edit') this.stop();
    const s = new Scene('Untitled');
    const env = s.root.addFolder('Environment');
    const sun = new GameObject('DirectionalLight');
    quatFromEulerDeg(50, 30, 0, sun.transform.localRotation);
    sun.addComponent(DirectionalLight);
    env.add(sun);
    const amb = new GameObject('AmbientLight');
    amb.addComponent(AmbientLight);
    env.add(amb);
    const ground = new GameObject('Ground');
    ground.transform.localScale.set(20, 1, 20);
    const gm = ground.addComponent(Mesh);
    gm.shape = 'Ground';
    gm.color.set(0.45, 0.47, 0.5);
    gm.castShadows = false;
    env.add(ground);
    const cam = new GameObject('MainCamera');
    cam.transform.localPosition.set(0, 4, -10);
    quatFromEulerDeg(15, 0, 0, cam.transform.localRotation);
    cam.addComponent(Camera);
    cam.addComponent(AudioListener);
    s.root.add(cam);
    this.setScene(s, true);
    this.setDirty(false);
  }

  async openScene(path: string, force = false): Promise<void> {
    if (!force && !this.confirmDiscard()) return;
    this.prefabMode = null;
    if (this.mode !== 'edit') this.stop();
    try {
      Assets.invalidate(path);
      const j = await Assets.loadJson<SceneJson>(path);
      const s = await sceneFromJson(j, path, { loadAllLinked: true });
      this.setScene(s, true);
      this.setDirty(false);
    } catch (e) {
      Debug.error(`Cannot open ${path}: ${(e as Error).message}`);
    }
  }

  async saveScene(saveAs = false): Promise<void> {
    if (this.prefabMode && this.mode === 'edit') return this.savePrefab();
    if (this.mode !== 'edit') {
      Debug.warn('Stop play mode before saving the scene');
      return;
    }
    let path = this.scene.path;
    if (!path || saveAs) {
      const name = prompt('Scene name', this.scene.name === 'Untitled' ? 'NewScene' : this.scene.name);
      if (!name) return;
      path = `${this.currentFolder()}/${name.replace(/[\\/:*?"<>|]/g, '_')}.scn.json`;
    }
    await this.write(path, serializeScene(this.scene));
    // linked folders: their content goes back to their own scene files
    const linked = [...this.scene.root.allFolders()].filter((f) => f.scenePath && f.sceneLoaded && f.scenePath !== path);
    for (const f of linked) await this.write(f.scenePath!, serializeLinkedFolder(f));
    this.scene.path = path;
    this.scene.name = path.slice(path.lastIndexOf('/') + 1).replace(/\.scn\.json$/, '');
    this.setDirty(false);
    this.emit('scene');
    Debug.log(`Saved ${path}${linked.length ? ` (+ ${linked.map((f) => f.scenePath).join(', ')})` : ''}`);
    await this.refreshFiles();
  }

  /** Links a scene file into a folder of the open scene (RE sub-scene); its content shows and saves back to that file. */
  async linkScene(path: string, parent: Folder | null = null): Promise<Folder | null> {
    if (path === this.scene.path) {
      Debug.warn('A scene cannot contain itself');
      return null;
    }
    this.recordUndo('Link Scene');
    const into = parent ?? this.scene.root;
    const f = into.addFolder(this.uniqueName(path.slice(path.lastIndexOf('/') + 1).replace(/\.scn\.json$/, ''), into.folders));
    f.scenePath = path;
    try {
      Assets.invalidate(path);
      await f.loadScene();
    } catch (e) {
      Debug.error(`Cannot load ${path}: ${(e as Error).message}`);
    }
    this.selectFolder(f.path);
    this.changed(true);
    return f;
  }

  /** Loads / unloads a linked folder's content in the editor (unloaded content is not saved: the file keeps it). */
  async setLinkedLoaded(f: Folder, loaded: boolean): Promise<void> {
    this.recordUndo(loaded ? 'Load Linked Scene' : 'Unload Linked Scene');
    if (loaded) {
      if (f.scenePath) Assets.invalidate(f.scenePath);
      await f.loadScene();
    } else f.unloadScene();
    this.changed(true);
  }

  private confirmDiscard(): boolean {
    return !this.dirty || confirm(`Discard the changes to ${this.scene.name}?`);
  }

  setDirty(d: boolean): void {
    if (this.dirty === d) return;
    this.dirty = d;
    this.emit('dirty');
  }

  // ---- undo -------------------------------------------------------------------------------------------------------------
  /** Snapshot before a change. `coalesce`: repeated changes with the same label within 600 ms make one step (drags). */
  recordUndo(label: string, coalesce = false): void {
    if (this.mode !== 'edit') return;
    const top = this.undoStack[this.undoStack.length - 1];
    const now = performance.now();
    if (coalesce && top && top.label === label && now - top.time < 600) {
      top.time = now;
      return;
    }
    this.undoStack.push({ label, scene: serializeScene(this.scene, INLINE), selection: [...this.selection], time: now });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }
  /** After a change: dirty + UI refresh. */
  changed(structure = false): void {
    if (this.mode === 'edit') this.setDirty(true);
    this.emit(structure ? 'scene' : 'inspector');
    if (structure) this.emit('inspector');
  }
  get canUndo(): boolean {
    return this.mode === 'edit' && this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.mode === 'edit' && this.redoStack.length > 0;
  }
  undo(): void {
    this.restore(this.undoStack, this.redoStack);
  }
  redo(): void {
    this.restore(this.redoStack, this.undoStack);
  }
  private restore(from: UndoEntry[], to: UndoEntry[]): void {
    if (this.mode !== 'edit') return;
    const e = from.pop();
    if (!e) return;
    to.push({ label: e.label, scene: serializeScene(this.scene, INLINE), selection: [...this.selection], time: 0 });
    const s = deserializeScene(e.scene, this.scene.name);
    s.path = this.scene.path;
    this.selection = e.selection;
    this.setScene(s, false);
    this.setDirty(true);
  }

  // ---- selection --------------------------------------------------------------------------------------------------------
  get selectedObjects(): GameObject[] {
    return this.selection.map((id) => this.scene.findById(id)).filter((g): g is GameObject => !!g);
  }
  select(ids: number[], additive = false): void {
    if (additive) {
      const s = new Set(this.selection);
      for (const id of ids) {
        if (s.has(id)) s.delete(id);
        else s.add(id);
      }
      this.selection = [...s];
    } else this.selection = ids;
    this.selectedFolder = null;
    this.selectedAsset = null;
    this.editedUserData = null;
    this.emit('selection', 'inspector');
  }
  selectFolder(path: string | null): void {
    this.selectedFolder = path;
    this.selection = [];
    this.selectedAsset = null;
    this.editedUserData = null;
    this.emit('selection', 'inspector');
  }
  async selectAsset(path: string | null): Promise<void> {
    this.selectedAsset = path;
    this.editedUserData = null;
    this.selection = [];
    this.selectedFolder = null;
    if (path && isUserDataPath(path)) this.editedUserData = await Assets.loadUserData(path);
    if (path?.endsWith('.fsm.json')) await Assets.loadFsm(path);
    this.emit('selection', 'inspector');
  }

  /** Folder new objects go to: the selected folder, the folder of the selected object, else Root. */
  targetFolder(): Folder {
    if (this.selectedFolder !== null) return this.scene.root.findFolder(this.selectedFolder) ?? this.scene.root;
    const g = this.selectedObjects[0];
    return g?.folder ?? this.scene.root;
  }

  // ---- objects ----------------------------------------------------------------------------------------------------------
  create(kind: CreateKind, where: Folder | GameObject | null = null): GameObject {
    this.recordUndo(`Create ${kind}`);
    const go = new GameObject(kind === 'Empty' ? 'GameObject' : kind);
    if (kind === 'DirectionalLight') {
      go.addComponent(DirectionalLight);
      quatFromEulerDeg(50, 30, 0, go.transform.localRotation);
    } else if (kind === 'PointLight') go.addComponent(PointLight);
    else if (kind === 'SpotLight') go.addComponent(SpotLight);
    else if (kind === 'AmbientLight') go.addComponent(AmbientLight);
    else if (kind === 'Camera') {
      go.addComponent(Camera).main = !this.scene.findComponents(Camera).length;
      if (!this.scene.findComponents(AudioListener).length) go.addComponent(AudioListener);
    } else if (kind === 'AudioSource' || kind === 'ParticleSystem' || kind === 'Environment') go.addComponent(kind);
    else if (kind === 'UIText' || kind === 'UIButton' || kind === 'UIImage' || kind === 'UIPanel') {
      const c = go.addComponent(kind);
      if (kind === 'UIPanel') (c as UIComponent).width = (c as UIComponent).height = 300;
      // UI objects go under the selected UI object (nested layout)
      const sel = this.selectedObjects[0];
      if (!where && sel?.components.some((x) => x instanceof UIComponent)) where = sel;
    }
    else if (kind !== 'Empty') {
      const m = go.addComponent(Mesh);
      m.shape = kind;
      if (kind === 'Ground') go.transform.localScale.set(10, 1, 10);
    }
    go.name = this.uniqueName(go.name, where instanceof GameObject ? where.children : (where ?? this.targetFolder()).gameObjects);
    if (!(where instanceof GameObject)) {
      const p = this.spawnPoint();
      go.transform.localPosition.copyFrom(p);
      if (kind !== 'Empty' && kind !== 'Ground' && kind !== 'Plane' && !kind.endsWith('Light') && kind !== 'Camera') go.transform.localPosition.y = Math.max(p.y, 0.5);
    }
    this.scene.add(go, where ?? this.targetFolder());
    this.select([go.id]);
    this.changed(true);
    return go;
  }

  private uniqueName(base: string, siblings: readonly { name: string }[]): string {
    if (!siblings.some((s) => s.name === base)) return base;
    const stem = base.replace(/_\d+$/, '');
    for (let i = 1; ; i++) {
      const n = `${stem}_${String(i).padStart(2, '0')}`;
      if (!siblings.some((s) => s.name === n)) return n;
    }
  }

  createFolder(parentPath: string | null = null): Folder {
    this.recordUndo('Create Folder');
    const parent = parentPath !== null ? (this.scene.root.findFolder(parentPath) ?? this.scene.root) : this.targetFolder();
    const f = parent.addFolder(this.uniqueName('Folder', parent.folders));
    this.scene.version++;
    this.selectFolder(f.path);
    this.changed(true);
    return f;
  }

  rename(target: GameObject | Folder, name: string): void {
    name = name.trim();
    if (!name || name === target.name) return;
    this.recordUndo('Rename');
    if (target instanceof Folder && target.parent) name = this.uniqueName(name, target.parent.folders.filter((f) => f !== target));
    const oldPath = target instanceof Folder ? target.path : null;
    target.name = name;
    if (target instanceof Folder && this.selectedFolder === oldPath) this.selectedFolder = target.path;
    this.scene.version++;
    this.changed(true);
  }

  deleteSelection(): void {
    if (this.selectedFolder) {
      const f = this.scene.root.findFolder(this.selectedFolder);
      if (!f || !f.parent) return;
      this.recordUndo('Delete Folder');
      for (const g of [...f.allFolders()].flatMap((x) => x.gameObjects)) this.scene.destroy(g);
      f.parent.removeFolder(f);
      this.scene.version++;
      this.selectFolder(null);
      this.changed(true);
      return;
    }
    const objs = this.selectedObjects.filter((g) => !this.selectedObjects.some((o) => o !== g && isAncestor(o, g)));
    if (!objs.length) return;
    this.recordUndo('Delete');
    for (const g of objs) this.scene.destroy(g);
    this.select([]);
    this.changed(true);
  }

  duplicateSelection(): void {
    const objs = this.selectedObjects.filter((g) => !this.selectedObjects.some((o) => o !== g && isAncestor(o, g)));
    if (!objs.length) return;
    this.recordUndo('Duplicate');
    const copies: number[] = [];
    for (const g of objs) {
      const c = cloneGameObject(g, this.scene);
      const siblings = g.parent ? g.parent.children : (g.folder ?? this.scene.root).gameObjects;
      c.name = this.uniqueName(g.name, siblings);
      const index = (g.parent ? g.parent.children : siblings).indexOf(g) + 1;
      this.scene.add(c, g.parent ?? g.folder ?? this.scene.root, index);
      copies.push(c.id);
    }
    this.select(copies);
    this.changed(true);
  }

  /** Moves objects under a parent object or into a folder (keeps world placement). */
  moveObjects(ids: number[], target: { parent: GameObject } | { folder: Folder }, index = -1): void {
    const objs = ids.map((i) => this.scene.findById(i)).filter((g): g is GameObject => !!g);
    const moving = objs.filter((g) => !objs.some((o) => o !== g && isAncestor(o, g)));
    if ('parent' in target && moving.some((g) => g === target.parent || isAncestor(g, target.parent))) return;
    if (!moving.length) return;
    this.recordUndo('Move');
    for (const g of moving) {
      const world = g.transform.worldMatrix.clone();
      if ('parent' in target) {
        g._folder?.remove(g);
        g._folder = null;
        g._scene = null;
        g.transform.setParent(target.parent.transform, false, index);
      } else target.folder.add(g, index);
      const local = 'parent' in target ? world.multiply(target.parent.transform.worldMatrix.clone().invert()) : world;
      local.decompose(g.transform.localScale, g.transform.localRotation, g.transform.localPosition);
      g.transform.markDirty();
      if (index >= 0) index++;
    }
    this.scene.version++;
    this.changed(true);
  }

  moveFolder(path: string, into: Folder, index = -1): void {
    const f = this.scene.root.findFolder(path);
    if (!f || !f.parent || f === into) return;
    for (let p: Folder | null = into; p; p = p.parent) if (p === f) return;
    this.recordUndo('Move Folder');
    f.name = this.uniqueName(f.name, into.folders.filter((x) => x !== f));
    into.addFolder(f, index);
    this.scene.version++;
    this.selectFolder(f.path);
    this.changed(true);
  }

  // ---- components -------------------------------------------------------------------------------------------------------
  addComponent(go: GameObject, type: string): void {
    const t = Types.get(type);
    if (!t) return;
    if (t.options.single && go.getComponent(type)) {
      Debug.warn(`${go.name} already has a ${type}`);
      return;
    }
    this.recordUndo(`Add ${type}`);
    go.addComponent(type);
    this.changed(true);
  }
  removeComponent(c: Component): void {
    this.recordUndo('Remove Component');
    c.gameObject.removeComponent(c);
    this.changed(true);
  }
  /** Sets a field of a component / UserData from the Inspector; `others` = the same component of the other selected objects. */
  setField(target: object, name: string, value: unknown, coalesce = true, others: readonly object[] = []): void {
    if (target instanceof UserData) {
      (target as unknown as Record<string, unknown>)[name] = value;
      this.saveUserDataSoon(target);
      this.emit('inspector');
      return;
    }
    this.recordUndo(`Edit ${name}`, coalesce);
    for (const t of [target, ...others]) {
      // each object gets its own copy of value types (vectors / colours are mutable)
      const v = t === target ? value : (value as { clone?: () => unknown } | null)?.clone ? (value as { clone: () => unknown }).clone() : value;
      (t as Record<string, unknown>)[name] = v;
      const c = t as Component;
      if (typeof c.onValidate === 'function') {
        try {
          c.onValidate();
        } catch (e) {
          Debug.exception(e, c);
        }
      }
      if (c.gameObject) c.gameObject.componentsVersion++;
    }
    this.changed();
  }

  // ---- motion FSM assets ----------------------------------------------------------------------------------------------
  /** Saves an edited MotionFsm (shared data replaced: Motions playing it pick the change up). */
  async saveFsm(path: string, data: MotionFsmData): Promise<void> {
    Assets.setFsm(path, data);
    this.emit('inspector');
    clearTimeout(this.fsmTimers.get(path));
    this.fsmTimers.set(
      path,
      window.setTimeout(() => void this.write(path, data), 250),
    );
  }
  private fsmTimers = new Map<string, number>();

  async createFsm(dir = this.assetFolder): Promise<string> {
    const p = this.freeAssetPath(dir, 'NewMotion', '.fsm.json');
    await this.write(p, emptyFsm());
    await this.refreshFiles();
    await this.selectAsset(p);
    return p;
  }

  /** Clip names of every loaded model with a Motion in the scene (FSM editor suggestions). */
  knownClips(): string[] {
    const s = new Set<string>();
    for (const m of this.scene.findComponents(Motion)) for (const c of m.clipNames) s.add(c);
    return [...s].sort();
  }
  /** Copies Inspector transform edits (undo already recorded by the caller). */
  transformChanged(go: GameObject): void {
    go.transform.markDirty();
    this.changed();
  }

  // ---- play mode --------------------------------------------------------------------------------------------------------
  play(): void {
    if (this.prefabMode) return Debug.warn('Back to the scene to play (prefab mode)');
    if (this.mode === 'pause') {
      this.mode = 'play';
      this.emit('mode');
      return;
    }
    if (this.mode !== 'edit') return;
    this.playSnapshot = serializeScene(this.scene, INLINE);
    this.playScenePath = this.scene.path;
    this.playSceneName = this.scene.name;
    Application._reset();
    if (this.gameElement) Input.attach(this.gameElement);
    SceneManager._setActive(this.scene);
    this.mode = 'play';
    this.scene.begin();
    this.emit('mode', 'inspector');
  }
  private playScenePath: string | null = null;
  private playSceneName = '';

  /** SceneManager.load while playing: the current scene ends and the loaded one plays; Stop returns to the edited scene. */
  private async loadSceneInPlay(path: string): Promise<Scene> {
    if (this.mode === 'edit') {
      await this.openScene(path);
      return this.scene;
    }
    const next = await loadScene(path);
    const keep = this.scene._takePersistent();
    this.scene.end();
    this.scene = next;
    SceneManager._setActive(next);
    this.selection = [];
    Application._reset();
    next.begin();
    SceneManager._carry(keep, next);
    this.emit('scene', 'selection', 'inspector');
    return next;
  }
  pause(): void {
    if (this.mode === 'play') this.mode = 'pause';
    else if (this.mode === 'pause') this.mode = 'play';
    this.emit('mode');
  }
  /** One frame while paused. */
  stepFrame(): void {
    if (this.mode === 'edit') this.play();
    this.mode = 'pause';
    this.scene.step(1 / 60);
    this.emit('mode', 'inspector');
  }
  stop(): void {
    if (this.mode === 'edit') return;
    this.scene.end();
    Input.detach();
    const snap = this.playSnapshot;
    this.playSnapshot = null;
    this.mode = 'edit';
    if (snap) {
      const s = deserializeScene(snap, this.playSceneName || this.scene.name);
      s.path = this.playScenePath;
      this.setScene(s, false);
    }
    this.emit('mode', 'scene', 'inspector');
  }

  // ---- assets -----------------------------------------------------------------------------------------------------------
  /** Folder shown in the Asset Browser (new assets go there). */
  assetFolder = 'Assets';
  currentFolder(): string {
    return this.assetFolder;
  }
  setAssetFolder(path: string): void {
    this.assetFolder = path;
    this.emit('files');
  }

  private freeAssetPath(dir: string, base: string, ext: string): string {
    const taken = new Set(this.files.map((f) => f.path));
    for (let i = 0; ; i++) {
      const p = `${dir}/${base}${i ? `_${i}` : ''}${ext}`;
      if (!taken.has(p)) return p;
    }
  }

  async createAssetFolder(dir = this.assetFolder): Promise<string> {
    const p = this.freeAssetPath(dir, 'NewFolder', '');
    await api.mkdir(p);
    await this.refreshFiles();
    return p;
  }

  async createScript(dir = this.assetFolder, name = 'NewBehavior'): Promise<string> {
    const cls = name.replace(/[^A-Za-z0-9_]/g, '') || 'NewBehavior';
    const p = this.freeAssetPath(dir, cls, '.ts');
    const finalName = p.slice(p.lastIndexOf('/') + 1, -3);
    const src = `import { Application, Behavior, field } from '@rs/core';

export class ${finalName} extends Behavior {
  @field({ min: 0 }) speed = 1;

  start(): void {}

  update(): void {
    // this.transform.rotate(0, this.speed * 90 * Application.deltaTime, 0);
    void Application.deltaTime;
  }
}
`;
    await api.write(p, src);
    await this.refreshFiles();
    return p;
  }

  async createUserData(type: string, dir = this.assetFolder): Promise<string | null> {
    const t = Types.get(type);
    if (!t || t.kind !== 'userdata') return null;
    const u = new (t.ctor as new () => UserData)();
    const p = this.freeAssetPath(dir, type === 'Material' ? 'NewMaterial' : type, userDataExt(type));
    await this.write(p, serializeUserData(u));
    await this.refreshFiles();
    await this.selectAsset(p);
    return p;
  }

  async createSceneAsset(dir = this.assetFolder): Promise<string> {
    const p = this.freeAssetPath(dir, 'NewScene', '.scn.json');
    await this.write(p, { format: 1, root: { name: 'Root', folders: [], gameObjects: [] } });
    await this.refreshFiles();
    return p;
  }

  /** Saves a GameObject subtree as a prefab file (RE: drag an object into the Asset Browser); the object becomes its instance. */
  async createPrefab(go: GameObject, dir = this.assetFolder): Promise<string> {
    const p = this.freeAssetPath(dir, go.name.replace(/[\\/:*?"<>|]/g, '_'), '.pfb.json');
    this.recordUndo('Create Prefab');
    if (go.prefab || go._prefabId !== null) unpackInstance(go); // the object itself becomes the new prefab's root
    // prefab instances inside stay nested prefabs (written compactly); file ids = the scene ids
    const data: PrefabJson = { format: 1, gameObject: serializePrefabTree(go) };
    await this.write(p, data);
    const sceneJson = serializeScene(this.scene, INLINE);
    Assets.prefabRef(p).data = data;
    // the object becomes a clean instance of the new prefab (same scene ids)
    const node = findObjectJson(sceneJson, go.id);
    if (node) {
      const ids: Record<string, number> = {};
      const walk = (n: GameObjectJson) => ((ids[n.id] = n.id), n.children.forEach(walk));
      walk(canonicalPrefab(data));
      Object.assign(node, { components: [], children: [], prefab: p, overrides: { ids } });
      this.rebuildScene(sceneJson);
    }
    this.changed(true);
    await this.refreshFiles();
    Debug.log(`Prefab ${p} created`);
    return p;
  }

  // ---- prefab mode / instances ------------------------------------------------------------------------------------------
  /** Editing a prefab file in isolation (RE / Unity prefab mode); `back` = the scene to return to. */
  prefabMode: { path: string; back: { json: SceneJson; path: string | null; name: string; dirty: boolean; selection: number[]; undo: UndoEntry[]; redo: UndoEntry[] } | null } | null = null;

  /** Opens a prefab for editing (Save writes the file; Back returns to the scene, whose instances pick up the change). */
  async openPrefab(path: string): Promise<void> {
    if (this.mode !== 'edit') this.stop();
    if (this.prefabMode && !(await this.closePrefab())) return;
    const pf = await Assets.loadPrefab(path);
    if (!pf?.data) return;
    const back = { json: serializeScene(this.scene, INLINE), path: this.scene.path, name: this.scene.name, dirty: this.dirty, selection: [...this.selection], undo: this.undoStack, redo: this.redoStack };
    const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.pfb\.json$/, '');
    const s = new Scene(name);
    const ctx = newReadContext(true, s);
    const root = deserializeGameObject({ ...pf.data.gameObject, prefab: undefined, overrides: undefined }, ctx);
    resolveReferences(ctx);
    s.root.add(root);
    s.path = path;
    this.prefabMode = { path, back };
    this.setScene(s, true);
    this.setDirty(false);
    this.select([root.id]);
    this.emit('mode');
  }

  /** Writes the prefab being edited (its first root object). */
  async savePrefab(): Promise<void> {
    const pm = this.prefabMode;
    if (!pm) return;
    const roots = this.scene.allGameObjects().filter((g) => !g.parent);
    if (!roots.length) return Debug.warn('A prefab needs one root object');
    if (roots.length > 1) Debug.warn(`Only '${roots[0].name}' is saved: a prefab has one root object`);
    const data: PrefabJson = { format: 1, gameObject: serializePrefabTree(roots[0]) };
    await this.write(pm.path, data);
    Assets.prefabRef(pm.path).data = data;
    this.setDirty(false);
    Debug.log(`Saved ${pm.path}`);
  }

  /** Leaves prefab mode (asks about unsaved changes); returns false when cancelled. */
  async closePrefab(): Promise<boolean> {
    const pm = this.prefabMode;
    if (!pm) return true;
    if (this.dirty) {
      if (confirm(`Save the changes to ${pm.path}?`)) await this.savePrefab();
      else if (!confirm('Discard the changes to the prefab?')) return false;
    }
    this.prefabMode = null;
    const b = pm.back;
    if (b) {
      const s = deserializeScene(b.json, b.name);
      s.path = b.path;
      this.setScene(s, true);
      this.undoStack = b.undo;
      this.redoStack = b.redo;
      this.selection = b.selection.filter((id) => !!s.findById(id));
      this.setDirty(b.dirty);
    } else this.newScene(true);
    this.emit('mode', 'selection', 'inspector');
    return true;
  }

  /** The instance root an object belongs to (itself, or the nearest ancestor that is an instance root), or null. */
  prefabRootOf(go: GameObject): GameObject | null {
    for (let g: GameObject | null = go; g; g = g.parent) {
      if (g.prefab) return g;
      if (g._prefabId === null) return null;
    }
    return null;
  }

  /** Whether an instance differs from its prefab. */
  hasOverrides(go: GameObject): boolean {
    const j = serializeGameObject(go);
    const o = j.overrides;
    return !!o && !!(o.objects || o.addedComps || o.removedComps || o.added || o.removed);
  }

  /** Writes an instance (with its overrides) into its prefab: every instance gets the change. */
  async applyPrefab(go: GameObject): Promise<void> {
    const path = go.prefab;
    const pf = path ? Assets.getPrefab(path) : null;
    if (!path || !pf?.data) return;
    this.recordUndo('Apply Prefab');
    const sceneJson = serializeScene(this.scene, INLINE);
    // the instance in the prefab's id space: its own objects keep their prefab ids, added ones get new ones
    let maxPid = 0;
    const visit = (n: GameObjectJson) => ((maxPid = Math.max(maxPid, n.id)), n.children.forEach(visit));
    visit(canonicalPrefab(pf.data));
    const pidOf = new Map<number, number>();
    const assign = (g: GameObject, owned: boolean) => {
      const mine = owned && g._prefabId !== null && (g === go || !g.prefab);
      pidOf.set(g.id, mine ? g._prefabId! : ++maxPid);
      for (const c of g.children) if (!c.destroyed) assign(c, mine);
    };
    assign(go, true);
    // nested prefabs stay compact instances; then every id moves into the prefab's id space
    const tree = serializePrefabTree(go);
    remapJsonIds(tree, pidOf);
    const data: PrefabJson = { format: 1, gameObject: tree };
    await this.write(path, data);
    // this instance becomes a clean instance of the new data (same scene ids)
    const node = findObjectJson(sceneJson, go.id);
    if (node) {
      const ids: Record<string, number> = {};
      for (const [sid, pid] of pidOf) ids[pid] = sid;
      Object.assign(node, { components: [], children: [], prefab: path, overrides: { ids } });
    }
    Assets.prefabRef(path).data = data;
    this.rebuildScene(sceneJson);
    this.setDirty(true);
    Debug.log(`Applied ${go.name} to ${path}`);
  }

  /** Drops an instance's overrides (keeps its root name / position). */
  revertPrefab(go: GameObject): void {
    if (!go.prefab) return;
    this.recordUndo('Revert Prefab');
    const sceneJson = serializeScene(this.scene, INLINE);
    const node = findObjectJson(sceneJson, go.id);
    if (node?.overrides) node.overrides = { ids: node.overrides.ids };
    this.rebuildScene(sceneJson);
    this.setDirty(true);
  }

  /** Makes an instance a plain object tree. */
  unpackPrefab(go: GameObject): void {
    if (!go.prefab) return;
    this.recordUndo('Unpack Prefab');
    unpackInstance(go);
    this.changed(true);
  }

  /** A prefab file changed on disk: instances in the open scene take the new data and keep their overrides. */
  private async prefabFileChanged(path: string): Promise<void> {
    if (this.prefabMode?.path === path) return Debug.warn(`${path} changed on disk while you edit it`);
    const used = this.scene.allGameObjects().some((g) => !!g.prefab); // any instance: prefabs can nest this one
    if (!used || this.mode !== 'edit') {
      await Assets.reloadPrefab(path); // play: Stop rebuilds the scene from its (compact) snapshot with the new data
      return;
    }
    const json = serializeScene(this.scene, INLINE); // compared with the old data
    await Assets.reloadPrefab(path);
    this.rebuildScene(json);
    Debug.log(`${path} changed: instances updated`);
  }

  /** Rebuilds the open scene from JSON (same path / selection; undo history kept). */
  private rebuildScene(json: SceneJson): void {
    const s = deserializeScene(json, this.scene.name);
    s.path = this.scene.path;
    this.setScene(s, false);
  }

  async instantiatePrefab(path: string, where: Folder | GameObject | null = null, position?: Vector3): Promise<GameObject | null> {
    const p = await Assets.loadPrefab(path);
    if (!p) return null;
    this.recordUndo('Instantiate Prefab');
    const go = p.instantiate(position ?? this.spawnPoint(), where ?? this.targetFolder(), this.scene);
    go.name = this.uniqueName(go.name, (go.parent ? go.parent.children : (go.folder ?? this.scene.root).gameObjects).filter((g) => g !== go));
    this.select([go.id]);
    this.changed(true);
    return go;
  }

  private udTimers = new Map<UserData, number>();
  private saveUserDataSoon(u: UserData): void {
    clearTimeout(this.udTimers.get(u));
    this.udTimers.set(
      u,
      window.setTimeout(() => {
        if (u.path) void this.write(u.path, serializeUserData(u));
      }, 300),
    );
  }

  async renameAsset(from: string, newName: string): Promise<void> {
    const dir = from.slice(0, from.lastIndexOf('/'));
    const to = `${dir}/${newName}`;
    if (to === from) return;
    try {
      await api.rename(from, to);
      if (this.scene.path === from) this.scene.path = to;
      if (this.selectedAsset === from) this.selectedAsset = to;
      Assets.invalidate(from);
    } catch (e) {
      Debug.error((e as Error).message);
    }
    await this.refreshFiles();
  }

  async deleteAsset(path: string): Promise<void> {
    if (!confirm(`Delete ${path}?`)) return;
    await api.remove(path);
    Assets.invalidate(path);
    if (this.selectedAsset === path) await this.selectAsset(null);
    await this.refreshFiles();
  }

  /** Project Settings: applies the engine state (Physics / Input edited in the window) and writes rs.project.json. */
  async saveProjectSettings(patch: Partial<ProjectSettingsJson> = {}): Promise<void> {
    const next = ProjectSettings.capture({ ...this.projectSettings, ...patch });
    this.projectSettings = next;
    if (next.startScene) this.startScene = next.startScene;
    await this.write('rs.project.json', next);
    this.emit('inspector');
  }

  async buildGame(): Promise<void> {
    Debug.log('Building…');
    try {
      const r = await api.build();
      const total = r.files.reduce((n, f) => n + f.bytes, 0);
      Debug.log(`Built ${r.outDir} (${r.files.length} files, ${(total / 1024 / 1024).toFixed(2)} MB) in ${r.ms} ms`);
    } catch (e) {
      Debug.error(`Build failed: ${(e as Error).message}`);
    }
  }

  /** Component types for the Add Component menu. */
  componentTypes() {
    return Types.all('component').filter((t) => !t.options.hidden);
  }
  userDataTypes() {
    return Types.all('userdata');
  }
  fieldsOf(o: object) {
    return getFields(o.constructor);
  }
}

export function isAncestor(a: GameObject, b: GameObject): boolean {
  for (let p = b.parent; p; p = p.parent) if (p === a) return true;
  return false;
}

/** The JSON of an object (by id) inside scene JSON, also inside prefab instances' added children. */
export function findObjectJson(scene: SceneJson, id: number): GameObjectJson | null {
  const inObjects = (list: GameObjectJson[]): GameObjectJson | null => {
    for (const g of list) {
      if (g.id === id) return g;
      const r = inObjects(g.children ?? []) ?? inObjects(Object.values(g.overrides?.added ?? {}).flat());
      if (r) return r;
    }
    return null;
  };
  const inFolder = (f: SceneJson['root']): GameObjectJson | null => {
    const r = inObjects(f.gameObjects ?? []);
    if (r) return r;
    for (const sub of f.folders ?? []) {
      const x = inFolder(sub);
      if (x) return x;
    }
    return null;
  };
  return inFolder(scene.root);
}

export const editor = new Editor();
(window as unknown as { __rsEditor: Editor }).__rsEditor = editor;
