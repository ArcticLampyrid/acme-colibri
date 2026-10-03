import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import {
  deleteAccessPoint,
  getAccessPoint,
  insertAccessPoint,
  listAccessPoints,
  replaceProvides,
  setKeyHash,
  type AccessPointRow,
} from "../db/accessPoints";
import { listZoneProviders } from "../db/zoneProviders";
import { randomToken, sha256Hex } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import { InvalidFqdnError, normalizeFqdn } from "../lib/fqdn";
import { parseJson } from "../lib/http";
import { idSchema } from "./schemas";

/** API representation. The key hash is never included. */
const toResponse = ({ id, provides, createdAt, updatedAt }: AccessPointRow) => ({ id, provides, createdAt, updatedAt });

const providesSchema = z.record(z.string(), z.string()).refine((p) => Object.keys(p).length <= 100, "at most 100 entries");

/**
 * Normalize suffix keys (lowercase, no trailing dot, Punycode) and check the referenced zone providers exist.
 * Two keys that normalize to the same suffix are rejected.
 */
async function normalizeProvides(db: D1Database, raw: Record<string, string>): Promise<Record<string, string>> {
  const known = new Set((await listZoneProviders(db)).map((z) => z.id));
  const entries = Object.entries(raw).map(([suffix, zoneId]): [string, string] => {
    try {
      if (!known.has(zoneId)) throw new HttpError(400, `unknown zone provider "${zoneId}"`);
      return [normalizeFqdn(suffix), zoneId];
    } catch (e) {
      if (e instanceof InvalidFqdnError) throw new HttpError(400, `invalid domain suffix "${suffix.slice(0, 100)}"`);
      throw e;
    }
  });
  const normalized = Object.fromEntries(entries);
  if (Object.keys(normalized).length !== entries.length) throw new HttpError(400, "duplicate domain suffix");
  return normalized;
}

/** A new Access Key: returned to the caller exactly once; only its SHA-256 is stored. */
const newAccessKey = async () => {
  const key = randomToken(32);
  return { key, keyHash: await sha256Hex(key) };
};

const requireAccessPoint = async (db: D1Database, id: string) => {
  const row = await getAccessPoint(db, id);
  if (!row) throw new HttpError(404, `access point "${id}" not found`);
  return row;
};

export const accessPointRoutes = new Hono<AppEnv>();

accessPointRoutes.get("/access-points", async (c) => c.json((await listAccessPoints(c.env.DB)).map(toResponse)));

accessPointRoutes.get("/access-points/:id", async (c) =>
  c.json(toResponse(await requireAccessPoint(c.env.DB, c.req.param("id")))),
);

accessPointRoutes.post("/access-points", async (c) => {
  const body = await parseJson(c, z.object({ id: idSchema, provides: providesSchema.default({}) }));
  if (await getAccessPoint(c.env.DB, body.id)) throw new HttpError(409, `access point "${body.id}" already exists`);

  const { key, keyHash } = await newAccessKey();
  const now = new Date().toISOString();
  const row: AccessPointRow = {
    id: body.id,
    keyHash,
    provides: await normalizeProvides(c.env.DB, body.provides),
    createdAt: now,
    updatedAt: now,
  };
  await insertAccessPoint(c.env.DB, row);
  return c.json({ accessPoint: toResponse(row), key }, 201);
});

accessPointRoutes.put("/access-points/:id", async (c) => {
  const existing = await requireAccessPoint(c.env.DB, c.req.param("id"));
  const body = await parseJson(c, z.object({ provides: providesSchema }));
  const provides = await normalizeProvides(c.env.DB, body.provides);
  const updatedAt = new Date().toISOString();
  await replaceProvides(c.env.DB, existing.id, provides, updatedAt);
  return c.json(toResponse({ ...existing, provides, updatedAt }));
});

accessPointRoutes.post("/access-points/:id/rotate-key", async (c) => {
  const existing = await requireAccessPoint(c.env.DB, c.req.param("id"));
  const { key, keyHash } = await newAccessKey();
  const updatedAt = new Date().toISOString();
  await setKeyHash(c.env.DB, existing.id, keyHash, updatedAt);
  return c.json({ accessPoint: toResponse({ ...existing, updatedAt }), key });
});

accessPointRoutes.delete("/access-points/:id", async (c) => {
  await requireAccessPoint(c.env.DB, c.req.param("id"));
  await deleteAccessPoint(c.env.DB, c.req.param("id"));
  return c.body(null, 204);
});
