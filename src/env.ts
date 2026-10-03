/** Worker bindings: D1, static assets, secrets and plain vars (see spec/configuration.md). */
export type Bindings = {
  DB: D1Database;
  ASSETS?: Fetcher;
  SECRET_KEY: string;
  ADMIN_PASSWORD?: string;
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_SCOPES?: string;
  OIDC_REDIRECT_URI?: string;
  OIDC_ALLOWED_EMAILS?: string;
  OIDC_ALLOWED_GROUPS?: string;
  OIDC_GROUPS_CLAIM?: string;
  SESSION_TTL_SECONDS?: string;
};
