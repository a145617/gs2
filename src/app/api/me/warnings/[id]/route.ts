import type { NextRequest } from "next/server";
import { route, json, notFound } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { acknowledgeWarning } from "@/server/services/admin";

/** 警告の内容を確認した */
export const POST = route(async (req: NextRequest, ctx: RouteContext<"/api/me/warnings/[id]">) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound();
  await acknowledgeWarning(viewer.id, id);
  return json({ ok: true });
});
