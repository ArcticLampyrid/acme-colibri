import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { adminCookie, json, passcodeEnv, request } from "./helpers";

export const CF_TOKEN = "cf-secret-token-abc123";

/** Create zone providers + an access point through the admin API; returns the access key. */
export async function seed(provides: Record<string, string> = { "main.com": "cf-main" }) {
  const overrides = passcodeEnv();
  const cookie = await adminCookie(overrides);
  const headers = { Cookie: cookie };

  for (const id of new Set(Object.values(provides))) {
    const res = await request(
      "/api/admin/zone-providers",
      json({ id, type: "cloudflare", config: { zone_id: "zone1" }, secrets: { api_token: CF_TOKEN } }, headers),
      overrides,
    );
    expect(res.status).toBe(201);
  }
  const res = await request("/api/admin/access-points", json({ id: "ap1", provides }, headers), overrides);
  expect(res.status).toBe(201);
  const { key } = (await res.json()) as { key: string };
  return { key, overrides, cookie, db: env.DB };
}
