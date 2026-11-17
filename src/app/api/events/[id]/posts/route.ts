import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, tooMany, badRequest } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { readImageFile } from "@/server/images";
import { hitRateLimit } from "@/server/rate-limit";
import { now } from "@/server/clock";
import { createEventPost, getEventRow } from "@/server/services/events";
import { listEventPosts } from "@/server/services/posts";
import { postCaptionSchema, postTagsSchema, postTitleSchema } from "@/lib/validation";
import { photoMetaSchema } from "@/lib/photo-meta";

type Ctx = RouteContext<"/api/events/[id]/posts">;

/** イベントに集まった写真 */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  await getEventRow(id);
  return json(await listEventPosts(viewer, id, await now(), req.nextUrl.searchParams.get("cursor")));
});

const fieldsSchema = z.object({
  title: postTitleSchema,
  caption: postCaptionSchema.default(""),
  tags: postTagsSchema.default(""),
  meta: photoMetaSchema,
});

/** 担当の色が写った写真を投稿して、ピクセルアートの1マスを埋める */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const limit = await hitRateLimit(`event-post:${viewer.id}`, 60, 60 * 60);
  if (!limit.ok) throw tooMany(limit.retryAfterSec);
  const { id } = await ctx.params;
  const form = await req.formData();
  let meta: unknown;
  try {
    meta = JSON.parse(String(form.get("meta") ?? "{}"));
  } catch {
    throw badRequest("撮影情報の形式が正しくありません");
  }
  const fields = fieldsSchema.parse({
    title: form.get("title") ?? "",
    caption: form.get("caption") ?? "",
    tags: form.get("tags") ?? "",
    meta,
  });
  const image = await readImageFile(form, "image", 12 * 1024 * 1024);
  return json(await createEventPost(viewer, id, fields, image, await now()), { status: 201 });
});
