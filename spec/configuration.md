# Configuration

[Index](README.md) · Related: [admin-auth](admin-auth.md), [security](security.md), [architecture](architecture.md)

Vars and secrects are set via Cloudflare dashboard. For local development, use `.dev.vars` (see `.dev.vars.example`) to provide values.

> Why not use `wrangler.toml`? Deployment-specific details—secret or not—don't belong in source control. While not officially recommended, keeping them separate remains a best practice.

D1 binding is `DB`; static assets binding is `ASSETS`.

> Do not store database id in `wrangler.toml` to avoid commiting deployment-specific details. Without ID, `wrangler` will find the database by name.

| Name | Kind | Required | Description |
| --- | --- | --- | --- |
| `SECRET_KEY` | secret | always | Random string, ≥ 32 chars. Root of all derived keys ([security](security.md)). Changing it invalidates sessions **and makes stored zone provider tokens undecryptable**. |
| `ADMIN_PASSWORD` | secret | passcode mode | Admin password in cleartext (set with `wrangler secret put`). |
| `OIDC_ISSUER` | var | OIDC mode | Issuer URL (https, or `http://localhost…`). Setting it **selects OIDC mode**. |
| `OIDC_CLIENT_ID` | var | OIDC mode | |
| `OIDC_CLIENT_SECRET` | secret | OIDC mode | |
| `OIDC_SCOPES` | var | no | Default `openid email profile` (add the scope your IdP needs for groups). |
| `OIDC_REDIRECT_URI` | var | no | Default `<request origin>/api/auth/oidc/callback`. |
| `OIDC_ALLOWED_EMAILS` | var | no | Comma-separated, case-insensitive. |
| `OIDC_ALLOWED_GROUPS` | var | no | Comma-separated, case-sensitive. |
| `OIDC_GROUPS_CLAIM` | var | no | Default `groups`. Exact claim name first, otherwise dotted path (e.g. `realm_access.roles`). Value may be an array or a string. |
| `SESSION_TTL_SECONDS` | var | no | Default 28800 (8 h); range 60 – 2 592 000. |

Mode selection: `OIDC_ISSUER` set → OIDC; else `ADMIN_PASSWORD` set → passcode; else the admin interface is **disabled** (admin API `503`, the UI shows a notice) while the ACME proxy keeps working. Only one mode is active at a time.
