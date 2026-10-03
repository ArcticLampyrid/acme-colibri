# ACME proxy protocol

[Index](README.md) · Related: [domain-rules](domain-rules.md), [dns-providers](dns-providers.md), [data-model](data-model.md), [security](security.md)

Compatible with acmeproxy clients and Lego's `httpreq` provider (standard and raw modes).

## Endpoints

| Request | Effect |
| --- | --- |
| `POST /present` | create the TXT record (idempotent: an identical existing record is success) |
| `POST /cleanup` | delete TXT record(s) at that name whose content equals the value; none found → success |

Only these two endpoints exist; no other DNS record types or operations are reachable. Bodies may use JSON, `application/x-www-form-urlencoded`, or `multipart/form-data`; standard mode uses `fqdn` and `value`, while raw mode uses `domain`, `token`, and `keyAuth`. Form encoding is supported for HTTPREQ adapters such as `certbot-httpreq`. There is no application-level body size limit.

## Authentication

HTTP Basic: username = **Access ID**, password = **Access Key**. The key is hashed with SHA-256 and compared in constant time with the stored hash; an unknown Access ID is compared against a dummy hash so both paths do equal work. Failure: `401` with `WWW-Authenticate: Basic realm="acme-colibri"`.

## Request bodies

| Mode | Body | Derived record |
| --- | --- | --- |
| standard (acmeproxy; Lego `HTTPREQ_MODE` unset) | `{"fqdn": "_acme-challenge.example.com.", "value": "<txt>"}` | as given |
| raw (Lego `HTTPREQ_MODE=RAW`) | `{"domain": "example.com", "token": "…", "keyAuth": "…"}` | name `_acme-challenge.<domain>`; value `base64url(SHA-256(keyAuth))` |

Detection: a body with `keyAuth` and no `fqdn` is raw, anything else is validated as standard. This detection applies equally to JSON and form-encoded bodies. In raw mode a leading `*.` on `domain` is stripped (wildcard orders). The TXT value is not validated beyond being a non-empty string (standard mode) in either length or alphabet; in raw mode it is derived as `base64url(SHA-256(keyAuth))`.

## Processing order and responses

1. Authenticate → `401`.
2. Parse/validate body, normalize name ([domain-rules](domain-rules.md)) → `400` (bad JSON/form body, bad shape, invalid name, invalid value).
3. Authorize: name must be `_acme-challenge.<domain>` and `<domain>` must fall under one of the access point's suffixes (longest match wins) → `403` otherwise.
4. Load the matched zone provider, decrypt its secrets, call the provider ([dns-providers](dns-providers.md)). Upstream failure → `502 {"error": "<safe message>"}` (never contains credentials).
5. Success → `200 {"fqdn": "<normalized name>.", "value": "<txt>"}`.

Example (Lego standard mode): `HTTPREQ_ENDPOINT=https://acme.example.com HTTPREQ_USERNAME=ap1 HTTPREQ_PASSWORD=<key> lego --dns httpreq -d example.com -d '*.example.com' -m you@example.com run`. Lego's raw mode remains supported but is not needed for this proxy.
