# Architecture

[Index](README.md) · Related: [configuration](configuration.md), [acmeproxy-protocol](acmeproxy-protocol.md), [admin-api](admin-api.md), [dns-providers](dns-providers.md)

A single Cloudflare Worker (Hono, TypeScript) plus a static Svelte admin UI served via Workers Static Assets. D1 stores all application data; env vars / Worker Secrets hold system configuration.

## Request routing

`wrangler.toml` `assets.run_worker_first` sends only these paths to the Worker; everything else is a static asset (SPA fallback to `index.html`):

| Path | Handler |
| --- | --- |
| `GET /health` | liveness, no configuration needed |
| `POST /present`, `POST /cleanup` | [ACME proxy](acmeproxy-protocol.md) |
| `/api/auth/*` | [admin authentication](admin-auth.md) |
| `/api/admin/*` | [admin API](admin-api.md) (requires session) |

Every other route inside the Worker returns `404 {"error":"not found"}`.

## Cross-cutting behavior

- Configuration is parsed and validated per request ([configuration](configuration.md)); invalid config → `500 server misconfigured: …` (field names only, never values). `/health` skips this.
- All responses (except static assets and `/health`) carry `Cache-Control: no-store`.
- Errors are JSON `{"error": "<message>"}`. `HttpError` messages are client-safe; any other exception is logged with `console.error` and returned as `500 internal server error`.
- There is no audit logging or request logging (see [security](security.md)).

## Code layout

```
src/app.ts            route composition, config middleware, error handling
src/config.ts         env -> typed AppConfig (zod)
src/acmeproxy/        auth (Basic), protocol (body parsing), authorize (suffix -> zone), routes
src/auth/             jwt, session cookies, oidc flow, middleware, routes
src/admin/            zone provider + access point CRUD
src/db/               D1 queries (row <-> typed objects)
src/providers/        provider registry, types, cloudflare
src/lib/              crypto, fqdn, http helpers, errors
web/                  Svelte UI (built to web/dist)
migrations/           D1 SQL migrations
```
