import { createHash, randomUUID } from "node:crypto";

export type ReceiptType = "input" | "retrieval" | "proposal" | "parse_guard";
export type Boundary = "support-only" | "review-only" | "effect-bearing";
export type RetrievalStatus = "succeeded" | "empty" | "degraded";

function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

export type InputPayload = { contentHash: string };
export type RetrievalPayload = {
  toolName: string;
  argsHash: string;
  status: RetrievalStatus;
  resultRefs: string[];
};
export type ProposalPayload = {
  modelId: string;
  outputHash: string;
  inputReceiptRefs: string[];
};
export type ParseGuardPayload = {
  observationStatus: "sufficient" | "empty";
  toolName: string;
  argsHash: string;
  action: "allow" | "annotate";
};

type BaseReceipt<T extends ReceiptType, P> = {
  id: string;
  receiptType: T;
  boundary: Boundary;
  conversationId: string;
  messageId: string | null;
  payload: P;
};

export type InputReceipt = BaseReceipt<"input", InputPayload>;
export type RetrievalReceipt = BaseReceipt<"retrieval", RetrievalPayload>;
export type ProposalReceipt = BaseReceipt<"proposal", ProposalPayload>;
export type ParseGuardReceipt = BaseReceipt<"parse_guard", ParseGuardPayload>;
export type AnyReceipt =
  | InputReceipt
  | RetrievalReceipt
  | ProposalReceipt
  | ParseGuardReceipt;

export function buildInputReceipt(params: {
  conversationId: string;
  messageId: string;
  text: string;
}): InputReceipt {
  return {
    id: randomUUID(),
    receiptType: "input",
    boundary: "support-only",
    conversationId: params.conversationId,
    messageId: params.messageId,
    payload: { contentHash: sha256(params.text) },
  };
}

export function buildRetrievalReceipt(params: {
  conversationId: string;
  messageId?: string | null;
  toolName: string;
  args: unknown;
  status: RetrievalStatus;
  resultRefs: string[];
}): RetrievalReceipt {
  return {
    id: randomUUID(),
    receiptType: "retrieval",
    boundary: "support-only",
    conversationId: params.conversationId,
    messageId: params.messageId ?? null,
    payload: {
      toolName: params.toolName,
      argsHash: sha256(JSON.stringify(params.args ?? null)),
      status: params.status,
      resultRefs: params.resultRefs,
    },
  };
}

export function buildProposalReceipt(params: {
  conversationId: string;
  messageId: string;
  modelId: string;
  outputText: string;
  inputReceiptIds: string[];
}): ProposalReceipt {
  return {
    id: randomUUID(),
    receiptType: "proposal",
    boundary: "support-only",
    conversationId: params.conversationId,
    messageId: params.messageId,
    payload: {
      modelId: params.modelId,
      outputHash: sha256(params.outputText),
      inputReceiptRefs: params.inputReceiptIds,
    },
  };
}

export function buildParseGuardReceipt(params: {
  conversationId: string;
  messageId?: string | null;
  toolName: string;
  args: unknown;
  observationStatus: "sufficient" | "empty";
  action: "allow" | "annotate";
}): ParseGuardReceipt {
  return {
    id: randomUUID(),
    receiptType: "parse_guard",
    boundary: "support-only",
    conversationId: params.conversationId,
    messageId: params.messageId ?? null,
    payload: {
      observationStatus: params.observationStatus,
      toolName: params.toolName,
      argsHash: sha256(JSON.stringify(params.args ?? null)),
      action: params.action,
    },
  };
}
