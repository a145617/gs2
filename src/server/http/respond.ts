import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

/** APIで返すエラー（ステータスコード・機械向けコード・日本語メッセージ） */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = (message = "ログインが必要です") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "この操作は許可されていません") => new HttpError(403, "forbidden", message);
export const notFound = (message = "見つかりませんでした") => new HttpError(404, "not_found", message);
export const badRequest = (message = "入力内容を確認してください", details?: unknown) =>
  new HttpError(400, "bad_request", message, details);
export const conflict = (message: string, code = "conflict") => new HttpError(409, code, message);
export const tooMany = (retryAfterSec: number, message = "操作が多すぎます。しばらく待ってからもう一度お試しください") =>
  new HttpError(429, "rate_limited", message, { retryAfterSec });

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

function zodDetails(err: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return { fields };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    const retry = (err.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
    if (err.status === 429 && retry) headers["Retry-After"] = String(retry);
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status, headers },
    );
  }
  if (err instanceof ZodError) {
    const details = zodDetails(err);
    const first = Object.values(details.fields)[0];
    return NextResponse.json(
      { error: { code: "validation", message: first ?? "入力内容を確認してください", details } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  console.error("[api] unexpected error", err);
  return NextResponse.json(
    { error: { code: "internal", message: "サーバーでエラーが発生しました。時間をおいてもう一度お試しください" } },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** ルートハンドラーを包み、例外を JSON のエラーレスポンスに変換する */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest("リクエストの形式が正しくありません");
  }
}
