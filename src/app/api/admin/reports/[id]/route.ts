import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireAdmin } from "@/server/http/viewer";
import { resolveReport } from "@/server/services/admin";

const schema = z.object({
  action: z.enum(["dismiss", "hide", "delete", "restore"]),
  note: z.string().trim().max(300, "メモは300文字以内にしてください").default(""),
});

/** 通報を処理する（問題なし / 非表示 / 削除 / 復元）。同じ対象への未対応の通報もまとめて閉じる */
export const POST = route(async (req: NextRequest, ctx: RouteContext<"/api/admin/reports/[id]">) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const { action, note } = schema.parse(await readJson(req));
  return json(await resolveReport(admin, id, action, note));
});
