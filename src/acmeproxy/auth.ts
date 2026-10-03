import { getAccessPoint, type AccessPointRow } from "../db/accessPoints";
import { sha256Hex, timingSafeEqualStr } from "../lib/crypto";

/** Compared against when the Access ID is unknown, so both paths do the same work. */
const DUMMY_HASH = "0".repeat(64);

/** Decode an HTTP Basic `Authorization` header into [accessId, accessKey]. */
export function parseBasicAuth(header: string | undefined): [string, string] | null {
  const match = /^Basic\s+([A-Za-z0-9+/=_-]+)$/i.exec(header ?? "");
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(atob(match[1]!.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    const sep = decoded.indexOf(":");
    return sep > 0 ? [decoded.slice(0, sep), decoded.slice(sep + 1)] : null;
  } catch {
    return null;
  }
}

/** Resolve the access point for the presented Access ID + Key, or `null`. */
export async function authenticateAccessPoint(
  db: D1Database,
  authorization: string | undefined,
): Promise<AccessPointRow | null> {
  const credentials = parseBasicAuth(authorization);
  if (!credentials) return null;
  const [accessId, accessKey] = credentials;
  const [accessPoint, presentedHash] = await Promise.all([
    accessId.length <= 64 ? getAccessPoint(db, accessId) : null,
    sha256Hex(accessKey),
  ]);
  const matches = timingSafeEqualStr(presentedHash, accessPoint?.keyHash ?? DUMMY_HASH);
  return accessPoint && matches ? accessPoint : null;
}
