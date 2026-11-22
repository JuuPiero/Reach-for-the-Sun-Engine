# RS Engine (Reach for the Sun)

Game engine chạy trên web, viết bằng TypeScript, quy trình làm việc theo phong cách RE Engine: scene là cây **Folder** chứa
**GameObject**, script là component `rs.Behavior`, dữ liệu tinh chỉnh là **UserData** (`.user.json`), prefab là `.pfb.json`,
scene là `.scn.json`. Hình ảnh vẽ bằng **Babylon.js 9**. Editor chạy trên trình duyệt với bố cục quen thuộc: Hierarchies,
Macro Shelf, Runtime view, Inspector (Global / Local), AssetBrowser, Console.

## Bắt đầu

```powershell
npm install
node scripts/rs.mjs editor examples/Demo     # mở editor cho project mẫu (http://localhost:5180)
node scripts/rs.mjs build examples/Demo      # build game web → examples/Demo/Build/Web
node scripts/rs.mjs create D:\Games\MyGame   # tạo project mới (chép từ examples/Demo)
```

Project gồm `rs.project.json` (`name`, `startScene`) và thư mục `Assets/` (scene, script, prefab, UserData, model `.glb`,
texture `.png/.jpg`). Mọi tham chiếu tới asset đều là **đường dẫn trong project** (`Assets/UserData/PlayerParam.user.json`).

## Khái niệm

- **GameObject**: tên, tag, Transform (vị trí / xoay / scale cục bộ, cha – con) và danh sách component. Hai cờ như RE:
  **Update Self** (component có chạy không) và **Draw Self** (có vẽ không).
- **Folder**: nhóm GameObject trong scene; tắt folder là tắt (không chạy, không vẽ) mọi thứ bên trong.
- **Component dựng sẵn**: Mesh (Box / Sphere / Cylinder / Capsule / Plane / Ground / Torus hoặc model glTF; màu, texture,
  tiling, emissive, specular, đổ bóng / nhận bóng), Camera (FOV, near / far, màu nền, Main), DirectionalLight (có bóng),
  PointLight, SpotLight, AmbientLight (ánh sáng bầu trời / mặt đất).
- **Script** (`Assets/**/*.ts`): mỗi class export kế thừa `Behavior` thành một component (menu Add Component ▸ Scripts).
  Vòng đời: `awake` (khi tạo) → `start` (trước update đầu tiên) → `update` → `lateUpdate` mỗi frame → `onDestroy`.
  Field public kiểu số / chuỗi / bool / `Vector3` / `Color3` tự hiện trong Inspector và được lưu; `@field({...})` thêm thông tin
  (khoảng giá trị, enum, header, tham chiếu `userdata` / `prefab` / `gameobject` / `asset`).

```ts
import { Application, Behavior, Input, field, type Prefab } from '@rs/core';
import type { PlayerParam } from './PlayerParam';

export class Player extends Behavior {
  @field({ type: 'userdata', userDataType: 'PlayerParam' }) param: PlayerParam | null = null;
  @field({ type: 'prefab' }) bullet: Prefab | null = null;

  update(): void {
    const speed = this.param?.moveSpeed ?? 5;
    this.transform.translate(Input.axis('KeyA', 'KeyD') * speed * Application.deltaTime, 0, 0);
    if (Input.getKeyDown('Space')) this.bullet?.instantiate(this.transform.position);
  }
}
```

- **UserData**: class export kế thừa `UserData` (ví dụ `PlayerParam` với `moveSpeed`, `jumpHeight`); tạo file trong AssetBrowser
  (Create ▸ UserData ▸ PlayerParam), chỉnh trong Inspector (tự lưu), gán vào field của component. Mọi component dùng chung
  một bản của mỗi file.
- **Prefab**: kéo một GameObject từ Hierarchies vào AssetBrowser để tạo `.pfb.json`; kéo prefab vào Hierarchies / Runtime
  view để đặt; trong script gọi `prefab.instantiate(vịTrí, folder)`.
- API khác: `Application.deltaTime / time / timeScale`, `Input.getKey / getKeyDown / axis / mouseX…`, `Debug.log / warn / error`
  (hiện ở Console), `this.scene.find('Tên')`, `findWithTag`, `findComponents`, `gameObject.destroy()`.

## Vật lý (Rapier)

- **Collider** (Box / Sphere / Capsule / Cylinder; Center, Size, Radius, Height, Is Trigger, Friction, Restitution): không có
  RigidBody thì là vật tĩnh; collider ở object con của một RigidBody thuộc về body đó (ghép nhiều hình).
