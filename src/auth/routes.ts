import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../app";
import { secretsEqual, timingSafeEqualStr } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import { isHttps, parseJson } from "../lib/http";
import { signJwt, verifyJwt } from "./jwt";
import { beginLogin, completeLogin, isAllowed, redirectUriFor, subjectOf, type LoginState } from "./oidc";
import { currentAdmin, endSession, startSession } from "./session";

const OIDC_COOKIE = "colibri_oidc";
const OIDC_COOKIE_PATH = "/api/auth/oidc";
const OIDC_STATE_TTL_SECONDS = 600;

export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/session", async (c) => c.json({ mode: c.var.config.auth.mode, user: await currentAdmin(c) }));

authRoutes.post("/logout", (c) => {
  endSession(c);
  return c.body(null, 204);
});

// ---------- passcode mode ----------

authRoutes.post("/login", async (c) => {
  const { auth } = c.var.config;
  if (auth.mode !== "passcode") throw new HttpError(404, "passcode login is not enabled");
  const { password } = await parseJson(c, z.object({ password: z.string().min(1).max(1024) }));
  if (!(await secretsEqual(password, auth.password))) throw new HttpError(401, "invalid passcode");
  await startSession(c, "admin");
  return c.json({ user: "admin" });
});

// ---------- OIDC mode ----------

authRoutes.get("/oidc/login", async (c) => {
  const { auth, secretKey } = c.var.config;
  if (auth.mode !== "oidc") throw new HttpError(404, "OIDC login is not enabled");

  const { location, login } = await beginLogin(auth.oidc, redirectUriFor(auth.oidc, c.req.url));
  setCookie(c, OIDC_COOKIE, await signJwt(secretKey, "oidc-state", login, OIDC_STATE_TTL_SECONDS), {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax", // must accompany the top-level redirect back from the IdP
    path: OIDC_COOKIE_PATH,
    maxAge: OIDC_STATE_TTL_SECONDS,
  });
  return c.redirect(location, 302);
});

authRoutes.get("/oidc/callback", async (c) => {
  const { auth, secretKey } = c.var.config;
  if (auth.mode !== "oidc") throw new HttpError(404, "OIDC login is not enabled");
  const fail = (reason: "denied" | "failed") => c.redirect(`/?login_error=${reason}`, 302);

  const cookie = getCookie(c, OIDC_COOKIE);
  deleteCookie(c, OIDC_COOKIE, { path: OIDC_COOKIE_PATH, secure: isHttps(c) });

  const code = c.req.query("code");
  const state = c.req.query("state");
  const saved = cookie ? await verifyJwt(secretKey, "oidc-state", cookie) : null;
  if (!saved || !code || !state || typeof saved.state !== "string" || !timingSafeEqualStr(state, saved.state)) {
    return fail("failed");
  }

  try {
    const login = saved as unknown as LoginState;
    const claims = await completeLogin(auth.oidc, redirectUriFor(auth.oidc, c.req.url), login, code);
    if (!isAllowed(auth.oidc, claims)) return fail("denied");
    await startSession(c, subjectOf(claims));
    return c.redirect("/", 302);
  } catch (e) {
    console.error("OIDC login failed:", e instanceof Error ? e.message : "unknown error");
    return fail("failed");
  }
});
