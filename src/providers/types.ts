/** One credential/config input of a provider. `secret` fields are encrypted and never returned by the API. */
export type ProviderField = { name: string; label: string; secret: boolean };

/** Operations the proxy needs from an upstream DNS provider. Both must be idempotent. */
export interface DnsProvider {
  /** Create TXT record `fqdn` (normalized, no trailing dot) with `value`. */
  addTxtRecord(fqdn: string, value: string): Promise<void>;
  /** Delete the TXT record(s) `fqdn` carrying exactly `value`. Missing records are not an error. */
  removeTxtRecord(fqdn: string, value: string): Promise<void>;
}

export type ProviderDefinition = {
  type: string;
  label: string;
  fields: readonly ProviderField[];
  /** Build a client from the merged (config + decrypted secrets) field values. */
  create(values: Record<string, string>): DnsProvider;
};

/** Upstream failure; `message` is safe to return to ACME clients (never contains credentials). */
export class ProviderError extends Error {}