- **RigidBody**: Dynamic (mô phỏng) / Kinematic (đi theo Transform — ví dụ khối xoay bằng script vẫn đẩy được vật khác) /
  Static; Mass, Damping, Use Gravity, CCD, khoá xoay theo trục. Script: `velocity`, `addForce`, `addImpulse`, `addTorque`,
  `syncFromTransform()` (sau khi tự dời vật).
- **CharacterController**: capsule di chuyển bằng `move(dịchChuyển)` — trượt theo tường, tự bước lên bậc (Step Offset), không
  leo dốc quá Slope Limit, bám đất; `isGrounded`, `velocity`.
- Callback trên Behavior: `onCollisionEnter / onCollisionExit(collision)` (object kia, điểm, pháp tuyến),
  `onTriggerEnter / onTriggerExit(object)`, `fixedUpdate()` (mỗi bước vật lý, 60 lần / giây).
- Truy vấn: `Physics.raycast(gốc, hướng, khoảngCách, { ignore, triggers })`, `Physics.overlapSphere(tâm, bánKính)`, `Physics.gravity`.
- Bản build chỉ kèm Rapier khi project dùng vật lý (scene / prefab / script nhắc tới Collider, RigidBody, CharacterController
  hoặc Physics). Runtime view vẽ khung dây collider của object đang chọn (xanh lá = vật cản, vàng = trigger); nút **Colliders**
  để hiện tất cả.

## Motion (animation)

- **Motion** (đặt cùng object có Mesh dạng Model `.glb`/`.gltf`): phát các clip animation của model, chuyển clip có làm mờ
  (Cross Fade), Speed, Loop. Ô **Clip** là danh sách clip đọc từ model. Bật **Update In Edit** để xem animation ngay trong editor.
- **MotionFsm** (`.fsm.json`, tạo bằng Create ▸ Motion FSM): máy trạng thái — Parameters (float / bool / trigger), States (tên,
  clip, speed, loop), Transitions (từ state / Any State → state, điều kiện theo tham số, Exit Time, thời gian chuyển). Chỉnh trực
  tiếp trong Inspector, tự lưu, object đang chạy nhận thay đổi ngay. Script điều khiển: `motion.setFloat('speed', v)`,
  `setBool('grounded', true)`, `setTrigger('jump')`, `play('Run', 0.2)`, đọc `state`, `currentClip`, `normalizedTime`.
- Demo: robot (model sinh bởi `node scripts/gen-demo-assets.mjs`) có các clip Idle / Walk / Run / Jump; WASD để đi, Shift để
  chạy, Space để nhảy; thùng gỗ / bóng là vật Dynamic, cầu thang và dốc là vật tĩnh, coin là trigger.

## Editor

- **Hierarchies**: cây Folder / GameObject (folder chữ xanh đậm, object chữ nghiêng), hai nút bật/tắt Update / Draw ở đầu mỗi
  dòng, mũi tên mở / đóng, tìm kiếm. Kéo thả để đổi cha / đổi folder / sắp xếp (thả vào giữa dòng = làm con, mép trên / dưới =
  chèn trước / sau), F2 hoặc double-click để đổi tên, chuột phải: Create, Rename, Duplicate, Create Prefab, Unparent, Delete.
- **Macro Shelf**: các tab Primitive / Light / Level / UI / Audio / Asset với nút tạo nhanh (Cube, Sphere, Floor, đèn, camera, folder, Text, Button, Sound, script…).
- **Runtime view**: camera editor — giữ chuột phải để nhìn + W/A/S/D/Q/E để bay (lăn chuột khi đang giữ để đổi tốc độ, Shift
  để nhanh), chuột giữa để kéo ngang, lăn chuột để tiến / lùi, Alt + chuột trái để xoay quanh, F để nhìn vào object đang chọn.
  Click để chọn (Ctrl / Shift để chọn thêm), gizmo Move / Rotate / Scale (W / E / R), Local / Global, lưới, viền cam cho object
  đang chọn, icon cho đèn / camera. Thả prefab / model `.glb` từ AssetBrowser vào view để đặt tại điểm chuột.
  View: Default (edit = camera editor, play = camera game) / Editor Camera / Game Camera.
- **Inspector**: tên, tag, Update / Draw, **Add Component**, Transform **Global** (Position / Rotation / Scale) và **Local**,
  từng component có checkbox bật / tắt, nút xoá, các field (kéo nhãn X/Y/Z để thay đổi nhanh, phím ↑ / ↓ tăng giảm, gõ biểu
  thức `2*3`). Chọn asset trong AssetBrowser: UserData chỉnh trực tiếp, scene (Open), prefab (Add to Scene), script (các class
  định nghĩa, Open in VS Code), texture (xem trước).
- **AssetBrowser**: cây thư mục + Favorites, breadcrumb, ô asset có icon màu theo loại (Scene tím, Prefab xanh dương, UserData
  hồng, Script xanh lá, Model, Texture có ảnh thu nhỏ). Create ▸ Folder / Scene / Script / UserData, F2 đổi tên, Del xoá,
  double-click mở (thư mục, scene, script trong VS Code), kéo ô vào thư mục để di chuyển.
