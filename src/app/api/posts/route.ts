import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, tooMany, badRequest } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { readImageFile } from "@/server/images";
import { hitRateLimit } from "@/server/rate-limit";
import { now } from "@/server/clock";
import { createThemePost } from "@/server/services/posts";
import { postCaptionSchema, postTagsSchema, postTitleSchema } from "@/lib/validation";
import { photoMetaSchema } from "@/lib/photo-meta";

const fieldsSchema = z.object({
  title: postTitleSchema,
  caption: postCaptionSchema.default(""),
  tags: postTagsSchema.default(""),
  themeId: z.uuid().optional(),
  meta: photoMetaSchema,
});

/** 今日のお題に投稿する（multipart/form-data: image, title, caption, tags, themeId, meta） */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const limit = await hitRateLimit(`post:${viewer.id}`, 30, 60 * 60);
  if (!limit.ok) throw tooMany(limit.retryAfterSec);

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
    themeId: form.get("themeId") || undefined,
    meta,
  });
  const image = await readImageFile(form, "image", 12 * 1024 * 1024);
  const { post } = await createThemePost(viewer, fields, image, await now());
  return json({ post }, { status: 201 });
});
