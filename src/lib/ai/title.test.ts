import { describe, expect, it } from "vitest";
import { fallbackTitle } from "./title";

describe("fallbackTitle", () => {
  it("collapses whitespace and trims", () => {
    expect(fallbackTitle("  hello   world \n foo ")).toBe("hello world foo");
  });

  it("truncates to 40 characters", () => {
    const long = "a".repeat(100);
    expect(fallbackTitle(long)).toHaveLength(40);
  });

  it("falls back to a default when empty", () => {
    expect(fallbackTitle("   ")).toBe("新しいチャット");
  });
});
