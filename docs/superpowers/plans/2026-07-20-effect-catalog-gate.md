# Effect Catalog + Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** effect種別ごとのメタデータを持つ Effect Catalog と、実行前判定の純粋関数 `effectGate`(ACCEPT/DEGRADE/REJECT)を、外部操作なしのライブラリとして実装する。

**Architecture:** `src/lib/effects/` に types(語彙)/catalog(例エントリ+参照)/gate(9段判定の純粋関数)を分割。DB・UI・route には触れない。フェーズ3の実ツールがこのゲートに差し込む。

**Tech Stack:** TypeScript / Vitest。ランタイム依存なし(純粋ロジック)。

**Branch:** `worktree-phase2-effect-catalog`(main起点のworktree)。単一PR。

**検証:** `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` グリーン。

---

### Task 1: 型と Effect Catalog(TDD)

**Files:**
- Create: `src/lib/effects/types.ts`
- Create: `src/lib/effects/catalog.ts`
- Test: `src/lib/effects/catalog.test.ts`

- [ ] **Step 1: 型を定義**

`src/lib/effects/types.ts`:
```ts
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
```

- [ ] **Step 2: 失敗するテスト**

`src/lib/effects/catalog.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CATALOG_VERSION, EFFECT_CATALOG, getEffectEntry } from "./catalog";

describe("effect catalog", () => {
  it("looks up a known effect entry", () => {
    const entry = getEffectEntry("add_internal_label");
    expect(entry?.reversibility).toBe("reversible");
    expect(entry?.autoExecuteAllowed).toBe(true);
  });

  it("returns undefined for an unknown effect", () => {
    expect(getEffectEntry("nope")).toBeUndefined();
  });

  it("stamps every entry with the catalog version", () => {
    for (const entry of EFFECT_CATALOG) {
      expect(entry.policyVersion).toBe(CATALOG_VERSION);
    }
  });

  it("covers all reversibility levels in the examples", () => {
    const levels = EFFECT_CATALOG.map((e) => e.reversibility).sort();
    expect(levels).toEqual(["compensatable", "irreversible", "reversible"]);
  });
});
```

Run: `pnpm test src/lib/effects/catalog.test.ts` → FAIL(モジュール未作成)。

- [ ] **Step 3: catalog を実装**

`src/lib/effects/catalog.ts`:
```ts
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
```

- [ ] **Step 4: テスト通過 + 型確認**

Run: `pnpm test src/lib/effects/catalog.test.ts` → PASS(4件)。`pnpm typecheck` → エラーなし。

- [ ] **Step 5: コミット**

```bash
git add src/lib/effects/types.ts src/lib/effects/catalog.ts src/lib/effects/catalog.test.ts
git commit -m "feat: add effect catalog types and example entries"
```

---

### Task 2: 実行ゲート(TDD)

**Files:**
- Create: `src/lib/effects/gate.ts`
- Test: `src/lib/effects/gate.test.ts`

`effectGate(request, context)` はカタログ参照 + delegate、`evaluateGate(entry, request, context)` が純粋判定。分けることで、実カタログに存在しない設定矛盾(irreversible+auto)も手製エントリで直接テストできる。

- [ ] **Step 1: 失敗するテスト**

`src/lib/effects/gate.test.ts`:
```ts
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
    const v = evaluateGate(entry(), req(), ctx({ presentReceiptTypes: ["input"] }));
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
```

Run: `pnpm test src/lib/effects/gate.test.ts` → FAIL。

- [ ] **Step 2: gate を実装**

`src/lib/effects/gate.ts`:
```ts
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
```

- [ ] **Step 3: テスト通過 + lint/typecheck**

Run: `pnpm test src/lib/effects/gate.test.ts` → PASS(14件)。`pnpm lint && pnpm typecheck` → エラーなし。

- [ ] **Step 4: コミット**

```bash
git add src/lib/effects/gate.ts src/lib/effects/gate.test.ts
git commit -m "feat: add effectGate and evaluateGate execution gate"
```

---

### Task 3: 検証・PR

**Files:** なし

- [ ] **Step 1: フル検証**

```bash
rm -rf .next && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: lint/typecheck エラーなし、test 全通過(既存 + 追加18: catalog 4 + gate 14)、build 成功。

- [ ] **Step 2: プッシュ・PR**

```bash
git push -u origin worktree-phase2-effect-catalog
gh pr create --base main --title "フェーズ2: Effect Catalog + 実行ゲート(土台)" --body "..."
```

---

## Self-Review 結果

- **Spec coverage:** §3型→Task1、§4カタログ+getEffectEntry→Task1、§5 gate 9段判定→Task2、§6 fail-safe/純粋→Task2実装、§7テスト→Task1(catalog)+Task2(gate)、§8配置→Task1-2。
- **Placeholder scan:** なし。
- **型整合:** `EffectRequest`/`GateContext`/`GateVerdict`/`Reversibility`/`ReceiptRequirement`/`PlanRequirement`(Task1 types.ts)を catalog(Task1)・gate(Task2)で一貫使用。`getEffectEntry`/`EFFECT_CATALOG`/`CATALOG_VERSION`(Task1)を gate/テスト(Task2)で使用。`effectGate` の verdict reason 文字列はテスト期待値と実装で一致。requiredReceipts に "review" を含めない方針(spec §4改訂)を catalog 実装に反映済み。
