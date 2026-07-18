import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "./allowed";

describe("isAllowedEmail", () => {
  it("allows any email when no domains configured", () => {
    expect(isAllowedEmail("a@example.com", undefined)).toBe(true);
    expect(isAllowedEmail("a@example.com", "")).toBe(true);
  });

  it("allows emails in the configured domains (csv, case-insensitive)", () => {
    expect(isAllowedEmail("a@corp.co.jp", "corp.co.jp, other.com")).toBe(true);
    expect(isAllowedEmail("a@Other.COM", "corp.co.jp,other.com")).toBe(true);
  });

  it("rejects emails outside the configured domains", () => {
    expect(isAllowedEmail("a@evil.com", "corp.co.jp")).toBe(false);
  });

  it("rejects missing email", () => {
    expect(isAllowedEmail(null, "corp.co.jp")).toBe(false);
    expect(isAllowedEmail(undefined, "corp.co.jp")).toBe(false);
  });
});
