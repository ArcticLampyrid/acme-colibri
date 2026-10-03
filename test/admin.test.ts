import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/lib/crypto";
import { PASSWORD, adminCookie, json, passcodeEnv, request } from "./helpers";
import { CF_TOKEN, seed } from "./seed";

describe("passcode auth", () => {
  it("rejects wrong passwords and unauthenticated admin calls", async () => {
    const overrides = passcodeEnv();
    expect((await request("/api/auth/login", json({ password: "nope" }), overrides)).status).toBe(401);
    expect((await request("/api/admin/zone-providers", {}, overrides)).status).toBe(401);
    expect((await request("/api/admin/zone-providers", { headers: { Cookie: "colibri_session=garbage" } }, overrides)).status).toBe(401);
  });

  it("logs in, reports the session, and logs out", async () => {
    const overrides = passcodeEnv();
    const login = await request("/api/auth/login", json({ password: PASSWORD }), overrides);
    expect(login.status).toBe(200);
    const setCookie = login.headers.get("Set-Cookie")!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toContain("__Host-colibri_session=");

    const cookie = await adminCookie(overrides);
    const session = await request("/api/auth/session", { headers: { Cookie: cookie } }, overrides);
    expect(await session.json()).toEqual({ mode: "passcode", user: "admin" });
    expect((await request("/api/auth/logout", { method: "POST", headers: { Cookie: cookie } }, overrides)).status).toBe(204);
  });

  it("invalidates sessions when the auth mode changes", async () => {
    const overrides = passcodeEnv();
    const cookie = await adminCookie(overrides);
    const oidc = { ...overrides, OIDC_ISSUER: "https://idp.test", OIDC_CLIENT_ID: "c", OIDC_CLIENT_SECRET: "s" };
    expect((await request("/api/admin/zone-providers", { headers: { Cookie: cookie } }, oidc)).status).toBe(401);
  });

  it("refuses cross-origin state-changing requests", async () => {
    const overrides = passcodeEnv();
    const res = await request("/api/auth/login", json({ password: PASSWORD }, { Origin: "https://evil.test" }), overrides);
    expect(res.status).toBe(403);
  });

  it("admin API is 503 when no auth is configured", async () => {
    const res = await request("/api/admin/zone-providers", {}, { ADMIN_PASSWORD: undefined });
    expect(res.status).toBe(503);
    const s = await request("/api/auth/session", {}, { ADMIN_PASSWORD: undefined });
    expect(await s.json()).toEqual({ mode: "disabled", user: null });
  });
});

describe("zone providers", () => {
  it("never exposes secrets and stores them encrypted", async () => {
    const { overrides, cookie } = await seed();
    const headers = { Cookie: cookie };

    const list = await request("/api/admin/zone-providers", { headers }, overrides);
    const text = await list.text();
    expect(text).not.toContain(CF_TOKEN);
    expect(JSON.parse(text)).toEqual([expect.objectContaining({ id: "cf-main", type: "cloudflare", config: { zone_id: "zone1" } })]);

    const row = await env.DB.prepare("SELECT * FROM zone_providers WHERE id = 'cf-main'").first<{ secrets_enc: string; config: string }>();
    expect(row!.secrets_enc.startsWith("v1.")).toBe(true);
    expect(JSON.stringify(row)).not.toContain(CF_TOKEN);
  });

  it("validates input", async () => {
    const { overrides, cookie } = await seed();
    const h = { Cookie: cookie };
    const post = (b: unknown) => request("/api/admin/zone-providers", json(b, h), overrides);
    expect((await post({ id: "Bad Id", type: "cloudflare", config: {}, secrets: {} })).status).toBe(400);
    expect((await post({ id: "z2", type: "nope", config: {}, secrets: {} })).status).toBe(400);
    for (const config of [{}, { zone_id: "" }, { zone_id: "   " }]) {
      expect((await post({ id: "z2", type: "cloudflare", config, secrets: { api_token: "t" } })).status).toBe(400);
    }
    expect((await post({ id: "z2", type: "cloudflare", config: { zone_id: "a" }, secrets: {} })).status).toBe(400);
    expect((await post({ id: "z2", type: "cloudflare", config: { zone_id: "a", extra: "x" }, secrets: { api_token: "t" } })).status).toBe(400);
    expect((await post({ id: "z2", type: "cloudflare", config: { zone_id: "a" }, secrets: { api_token: "t" } })).status).toBe(201);
    expect((await post({ id: "z2", type: "cloudflare", config: { zone_id: "a" }, secrets: { api_token: "t" } })).status).toBe(409);
  });

  it("patches config and rotates a secret independently", async () => {
    const { overrides, cookie, key } = await seed();
    const h = { Cookie: cookie, "Content-Type": "application/json" };
    const patch = (b: unknown) => request("/api/admin/zone-providers/cf-main", { method: "PATCH", headers: h, body: JSON.stringify(b) }, overrides);

    const res = await patch({ config: { zone_id: "zone2" } });
    expect(await res.json()).toMatchObject({ config: { zone_id: "zone2" } });
    expect((await patch({ secrets: { api_token: "new-token" } })).status).toBe(200);
    expect((await patch({ secrets: { bogus: "x" } })).status).toBe(400);
    expect((await patch({ config: { zone_id: " " } })).status).toBe(400);
    expect(key).toBeTruthy();
  });

  it("refuses to delete a provider in use, then deletes it once free", async () => {
    const { overrides, cookie } = await seed();
    const h = { Cookie: cookie };
    const del = (path: string) => request(path, { method: "DELETE", headers: h }, overrides);
    const blocked = await del("/api/admin/zone-providers/cf-main");
    expect(blocked.status).toBe(409);
    expect(await blocked.text()).toContain("ap1");
    expect((await del("/api/admin/access-points/ap1")).status).toBe(204);
    expect((await del("/api/admin/zone-providers/cf-main")).status).toBe(204);
    expect((await del("/api/admin/zone-providers/cf-main")).status).toBe(404);
  });

  it("lists provider types with field metadata", async () => {
    const { overrides, cookie } = await seed();
    const res = await request("/api/admin/provider-types", { headers: { Cookie: cookie } }, overrides);
    expect(await res.json()).toEqual([
      expect.objectContaining({ type: "cloudflare", fields: [
        { name: "zone_id", label: "Zone ID", secret: false },
        { name: "api_token", label: "API Token (DNS:Edit)", secret: true },
      ] }),
    ]);
  });
});

