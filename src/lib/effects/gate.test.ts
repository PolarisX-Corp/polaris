import { describe, expect, it } from "vitest";
import type { EffectCatalogEntry } from "./catalog";
import { CATALOG_VERSION } from "./catalog";
import { effectGate, evaluateGate } from "./gate";
import type { EffectRequest, GateContext } from "./types";

function entry(overrides: Partial<EffectCatalogEntry> = {}): EffectCatalogEntry {
  return {
    effectType: "test_effect",
    boundary: "effect-bearing",
    reversibility: "reversible",
    autoExecuteAllowed: true,
    requiredReceipts: ["input", "proposal"],
    requiredReviewerRoles: [],
    requiredPlans: ["rollback_plan"],
    policyVersion: CATALOG_VERSION,
    ...overrides,
  };
}

function req(overrides: Partial<EffectRequest> = {}): EffectRequest {
  return {
    requestId: "rq1",
    effectType: "test_effect",
    idempotencyKey: "idem1",
    requestedBy: "u1",
    evidenceRefs: ["ev1"],
    policyVersion: CATALOG_VERSION,
    ...overrides,
  };
}

function ctx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    presentReceiptTypes: ["input", "proposal"],
    presentPlans: ["rollback_plan"],
    ...overrides,
  };
}

describe("effectGate (catalog lookup)", () => {
  it("rejects an unknown effect type", () => {
    const v = effectGate(req({ effectType: "nope" }), ctx());
    expect(v).toEqual({ level: "REJECT", reason: "unknown_effect_type" });
  });

  it("accepts add_internal_label when everything is present", () => {
    const v = effectGate(req({ effectType: "add_internal_label" }), ctx());
    expect(v).toEqual({ level: "ACCEPT" });
  });
});

describe("evaluateGate", () => {
  it("degrades on policy version mismatch", () => {
    const v = evaluateGate(entry(), req({ policyVersion: "old" }), ctx());
    expect(v).toMatchObject({
      level: "DEGRADE",
      reason: "policy_version_mismatch",
    });
  });

  it("rejects an irreversible effect misconfigured for auto-execute", () => {
    const v = evaluateGate(
      entry({ reversibility: "irreversible", autoExecuteAllowed: true }),
      req(),
      ctx(),
    );
    expect(v).toEqual({
      level: "REJECT",
      reason: "irreversible_must_not_auto_execute",
    });
  });

  it("degrades when evidence is missing", () => {
    const v = evaluateGate(entry(), req({ evidenceRefs: [] }), ctx());
    expect(v).toMatchObject({ level: "DEGRADE", reason: "evidence_missing" });
  });

  it("degrades when idempotency key is missing", () => {
    const v = evaluateGate(entry(), req({ idempotencyKey: "" }), ctx());
    expect(v).toMatchObject({
      level: "DEGRADE",
      reason: "idempotency_key_missing",
    });
  });

  it("degrades when required receipts are missing", () => {
    const v = evaluateGate(
      entry(),
      req(),
      ctx({ presentReceiptTypes: ["input"] }),
    );
    expect(v).toMatchObject({
      level: "DEGRADE",
      reason: "required_receipts_missing",
      missing: ["proposal"],
    });
  });

  it("degrades when a required plan is missing", () => {
    const v = evaluateGate(entry(), req(), ctx({ presentPlans: [] }));
    expect(v).toMatchObject({
      level: "DEGRADE",
      reason: "required_plans_missing",
      missing: ["rollback_plan"],
    });
  });

  it("accepts a reversible effect when everything is present", () => {
    expect(evaluateGate(entry(), req(), ctx())).toEqual({ level: "ACCEPT" });
  });

  const emailEntry = entry({
    reversibility: "compensatable",
    autoExecuteAllowed: false,
    requiredReviewerRoles: ["support_lead"],
    requiredPlans: ["compensation_plan"],
  });
  const emailCtx = (o: Partial<GateContext> = {}): GateContext =>
    ctx({ presentPlans: ["compensation_plan"], ...o });

  it("degrades a review-required effect when no review is present", () => {
    const v = evaluateGate(emailEntry, req(), emailCtx());
    expect(v).toMatchObject({
      level: "DEGRADE",
      reason: "review_receipt_missing",
    });
  });

  it("rejects when the review was rejected", () => {
    const v = evaluateGate(
      emailEntry,
      req(),
      emailCtx({ review: { approved: false, reviewerRoles: ["support_lead"] } }),
    );
    expect(v).toEqual({ level: "REJECT", reason: "review_rejected" });
  });

  it("degrades when the required reviewer role is missing", () => {
    const v = evaluateGate(
      emailEntry,
      req(),
      emailCtx({ review: { approved: true, reviewerRoles: ["other_role"] } }),
    );
    expect(v).toMatchObject({
      level: "DEGRADE",
      reason: "required_reviewer_role_missing",
      missing: ["support_lead"],
    });
  });

  it("accepts a compensatable effect when fully satisfied", () => {
    const v = evaluateGate(
      emailEntry,
      req(),
      emailCtx({ review: { approved: true, reviewerRoles: ["support_lead"] } }),
    );
    expect(v).toEqual({ level: "ACCEPT" });
  });
});
