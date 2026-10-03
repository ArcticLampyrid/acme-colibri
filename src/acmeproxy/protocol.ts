import { z } from "zod";
import { base64urlEncode, sha256 } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import { ACME_CHALLENGE_LABEL, InvalidFqdnError, normalizeFqdn } from "../lib/fqdn";

/** acmeproxy / Lego httpreq "standard" mode: the client computed the record itself. */
const standardBody = z.object({ fqdn: z.string().min(1), value: z.string().min(1) });
/** Lego httpreq "raw" mode: the server derives the record from the key authorization. */
const rawBody = z.object({ domain: z.string().min(1), token: z.string().optional(), keyAuth: z.string().min(1) });

/** A normalized TXT record request (`fqdn` has no trailing dot). */
export type TxtRecordRequest = { fqdn: string; value: string };

export async function readRequestBody(req: Request): Promise<unknown> {
  const contentType = req.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  try {
    if (contentType === "application/x-www-form-urlencoded" || contentType === "multipart/form-data") {
      return Object.fromEntries((await req.formData()).entries());
    }
    return await req.json();
  } catch {
    throw new HttpError(400, "request body must be JSON or form-encoded");
  }
}

const normalizeOrThrow = (name: string): string => {
  try {
    return normalizeFqdn(name);
  } catch (e) {
    if (e instanceof InvalidFqdnError) throw new HttpError(400, `invalid domain name "${name.slice(0, 100)}"`);
    throw e;
  }
};

/** Accept either body shape and reduce it to a validated `{ fqdn, value }`. */
export async function toTxtRecordRequest(body: unknown): Promise<TxtRecordRequest> {
  const isRaw = typeof body === "object" && body !== null && "keyAuth" in body && !("fqdn" in body);
  let fqdn: string;
  let value: string;

  if (isRaw) {
    const parsed = rawBody.safeParse(body);
    if (!parsed.success) throw new HttpError(400, "invalid raw-mode body: expected { domain, token, keyAuth }");
    const domain = normalizeOrThrow(parsed.data.domain.replace(/^\*\./, ""));
    fqdn = `${ACME_CHALLENGE_LABEL}.${domain}`;
    value = base64urlEncode(await sha256(parsed.data.keyAuth));
  } else {
    const parsed = standardBody.safeParse(body);
    if (!parsed.success) throw new HttpError(400, "invalid body: expected { fqdn, value }");
    fqdn = normalizeOrThrow(parsed.data.fqdn);
    value = parsed.data.value;
  }
  return { fqdn, value };
}
