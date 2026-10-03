import { describe, expect, it } from "vitest";
import { decryptJson, deriveKeyBytes, encryptJson, secretsEqual, sha256Hex, timingSafeEqual } from "../src/lib/crypto";

const SECRET = "unit-test-secret-unit-test-secret-0000";

describe("AES-GCM envelope", () => {
  it("round-trips and does not contain the plaintext", async () => {
    const env = await encryptJson(SECRET, "zone:a", { api_token: "tok-123" });
    expect(env.startsWith("v1.")).toBe(true);
    expect(env).not.toContain("tok-123");
    expect(await decryptJson(SECRET, "zone:a", env)).toEqual({ api_token: "tok-123" });
  });

  it("uses a fresh IV each time", async () => {
    expect(await encryptJson(SECRET, "a", 1)).not.toBe(await encryptJson(SECRET, "a", 1));
  });

  it("fails with another AAD, another secret, or tampering", async () => {
    const env = await encryptJson(SECRET, "zone:a", { x: 1 });
    await expect(decryptJson(SECRET, "zone:b", env)).rejects.toThrow();
    await expect(decryptJson(SECRET + "x", "zone:a", env)).rejects.toThrow();
    const [v, iv, ct] = env.split(".");
    await expect(decryptJson(SECRET, "zone:a", `${v}.${iv}.${ct!.slice(0, -2)}AA`)).rejects.toThrow();
  });
});

describe("key derivation", () => {
  it("derives independent keys per purpose", async () => {
    const [a, b] = await Promise.all([deriveKeyBytes(SECRET, "session"), deriveKeyBytes(SECRET, "zone-secrets")]);
    expect(a).toHaveLength(32);
    expect(timingSafeEqual(a, b)).toBe(false);
  });
});

describe("helpers", () => {
  it("sha256Hex matches a known vector", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("timingSafeEqual compares content and length", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("secretsEqual", () => {
  it("compares content and length", async () => {
    expect(await secretsEqual("hunter2", "hunter2")).toBe(true);
    expect(await secretsEqual("hunter2", "hunter3")).toBe(false);
    expect(await secretsEqual("hunter2", "hunter22")).toBe(false);
  });
});
