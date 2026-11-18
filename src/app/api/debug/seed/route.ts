import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson, badRequest } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireDebug } from "@/server/http/debug";
import { now } from "@/server/clock";
import { purgeTestData, seedDemoData } from "@/server/services/debug";

const schema = z.object({
  users: z.number().int().min(1).max(12).default(6),
  postsPerUser: z.number().int().min(1).max(4).default(2),
});

/** デバッグ: テスト用ユーザーと、その投稿・いいね・コメント・フォローを作る */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireDebug(req);
  const input = schema.parse(await readJson(req));
  return json(await seedDemoData(viewer, input, await now()), { status: 201 });
});

/** デバッグ: テスト用ユーザーと、そのデータをすべて削除する */
export const DELETE = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireDebug(req);
  if (viewer.isTestUser || viewer.session.impersonatorId) {
    throw badRequest("テスト用ユーザーとして操作中は削除できません。先に元のアカウントに戻ってください");
  }
  return json(await purgeTestData());
});
