# Domain rules

[Index](README.md) · Related: [acmeproxy-protocol](acmeproxy-protocol.md), [data-model](data-model.md)

Implemented in `src/lib/fqdn.ts`.

## Normalization (`normalizeFqdn`)

Applied to request names and to stored suffixes:

1. trim, lowercase;
2. reject empty/oversized input or any of whitespace `/ \ ? # @ : [ ] % < > | ^ " ' \` { } *`;
3. IDN → Punycode via the URL host parser (UTS #46);
4. strip **one** trailing dot;
5. strict validation: total ≤ 253 chars; each label 1–63 chars of `[a-z0-9_-]`, not starting/ending with `-`; the last label must not be all digits (rejects IPv4 literals).

Anything else (empty labels, `a..b`, ports, paths, IPs, wildcards) → invalid.

## Operation scope

A record name is acceptable only if it is `_acme-challenge.<domain>` with a non-empty `<domain>`. Record type is always TXT; the value is any non-empty string ([acmeproxy-protocol](acmeproxy-protocol.md)).

## Suffix matching

`<domain>` matches suffix `S` if `domain == S` or `domain` ends with `.S` (label boundary: `evilmain.com` does **not** match `main.com`). Among several matching suffixes the longest wins, so a more specific suffix can route to a different zone provider. The wildcard challenge `_acme-challenge.main.com` (for `*.main.com`) matches suffix `main.com`.
