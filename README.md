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

## Editor

- **Hierarchies**: cây Folder / GameObject (folder chữ xanh đậm, object chữ nghiêng), hai nút bật/tắt Update / Draw ở đầu mỗi
  dòng, mũi tên mở / đóng, tìm kiếm. Kéo thả để đổi cha / đổi folder / sắp xếp (thả vào giữa dòng = làm con, mép trên / dưới =
  chèn trước / sau), F2 hoặc double-click để đổi tên, chuột phải: Create, Rename, Duplicate, Create Prefab, Unparent, Delete.
- **Macro Shelf**: các tab Primitive / Light / Level / Asset với nút tạo nhanh (Cube, Sphere, Floor, đèn, camera, folder, script…).
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

## Giới hạn hiện tại (mốc 1)

Chưa có vật lý, animation (Motion / FSM), VFX, âm thanh, UI trong game, nhiều scene cùng lúc; prefab chưa có override (đặt
prefab = bản sao có ghi nguồn); chọn nhiều object chỉ chỉnh object đầu tiên trong Inspector.
