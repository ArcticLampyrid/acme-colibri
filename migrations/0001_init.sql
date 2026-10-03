-- Zone providers: upstream DNS credentials. `config` holds non-secret fields (JSON),
-- `secrets_enc` holds the AES-GCM encrypted secret fields (see spec/security.md).
CREATE TABLE zone_providers (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  config      TEXT NOT NULL,
  secrets_enc TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Access points: Access ID (id) + SHA-256 hash (hex) of the Access Key.
CREATE TABLE access_points (
  id         TEXT PRIMARY KEY,
  key_hash   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Allowed domain suffix -> zone provider mapping of an access point.
CREATE TABLE access_point_domains (
  access_point_id  TEXT NOT NULL REFERENCES access_points(id) ON DELETE CASCADE,
  suffix           TEXT NOT NULL,
  zone_provider_id TEXT NOT NULL REFERENCES zone_providers(id) ON DELETE RESTRICT,
  PRIMARY KEY (access_point_id, suffix)
);

CREATE INDEX idx_access_point_domains_zone ON access_point_domains(zone_provider_id);
