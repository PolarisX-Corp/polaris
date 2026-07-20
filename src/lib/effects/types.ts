export type Reversibility = "reversible" | "compensatable" | "irreversible";

// effect が要求しうるレシート種別(将来の "review" を含む前方互換の語彙)。
export type ReceiptRequirement =
  | "input"
  | "retrieval"
  | "proposal"
  | "parse_guard"
  | "review";

export type PlanRequirement = "rollback_plan" | "compensation_plan";

export type GateVerdict =
  | { level: "ACCEPT" }
  | { level: "REJECT"; reason: string }
  | { level: "DEGRADE"; reason: string; missing: string[] };

export type EffectRequest = {
  requestId: string;
  effectType: string;
  idempotencyKey: string;
  requestedBy: string;
  evidenceRefs: string[];
  reviewId?: string;
  policyVersion: string;
};

export type GateContext = {
  presentReceiptTypes: ReceiptRequirement[];
  review?: { approved: boolean; reviewerRoles: string[] };
  presentPlans: PlanRequirement[];
};
