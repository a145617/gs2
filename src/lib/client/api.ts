// ブラウザから自前のAPI（/api/*）を呼ぶための小さなヘルパー
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Options = Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit | null };

export async function api<T = unknown>(url: string, opts: Options = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  let body = opts.body ?? null;
  if (opts.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.json);
  }
  headers.set("Accept", "application/json");
  const res = await fetch(url, { ...opts, headers, body, credentials: "same-origin" });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "http_error",
      err?.message ?? `通信エラーが発生しました（${res.status}）`,
      err?.details,
    );
  }
  return data as T;
}

/** SWR 用の fetcher */
export const fetcher = <T,>(url: string) => api<T>(url);
