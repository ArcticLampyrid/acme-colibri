export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type AuthMode = "oidc" | "passcode" | "disabled";
export type Session = { mode: AuthMode; user: string | null };
export type ProviderField = { name: string; label: string; secret: boolean };
export type ProviderType = { type: string; label: string; fields: ProviderField[] };
export type ZoneProvider = { id: string; type: string; config: Record<string, string>; createdAt: string; updatedAt: string };
export type AccessPoint = { id: string; provides: Record<string, string>; createdAt: string; updatedAt: string };
/** Create / rotate responses: the key is shown exactly once. */
export type KeyReveal = { accessPoint: AccessPoint; key: string };

export async function api<T = void>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
