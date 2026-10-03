import { describe, expect, it } from "vitest";
import { acmeChallengeDomain, longestMatchingSuffix, normalizeFqdn } from "../src/lib/fqdn";

describe("normalizeFqdn", () => {
  it.each([
    ["_ACME-Challenge.Example.COM.", "_acme-challenge.example.com"],
    ["  example.com  ", "example.com"],
    ["_acme-challenge.bücher.example", "_acme-challenge.xn--bcher-kva.example"],
    ["例え.jp.", "xn--r8jz45g.jp"],
    ["_acme-challenge.xn--bcher-kva.example", "_acme-challenge.xn--bcher-kva.example"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeFqdn(input)).toBe(expected);
  });

  it.each([
    "", ".", "example.com..", "a..b.com", "*.example.com", "example.com/path", "user@example.com",
    "example.com:8080", "127.0.0.1", "1.2.3", "-bad.example.com", "bad-.example.com", "a b.com",
    "[::1]", "exa%6dple.com", `${"a".repeat(64)}.com`, `${"a.".repeat(130)}com`,
  ])("rejects %j", (input) => {
    expect(() => normalizeFqdn(input)).toThrow();
  });
});

describe("suffix matching", () => {
  it("extracts the domain from an acme challenge name only", () => {
    expect(acmeChallengeDomain("_acme-challenge.a.example.com")).toBe("a.example.com");
    expect(acmeChallengeDomain("_acme-challenge.")).toBeNull();
    expect(acmeChallengeDomain("www.example.com")).toBeNull();
    expect(acmeChallengeDomain("x._acme-challenge.example.com")).toBeNull();
  });

  it("matches on label boundaries and prefers the longest suffix", () => {
    const suffixes = ["main.com", "abc.main.com"];
    expect(longestMatchingSuffix("main.com", suffixes)).toBe("main.com");
    expect(longestMatchingSuffix("x.abc.main.com", suffixes)).toBe("abc.main.com");
    expect(longestMatchingSuffix("evilmain.com", suffixes)).toBeUndefined();
    expect(longestMatchingSuffix("main.com.evil.org", suffixes)).toBeUndefined();
  });
});
