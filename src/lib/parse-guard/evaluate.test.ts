import { describe, expect, it } from "vitest";
import { evaluateRetrieval } from "./evaluate";

describe("evaluateRetrieval", () => {
  it("treats missing/empty values as empty", () => {
    expect(evaluateRetrieval(null).status).toBe("empty");
    expect(evaluateRetrieval(undefined).status).toBe("empty");
    expect(evaluateRetrieval("").status).toBe("empty");
    expect(evaluateRetrieval("   ").status).toBe("empty");
    expect(evaluateRetrieval([]).status).toBe("empty");
  });

  it("treats an MCP result with empty content as empty", () => {
    expect(evaluateRetrieval({ content: [] }).status).toBe("empty");
    expect(
      evaluateRetrieval({ content: [{ type: "text", text: "  " }] }).status,
    ).toBe("empty");
  });

  it("treats present content as sufficient", () => {
    expect(evaluateRetrieval("見つかった文書").status).toBe("sufficient");
    expect(evaluateRetrieval(["doc1"]).status).toBe("sufficient");
    expect(
      evaluateRetrieval({ content: [{ type: "text", text: "返金ポリシー…" }] })
        .status,
    ).toBe("sufficient");
  });
});
