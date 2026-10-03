/** The only record name prefix the proxy is allowed to touch. */
export const ACME_CHALLENGE_LABEL = "_acme-challenge";

const FORBIDDEN_CHARS = /[\s/\\?#@:[\]%<>|^"'`{}*]/;
const LABEL = /^(?:[a-z0-9_]|[a-z0-9_][a-z0-9_-]{0,61}[a-z0-9_])$/;

export class InvalidFqdnError extends Error {}

/**
 * Normalize a domain name: lowercase, drop one trailing dot, IDN -> Punycode (UTS #46,
 * via the URL host parser), then strictly validate the result as a hostname.
 * Throws `InvalidFqdnError` for anything else (ports, paths, IPs, wildcards, empty labels...).
 */
export function normalizeFqdn(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw || raw.length > 1024 || FORBIDDEN_CHARS.test(raw)) throw new InvalidFqdnError("invalid domain name");

  let host: string;
  try {
    host = new URL(`http://${raw}`).hostname;
  } catch {
    throw new InvalidFqdnError("invalid domain name");
  }

  const name = host.endsWith(".") ? host.slice(0, -1) : host;
  const labels = name.split(".");
  const ok =
    name.length > 0 &&
    name.length <= 253 &&
    labels.every((l) => LABEL.test(l)) &&
    !/^\d+$/.test(labels[labels.length - 1]!); // rejects IPv4 literals / numeric TLDs
  if (!ok) throw new InvalidFqdnError("invalid domain name");
  return name;
}

/** For a normalized `_acme-challenge.<domain>` name returns `<domain>`, otherwise `null`. */
export function acmeChallengeDomain(fqdn: string): string | null {
  const prefix = `${ACME_CHALLENGE_LABEL}.`;
  return fqdn.startsWith(prefix) && fqdn.length > prefix.length ? fqdn.slice(prefix.length) : null;
}

/** `domain` equals `suffix` or is a subdomain of it (label boundary aware). */
export const domainMatchesSuffix = (domain: string, suffix: string): boolean =>
  domain === suffix || domain.endsWith(`.${suffix}`);

/** Longest (most specific) matching suffix, or `undefined`. */
export function longestMatchingSuffix(domain: string, suffixes: Iterable<string>): string | undefined {
  let best: string | undefined;
  for (const s of suffixes) {
    if (domainMatchesSuffix(domain, s) && (best === undefined || s.length > best.length)) best = s;
  }
  return best;
}
