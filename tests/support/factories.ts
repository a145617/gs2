import sharp from "sharp";
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

/** テスト用の画像（単色・指定サイズのJPEG） */
export async function makeImage(color = "#3366cc", width = 800, height = 600, opts: { exif?: boolean } = {}) {
  let img = sharp({ create: { width, height, channels: 3, background: color } }).jpeg({ quality: 85 });
  if (opts.exif) {
    img = img.withExif({ IFD0: { Make: "TestMaker", Model: "TestCam", Software: "secret-software" } });
  }
  return img.toBuffer();
}
