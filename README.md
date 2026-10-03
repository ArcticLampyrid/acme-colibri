# acme-colibri

An [acmeproxy](https://github.com/mdbraber/acmeproxy)-compatible ACME DNS-01 proxy that runs on Cloudflare Workers. ACME clients (Lego, …) get a scoped **Access ID + Key** instead of your DNS provider credentials; the proxy checks which domains that key may touch and forwards the TXT record change to the DNS provider (Cloudflare for now).

- Works with the acmeproxy protocol and Lego's `httpreq` provider (standard and raw mode)
- Per-client access points limited to domain suffixes, `_acme-challenge` TXT records only
- Access keys are shown once and stored hashed; DNS provider tokens are stored encrypted
- Admin UI protected by OIDC (with optional email / group restrictions) or a passcode

## Deploy

```sh
pnpm install
pnpx wrangler d1 create acme-colibri
pnpm run db:migrate:remote
pnpx wrangler secret put SECRET_KEY        # >= 32 random chars: openssl rand -base64 48
```

Choose how admins sign in, and then set vars via dashboard:

**OIDC** — `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (secret), optionally `OIDC_ALLOWED_EMAILS` / `OIDC_ALLOWED_GROUPS` (comma separated; with neither set, *every* user your IdP authenticates is an admin). Register `https://<your-host>/api/auth/oidc/callback` as the redirect URI.

**Passcode** (used when `OIDC_ISSUER` is not set): `ADMIN_PASSWORD` (secret).

Verification is a cheap constant-time comparison, so it fits the free plan's 10 ms CPU limit. Use a long random password and consider a Cloudflare rate-limiting rule on `/api/auth/login`.

```sh
pnpm run deploy
```

All options are listed in [spec/configuration.md](spec/configuration.md).

## Use

1. Open the admin UI, add a **zone provider**: Cloudflare Zone ID and an API token with `DNS:Edit` for that zone.
2. Add an **access point**: an Access ID and the domain suffixes it may manage, each mapped to a zone provider (e.g. `example.com → cf-main`). Copy the generated **Access Key** — it is shown only once.
3. Point your ACME client at the proxy:

```sh
HTTPREQ_ENDPOINT=https://acme.example.com \
HTTPREQ_USERNAME=<access id> \
HTTPREQ_PASSWORD=<access key> \
lego --dns httpreq -d example.com -d '*.example.com' -m you@example.com run
```

The create/rotate dialog includes setup examples for Lego, Caddy, Certbot, acme.sh, and cert-manager.io. Caddy uses its ACMEProxy DNS module, Certbot uses the `certbot-httpreq` plugin, and cert-manager.io uses Saturn Cloud's HTTPREQ webhook; all adapters send `POST /present` and `POST /cleanup` with HTTP Basic auth.

## Develop

```sh
cp .dev.vars.example .dev.vars   # then fill in
pnpm run db:migrate:local
pnpm run dev                      # builds the UI, runs wrangler dev on :8787
pnpm test                         # vitest in the Workers runtime
pnpm run typecheck
```

Behavior is specified in [spec/](spec/README.md); contributor notes are in [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
