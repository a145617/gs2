import type { NextRequest } from "next/server";
import { route, json, readJson, tooMany } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { hitRateLimit } from "@/server/rate-limit";
import { changePassword } from "@/server/services/users";
import { passwordChangeSchema } from "@/lib/validation";

export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const limit = await hitRateLimit(`password:${viewer.id}`, 10, 15 * 60);
  if (!limit.ok) throw tooMany(limit.retryAfterSec);
  const input = passwordChangeSchema.parse(await readJson(req));
  await changePassword(viewer.id, input.currentPassword, input.newPassword);
  return json({ ok: true });
});
