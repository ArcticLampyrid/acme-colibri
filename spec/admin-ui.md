# Admin UI

[Index](README.md) · Related: [admin-api](admin-api.md), [admin-auth](admin-auth.md), [dns-providers](dns-providers.md)

Svelte 5 + Vite app in `web/`, built to `web/dist` and served as Workers static assets (`pnpm build:web`; `pnpm dev:web` proxies `/api` to `wrangler dev` on :8787). No router: a header with two tabs.

- **Sign-in:** OIDC button or passcode form depending on `GET /api/auth/session` mode; shows `?login_error` results. Disabled mode shows a configuration notice.
- **Zone providers:** list, add, edit, delete. The form is generated from the provider type's `fields` (secret fields are password inputs; when editing they start empty and blank means "keep").
- **Access points:** list, add (Access ID + rows of suffix → zone provider), edit mapping, rotate key, delete. After create/rotate a dialog shows the Access Key once with a copy button and client-specific configure examples for Lego (standard HTTPREQ mode), Caddy, Certbot, cert-manager.io, and acme.sh. Caddy requires the `caddy-dns/acmeproxy` module; Certbot uses the `certbot-httpreq` plugin; cert-manager.io uses Saturn Cloud's `cert-manager-webhook-httpreq` webhook. The key exists only in component memory and is dropped when the dialog closes. The dialog owns the vertical overflow; code examples wrap long lines and do not create nested horizontal or vertical scrollbars.
