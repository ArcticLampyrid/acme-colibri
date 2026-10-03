import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OidcConfig } from "../src/config";
import { getClaim, isAllowed, subjectOf } from "../src/auth/oidc";
import { base64urlEncode, sha256 } from "../src/lib/crypto";
import { jsonResponse, request, stubFetch } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const ISSUER = "https://idp.test";
const oidcEnv = (extra: Record<string, string> = {}) => ({
  OIDC_ISSUER: ISSUER,
  OIDC_CLIENT_ID: "colibri",
  OIDC_CLIENT_SECRET: "shh",
  ...extra,
});

const cfg = (over: Partial<OidcConfig> = {}): OidcConfig => ({
  issuer: ISSUER, clientId: "c", clientSecret: "s", scopes: "openid", allowedEmails: [], allowedGroups: [], groupsClaim: "groups", ...over,
});

describe("restrictions", () => {
  it("allows everyone when nothing is configured", () => {
    expect(isAllowed(cfg(), { sub: "1" })).toBe(true);
  });
  it("matches emails case-insensitively and requires a verified email", () => {
    const c = cfg({ allowedEmails: ["alice@example.com"] });
    expect(isAllowed(c, { email: "Alice@Example.com" })).toBe(true);
    expect(isAllowed(c, { email: "alice@example.com", email_verified: false })).toBe(false);
    expect(isAllowed(c, { email: "alice@example.com", email_verified: "false" })).toBe(false);
    expect(isAllowed(c, { email: "bob@example.com" })).toBe(false);
    expect(isAllowed(c, {})).toBe(false);
  });
  it("matches groups (array, string, dotted path, custom claim)", () => {
    const c = cfg({ allowedGroups: ["admins"] });
    expect(isAllowed(c, { groups: ["x", "admins"] })).toBe(true);
    expect(isAllowed(c, { groups: "admins" })).toBe(true);
    expect(isAllowed(c, { groups: ["x"] })).toBe(false);
    expect(isAllowed({ ...c, groupsClaim: "realm_access.roles" }, { realm_access: { roles: ["admins"] } })).toBe(true);
    expect(getClaim({ "https://x/groups": ["a"] }, "https://x/groups")).toEqual(["a"]);
  });
  it("is a union of email and group allow-lists", () => {
    const c = cfg({ allowedEmails: ["a@x.com"], allowedGroups: ["admins"] });
    expect(isAllowed(c, { email: "a@x.com" })).toBe(true);
    expect(isAllowed(c, { email: "z@x.com", groups: ["admins"] })).toBe(true);
    expect(isAllowed(c, { email: "z@x.com", groups: [] })).toBe(false);
  });
  it("derives a display subject", () => {
    expect(subjectOf({ email: "a@x.com", sub: "1" })).toBe("a@x.com");
    expect(subjectOf({ preferred_username: "al", sub: "1" })).toBe("al");
    expect(subjectOf({ sub: "1" })).toBe("1");
  });
});

/** A tiny fake IdP: discovery, JWKS, token endpoint, optional userinfo. */
async function fakeIdp(claims: Record<string, unknown>, opts: { userinfo?: Record<string, unknown>; idTokenAudience?: string } = {}) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const seen: { authorize?: URL; tokenBody?: URLSearchParams; tokenAuth?: string } = {};
  let nonce = "";

  const calls = stubFetch(async (url, init) => {
    if (url.pathname === "/.well-known/openid-configuration") {
      return jsonResponse({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
        ...(opts.userinfo ? { userinfo_endpoint: `${ISSUER}/userinfo` } : {}),
      });
    }
    if (url.pathname === "/jwks") return jsonResponse({ keys: [jwk] });
    if (url.pathname === "/userinfo") return jsonResponse(opts.userinfo);
    if (url.pathname === "/token") {
      seen.tokenBody = new URLSearchParams(init!.body as URLSearchParams);
      seen.tokenAuth = (init!.headers as Record<string, string>).Authorization;
      const idToken = await new SignJWT({ nonce, ...claims })
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(ISSUER).setAudience(opts.idTokenAudience ?? "colibri").setSubject("user-1")
        .setIssuedAt().setExpirationTime("5m").sign(privateKey);
      return jsonResponse({ id_token: idToken, access_token: "at-1" });
    }
    throw new Error(`unexpected ${url}`);
  });

  /** Run login -> callback and return the callback response. */
  async function run(env: Record<string, string>, tamper?: (q: URLSearchParams) => void) {
    const login = await request("/api/auth/oidc/login", {}, env);
    expect(login.status).toBe(302);
    seen.authorize = new URL(login.headers.get("Location")!);
    nonce = seen.authorize.searchParams.get("nonce")!;
    const stateCookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const q = new URLSearchParams({ code: "code-1", state: seen.authorize.searchParams.get("state")! });
    tamper?.(q);
    const cb = await request(`/api/auth/oidc/callback?${q}`, { headers: { Cookie: stateCookie } }, env);
    return { login, cb, calls };
  }
  return { run, seen };
}

