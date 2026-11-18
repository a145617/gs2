import type { NextRequest } from "next/server";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireAdmin } from "@/server/http/viewer";
import { audit } from "@/server/services/admin";
import { addPoolEntry, listPool } from "@/server/services/themes";
import { themeInputSchema } from "@/lib/validation";

/** 毎朝5時の自動出題で使うお題の候補 */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req);
  const rows = await listPool();
  return json({
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      template: r.template,
      accent: r.accent,
      enabled: r.enabled,
      timesUsed: r.timesUsed,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    })),
  });
});

/** お題の候補を追加する */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const input = themeInputSchema.parse(await readJson(req));
  const row = await addPoolEntry(input);
  await audit(admin.id, "pool.add", "theme_pool", row.id, { title: row.title, template: row.template });
  return json({ id: row.id }, { status: 201 });
});
