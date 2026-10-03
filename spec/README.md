# acme-colibri specification

Reference description of the implemented behavior. Keep it in sync with the code (see [AGENTS.md](../AGENTS.md)).

| Document | Contents |
| --- | --- |
| [architecture.md](architecture.md) | Components, request routing, code layout |
| [configuration.md](configuration.md) | Environment variables, secrets, bindings |
| [data-model.md](data-model.md) | Zone Provider, Access Point, D1 schema, id rules |
| [acmeproxy-protocol.md](acmeproxy-protocol.md) | `/present`, `/cleanup`, accepted request bodies, status codes |
| [domain-rules.md](domain-rules.md) | FQDN normalization, suffix matching, operation scope |
| [dns-providers.md](dns-providers.md) | Provider abstraction and the Cloudflare implementation |
| [admin-auth.md](admin-auth.md) | OIDC mode, passcode mode, sessions, CSRF |
| [admin-api.md](admin-api.md) | Admin REST API |
| [admin-ui.md](admin-ui.md) | Svelte admin frontend |
| [security.md](security.md) | Credential handling and the no-audit constraint |
