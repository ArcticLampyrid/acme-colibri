import { ProviderError, type DnsProvider, type ProviderDefinition } from "./types";

const API = "https://api.cloudflare.com/client/v4";
const TTL = 120;
const TIMEOUT_MS = 10_000;
/** Cloudflare error codes meaning "this exact record already exists". */
const ALREADY_EXISTS = new Set([81057, 81058]);

type CfEnvelope<T> = { success: boolean; result: T; errors?: { code: number; message: string }[] };
type CfRecord = { id: string; content: string };

class CfApiError extends ProviderError {
  constructor(message: string, readonly codes: number[] = []) {
    super(message);
  }
}

async function cf<T>(token: string, method: string, path: string, opts: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new CfApiError("Cloudflare API request failed");
  }
  const json = (await res.json().catch(() => null)) as CfEnvelope<T> | null;
  if (!res.ok || !json?.success) {
    const errors = json?.errors ?? [];
    const detail = errors.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    throw new CfApiError(`Cloudflare API error: ${detail}`, errors.map((e) => e.code));
  }
  return json.result;
}

/** TXT contents may come back wrapped in quotes. */
const unquote = (s: string) => (s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

function createCloudflare({ zone_id, api_token }: Record<string, string>): DnsProvider {
  const zoneId = encodeURIComponent(zone_id!);

  return {
    async addTxtRecord(fqdn, value) {
      try {
        await cf(api_token!, "POST", `/zones/${zoneId}/dns_records`, {
          body: { type: "TXT", name: fqdn, content: value, ttl: TTL },
        });
      } catch (e) {
        if (e instanceof CfApiError && e.codes.some((c) => ALREADY_EXISTS.has(c))) return;
        throw e;
      }
    },

    async removeTxtRecord(fqdn, value) {
      const records = await cf<CfRecord[]>(api_token!, "GET", `/zones/${zoneId}/dns_records`, {
        query: { type: "TXT", name: fqdn, per_page: "100" },
      });
      const matches = records.filter((r) => unquote(r.content) === value);
      await Promise.all(matches.map((r) => cf(api_token!, "DELETE", `/zones/${zoneId}/dns_records/${r.id}`)));
    },
  };
}

export const cloudflare: ProviderDefinition = {
  type: "cloudflare",
  label: "Cloudflare",
  fields: [
    { name: "zone_id", label: "Zone ID", secret: false },
    { name: "api_token", label: "API Token (DNS:Edit)", secret: true },
  ],
  create: createCloudflare,
};