- **Play** (Ctrl+P) / Pause / Step / Stop: game chạy ngay trong Runtime view; Stop trả scene về như trước khi Play (giống RE,
  thay đổi trong lúc chơi không được giữ). Undo / Redo (Ctrl+Z / Ctrl+Y), Duplicate (Ctrl+D), Save (Ctrl+S).
- **Live coding**: sửa / thêm script là editor nạp lại ngay, component trong scene dùng class mới mà không mất dữ liệu. Script
  lỗi / bị xoá: component thành "missing script" nhưng dữ liệu vẫn được giữ và lưu lại.
- File ▸ **Build Game (Web)**: build ngay từ editor, kết quả ghi ở Console.

- **Chọn nhiều object**: sửa Transform chỉ áp trục vừa đổi cho tất cả (giữ nguyên các trục khác), sửa field của component có ở
  mọi object đã chọn; một lần Undo hoàn tác cả nhóm.
- Scene đang mở bị sửa từ ngoài (editor khác, git…): tự nạp lại nếu chưa có thay đổi chưa lưu, nếu có thì Console cảnh báo
  (File ▸ Reload Scene để lấy bản trên đĩa).
- Giao diện tông đen + cam, mọi control (menu, ô chọn, checkbox, thanh trượt, ô màu, ô số X/Y/Z) đều tự vẽ.

## Âm thanh

- **AudioSource** (Add Component ▸ Audio): `clip` (wav / mp3 / ogg trong Assets), volume, pitch, loop, Play On Start, Spatial
  (âm 3D, nhỏ dần theo khoảng cách minDistance → maxDistance tính từ AudioListener). Script: `play()`, `stop()`, `pause()`,
  `isPlaying`, `playOneShot(path, volume)` (hiệu ứng ngắn, nhiều cái chồng nhau được).
- **AudioListener**: "tai" của game, thường gắn vào camera (Create ▸ Camera và scene mới tự thêm).
- `AudioEngine.masterVolume`, `AudioEngine.muted`. Trình duyệt chỉ cho phát tiếng sau lần bấm phím / chuột đầu tiên — engine tự
  mở khoá khi đó.

## UI trong game

Component UI (Add Component ▸ UI hoặc tab **UI / Audio** của Macro Shelf) vẽ đè lên game bằng HTML, theo độ phân giải tham chiếu
cao 720 px (tự co giãn theo khung):
- Mọi UI có **Anchor** (TopLeft … BottomRight, Center, Stretch), X / Y (Y hướng lên; Stretch: X / Y = lề), Width / Height,
  Opacity. Object UI con nằm trong khung của object UI cha (tạo UI khi đang chọn một object UI là tạo con của nó).
- **UIText** (text, cỡ chữ, màu, đậm, căn lề, đổ bóng), **UIImage** (ảnh + màu), **UIPanel** (nền, độ trong, bo góc, viền),
  **UIButton** (chữ, màu thường / hover, `interactable`; On Click: chọn object + tên hàm, hoặc trong script
  `button.onClick(() => …)`).
- Ẩn / hiện một menu: `go.active = false / true` (tắt cả Update và Draw).
- Trong editor: UI hiện cả lúc edit (nút **UI** trên thanh Runtime để ẩn), click vào UI để chọn object; nút chỉ bấm được khi Play.

## Scene, thời gian, tween

- `SceneManager.load('Assets/Scenes/Level2.scn.json')`: chuyển scene khi đang chơi (scene cũ kết thúc, scene mới bắt đầu). Trong
  editor, Stop quay về scene đang chỉnh. `SceneManager.active`, `SceneManager.onActiveChanged(fn)`.
- `Application.timeScale` (0 = dừng game, ví dụ menu pause), `Application.unscaledDeltaTime`.
- Hẹn giờ trong component: `await this.wait(1.5)` (theo thời gian game, dừng khi pause), `this.invoke(() => …, 2)`. Hẹn giờ bị
  huỷ khi scene kết thúc.
- `Tween.to(target, { field: value, … }, duration, { ease: Ease.outBack, delay, repeat: -1, yoyo: true, onComplete })`: tween số,
  Vector3, Color3 của bất kỳ object nào (`Tween.to(transform, { localPosition: new Vector3(0, 3, 0) }, 1)`), `tween.kill()`,
  `await tween.finished`, `Tween.killTweensOf(target)`.
- `SaveData.setNumber('best', 10)`, `getNumber`, `setString` / `getString`, `setObject` / `getObject`, `has`, `delete`, `clear`
  (lưu trong trình duyệt, riêng cho từng project).

