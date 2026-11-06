// ADMIN-v1: tiny fetch helper for the owner dashboard (same-origin, cookie session; the server does all checks).
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function adminApi<T = Record<string, unknown>>(path: string, method = "GET", body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { error?: string }).error || `Request failed (${res.status})` };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
}

export const fmtDate = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
export const fmtDateTime = (ms: number) => new Date(ms).toLocaleString();
