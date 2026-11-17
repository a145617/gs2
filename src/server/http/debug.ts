import type { NextRequest } from "next/server";
import { env } from "../env";
import { notFound } from "./respond";
import { requireViewer, type Viewer } from "./viewer";

/** デバッグモードのときだけ使えるAPI（無効なときは存在しないものとして 404 を返す） */
export async function requireDebug(req: NextRequest): Promise<Viewer> {
  if (!env.debugMode) throw notFound();
  return requireViewer(req);
}