describe("access points", () => {
  it("returns the key once, stores only its SHA-256, and never lists it", async () => {
    const { key, overrides, cookie } = await seed();
    expect(key.length).toBeGreaterThanOrEqual(43);

    const row = await env.DB.prepare("SELECT key_hash FROM access_points WHERE id = 'ap1'").first<{ key_hash: string }>();
    expect(row!.key_hash).toBe(await sha256Hex(key));

    const text = await (await request("/api/admin/access-points", { headers: { Cookie: cookie } }, overrides)).text();
    expect(text).not.toContain(key);
    expect(text).not.toContain(row!.key_hash);
  });

  it("normalizes suffixes and validates zone references", async () => {
    const { overrides, cookie } = await seed();
    const h = { Cookie: cookie };
    const post = (b: unknown) => request("/api/admin/access-points", json(b, h), overrides);

    const ok = await post({ id: "ap2", provides: { "Bücher.Example.": "cf-main" } });
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as any).accessPoint.provides).toEqual({ "xn--bcher-kva.example": "cf-main" });

    expect((await post({ id: "ap3", provides: { "x.com": "missing" } })).status).toBe(400);
    expect((await post({ id: "ap3", provides: { "bad/suffix": "cf-main" } })).status).toBe(400);
    expect((await post({ id: "ap3", provides: { "a.com": "cf-main", "A.COM.": "cf-main" } })).status).toBe(400);
    expect((await post({ id: "ap1", provides: {} })).status).toBe(409);
  });

  it("replaces the mapping and rotates the key (old key stops working)", async () => {
    const { key, overrides, cookie } = await seed();
    const h = { Cookie: cookie, "Content-Type": "application/json" };

    const put = await request("/api/admin/access-points/ap1", { method: "PUT", headers: h, body: JSON.stringify({ provides: { "other.com": "cf-main" } }) }, overrides);
    expect(((await put.json()) as any).provides).toEqual({ "other.com": "cf-main" });

    const rot = await request("/api/admin/access-points/ap1/rotate-key", { method: "POST", headers: h }, overrides);
    const { key: newKey } = (await rot.json()) as { key: string };
    expect(newKey).not.toBe(key);

    const probe = (k: string) =>
      request("/present", json({ fqdn: "_acme-challenge.nothing.org", value: "A".repeat(43) }, { Authorization: `Basic ${btoa(`ap1:${k}`)}` }), overrides);
    expect((await probe(key)).status).toBe(401);
    expect((await probe(newKey)).status).toBe(403); // authenticated, but domain not allowed
  });
});
