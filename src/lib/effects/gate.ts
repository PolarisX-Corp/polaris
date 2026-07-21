import { getEffectEntry, type EffectCatalogEntry } from "./catalog";
import type { EffectRequest, GateContext, GateVerdict } from "./types";

/**
 * Pure requirement check for a known catalog entry. Returns the first failing
 * verdict in priority order, or ACCEPT. Never throws.
 */
export function evaluateGate(
  entry: EffectCatalogEntry,
  request: EffectRequest,
  context: GateContext,
): GateVerdict {
  if (request.policyVersion !== entry.policyVersion) {
    return {
      level: "DEGRADE",
      reason: "policy_version_mismatch",
      missing: ["explicit_rebind_or_recheck"],
    };
  }

  if (entry.reversibility === "irreversible" && entry.autoExecuteAllowed) {
    return { level: "REJECT", reason: "irreversible_must_not_auto_execute" };
  }

  if (request.evidenceRefs.length === 0) {
    return {
      level: "DEGRADE",
      reason: "evidence_missing",
      missing: ["evidence_refs"],
    };
  }

  if (!request.idempotencyKey) {
    return {
      level: "DEGRADE",
      reason: "idempotency_key_missing",
      missing: ["idempotency_key"],
    };
  }

  const missingReceipts = entry.requiredReceipts.filter(
    (r) => !context.presentReceiptTypes.includes(r),
  );
  if (missingReceipts.length > 0) {
    return {
      level: "DEGRADE",
      reason: "required_receipts_missing",
      missing: missingReceipts,
    };
  }

  const missingPlans = entry.requiredPlans.filter(
    (p) => !context.presentPlans.includes(p),
  );
  if (missingPlans.length > 0) {
    return {
      level: "DEGRADE",
      reason: "required_plans_missing",
      missing: missingPlans,
    };
  }

  const review = context.review;
  if (entry.requiredReviewerRoles.length > 0 && !review) {
    return {
      level: "DEGRADE",
      reason: "review_receipt_missing",
      missing: ["review"],
    };
  }
  if (review && review.approved === false) {
    return { level: "REJECT", reason: "review_rejected" };
  }
  if (entry.requiredReviewerRoles.length > 0 && review) {
    const missingRoles = entry.requiredReviewerRoles.filter(
      (role) => !review.reviewerRoles.includes(role),
    );
    if (missingRoles.length > 0) {
      return {
        level: "DEGRADE",
        reason: "required_reviewer_role_missing",
        missing: missingRoles,
      };
    }
  }
  if (!entry.autoExecuteAllowed && review?.approved !== true) {
    return { level: "DEGRADE", reason: "review_required", missing: ["review"] };
  }

  return { level: "ACCEPT" };
}

/**
 * Execution gate. Looks up the effect in the catalog and evaluates it.
 * fail-safe: unknown effect types are REJECTed (no fail-open).
 */
export function effectGate(
  request: EffectRequest,
  context: GateContext,
): GateVerdict {
  const entry = getEffectEntry(request.effectType);
  if (!entry) {
    return { level: "REJECT", reason: "unknown_effect_type" };
  }
  return evaluateGate(entry, request, context);
}
