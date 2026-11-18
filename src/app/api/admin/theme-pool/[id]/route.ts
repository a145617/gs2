import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson, notFound } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireAdmin } from "@/server/http/viewer";
import { audit } from "@/server/services/admin";
import { setPoolEnabled } from "@/server/services/themes";

/** お題の候補を自動出題に使う・使わない */
export const PATCH = route(async (req: NextRequest, ctx: RouteContext<"/api/admin/theme-pool/[id]">) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound();
  const { enabled } = z.object({ enabled: z.boolean() }).parse(await readJson(req));
  await setPoolEnabled(id, enabled);
  await audit(admin.id, enabled ? "pool.enable" : "pool.disable", "theme_pool", id);
  return json({ ok: true });
});
