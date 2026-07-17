import { describe, expect, it } from "vitest";
import { withMcpDegradation } from "./client";

describe("withMcpDegradation", () => {
  it("returns tools when the loader succeeds", async () => {
    const r = await withMcpDegradation(async () => ({
      tools: { search: {} as never },
      close: async () => {},
    }));
    expect(r.degraded).toBe(false);
    expect(Object.keys(r.tools)).toEqual(["search"]);
  });

  it("degrades to empty tools when the loader throws (golden case)", async () => {
    const r = await withMcpDegradation(async () => {
      throw new Error("boom");
    });
    expect(r.degraded).toBe(true);
    expect(r.tools).toEqual({});
    expect(r.close).toBeInstanceOf(Function);
  });
});
