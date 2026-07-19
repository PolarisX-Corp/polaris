import type { ActivityRecord } from "./types";

export type ReceiptRow = {
  id: string;
  conversationId: string;
  messageId: string | null;
  receiptType: "input" | "retrieval" | "proposal";
  boundary: string;
  payload: unknown;
  createdAt: Date;
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function refs(v: unknown): string {
  return Array.isArray(v) ? v.map(str).join(", ") : "";
}

export function receiptToActivity(row: ReceiptRow): ActivityRecord {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  const base = {
    id: row.id,
    source: "receipt" as const,
    kind: row.receiptType,
    boundary: row.boundary,
    messageId: row.messageId,
    createdAt: row.createdAt.toISOString(),
  };

  switch (row.receiptType) {
    case "input":
      return {
        ...base,
        summary: "入力を記録",
        details: [{ label: "contentHash", value: str(p.contentHash) }],
      };
    case "retrieval":
      return {
        ...base,
        summary: `ドキュメント検索: ${str(p.toolName)} (${str(p.status)})`,
        details: [
          { label: "toolName", value: str(p.toolName) },
          { label: "status", value: str(p.status) },
          { label: "argsHash", value: str(p.argsHash) },
          { label: "resultRefs", value: refs(p.resultRefs) },
        ],
      };
    case "proposal":
      return {
        ...base,
        summary: `回答を生成: ${str(p.modelId)}`,
        details: [
          { label: "modelId", value: str(p.modelId) },
          { label: "outputHash", value: str(p.outputHash) },
          { label: "inputReceiptRefs", value: refs(p.inputReceiptRefs) },
        ],
      };
  }
}

export function receiptsToActivity(rows: ReceiptRow[]): ActivityRecord[] {
  return rows.map(receiptToActivity);
}