## Input bổ sung

- Tay cầm: `Input.getButton('A')` / `getButtonDown` / `getButtonUp` (A, B, X, Y, LB, RB, LT, RT, Back, Start, LS, RS, Up, Down,
  Left, Right, Home), `Input.getAxis('LeftX' | 'LeftY' | 'RightX' | 'RightY' | 'LT' | 'RT')`, `Input.gamepadConnected`,
  `Input.deadZone`.
- Khoá chuột (game góc nhìn thứ nhất): `Input.lockCursor(true)` hoặc `Input.lockOnClick = true`; `Input.cursorLocked`.
- Camera: `Camera.main`, `camera.screenPointToRay(Input.mouseX, Input.mouseY)` (kết hợp `Physics.raycast` để click chọn vật),
  `camera.worldToScreenPoint(p)` (đặt UI theo vị trí 3D).

## Material

- AssetBrowser ▸ Create ▸ **Material** (hoặc Macro Shelf ▸ Effects ▸ Material) tạo file `.mat.json`. Chọn file để chỉnh trong
  Inspector: màu, texture, Metallic, Roughness, Normal Map (+ độ mạnh), Tiling, Emission (màu, cường độ, texture), Blend (Opaque /
  Cutout / Transparent / Additive), Opacity, Alpha Cutoff, Unlit, Double Sided. Sửa là mọi object dùng material đó đổi ngay.
- Gán cho Mesh qua field **Material** (hoặc kéo file material thả lên object trong Runtime view). Khi có material, các field màu /
  texture riêng của Mesh được ẩn; với model `.glb`, material thay cho material gốc của model (bỏ chọn là trở lại như cũ).
- Script: `mesh.material.color = new Color3(1, 0, 0)` đổi màu cho mọi object dùng chung material đó.

## Environment (trời, sương mù, hậu kỳ)

Component **Environment** (Macro Shelf ▸ Effects ▸ Environ., mỗi scene một cái):
- Sky: Camera Color (màu nền của camera), Gradient (Top / Horizon / Bottom), Texture (ảnh 360° equirectangular), Sky Intensity.
- Fog: None / Linear (Start, End) / Exponential (Density), Fog Color — nên đặt cùng màu với Horizon.
- Image: Tone Mapping (None / Standard / ACES), Exposure, Contrast, Vignette.
- Post Processing: Bloom (Threshold, Weight), FXAA (khử răng cưa).

## Particle

Component **ParticleSystem** (Macro Shelf ▸ Effects ▸ Particles): Emission (Play On Start, Loop, Duration, Rate / giây, Burst lúc bắt
đầu mỗi chu kỳ, Max Particles), Particle (Lifetime, Speed, Size min–max, End Size, màu + alpha đầu / cuối, Gravity, Spin), Shape
(Point, Sphere, Hemisphere, Cone — hướng lên trục Y của object, Box), Rendering (texture — để trống là chấm tròn mờ, Additive / Alpha,
Local Space). Trong editor particle chạy thử luôn khi edit (tắt bằng **Simulate In Edit**). Script: `ps.play()`, `ps.stop(clear)`,
`ps.emit(30)` (bắn một loạt), `ps.isPlaying`, `ps.particleCount`.

## Vẽ debug

`Debug.drawLine(a, b, color?, duration?)`, `Debug.drawRay(origin, dir, …)`, `Debug.drawBox(center, size, …)`,
`Debug.drawSphere(center, radius, …)`: đường kẻ vẽ đè lên scene (duration 0 = chỉ frame này, gọi mỗi frame). Editor luôn vẽ; game
build chỉ vẽ khi `Debug.showLines = true`.

## Demo

`examples/Demo`: scene **Main** (robot nhặt coin, HUD đếm coin + thời gian + kỷ lục lưu bằng SaveData, Esc / P mở menu pause với
nút Resume / Title Screen, nhạc nền + tiếng nhảy / nhặt coin, bầu trời gradient + sương mù, material cho sàn / thùng / coin vàng,
coin lấp lánh + hiệu ứng nổ hạt khi nhặt, tia debug hướng chạy trong editor) và scene **Title** (camera xoay, nút Start / phím
Enter). Âm thanh / texture do `scripts/gen-demo-sounds.mjs` / `scripts/gen-demo-textures.mjs` tạo ra.

## Giới hạn hiện tại (mốc 4)

Chưa có nhiều scene cùng lúc (additive), skinned mesh / root motion, layer va chạm; prefab chưa có override (đặt prefab = bản sao
có ghi nguồn). Material dùng ánh sáng Blinn-Phong (Metallic / Roughness được quy đổi, chưa có phản chiếu môi trường). Game dùng vật
lý nặng thêm ~3,5 MB (Rapier bản nhúng WASM).
