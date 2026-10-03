import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { deriveKeyBytes, type KeyPurpose } from "../lib/crypto";

const ISSUER = "acme-colibri";

type JwtPurpose = Extract<KeyPurpose, "session" | "oidc-state">;

/** HS256 JWT signed with a key derived from `SECRET_KEY`; the purpose is also the audience. */
export async function signJwt(
  secretKey: string,
  purpose: JwtPurpose,
  claims: Record<string, unknown>,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(purpose)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(await deriveKeyBytes(secretKey, purpose));
}

/** Returns the payload of a valid, unexpired token for this purpose, otherwise `null`. */
export async function verifyJwt(secretKey: string, purpose: JwtPurpose, token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, await deriveKeyBytes(secretKey, purpose), {
      issuer: ISSUER,
      audience: purpose,
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}
