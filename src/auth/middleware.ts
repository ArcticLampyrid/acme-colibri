import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app";
import { HttpError } from "../lib/errors";
import { currentAdmin } from "./session";

/** Admin API guard: 503 when no auth mode is configured, 401 without a valid session. */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.var.config.auth.mode === "disabled") {
    throw new HttpError(503, "admin interface is disabled: configure OIDC_* or ADMIN_PASSWORD");
  }
  if (!(await currentAdmin(c))) throw new HttpError(401, "authentication required");
  await next();
});

/** CSRF defence for cookie-authenticated requests: refuse cross-site state-changing requests. */
export const sameOriginOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    const crossSite = c.req.header("Sec-Fetch-Site") === "cross-site";
    if (crossSite || (origin !== undefined && origin !== new URL(c.req.url).origin)) {
      throw new HttpError(403, "cross-origin request refused");
    }
  }
  await next();
});
