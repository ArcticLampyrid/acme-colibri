import { Hono } from "hono";
import { ZodError } from "zod";
import { acmeProxyRoutes } from "./acmeproxy/routes";
import { accessPointRoutes } from "./admin/accessPoints";
import { zoneProviderRoutes } from "./admin/zoneProviders";
import { requireAdmin, sameOriginOnly } from "./auth/middleware";
import { authRoutes } from "./auth/routes";
import { parseConfig, type AppConfig } from "./config";
import type { Bindings } from "./env";
import { HttpError } from "./lib/errors";

export type AppEnv = { Bindings: Bindings; Variables: { config: AppConfig } };

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ ok: true }));

// Validate configuration for everything that needs it (all routes except /health).
app.use("*", async (c, next) => {
  try {
    c.set("config", parseConfig(c.env));
  } catch (e) {
    const detail = e instanceof ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : String(e);
    console.error("Invalid configuration:", detail);
    throw new HttpError(500, `server misconfigured: ${detail}`);
  }
  c.header("Cache-Control", "no-store");
  await next();
});

app.route("/", acmeProxyRoutes);

app.use("/api/*", sameOriginOnly);
app.route("/api/auth", authRoutes);
app.use("/api/admin/*", requireAdmin);
app.route("/api/admin", zoneProviderRoutes);
app.route("/api/admin", accessPointRoutes);

app.notFound((c) => c.json({ error: "not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status, err.headers);
  console.error("Unhandled error:", err instanceof Error ? err.stack : err);
  return c.json({ error: "internal server error" }, 500);
});

export default app;
