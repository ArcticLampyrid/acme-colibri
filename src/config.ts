import { z } from "zod";
import type { Bindings } from "./env";

export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri?: string;
  allowedEmails: string[];
  allowedGroups: string[];
  groupsClaim: string;
};

export type AuthConfig =
  | { mode: "oidc"; oidc: OidcConfig }
  | { mode: "passcode"; password: string }
  | { mode: "disabled" };

export type AppConfig = {
  secretKey: string;
  sessionTtlSeconds: number;
  auth: AuthConfig;
};

const blank = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);
const csv = (v: string | undefined, lower = false): string[] =>
  (v ?? "")
    .split(",")
    .map((s) => (lower ? s.trim().toLowerCase() : s.trim()))
    .filter(Boolean);

const oidcSchema = z.object({
  issuer: z.url().refine((u) => u.startsWith("https://") || u.startsWith("http://localhost"), "must be https"),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

const baseSchema = z.object({
  secretKey: z.string().min(32, "SECRET_KEY must be set to a random string of at least 32 characters"),
  sessionTtlSeconds: z.coerce.number().int().min(60).max(30 * 24 * 3600),
});

function parseAuth(env: Bindings): AuthConfig {
  if (blank(env.OIDC_ISSUER)) {
    const { issuer, clientId, clientSecret } = oidcSchema.parse({
      issuer: blank(env.OIDC_ISSUER)!.replace(/\/+$/, ""),
      clientId: blank(env.OIDC_CLIENT_ID),
      clientSecret: blank(env.OIDC_CLIENT_SECRET),
    });
    return {
      mode: "oidc",
      oidc: {
        issuer,
        clientId,
        clientSecret,
        scopes: blank(env.OIDC_SCOPES) ?? "openid email profile",
        redirectUri: blank(env.OIDC_REDIRECT_URI),
        allowedEmails: csv(env.OIDC_ALLOWED_EMAILS, true),
        allowedGroups: csv(env.OIDC_ALLOWED_GROUPS),
        groupsClaim: blank(env.OIDC_GROUPS_CLAIM) ?? "groups",
      },
    };
  }
  const password = blank(env.ADMIN_PASSWORD);
  if (password) return { mode: "passcode", password };
  return { mode: "disabled" };
}

/** Validate bindings once per request. Throws a `ZodError`/`Error` on misconfiguration. */
export function parseConfig(env: Bindings): AppConfig {
  const base = baseSchema.parse({
    secretKey: env.SECRET_KEY,
    sessionTtlSeconds: blank(env.SESSION_TTL_SECONDS) ?? 8 * 3600,
  });
  return { ...base, auth: parseAuth(env) };
}
