export type AccessPointRow = {
  /** The user-defined Access ID. */
  id: string;
  /** Hex SHA-256 of the Access Key. */
  keyHash: string;
  /** Normalized domain suffix -> zone provider id. */
  provides: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

type RawAp = { id: string; key_hash: string; created_at: string; updated_at: string };
type RawDomain = { access_point_id: string; suffix: string; zone_provider_id: string };

const assemble = (aps: RawAp[], domains: RawDomain[]): AccessPointRow[] =>
  aps.map((ap) => ({
    id: ap.id,
    keyHash: ap.key_hash,
    provides: Object.fromEntries(
      domains.filter((d) => d.access_point_id === ap.id).map((d) => [d.suffix, d.zone_provider_id]),
    ),
    createdAt: ap.created_at,
    updatedAt: ap.updated_at,
  }));

export async function listAccessPoints(db: D1Database): Promise<AccessPointRow[]> {
  const [aps, domains] = await db.batch<RawAp | RawDomain>([
    db.prepare("SELECT * FROM access_points ORDER BY id"),
    db.prepare("SELECT * FROM access_point_domains ORDER BY access_point_id, suffix"),
  ]);
  return assemble(aps!.results as RawAp[], domains!.results as RawDomain[]);
}

export async function getAccessPoint(db: D1Database, id: string): Promise<AccessPointRow | null> {
  const [aps, domains] = await db.batch<RawAp | RawDomain>([
    db.prepare("SELECT * FROM access_points WHERE id = ?").bind(id),
    db.prepare("SELECT * FROM access_point_domains WHERE access_point_id = ? ORDER BY suffix").bind(id),
  ]);
  return assemble(aps!.results as RawAp[], domains!.results as RawDomain[])[0] ?? null;
}

const insertDomains = (db: D1Database, id: string, provides: Record<string, string>) =>
  Object.entries(provides).map(([suffix, zoneId]) =>
    db
      .prepare("INSERT INTO access_point_domains (access_point_id, suffix, zone_provider_id) VALUES (?, ?, ?)")
      .bind(id, suffix, zoneId),
  );

/** Atomic (D1 batch = one transaction). */
export async function insertAccessPoint(db: D1Database, row: AccessPointRow): Promise<void> {
  await db.batch([
    db
      .prepare("INSERT INTO access_points (id, key_hash, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .bind(row.id, row.keyHash, row.createdAt, row.updatedAt),
    ...insertDomains(db, row.id, row.provides),
  ]);
}

/** Replace the whole `provides` mapping atomically. */
export async function replaceProvides(
  db: D1Database,
  id: string,
  provides: Record<string, string>,
  updatedAt: string,
): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM access_point_domains WHERE access_point_id = ?").bind(id),
    ...insertDomains(db, id, provides),
    db.prepare("UPDATE access_points SET updated_at = ? WHERE id = ?").bind(updatedAt, id),
  ]);
}

export async function setKeyHash(db: D1Database, id: string, keyHash: string, updatedAt: string): Promise<void> {
  await db
    .prepare("UPDATE access_points SET key_hash = ?, updated_at = ? WHERE id = ?")
    .bind(keyHash, updatedAt, id)
    .run();
}

export async function deleteAccessPoint(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM access_points WHERE id = ?").bind(id).run();
}
