import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM access_point_domains"),
    env.DB.prepare("DELETE FROM access_points"),
    env.DB.prepare("DELETE FROM zone_providers"),
  ]);
});
