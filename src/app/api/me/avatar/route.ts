import type { NextRequest } from "next/server";
import { route, json, tooMany } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { readImageFile } from "@/server/images";
import { hitRateLimit } from "@/server/rate-limit";
import { removeAvatar, setAvatar, toMe } from "@/server/services/users";

export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const limit = await hitRateLimit(`avatar:${viewer.id}`, 30, 60 * 60);
  if (!limit.ok) throw tooMany(limit.retryAfterSec);
  const image = await readImageFile(await req.formData(), "image", 8 * 1024 * 1024);
  const user = await setAvatar(viewer.id, image);
  return json({ user: toMe(user) });
});

export const DELETE = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const user = await removeAvatar(viewer.id);
  return json({ user: toMe(user) });
});
