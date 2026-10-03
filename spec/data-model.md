# Data model

[Index](README.md) · Related: [security](security.md), [domain-rules](domain-rules.md), [dns-providers](dns-providers.md), [admin-api](admin-api.md)

Schema: `migrations/0001_init.sql` (D1, foreign keys enforced). Timestamps are ISO-8601 UTC strings.

## Ids

Zone Provider IDs and Access IDs are user-defined, immutable, and match `^[a-z0-9][a-z0-9_-]{0,63}$` (safe in HTTP Basic auth and URLs).

## Zone Provider (`zone_providers`)

A named set of upstream credentials: `id`, `type` (e.g. `cloudflare`), `config` (JSON of the **non-secret** fields), `secrets_enc` (AES-GCM envelope of the **secret** fields, see [security](security.md)). Which fields exist and which are secret is defined by the provider ([dns-providers](dns-providers.md)).

Example: `cf-zone-main` = cloudflare, config `{zone_id}`, secrets `{api_token}`.

## Access Point (`access_points` + `access_point_domains`)

`id` is the **Access ID**; `key_hash` is the hex SHA-256 of the Access Key. `provides` is a mapping *domain suffix → Zone Provider ID* (one row per suffix, PK `(access_point_id, suffix)`).

Example: `ap1` provides `{"main.com": "cf-zone-main", "abc.side.com": "cf-zone-side"}`.

- Suffixes are stored normalized ([domain-rules](domain-rules.md)); two suffixes normalizing to the same value are rejected.
- Deleting an access point cascades to its domain rows.
- A zone provider referenced by any access point cannot be deleted (`ON DELETE RESTRICT`; the API answers `409` listing the access points).
- Replacing `provides` and creating an access point are single atomic D1 batches.
