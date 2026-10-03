import { Hono } from "hono";
import type { AppEnv } from "../app";
import { getZoneProvider } from "../db/zoneProviders";
import { HttpError } from "../lib/errors";
import { instantiateProvider } from "../providers";
import { ProviderError, type DnsProvider } from "../providers/types";
import { authenticateAccessPoint } from "./auth";
import { resolveZoneProviderId } from "./authorize";
import { readRequestBody, toTxtRecordRequest } from "./protocol";

type Action = (provider: DnsProvider, fqdn: string, value: string) => Promise<void>;

const actions = {
  present: (p, fqdn, value) => p.addTxtRecord(fqdn, value),
  cleanup: (p, fqdn, value) => p.removeTxtRecord(fqdn, value),
} satisfies Record<string, Action>;

/**
 * acmeproxy protocol: `POST /present` and `POST /cleanup` with HTTP Basic auth (Access ID / Access Key).
 * Request bodies: JSON or form-encoded acmeproxy / Lego httpreq standard `{fqdn, value}`, and Lego httpreq raw `{domain, token, keyAuth}`.
 */
export const acmeProxyRoutes = new Hono<AppEnv>();

for (const [path, action] of Object.entries(actions)) {
  acmeProxyRoutes.post(`/${path}`, async (c) => {
    const accessPoint = await authenticateAccessPoint(c.env.DB, c.req.header("Authorization"));
    if (!accessPoint) {
      throw new HttpError(401, "invalid Access ID or Access Key", { "WWW-Authenticate": 'Basic realm="acme-colibri"' });
    }

    const { fqdn, value } = await toTxtRecordRequest(await readRequestBody(c.req.raw));
    const zoneProviderId = resolveZoneProviderId(accessPoint, fqdn);

    const zoneProvider = await getZoneProvider(c.env.DB, zoneProviderId);
    if (!zoneProvider) throw new Error(`access point "${accessPoint.id}" references missing zone provider "${zoneProviderId}"`);

    try {
      await action(await instantiateProvider(c.var.config.secretKey, zoneProvider), fqdn, value);
    } catch (e) {
      if (e instanceof ProviderError) throw new HttpError(502, e.message);
      throw e;
    }
    return c.json({ fqdn: `${fqdn}.`, value });
  });
}
