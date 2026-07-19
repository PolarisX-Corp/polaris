import { describe, expect, it } from "vitest";
import { sortActivity } from "./index";
import type { ActivityRecord } from "./types";

const rec = (id: string, createdAt: string): ActivityRecord => ({
  id,
  source: "receipt",
  kind: "input",
  createdAt,
  summary: "",
  details: [],
});

describe("sortActivity", () => {
  it("orders records by createdAt ascending", () => {
    const out = sortActivity([
      rec("b", "2026-07-19T02:00:00.000Z"),
      rec("a", "2026-07-19T01:00:00.000Z"),
      rec("c", "2026-07-19T03:00:00.000Z"),
    ]);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});
