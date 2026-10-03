import { afterEach, describe, expect, it, vi } from "vitest";
import { base64urlEncode, sha256 } from "../src/lib/crypto";
import { basic, json, jsonResponse, request, stubFetch } from "./helpers";
import { CF_TOKEN, seed } from "./seed";

const VALUE = "A".repeat(43);

afterEach(() => vi.restoreAllMocks());

/** Minimal Cloudflare API double with one zone `main.com`. */
function cloudflareDouble(opts: { existing?: { id: string; content: string }[]; createError?: number } = {}) {
  return stubFetch((url, init) => {
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${CF_TOKEN}`);
    const { pathname } = url;
    if (pathname === "/client/v4/zones/zone1/dns_records" && init?.method === "POST") {
      return opts.createError
        ? jsonResponse({ success: false, errors: [{ code: opts.createError, message: "An identical record already exists." }] }, 400)
        : jsonResponse({ success: true, result: { id: "rec1" } });
    }
    if (pathname === "/client/v4/zones/zone1/dns_records" && (init?.method ?? "GET") === "GET") {
      return jsonResponse({ success: true, result: opts.existing ?? [] });
    }
    if (init?.method === "DELETE") return jsonResponse({ success: true, result: { id: "x" } });
    throw new Error(`unexpected request ${init?.method} ${url}`);
  });
}

describe("acmeproxy standard mode", () => {
  it("present creates a TXT record at the right zone", async () => {
    const { key, overrides } = await seed();
    const calls = cloudflareDouble();
    const res = await request(
      "/present",
      json({ fqdn: "_acme-challenge.Sub.Main.com.", value: VALUE }, { Authorization: basic("ap1", key) }),
      overrides,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fqdn: "_acme-challenge.sub.main.com.", value: VALUE });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.pathname).toBe("/client/v4/zones/zone1/dns_records");
    const create = calls.find((c) => c.method === "POST")!;
    expect(create.body).toMatchObject({ type: "TXT", name: "_acme-challenge.sub.main.com", content: VALUE });
  });

  it("accepts form-encoded requests from HTTPREQ adapters", async () => {
    const { key, overrides } = await seed();
    const calls = cloudflareDouble();
    const body = new URLSearchParams({ fqdn: "_acme-challenge.main.com.", value: VALUE });
    const res = await request(
      "/present",
      { method: "POST", headers: { Authorization: basic("ap1", key), "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() },
      overrides,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fqdn: "_acme-challenge.main.com.", value: VALUE });
    expect(calls.find((call) => call.method === "POST")?.body).toMatchObject({ name: "_acme-challenge.main.com", content: VALUE });
  });

  it("treats an already existing identical record as success", async () => {
    const { key, overrides } = await seed();
    cloudflareDouble({ createError: 81058 });
    const res = await request("/present", json({ fqdn: "_acme-challenge.main.com", value: VALUE }, { Authorization: basic("ap1", key) }), overrides);
    expect(res.status).toBe(200);
  });

  it("cleanup deletes only records with the matching value (quotes tolerated)", async () => {
    const { key, overrides } = await seed();
    const calls = cloudflareDouble({
      existing: [
        { id: "mine", content: `"${VALUE}"` },
        { id: "other", content: "B".repeat(43) },
      ],
    });
    const res = await request("/cleanup", json({ fqdn: "_acme-challenge.main.com.", value: VALUE }, { Authorization: basic("ap1", key) }), overrides);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url.pathname).toBe("/client/v4/zones/zone1/dns_records");
    expect(calls[0]!.url.searchParams.get("name")).toBe("_acme-challenge.main.com");
    const deletes = calls.filter((c) => c.method === "DELETE").map((c) => c.url.pathname);
    expect(deletes).toEqual(["/client/v4/zones/zone1/dns_records/mine"]);
  });

  it("cleanup with nothing to delete succeeds", async () => {
    const { key, overrides } = await seed();
    cloudflareDouble();
    const res = await request("/cleanup", json({ fqdn: "_acme-challenge.main.com", value: VALUE }, { Authorization: basic("ap1", key) }), overrides);
    expect(res.status).toBe(200);
  });
});

describe("acmeproxy raw mode (Lego httpreq)", () => {
  it("derives fqdn and value from form-encoded domain + keyAuth", async () => {
    const { key, overrides } = await seed();
    const calls = cloudflareDouble();
    const keyAuth = "token.thumbprint";
    const body = new URLSearchParams({ domain: "*.Main.com", token: "token", keyAuth });
    const res = await request(
      "/present",
      { method: "POST", headers: { Authorization: basic("ap1", key), "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() },
      overrides,
    );
    expect(res.status).toBe(200);
    const expected = base64urlEncode(await sha256(keyAuth));
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ name: "_acme-challenge.main.com", content: expected });
  });

  it("derives fqdn and value from domain + keyAuth", async () => {
    const { key, overrides } = await seed();
    const calls = cloudflareDouble();
    const keyAuth = "token.thumbprint";
    const res = await request(
      "/present",
      json({ domain: "*.Main.com", token: "token", keyAuth }, { Authorization: basic("ap1", key) }),
      overrides,
    );
    expect(res.status).toBe(200);
    const expected = base64urlEncode(await sha256(keyAuth));
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ name: "_acme-challenge.main.com", content: expected });
  });
});

describe("authentication & authorization", () => {
  const body = { fqdn: "_acme-challenge.main.com", value: VALUE };

  it("401 without credentials, with a wrong key, or unknown id", async () => {
    const { key, overrides } = await seed();
    const none = await request("/present", json(body), overrides);
    expect(none.status).toBe(401);
    expect(none.headers.get("WWW-Authenticate")).toContain("Basic");
    expect((await request("/present", json(body, { Authorization: basic("ap1", key + "x") }), overrides)).status).toBe(401);
    expect((await request("/present", json(body, { Authorization: basic("nope", key) }), overrides)).status).toBe(401);
    expect((await request("/present", json(body, { Authorization: "Basic !!!" }), overrides)).status).toBe(401);
  });

  it("403 for domains outside the access point and non-challenge names", async () => {
    const { key, overrides } = await seed();
    const auth = { Authorization: basic("ap1", key) };
    for (const fqdn of ["_acme-challenge.other.com", "_acme-challenge.evilmain.com", "www.main.com", "main.com", "x._acme-challenge.main.com"]) {
      const res = await request("/present", json({ fqdn, value: VALUE }, auth), overrides);
      expect(res.status, fqdn).toBe(403);
    }
  });

  it("accepts any non-empty TXT value", async () => {
    const { key, overrides } = await seed();
    cloudflareDouble();
    for (const value of ["short", "B".repeat(100), "has space!"]) {
      const res = await request("/present", json({ fqdn: "_acme-challenge.main.com", value }, { Authorization: basic("ap1", key) }), overrides);
      expect(res.status, value).toBe(200);
    }
  });

  it("400 for malformed input", async () => {
    const { key, overrides } = await seed();
    const auth = { Authorization: basic("ap1", key) };
    const bad = [
      { fqdn: "_acme-challenge.main.com", value: "" },
      { fqdn: "_acme-challenge.main.com/../x", value: VALUE },
      { fqdn: "_acme-challenge.main.com" },
      { hello: "world" },
    ];
    for (const b of bad) expect((await request("/present", json(b, auth), overrides)).status, JSON.stringify(b)).toBe(400);
    const notJson = await request("/present", { method: "POST", headers: auth, body: "nope" }, overrides);
    expect(notJson.status).toBe(400);
  });

  it("uses the most specific suffix when several match", async () => {
    const { key, overrides } = await seed({ "main.com": "cf-main", "deep.main.com": "cf-deep" });
    const calls = stubFetch(() => jsonResponse({ success: true, result: {} }));
    const res = await request("/present", json({ fqdn: "_acme-challenge.a.deep.main.com", value: VALUE }, { Authorization: basic("ap1", key) }), overrides);
    expect(res.status).toBe(200);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("502 with a safe message when the upstream fails", async () => {
    const { key, overrides } = await seed();
    stubFetch(() => jsonResponse({ success: false, errors: [{ code: 9109, message: "Invalid access token" }] }, 403));
    const res = await request("/present", json({ fqdn: "_acme-challenge.main.com", value: VALUE }, { Authorization: basic("ap1", key) }), overrides);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain(CF_TOKEN);
  });

});

describe("misc", () => {
  it("serves /health without configuration", async () => {
    const res = await request("/health", {}, { SECRET_KEY: "" });
    expect(res.status).toBe(200);
  });
  it("500 when SECRET_KEY is missing", async () => {
    const res = await request("/present", json({}), { SECRET_KEY: "short" });
    expect(res.status).toBe(500);
  });
});
