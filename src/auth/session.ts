import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../app";
import { isHttps } from "../lib/http";
import { signJwt, verifyJwt } from "./jwt";

/** `__Host-` pins the cookie to this host over HTTPS; plain name is used on http://localhost. */
const sessionCookieName = (c: Context) => (isHttps(c) ? "__Host-colibri_session" : "colibri_session");

export async function startSession(c: Context<AppEnv>, subject: string): Promise<void> {
  const { secretKey, sessionTtlSeconds, auth } = c.var.config;
  const token = await signJwt(secretKey, "session", { sub: subject, mode: auth.mode }, sessionTtlSeconds);
  setCookie(c, sessionCookieName(c), token, {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax",
    path: "/",
    maxAge: sessionTtlSeconds,
  });
}

export const endSession = (c: Context<AppEnv>): void => {
  deleteCookie(c, sessionCookieName(c), { path: "/", secure: isHttps(c) });
};

/** The signed-in admin's subject, or `null`. Sessions issued under another auth mode are rejected. */
export async function currentAdmin(c: Context<AppEnv>): Promise<string | null> {
  const token = getCookie(c, sessionCookieName(c));
  if (!token) return null;
  const payload = await verifyJwt(c.var.config.secretKey, "session", token);
  return payload && payload.mode === c.var.config.auth.mode && typeof payload.sub === "string" ? payload.sub : null;
}
