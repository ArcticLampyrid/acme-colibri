export type ZoneProviderRow = {
  id: string;
  type: string;
  /** Non-secret field values. */
  config: Record<string, string>;
  /** AES-GCM envelope of the secret field values. */
  secretsEnc: string;
  createdAt: string;
  updatedAt: string;
};

type Raw = { id: string; type: string; config: string; secrets_enc: string; created_at: string; updated_at: string };

const fromRaw = (r: Raw): ZoneProviderRow => ({
  id: r.id,
  type: r.type,
  config: JSON.parse(r.config) as Record<string, string>,
  secretsEnc: r.secrets_enc,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listZoneProviders(db: D1Database): Promise<ZoneProviderRow[]> {
  const { results } = await db.prepare("SELECT * FROM zone_providers ORDER BY id").all<Raw>();
  return results.map(fromRaw);
}

export async function getZoneProvider(db: D1Database, id: string): Promise<ZoneProviderRow | null> {
  const raw = await db.prepare("SELECT * FROM zone_providers WHERE id = ?").bind(id).first<Raw>();
  return raw ? fromRaw(raw) : null;
}

export async function insertZoneProvider(db: D1Database, row: ZoneProviderRow): Promise<void> {
  await db
    .prepare("INSERT INTO zone_providers (id, type, config, secrets_enc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.type, JSON.stringify(row.config), row.secretsEnc, row.createdAt, row.updatedAt)
    .run();
}

export async function updateZoneProvider(
  db: D1Database,
  row: Pick<ZoneProviderRow, "id" | "config" | "secretsEnc" | "updatedAt">,
): Promise<void> {
  await db
    .prepare("UPDATE zone_providers SET config = ?, secrets_enc = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(row.config), row.secretsEnc, row.updatedAt, row.id)
    .run();
}

export async function deleteZoneProvider(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM zone_providers WHERE id = ?").bind(id).run();
}

/** Ids of the access points whose `provides` mapping references this zone provider. */
export async function accessPointsUsingZoneProvider(db: D1Database, id: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT DISTINCT access_point_id FROM access_point_domains WHERE zone_provider_id = ? ORDER BY 1")
    .bind(id)
    .all<{ access_point_id: string }>();
  return results.map((r) => r.access_point_id);
}
