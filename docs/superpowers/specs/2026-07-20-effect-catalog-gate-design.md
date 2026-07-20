# Effect Catalog + 実行ゲート(土台ライブラリ)設計ドキュメント

日付: 2026-07-20
ステータス: 承認済み
シリーズ位置: フェーズ2(Zenn「AIワークフロー設計シリーズ」06 Effect Catalog / 03 Rollback / 01 境界)

## 1. 目的

effect-bearing(外部状態を変更する)処理を将来安全に扱うための土台を作る。effect種別ごとのメタデータを持つ **Effect Catalog** と、実行前に条件を判定する **実行ゲート `effectGate`**(ACCEPT / DEGRADE / REJECT)を、純粋なライブラリとして実装する。

このアプリはまだ effect-bearing なツールを持たないため、**外部操作・UI・ルート配線は一切しない**。フェーズ3(最初の実ツール)がこのゲートに差し込む。

## 2. スコープ

- **含む**: `src/lib/effects/` に types / catalog / gate。例エントリ3つ(reversibility 全網羅)。gate の単体テスト。
- **含まない(将来フェーズ)**: 実ツール実行、gate判定のレシート化・DB保存、レビュー用ワークスペースUI、ランタイムモード(live/dry_run/shadow)、Rollback/Compensation の実行、Effect Permission(権限)。

## 3. 型(`src/lib/effects/types.ts`)

```ts
export type Reversibility = "reversible" | "compensatable" | "irreversible";

// effect が要求しうるレシート種別。将来の "review" を含む(現DBのReceiptTypeとは
// 別に、effect土台として前方互換な語彙をここで定義する)。
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

## 4. Effect Catalog(`src/lib/effects/catalog.ts`)

記事06の entry をコードで管理(初期段階の推奨形)。

```ts
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
```

例エントリ3つ(全 reversibility を網羅):

| effectType | reversibility | autoExecuteAllowed | requiredReceipts | requiredReviewerRoles | requiredPlans |
|---|---|---|---|---|---|
| `add_internal_label` | reversible | true | input, proposal | (なし) | rollback_plan |
| `send_customer_email` | compensatable | false | input, proposal, review | support_lead | compensation_plan |
| `issue_refund` | irreversible | false | input, proposal, review | finance_lead | (なし) |

全エントリの `policyVersion` は `CATALOG_VERSION`。

参照関数:
```ts
export function getEffectEntry(effectType: string): EffectCatalogEntry | undefined;
```

## 5. 実行ゲート(`src/lib/effects/gate.ts`)

```ts
export function effectGate(
  request: EffectRequest,
  context: GateContext,
): GateVerdict;
```

判定順(記事03/06準拠。最初に該当したものを返す):

1. カタログに `effectType` が無い → **REJECT** `unknown_effect_type`
2. `request.policyVersion !== entry.policyVersion` → **DEGRADE** `policy_version_mismatch`, missing `["explicit_rebind_or_recheck"]`
3. `entry.reversibility === "irreversible" && entry.autoExecuteAllowed === true`(設定矛盾) → **REJECT** `irreversible_must_not_auto_execute`
4. `request.evidenceRefs` が空 → **DEGRADE** `evidence_missing`, missing `["evidence_refs"]`
5. `request.idempotencyKey` が空 → **DEGRADE** `idempotency_key_missing`, missing `["idempotency_key"]`
6. `entry.requiredReceipts` のうち `context.presentReceiptTypes` に無いものがある → **DEGRADE** `required_receipts_missing`, missing に不足種別
7. `entry.requiredPlans` のうち `context.presentPlans` に無いものがある → **DEGRADE** `required_plans_missing`, missing に不足プラン
8. 承認要件:
   - `entry.requiredReviewerRoles.length > 0` かつ `context.review` 無し → **DEGRADE** `review_receipt_missing`, missing `["review"]`
   - `context.review?.approved === false` → **REJECT** `review_rejected`
   - 必要ロールが `context.review.reviewerRoles` に揃っていない → **DEGRADE** `required_reviewer_role_missing`, missing に不足ロール
   - `entry.autoExecuteAllowed === false` かつ 承認済み review が無い(`!context.review?.approved`) → **DEGRADE** `review_required`, missing `["review"]`
9. すべて満たす → **ACCEPT**

補足: 手順8は「ロール要求あり」と「autoExecuteAllowed=false(＝人手承認必須)」の両方を満たす。ロール要求が無くても auto 不可なら承認済み review を要求する。

## 6. エラー・境界の扱い

- `effectGate` は純粋関数。例外を投げず、常に `GateVerdict` を返す。
- 未知の effectType は fail-safe に **REJECT**(effect-bearing で fail-open は危険、記事06の思想)。
- 判定できない不足はすべて **DEGRADE**(「足りないものを補って再開」)。実行不可の確定は **REJECT**。

## 7. テスト(`src/lib/effects/gate.test.ts`, `catalog.test.ts`)

gate(主役):
- 未知 effectType → REJECT `unknown_effect_type`
- policyVersion 不一致 → DEGRADE `policy_version_mismatch`
- `add_internal_label` で evidence/idempotency/receipts/plan 揃い → ACCEPT
- receipts 不足 → DEGRADE(missing に不足種別)
- plan 不足 → DEGRADE `required_plans_missing`
- `send_customer_email` で review 無し → DEGRADE `review_receipt_missing`
- review.approved=false → REJECT `review_rejected`
- 必要ロール不足(review はあるが support_lead 無し) → DEGRADE `required_reviewer_role_missing`
- `send_customer_email` 全充足(review approved + support_lead + receipts + compensation_plan) → ACCEPT
- evidence 空 → DEGRADE `evidence_missing`
- idempotencyKey 空 → DEGRADE `idempotency_key_missing`

catalog:
- `getEffectEntry("add_internal_label")` が entry を返す / 未知は undefined
- 全エントリの policyVersion === CATALOG_VERSION

## 8. 配置

| ファイル | 責務 |
|---|---|
| `src/lib/effects/types.ts` | Reversibility / GateVerdict / EffectRequest / GateContext / ReceiptRequirement / PlanRequirement |
| `src/lib/effects/catalog.ts` | EffectCatalogEntry 型、EFFECT_CATALOG(例3件)、CATALOG_VERSION、getEffectEntry |
| `src/lib/effects/gate.ts` | effectGate |
| `src/lib/effects/*.test.ts` | 単体テスト |

DB・UI・route には触れない。

## 9. PR

単一PR。ブランチ `worktree-phase2-effect-catalog`(main起点のworktree)。完了条件: lint/typecheck/test/build グリーン、gate の全 verdict 分岐が単体で確認できる。
