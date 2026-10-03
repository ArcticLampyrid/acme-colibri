import type { AccessPointRow } from "../db/accessPoints";
import { HttpError } from "../lib/errors";
import { acmeChallengeDomain, longestMatchingSuffix } from "../lib/fqdn";

/**
 * Decide which zone provider may serve `fqdn` for this access point.
 * Only `_acme-challenge.<domain>` names are allowed, and `<domain>` must fall under one of the
 * access point's suffixes (most specific suffix wins).
 */
export function resolveZoneProviderId(accessPoint: AccessPointRow, fqdn: string): string {
  const domain = acmeChallengeDomain(fqdn);
  if (!domain) throw new HttpError(403, "only _acme-challenge TXT records can be managed");
  const suffix = longestMatchingSuffix(domain, Object.keys(accessPoint.provides));
  const zoneProviderId = suffix === undefined ? undefined : accessPoint.provides[suffix];
  if (!zoneProviderId) throw new HttpError(403, "domain is not allowed for this access point");
  return zoneProviderId;
}
