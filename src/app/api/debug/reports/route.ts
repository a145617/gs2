import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireDebug } from "@/server/http/debug";
import { sendTestReports } from "@/server/services/debug";

const schema = z.object({
  postId: z.uuid().optional(),
  count: z.number().int().min(1).max(10).default(3),
});

/** デバッグ: テスト用ユーザーから自分の投稿に通報を送る（自動非表示・管理画面での処理の確認用） */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireDebug(req);
  return json(await sendTestReports(viewer, schema.parse(await readJson(req))), { status: 201 });
});
