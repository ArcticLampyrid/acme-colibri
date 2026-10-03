const encoder = new TextEncoder();
const decoder = new TextDecoder();

const HKDF_SALT = encoder.encode("acme-colibri/v1");

export const utf8 = (s: string) => encoder.encode(s) as Uint8Array<ArrayBuffer>;

// ---------- base64 / hex ----------

export function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function base64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const std = s.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

// ---------- hashing / comparison ----------

export async function sha256(data: string | Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const input = typeof data === "string" ? utf8(data) : data;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}

export const sha256Hex = async (data: string): Promise<string> => toHex(await sha256(data));

/** Constant-time comparison. Lengths are public (we only compare fixed-size digests). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export const timingSafeEqualStr = (a: string, b: string): boolean => timingSafeEqual(utf8(a), utf8(b));

/** Constant-time string comparison that also hides the length (compares SHA-256 digests). */
export async function secretsEqual(a: string, b: string): Promise<boolean> {
  return timingSafeEqual(await sha256(a), await sha256(b));
}

/** High-entropy random string (default 256 bits, base64url). */
export const randomToken = (bytes = 32): string => base64urlEncode(crypto.getRandomValues(new Uint8Array(bytes)));

// ---------- key derivation ----------

/** Purposes (HKDF `info`) for keys derived from the single `SECRET_KEY` Worker secret. */
export type KeyPurpose = "zone-secrets" | "session" | "oidc-state";

/** Derive 32 bytes of independent key material per purpose from the Worker secret. */
export async function deriveKeyBytes(secret: string, purpose: KeyPurpose): Promise<Uint8Array<ArrayBuffer>> {
  const base = await crypto.subtle.importKey("raw", utf8(secret), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: utf8(`acme-colibri/${purpose}`) },
    base,
    256,
  );
  return new Uint8Array(bits);
}

// ---------- AES-GCM envelope ----------

const ENVELOPE_VERSION = "v1";

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = await deriveKeyBytes(secret, "zone-secrets");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/**
 * Encrypt a JSON value as `v1.<iv>.<ciphertext>` (base64url). `aad` binds the ciphertext
 * to its owner (e.g. the zone provider id) so rows cannot be swapped in the database.
 */
export async function encryptJson(secret: string, aad: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(aad) },
    await aesKey(secret),
    utf8(JSON.stringify(value)),
  );
  return `${ENVELOPE_VERSION}.${base64urlEncode(iv)}.${base64urlEncode(new Uint8Array(ct))}`;
}

export async function decryptJson(secret: string, aad: string, envelope: string): Promise<unknown> {
  const [version, iv, ct] = envelope.split(".");
  if (version !== ENVELOPE_VERSION || !iv || !ct) throw new Error("unsupported ciphertext envelope");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64urlDecode(iv), additionalData: utf8(aad) },
    await aesKey(secret),
    base64urlDecode(ct),
  );
  return JSON.parse(decoder.decode(pt));
}
