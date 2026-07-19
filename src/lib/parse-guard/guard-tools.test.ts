import type { ToolSet } from "ai";
import { describe, expect, it } from "vitest";
import { guardTools, type GuardRecord } from "./guard-tools";

function makeTools(execute: unknown): ToolSet {
  return { search: { execute } } as unknown as ToolSet;
}

function runExecute(
  tools: ToolSet,
  name: string,
  args: unknown,
): Promise<unknown> {
  const exec = (
    tools[name] as { execute: (a: unknown, o: unknown) => Promise<unknown> }
  ).execute;
  return exec(args, {});
}

describe("guardTools", () => {
  it("injects a warning and records annotate on an empty result", async () => {
    const records: GuardRecord[] = [];
    const wrapped = guardTools(
      makeTools(async () => ""),
      { onRecord: (r) => records.push(r) },
    );
    const out = await runExecute(wrapped, "search", { q: "x" });
    expect(String(out)).toContain("PARSE_GUARD");
    expect(records[0]).toMatchObject({
      toolName: "search",
      status: "empty",
      action: "annotate",
    });
  });

  it("passes through and records allow on a non-empty result", async () => {
    const records: GuardRecord[] = [];
    const wrapped = guardTools(
      makeTools(async () => "found docs"),
      { onRecord: (r) => records.push(r) },
    );
    const out = await runExecute(wrapped, "search", {});
    expect(out).toBe("found docs");
    expect(records[0]).toMatchObject({ status: "sufficient", action: "allow" });
  });

  it("leaves tools without execute untouched", () => {
    const wrapped = guardTools(makeTools(undefined), { onRecord: () => {} });
    expect((wrapped.search as { execute?: unknown }).execute).toBeUndefined();
  });
});
