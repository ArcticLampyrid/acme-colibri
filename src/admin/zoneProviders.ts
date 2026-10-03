import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import {
  accessPointsUsingZoneProvider,
  deleteZoneProvider,
  getZoneProvider,
  insertZoneProvider,
  listZoneProviders,
  updateZoneProvider,
  type ZoneProviderRow,
} from "../db/zoneProviders";
import { decryptJson, encryptJson } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import { readJson, validate } from "../lib/http";
import { fieldSchemas, getProviderDefinition, listProviderTypes, secretsAad } from "../providers";
import { idSchema } from "./schemas";

/** API representation. Secrets are never included - only the non-secret `config`. */
const toResponse = ({ id, type, config, createdAt, updatedAt }: ZoneProviderRow) => ({
  id,
  type,
  config,
  createdAt,
  updatedAt,
});

const definitionOf = (type: string) => {
  const def = getProviderDefinition(type);
  if (!def) throw new HttpError(400, `unknown provider type "${type}"`);
  return def;
};

const requireZoneProvider = async (db: D1Database, id: string) => {
  const row = await getZoneProvider(db, id);
  if (!row) throw new HttpError(404, `zone provider "${id}" not found`);
  return row;
};

// The provider-specific `config` / `secrets` shapes are validated in a second step, once `type` is known.
const createEnvelope = z.object({
  id: idSchema,
  type: z.string().min(1),
  config: z.unknown(),
  secrets: z.unknown(),
});
const updateEnvelope = z.object({ config: z.unknown().optional(), secrets: z.unknown().optional() });

export const zoneProviderRoutes = new Hono<AppEnv>();

zoneProviderRoutes.get("/provider-types", (c) => c.json(listProviderTypes()));

zoneProviderRoutes.get("/zone-providers", async (c) =>
  c.json((await listZoneProviders(c.env.DB)).map(toResponse)),
);

zoneProviderRoutes.get("/zone-providers/:id", async (c) =>
  c.json(toResponse(await requireZoneProvider(c.env.DB, c.req.param("id")))),
);

zoneProviderRoutes.post("/zone-providers", async (c) => {
  const { id, type, ...rest } = validate(createEnvelope, await readJson(c));
  const schemas = fieldSchemas(definitionOf(type), { partial: false });
  const config = validate(schemas.config, rest.config ?? {});
  const secrets = validate(schemas.secrets, rest.secrets ?? {});

  if (await getZoneProvider(c.env.DB, id)) throw new HttpError(409, `zone provider "${id}" already exists`);
  const now = new Date().toISOString();
  const row: ZoneProviderRow = {
    id,
    type,
    config,
    secretsEnc: await encryptJson(c.var.config.secretKey, secretsAad(id), secrets),
    createdAt: now,
    updatedAt: now,
  };
  await insertZoneProvider(c.env.DB, row);
  return c.json(toResponse(row), 201);
});

/** Partial update: omitted config/secret fields keep their stored values (secrets can be rotated without re-entering the rest). */
zoneProviderRoutes.patch("/zone-providers/:id", async (c) => {
  const existing = await requireZoneProvider(c.env.DB, c.req.param("id"));
  const body = validate(updateEnvelope, await readJson(c));
  const schemas = fieldSchemas(definitionOf(existing.type), { partial: true });
  const configPatch = validate(schemas.config, body.config ?? {});
  const secretsPatch = validate(schemas.secrets, body.secrets ?? {});

  const { secretKey } = c.var.config;
  const currentSecrets = (await decryptJson(secretKey, secretsAad(existing.id), existing.secretsEnc)) as Record<string, string>;
  const row: ZoneProviderRow = {
    ...existing,
    config: { ...existing.config, ...configPatch },
    secretsEnc: await encryptJson(secretKey, secretsAad(existing.id), { ...currentSecrets, ...secretsPatch }),
    updatedAt: new Date().toISOString(),
  };
  await updateZoneProvider(c.env.DB, row);
  return c.json(toResponse(row));
});

zoneProviderRoutes.delete("/zone-providers/:id", async (c) => {
  const id = c.req.param("id");
  await requireZoneProvider(c.env.DB, id);
  const users = await accessPointsUsingZoneProvider(c.env.DB, id);
  if (users.length > 0) {
    throw new HttpError(409, `zone provider "${id}" is used by access point(s): ${users.join(", ")}`);
  }
  await deleteZoneProvider(c.env.DB, id);
  return c.body(null, 204);
});
