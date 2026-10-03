# Admin authentication

[Index](README.md) · Related: [configuration](configuration.md), [admin-api](admin-api.md), [admin-ui](admin-ui.md), [security](security.md)

Mode is chosen by configuration ([configuration](configuration.md)): OIDC (primary), passcode (fallback), or disabled. Both modes end in the same session cookie.

## Passcode mode

`POST /api/auth/login {password}` compares against the `ADMIN_PASSWORD` Worker secret (stored in cleartext) in constant time (SHA-256 digests via `timingSafeEqual`, so length is not leaked). Wrong → `401`. No password hashing is used: it is deliberately cheap so it fits the free plan's 10 ms CPU limit, so choose a long random password. Brute-force throttling is not built in — add a Cloudflare rate-limiting rule on `/api/auth/login`.

## OIDC mode

Authorization Code flow with PKCE (S256), `state` and `nonce`:

1. `GET /api/auth/oidc/login` — discovers `<issuer>/.well-known/openid-configuration` (issuer must match), stores `{state, nonce, verifier}` in a signed `colibri_oidc` cookie (HttpOnly, SameSite=Lax, 10 min, path `/api/auth/oidc`), redirects to the IdP.
2. `GET /api/auth/oidc/callback` — checks the cookie and `state`, exchanges the code (`client_secret_basic` unless the IdP only advertises `client_secret_post`), verifies the ID token with `jose` against the IdP's JWKS (issuer, audience = client id, asymmetric algs only, nonce). If a configured restriction needs `email`/groups that are absent from the ID token, `userinfo` is consulted (its `sub` must match).
3. On success sets the session cookie and redirects to `/`; on failure redirects to `/?login_error=denied|failed` (details are only logged).

### Restrictions

- Neither `OIDC_ALLOWED_EMAILS` nor `OIDC_ALLOWED_GROUPS` set → **no restriction**: anyone the IdP authenticates is an admin.
- Otherwise the user must match **any** configured list (union): verified email (`email_verified` not `false`/`"false"`) in the email list, or any group claim value in the group list.

Session subject: verified email, else `preferred_username`, `name`, `sub`.

## Sessions and CSRF

- Session = HS256 JWT (`jose`) with `sub` and `mode`, signed with a key derived from `SECRET_KEY`; cookie `__Host-colibri_session` (plain `colibri_session` over http for local dev), HttpOnly, Secure on https, SameSite=Lax, Path=/, lifetime `SESSION_TTL_SECONDS`. A session issued under a different auth mode is rejected.
- `GET /api/auth/session` → `{mode, user}` (`user: null` when signed out); `POST /api/auth/logout` clears the cookie (`204`).
- All `/api/*` non-GET requests are refused (`403`) if `Sec-Fetch-Site: cross-site` or an `Origin` differing from the request origin.
- `/api/admin/*`: `503` when mode is disabled, `401` without a valid session.
