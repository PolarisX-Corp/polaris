import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secret-box";

const KEY = "0".repeat(64); // 32-byte hex

describe("secret-box", () => {
  it("round-trips a secret", () => {
    const enc = encryptSecret("token-value", KEY);
    expect(enc).not.toContain("token-value");
    expect(decryptSecret(enc, KEY)).toBe("token-value");
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    expect(encryptSecret("x", KEY)).not.toBe(encryptSecret("x", KEY));
  });

  it("throws on tampered ciphertext", () => {
    const enc = encryptSecret("x", KEY);
    const tampered = enc.slice(0, -4) + "0000";
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });
});
