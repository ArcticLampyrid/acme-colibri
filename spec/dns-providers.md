# DNS providers

[Index](README.md) · Related: [data-model](data-model.md), [acmeproxy-protocol](acmeproxy-protocol.md), [security](security.md), [admin-ui](admin-ui.md)

## Abstraction (`src/providers/`)

A `ProviderDefinition` has `type`, `label`, `fields` (`{name, label, secret}`) and `create(values) → DnsProvider`, where `DnsProvider` offers `addTxtRecord(fqdn, value)` and `removeTxtRecord(fqdn, value)` (both idempotent). Providers throw `ProviderError` with a client-safe message for upstream failures (→ `502`).

`fields` is the single source of truth: the admin API derives its strict zod validation from it (non-secret fields → stored `config`, secret fields → encrypted `secrets`), `GET /api/admin/provider-types` exposes it, and the UI renders its form from it.

**Adding a provider:** implement a definition in `src/providers/<name>.ts`, add it to the list in `src/providers/index.ts`. No schema change is needed.

## Cloudflare (`type: cloudflare`)

| Field | Secret | Notes |
| --- | --- | --- |
| `zone_id` | no | required; Cloudflare Zone ID for all TXT operations |
| `api_token` | yes | required; needs `DNS:Edit` on the configured zone |

- **Zone selection:** use the configured `zone_id` directly for both present and cleanup; no zone discovery or `Zone:Read` permission is needed. Access point suffixes must belong to that zone; Cloudflare rejects invalid zone/name combinations. Use separate provider entries for different zones.
- **present:** `POST /zones/{id}/dns_records` `{type: TXT, name, content: value, ttl: 120}`; Cloudflare codes 81057/81058 (already exists) count as success.
- **cleanup:** list TXT records at the name, delete those whose content (surrounding quotes ignored) equals the value; records with other values are untouched.
- Requests time out after 10 s; API error messages are passed on, tokens never are.
