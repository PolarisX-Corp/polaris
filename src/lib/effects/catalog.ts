import type {
  PlanRequirement,
  ReceiptRequirement,
  Reversibility,
} from "./types";

export type EffectCatalogEntry = {
  effectType: string;
  boundary: "effect-bearing";
  reversibility: Reversibility;
  autoExecuteAllowed: boolean;
  requiredReceipts: ReceiptRequirement[];
  requiredReviewerRoles: string[];
  requiredPlans: PlanRequirement[];
  policyVersion: string;
};

export const CATALOG_VERSION = "2026-07-20";

export const EFFECT_CATALOG: EffectCatalogEntry[] = [
  {
    effectType: "add_internal_label",
    boundary: "effect-bearing",
    reversibility: "reversible",
    autoExecuteAllowed: true,
    requiredReceipts: ["input", "proposal"],
    requiredReviewerRoles: [],
    requiredPlans: ["rollback_plan"],
    policyVersion: CATALOG_VERSION,
  },
  {
    effectType: "send_customer_email",
    boundary: "effect-bearing",
    reversibility: "compensatable",
    autoExecuteAllowed: false,
    requiredReceipts: ["input", "proposal"],
    requiredReviewerRoles: ["support_lead"],
    requiredPlans: ["compensation_plan"],
    policyVersion: CATALOG_VERSION,
  },
  {
    effectType: "issue_refund",
    boundary: "effect-bearing",
    reversibility: "irreversible",
    autoExecuteAllowed: false,
    requiredReceipts: ["input", "proposal"],
    requiredReviewerRoles: ["finance_lead"],
    requiredPlans: [],
    policyVersion: CATALOG_VERSION,
  },
];

export function getEffectEntry(
  effectType: string,
): EffectCatalogEntry | undefined {
  return EFFECT_CATALOG.find((e) => e.effectType === effectType);
}
