# Security

[Index](README.md) · Related: [data-model](data-model.md), [admin-auth](admin-auth.md), [acmeproxy-protocol](acmeproxy-protocol.md), [configuration](configuration.md)

## Access Keys

Generated server-side as 32 random bytes (base64url, 256 bit), returned once at create/rotate, stored only as SHA-256 hex in D1. Verification hashes the presented key and compares in constant time (`timingSafeEqual`), including for unknown Access IDs. SHA-256 (no slow KDF) is appropriate because the keys are high-entropy.

## Zone provider secrets

Secret fields are serialized to JSON and encrypted with AES-256-GCM before storage: envelope `v1.<iv>.<ciphertext>` (base64url, random 96-bit IV). The key is derived from `SECRET_KEY` with HKDF-SHA-256 (purpose-specific `info`; separate keys for zone secrets, sessions and OIDC state). The additional authenticated data is `zone-provider:<id>`, so a ciphertext cannot be moved to another row. Secrets are decrypted only when serving a proxy request or merging a `PATCH`; they are never present in any API response. Rotating `SECRET_KEY` requires re-entering all provider tokens.

## Other measures

- Strict input validation: names ([domain-rules](domain-rules.md)), TXT values, body size, zod on every admin body.
- Upstream errors are mapped to a fixed safe message (`502`); unexpected errors give a generic `500`.
- CSRF protection and cookie flags: see [admin-auth](admin-auth.md). OIDC ID tokens are accepted only with asymmetric signatures.
- `Cache-Control: no-store` on all Worker responses except `/health`.

## No audit logging

By requirement there is **no audit feature**: no audit tables, no per-request/operation logs. Only `console.error` diagnostics for failures (OIDC failure reasons, unexpected exceptions, invalid configuration) exist, and they must never include secrets or tokens.
