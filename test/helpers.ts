import { env as workerEnv } from "cloudflare:workers";
import { vi } from "vitest";
import app from "../src/app";
import type { Bindings } from "../src/env";

export const ORIGIN = "https://colibri.test";

export const request = (path: string, init: RequestInit = {}, overrides: Partial<Bindings> = {}) =>
  app.request(`${ORIGIN}${path}`, init, { ...workerEnv, ...overrides });

export const PASSWORD = "correct horse battery staple";
export const passcodeEnv = (): Partial<Bindings> => ({ ADMIN_PASSWORD: PASSWORD });

export const json = (body: unknown, extra: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...extra },
  body: JSON.stringify(body),
});

export const basic = (id: string, key: string) => `Basic ${btoa(`${id}:${key}`)}`;

/** Log in with the passcode and return a `Cookie` header value. */
export async function adminCookie(overrides: Partial<Bindings>): Promise<string> {
  const res = await request("/api/auth/login", json({ password: PASSWORD }), overrides);
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

/** Replace global fetch; unmatched URLs throw so tests never reach the network. */
export function stubFetch(handler: Handler) {
  const calls: { url: URL; method: string; body: unknown }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body });
    return handler(url, init);
  });
  return calls;
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
