import { describe, expect, it } from "vitest";
import { buildParseGuardReceipt } from "./receipts";

describe("buildParseGuardReceipt", () => {
  it("records status/action and hashes args (no raw text)", () => {
    const r = buildParseGuardReceipt({
      conversationId: "c1",
      messageId: "m1",
      toolName: "search_docs",
      args: { query: "秘密のクエリ" },
      observationStatus: "empty",
      action: "annotate",
    });
    expect(r.receiptType).toBe("parse_guard");
    expect(r.boundary).toBe("support-only");
    expect(r.payload.observationStatus).toBe("empty");
    expect(r.payload.action).toBe("annotate");
    expect(r.payload.toolName).toBe("search_docs");
    expect(r.payload.argsHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(r.payload)).not.toContain("秘密のクエリ");
  });
});
