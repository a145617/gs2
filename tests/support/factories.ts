import sharp from "sharp";
import { demoPhotoById, requireDemoPhoto } from "@/server/debug/demo-photos";
import { deltaE2000, hexToLab } from "@/lib/color";
import { createUser } from "@/server/services/users";
import type { ViewerCtx } from "@/server/services/posts";

let n = 0;

/** テスト用ユーザーを作る */
export async function makeUser(name = "ユーザー", role: "user" | "admin" = "user") {
  n++;
  const u = await createUser({
    email: `user${n}-${Date.now()}@example.com`,
    password: "password1",
    displayName: `${name}${n}`,
    role,
  });
  const viewer: ViewerCtx = { id: u.id, role: u.role };
  return { ...u, viewer };
}

/**
 * テストで投稿に使う写真（Unsplash の写真、assets/demo-photos）。色ごとに代表的な1枚を決めておき、
 * 指定の色にいちばん近い写真を選ぶ（例: 黒→星空、赤→赤い花、青→入道雲）。
 */
const TEST_PHOTO_IDS = [
  "Cq5NaI0yKBE", // 満天の星（黒）
  "TapDWPQUsQY", // 赤の中の一輪（赤）
  "gJILnne_HFg", // 夏の入道雲（青）
  "6ArTTluciuA", // 水平線（青灰）
  "5lRxNLHfZOY", // ひまわり一輪（白・黄）
  "aL7SA1ASVdQ", // 霧の森（緑）
  "nD9tEn63suc", // ラベンダー畑（紫）
  "A4BBdJQu2co", // オレンジの山（橙）
];

function testPhotoFor(color: string) {
  const target = hexToLab(color);
  const candidates = TEST_PHOTO_IDS.map((id) => demoPhotoById(id)!);
  return candidates.reduce((best, p) => (deltaE2000(hexToLab(p.hex), target) < deltaE2000(hexToLab(best.hex), target) ? p : best));
}

/** テスト用の画像（指定の色に近い Unsplash の写真を、指定の大きさの JPEG にしたもの） */
export async function makeImage(color = "#3366cc", width = 800, height = 600, opts: { exif?: boolean } = {}) {
  const photo = testPhotoFor(color);
  let img = sharp(await requireDemoPhoto(photo)).resize(width, height, { fit: "cover" }).jpeg({ quality: 85 });
  if (opts.exif) {
    img = img.withExif({ IFD0: { Make: "TestMaker", Model: "TestCam", Software: "secret-software" } });
  }
  return img.toBuffer();
}
