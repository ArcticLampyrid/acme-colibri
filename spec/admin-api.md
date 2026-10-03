# Admin API

[Index](README.md) · Related: [admin-auth](admin-auth.md), [data-model](data-model.md), [dns-providers](dns-providers.md), [security](security.md)

All under `/api/admin`, JSON, session required ([admin-auth](admin-auth.md)). Validation errors → `400 {"error": "path: message; …"}`.

## Provider types

`GET /provider-types` → `[{type, label, fields: [{name, label, secret}]}]`.

## Zone providers

| Method & path | Body | Result |
| --- | --- | --- |
| `GET /zone-providers`, `GET /zone-providers/:id` | | `{id, type, config, createdAt, updatedAt}` — **no secrets, ever** |
| `POST /zone-providers` | `{id, type, config: {…non-secret}, secrets: {…secret}}` (strict: exactly the provider's fields) | `201`; `409` if the id exists |
| `PATCH /zone-providers/:id` | `{config?, secrets?}` — any subset of fields; omitted ones keep their value | `200` |
| `DELETE /zone-providers/:id` | | `204`; `409` while referenced by an access point |

`type` cannot be changed after creation.

## Access points

| Method & path | Body | Result |
| --- | --- | --- |
| `GET /access-points`, `GET /access-points/:id` | | `{id, provides, createdAt, updatedAt}` — no key, no hash |
| `POST /access-points` | `{id, provides: {suffix: zoneProviderId}}` (≤ 100 entries) | `201 {accessPoint, key}`; the **key is returned only here** |
| `PUT /access-points/:id` | `{provides}` — replaces the whole mapping | `200` |
| `POST /access-points/:id/rotate-key` | | `{accessPoint, key}` — new key shown once, old key stops working immediately |
| `DELETE /access-points/:id` | | `204` |

Suffixes are normalized ([domain-rules](domain-rules.md)); unknown zone provider ids, invalid suffixes, or duplicates after normalization → `400`.