describe("OIDC login flow", () => {
  it("redirects with PKCE, completes the exchange and starts a session", async () => {
    const idp = await fakeIdp({ email: "alice@example.com", groups: ["admins"] });
    const env = oidcEnv({ OIDC_ALLOWED_EMAILS: "alice@example.com" });
    const { login, cb } = await idp.run(env);

    const a = idp.seen.authorize!;
    expect(a.origin + a.pathname).toBe(`${ISSUER}/authorize`);
    expect(a.searchParams.get("response_type")).toBe("code");
    expect(a.searchParams.get("redirect_uri")).toBe("https://colibri.test/api/auth/oidc/callback");
    expect(a.searchParams.get("code_challenge_method")).toBe("S256");
    expect(login.headers.get("Set-Cookie")).toMatch(/HttpOnly/i);

    const verifier = idp.seen.tokenBody!.get("code_verifier")!;
    expect(a.searchParams.get("code_challenge")).toBe(base64urlEncode(await sha256(verifier)));
    expect(idp.seen.tokenBody!.get("grant_type")).toBe("authorization_code");
    expect(idp.seen.tokenAuth).toBe(`Basic ${btoa("colibri:shh")}`);

    expect(cb.status).toBe(302);
    expect(cb.headers.get("Location")).toBe("/");
    const cookie = cb.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => c?.includes("session")).join("; ");
    const session = await request("/api/auth/session", { headers: { Cookie: cookie } }, env);
    expect(await session.json()).toEqual({ mode: "oidc", user: "alice@example.com" });
  });

  it("denies users outside the allow-lists", async () => {
    const idp = await fakeIdp({ email: "mallory@example.com", groups: ["users"] });
    const { cb } = await idp.run(oidcEnv({ OIDC_ALLOWED_EMAILS: "alice@example.com", OIDC_ALLOWED_GROUPS: "admins" }));
    expect(cb.headers.get("Location")).toBe("/?login_error=denied");
    expect(cb.headers.getSetCookie().some((c) => c.includes("session=") && !c.includes("Max-Age=0"))).toBe(false);
  });

  it("allows by group", async () => {
    const idp = await fakeIdp({ groups: ["admins"] });
    const { cb } = await idp.run(oidcEnv({ OIDC_ALLOWED_GROUPS: "admins" }));
    expect(cb.headers.get("Location")).toBe("/");
  });

  it("falls back to userinfo for missing claims", async () => {
    const idp = await fakeIdp({}, { userinfo: { sub: "user-1", email: "alice@example.com" } });
    const { cb } = await idp.run(oidcEnv({ OIDC_ALLOWED_EMAILS: "alice@example.com" }));
    expect(cb.headers.get("Location")).toBe("/");
  });

  it("rejects a state mismatch, a missing state cookie and a wrong audience", async () => {
    const idp = await fakeIdp({ email: "a@x.com" });
    const bad = await idp.run(oidcEnv(), (q) => q.set("state", "forged"));
    expect(bad.cb.headers.get("Location")).toBe("/?login_error=failed");

    const noCookie = await request("/api/auth/oidc/callback?code=c&state=s", {}, oidcEnv());
    expect(noCookie.headers.get("Location")).toBe("/?login_error=failed");

    vi.restoreAllMocks();
    const wrongAud = await fakeIdp({ email: "a@x.com" }, { idTokenAudience: "someone-else" });
    expect((await wrongAud.run(oidcEnv())).cb.headers.get("Location")).toBe("/?login_error=failed");
  });

  it("is unavailable in passcode mode and prefers OIDC when configured", async () => {
    expect((await request("/api/auth/oidc/login", {}, {})).status).toBe(404);
    const s = await request("/api/auth/session", {}, { ...oidcEnv(), ADMIN_PASSWORD: "ignored-when-oidc" });
    expect(((await s.json()) as { mode: string }).mode).toBe("oidc");
  });
});
