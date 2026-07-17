import { describe, expect, it } from "vitest";
import { canAccessConversation } from "./access";

describe("canAccessConversation", () => {
  it("allows the owner", () => {
    expect(canAccessConversation({ userId: "u1" }, "u1")).toBe(true);
  });

  it("denies another user", () => {
    expect(canAccessConversation({ userId: "u1" }, "u2")).toBe(false);
  });

  it("denies when conversation does not exist", () => {
    expect(canAccessConversation(null, "u1")).toBe(false);
    expect(canAccessConversation(undefined, "u1")).toBe(false);
  });
});
