import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { recordViews } from "@/server/services/views";

const schema = z.object({ postIds: z.array(z.string()).max(50) });

/** 投稿を見たことを記録する（閲覧数・おすすめの計算に使う） */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { postIds } = schema.parse(await readJson(req));
  const counted = await recordViews(viewer, postIds, await now());
  return json({ counted });
});
