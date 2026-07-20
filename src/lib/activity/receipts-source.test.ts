import { describe, expect, it } from "vitest";
import { receiptsToActivity } from "./receipts-source";

const base = {
  conversationId: "c1",
  boundary: "support-only",
  messageId: "m1",
  createdAt: new Date("2026-07-19T01:00:00Z"),
};

describe("receiptsToActivity", () => {
  it("maps an input receipt to a hashed record with no raw text", () => {
    const [r] = receiptsToActivity([
      {
        ...base,
        id: "r1",
        receiptType: "input",
        payload: { contentHash: "sha256:abc" },
      },
    ]);
    expect(r.source).toBe("receipt");
    expect(r.kind).toBe("input");
    expect(r.boundary).toBe("support-only");
    expect(r.createdAt).toBe("2026-07-19T01:00:00.000Z");
    expect(r.details.some((d) => d.value === "sha256:abc")).toBe(true);
    expect(JSON.stringify(r)).not.toContain("秘密");
  });

  it("summarizes a retrieval receipt with tool and status", () => {
    const [r] = receiptsToActivity([
      {
        ...base,
        id: "r2",
        receiptType: "retrieval",
        payload: {
          toolName: "search_docs",
          status: "succeeded",
          argsHash: "sha256:def",
          resultRefs: ["doc:1", "doc:2"],
        },
      },
    ]);
    expect(r.kind).toBe("retrieval");
    expect(r.summary).toContain("search_docs");
    expect(r.summary).toContain("succeeded");
    expect(r.details.find((d) => d.label === "resultRefs")?.value).toBe(
      "doc:1, doc:2",
    );
  });

  it("summarizes a proposal receipt with model and input refs", () => {
    const [r] = receiptsToActivity([
      {
        ...base,
        id: "r3",
        receiptType: "proposal",
        payload: {
          modelId: "anthropic:claude-sonnet-5",
          outputHash: "sha256:ghi",
          inputReceiptRefs: ["r1"],
        },
      },
    ]);
    expect(r.kind).toBe("proposal");
    expect(r.summary).toContain("anthropic:claude-sonnet-5");
    expect(r.details.find((d) => d.label === "inputReceiptRefs")?.value).toBe(
      "r1",
    );
  });

  it("summarizes a parse_guard receipt with tool and status", () => {
    const [r] = receiptsToActivity([
      {
        ...base,
        id: "r4",
        receiptType: "parse_guard",
        payload: {
          observationStatus: "empty",
          toolName: "search_docs",
          argsHash: "sha256:xyz",
          action: "annotate",
        },
      },
    ]);
    expect(r.kind).toBe("parse_guard");
    expect(r.summary).toContain("search_docs");
    expect(r.summary).toContain("empty");
    expect(r.details.find((d) => d.label === "action")?.value).toBe("annotate");
  });
});
