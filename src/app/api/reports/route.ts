import type { NextRequest } from "next/server";
import { route, json, readJson, tooMany } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { hitRateLimit } from "@/server/rate-limit";
import { createReport } from "@/server/services/moderation";
import { reportSchema } from "@/lib/moderation";

/** 不適切な投稿・コメント・ユーザーを通報する */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const limit = await hitRateLimit(`report:${viewer.id}`, 30, 60 * 60);
  if (!limit.ok) throw tooMany(limit.retryAfterSec);
  const input = reportSchema.parse(await readJson(req));
  const { autoHidden } = await createReport(viewer, input);
  return json({ ok: true, autoHidden }, { status: 201 });
});
