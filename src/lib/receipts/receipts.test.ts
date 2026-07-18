import { describe, expect, it } from "vitest";
import {
  buildInputReceipt,
  buildProposalReceipt,
  buildRetrievalReceipt,
} from "./receipts";

describe("receipts", () => {
  it("input receipt hashes content and never stores raw text", () => {
    const r = buildInputReceipt({
      conversationId: "c1",
      messageId: "m1",
      text: "秘密のテキスト",
    });
    expect(r.receiptType).toBe("input");
    expect(r.boundary).toBe("support-only");
    expect(JSON.stringify(r.payload)).not.toContain("秘密のテキスト");
    expect(r.payload.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("retrieval receipt records tool call with status", () => {
    const r = buildRetrievalReceipt({
      conversationId: "c1",
      toolName: "search_docs",
      args: { query: "q" },
      status: "succeeded",
      resultRefs: ["doc:1"],
    });
    expect(r.receiptType).toBe("retrieval");
    expect(r.payload.toolName).toBe("search_docs");
    expect(r.payload.argsHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(r.payload.status).toBe("succeeded");
    expect(r.payload.resultRefs).toEqual(["doc:1"]);
  });

  it("retrieval receipt supports a degraded status", () => {
    const r = buildRetrievalReceipt({
      conversationId: "c1",
      toolName: "search_docs",
      args: {},
      status: "degraded",
      resultRefs: [],
    });
    expect(r.payload.status).toBe("degraded");
  });

  it("proposal receipt links input receipts and hashes output", () => {
    const r = buildProposalReceipt({
      conversationId: "c1",
      messageId: "m2",
      modelId: "anthropic:claude-sonnet-5",
      outputText: "answer",
      inputReceiptIds: ["r1"],
    });
    expect(r.receiptType).toBe("proposal");
    expect(r.payload.modelId).toBe("anthropic:claude-sonnet-5");
    expect(r.payload.inputReceiptRefs).toEqual(["r1"]);
    expect(r.payload.outputHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("generates a unique id per receipt", () => {
    const a = buildInputReceipt({ conversationId: "c1", messageId: "m1", text: "a" });
    const b = buildInputReceipt({ conversationId: "c1", messageId: "m1", text: "a" });
    expect(a.id).not.toBe(b.id);
  });
});
