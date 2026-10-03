import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { OidcConfig } from "../config";
import { base64urlEncode, randomToken, sha256 } from "../lib/crypto";

const TIMEOUT_MS = 10_000;
const ID_TOKEN_ALGS = ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "EdDSA"];

const metadataSchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
  userinfo_endpoint: z.url().optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
});
type Metadata = z.infer<typeof metadataSchema>;

const tokenResponseSchema = z.object({ id_token: z.string(), access_token: z.string().optional() });

export type Claims = Record<string, unknown>;

/** Per-login values kept in the signed `oidc-state` cookie while the user is at the IdP. */
export type LoginState = { state: string; nonce: string; verifier: string };

const stripSlash = (s: string) => s.replace(/\/+$/, "");

async function fetchJson(url: string | URL, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`OIDC request to ${new URL(url).pathname} failed with HTTP ${res.status}`);
  return res.json();
}

async function fetchMetadata(oidc: OidcConfig): Promise<Metadata> {
  const meta = metadataSchema.parse(await fetchJson(`${oidc.issuer}/.well-known/openid-configuration`));
  if (stripSlash(meta.issuer) !== oidc.issuer) throw new Error("OIDC discovery issuer mismatch");
  return meta;
}

export const redirectUriFor = (oidc: OidcConfig, requestUrl: string): string =>
  oidc.redirectUri ?? new URL("/api/auth/oidc/callback", requestUrl).toString();

/** Step 1: authorization request URL (code flow + PKCE S256) and the state to remember. */
export async function beginLogin(oidc: OidcConfig, redirectUri: string): Promise<{ location: string; login: LoginState }> {
  const meta = await fetchMetadata(oidc);
  const login: LoginState = { state: randomToken(16), nonce: randomToken(16), verifier: randomToken(32) };
  const url = new URL(meta.authorization_endpoint);
  url.search = new URLSearchParams({
    ...Object.fromEntries(url.searchParams),
    response_type: "code",
    client_id: oidc.clientId,
    redirect_uri: redirectUri,
    scope: oidc.scopes,
    state: login.state,
    nonce: login.nonce,
    code_challenge: base64urlEncode(await sha256(login.verifier)),
    code_challenge_method: "S256",
  }).toString();
  return { location: url.toString(), login };
}

/** Step 2: exchange the code, verify the ID token, and return the user's claims. */
export async function completeLogin(oidc: OidcConfig, redirectUri: string, login: LoginState, code: string): Promise<Claims> {
  const meta = await fetchMetadata(oidc);

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: login.verifier,
  });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  const methods = meta.token_endpoint_auth_methods_supported;
  if (!methods || methods.includes("client_secret_basic")) {
    const enc = encodeURIComponent;
    headers.Authorization = `Basic ${btoa(`${enc(oidc.clientId)}:${enc(oidc.clientSecret)}`)}`;
  } else {
    form.set("client_id", oidc.clientId);
    form.set("client_secret", oidc.clientSecret);
  }
  const tokens = tokenResponseSchema.parse(await fetchJson(meta.token_endpoint, { method: "POST", headers, body: form }));

  const { payload } = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(meta.jwks_uri)), {
    issuer: meta.issuer,
    audience: oidc.clientId,
    algorithms: ID_TOKEN_ALGS,
  });
  if (payload.nonce !== login.nonce) throw new Error("OIDC nonce mismatch");

  if (!needsUserinfo(oidc, payload) || !meta.userinfo_endpoint || !tokens.access_token) return payload;
  const info = (await fetchJson(meta.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })) as Claims;
  return info.sub === payload.sub ? { ...info, ...payload } : payload;
}

/** Look up a claim by exact name first, then as a dotted path (e.g. `realm_access.roles`). */
export function getClaim(claims: Claims, path: string): unknown {
  if (path in claims) return claims[path];
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Claims)[key] : undefined), claims);
}

const asStringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : [];

const emailOf = (claims: Claims): string | undefined => {
  const verified = claims.email_verified !== false && claims.email_verified !== "false";
  return typeof claims.email === "string" && verified ? claims.email.toLowerCase() : undefined;
};

const hasRestrictions = (oidc: OidcConfig) => oidc.allowedEmails.length > 0 || oidc.allowedGroups.length > 0;

function needsUserinfo(oidc: OidcConfig, claims: Claims): boolean {
  return (
    (oidc.allowedEmails.length > 0 && claims.email === undefined) ||
    (oidc.allowedGroups.length > 0 && getClaim(claims, oidc.groupsClaim) === undefined)
  );
}

/** No restrictions configured -> everyone the IdP authenticates; otherwise email OR group must match. */
export function isAllowed(oidc: OidcConfig, claims: Claims): boolean {
  if (!hasRestrictions(oidc)) return true;
  const email = emailOf(claims);
  const groups = asStringList(getClaim(claims, oidc.groupsClaim));
  return (email !== undefined && oidc.allowedEmails.includes(email)) || groups.some((g) => oidc.allowedGroups.includes(g));
}

export const subjectOf = (claims: Claims): string =>
  emailOf(claims) ??
  [claims.preferred_username, claims.name, claims.sub].find((v): v is string => typeof v === "string" && v !== "") ??
  "unknown";
