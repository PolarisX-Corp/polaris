# Activity Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 会話内から開くパネルで、その会話のレシート(監査ログ)を時系列表示し、今後のログ種別も同じ仕組みで並べられる汎用 `ActivityRecord` 抽象を用意する。

**Architecture:** DB行を種別ごとの「sourceアダプタ」で汎用 `ActivityRecord` に変換 → アグリゲータが集約・ソート → `GET /api/conversations/[id]/activity`(認証+所有者チェック)→ client の `ActivityPanel` が時系列描画。パネルは開いた時と回答完了時に取得。

**Tech Stack:** Next.js 15 App Router / React 19 / Drizzle / Vitest。既存の `receipt` テーブル・`canAccessConversation`・`useChat` の `onFinish` を再利用。

**Branch:** `worktree-receipts-viewer`(main起点のworktree)。単一PR。

**検証コマンド:** `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` がグリーン。

---

### Task 1: ActivityRecord 型と receipts アダプタ (TDD)

**Files:**
- Create: `src/lib/activity/types.ts`
- Create: `src/lib/activity/receipts-source.ts`
- Test: `src/lib/activity/receipts-source.test.ts`

- [ ] **Step 1: 型を定義**

`src/lib/activity/types.ts`:
```ts
export type ActivitySource = "receipt";

export type ActivityRecord = {
  id: string;
  source: ActivitySource;
  kind: string;
  boundary?: string;
  messageId?: string | null;
  createdAt: string; // ISO8601
  summary: string;
  details: { label: string; value: string }[];
};
```

- [ ] **Step 2: 失敗するテストを書く**

`src/lib/activity/receipts-source.test.ts`:
```ts
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
});
```

Run: `pnpm test src/lib/activity/receipts-source.test.ts` → FAIL(モジュール未作成)。

- [ ] **Step 3: アダプタを実装**

`src/lib/activity/receipts-source.ts`:
```ts
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
```

- [ ] **Step 4: テスト通過を確認**

Run: `pnpm test src/lib/activity/receipts-source.test.ts` → PASS(3件)。

- [ ] **Step 5: コミット**

```bash
git add src/lib/activity/types.ts src/lib/activity/receipts-source.ts src/lib/activity/receipts-source.test.ts
git commit -m "feat: add ActivityRecord type and receipts source adapter"
```

---

### Task 2: getReceipts クエリとアグリゲータ

**Files:**
- Modify: `src/lib/db/queries.ts`(`getReceipts` 追加)
- Create: `src/lib/activity/index.ts`
- Test: `src/lib/activity/index.test.ts`

- [ ] **Step 1: `getReceipts` を追加**

`src/lib/db/queries.ts` の末尾(`saveReceipts` の後)に追加:
```ts
export async function getReceipts(conversationId: string) {
  return db
    .select()
    .from(receipts)
    .where(eq(receipts.conversationId, conversationId))
    .orderBy(asc(receipts.createdAt));
}
```
(`receipts` / `asc` / `eq` は既に import 済み。)

- [ ] **Step 2: アグリゲータのソートをテスト**

`src/lib/activity/index.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { sortActivity } from "./index";
import type { ActivityRecord } from "./types";

const rec = (id: string, createdAt: string): ActivityRecord => ({
  id,
  source: "receipt",
  kind: "input",
  createdAt,
  summary: "",
  details: [],
});

describe("sortActivity", () => {
  it("orders records by createdAt ascending", () => {
    const out = sortActivity([
      rec("b", "2026-07-19T02:00:00.000Z"),
      rec("a", "2026-07-19T01:00:00.000Z"),
      rec("c", "2026-07-19T03:00:00.000Z"),
    ]);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});
```

Run: `pnpm test src/lib/activity/index.test.ts` → FAIL。

- [ ] **Step 3: アグリゲータを実装**

`src/lib/activity/index.ts`:
```ts
import { getReceipts } from "@/lib/db/queries";
import { receiptsToActivity } from "./receipts-source";
import type { ActivityRecord } from "./types";

export function sortActivity(records: ActivityRecord[]): ActivityRecord[] {
  return [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Aggregate all activity sources for a conversation. v1: receipts only. */
export async function getConversationActivity(
  conversationId: string,
): Promise<ActivityRecord[]> {
  const receiptRows = await getReceipts(conversationId);
  return sortActivity(receiptsToActivity(receiptRows));
}
```

- [ ] **Step 4: テスト通過 + 型確認**

Run: `pnpm test src/lib/activity/index.test.ts` → PASS。`pnpm typecheck` → エラーなし。

- [ ] **Step 5: コミット**

```bash
git add src/lib/db/queries.ts src/lib/activity/index.ts src/lib/activity/index.test.ts
git commit -m "feat: add getReceipts query and activity aggregator"
```

---

### Task 3: アクティビティ取得 API ルート

**Files:**
- Create: `src/app/api/conversations/[id]/activity/route.ts`

**テスト方針:** このリポジトリはルートの統合テストを持たず、認可は `canAccessConversation`(単体テスト済み)で担保する方針。ここでは新規の統合テストは追加せず、Task 5 の実行時スモークで確認する。

- [ ] **Step 1: ルートを実装**

`src/app/api/conversations/[id]/activity/route.ts`:
```ts
import { getConversationActivity } from "@/lib/activity";
import { auth } from "@/lib/auth";
import { canAccessConversation } from "@/lib/db/access";
import { getConversation } from "@/lib/db/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await getConversation(id);
  if (!canAccessConversation(conversation, session.user.id)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const records = await getConversationActivity(id);
  return Response.json({ records });
}
```

- [ ] **Step 2: 型確認・コミット**

Run: `pnpm typecheck` → エラーなし。
```bash
git add "src/app/api/conversations/[id]/activity/route.ts"
git commit -m "feat: add conversation activity API route"
```

---

### Task 4: ActivityPanel コンポーネントと chat.tsx 連携

**Files:**
- Create: `src/components/activity-panel.tsx`
- Modify: `src/components/chat.tsx`

- [ ] **Step 1: ActivityPanel を実装**

`src/components/activity-panel.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import type { ActivityRecord } from "@/lib/activity/types";

export function ActivityPanel({
  conversationId,
  open,
  refreshKey,
  onClose,
}: {
  conversationId: string;
  open: boolean;
  refreshKey: number;
  onClose: () => void;
}) {
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(false);
    fetch(`/api/conversations/${conversationId}/activity`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: { records: ActivityRecord[] }) => {
        if (active) setRecords(data.records);
      })
      .catch(() => {
        if (active) {
          setRecords([]);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [open, conversationId, refreshKey]);

  if (!open) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-20 flex w-96 max-w-full flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <span className="text-sm font-semibold">監査ログ</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          ×
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {error && (
          <p className="text-sm text-red-600">
            取得に失敗しました。パネルを開き直してください。
          </p>
        )}
        {!error && records.length === 0 && (
          <p className="text-sm text-gray-400">まだ記録はありません。</p>
        )}
        {records.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-gray-200 dark:border-gray-800"
          >
            <button
              type="button"
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left"
            >
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium dark:bg-gray-800">
                {r.kind}
              </span>
              {r.boundary && (
                <span className="text-xs text-gray-400">{r.boundary}</span>
              )}
              <span className="flex-1 truncate text-xs text-gray-600 dark:text-gray-300">
                {r.summary}
              </span>
              <time className="shrink-0 text-[10px] text-gray-400">
                {new Date(r.createdAt).toLocaleTimeString("ja-JP")}
              </time>
            </button>
            {expanded === r.id && (
              <dl className="space-y-1 border-t border-gray-100 px-3 py-2 text-xs dark:border-gray-800">
                {r.details.map((d) => (
                  <div key={d.label} className="flex gap-2">
                    <dt className="shrink-0 text-gray-400">{d.label}</dt>
                    <dd className="break-all font-mono text-gray-700 dark:text-gray-300">
                      {d.value || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: chat.tsx にトグルとパネルを配線**

`src/components/chat.tsx` の import に追加:
```tsx
import { ActivityPanel } from "./activity-panel";
```

`Chat` 本体の state 群(`urlUpdated` の近く)に追加:
```tsx
const [showActivity, setShowActivity] = useState(false);
const [activityKey, setActivityKey] = useState(0);
```

`useChat` の `onFinish` を、パネルの再取得も促すよう変更:
```tsx
    onFinish: () => {
      // Refresh the sidebar so a newly created conversation appears.
      router.refresh();
      // Refetch the activity panel so new receipts show up.
      setActivityKey((k) => k + 1);
    },
```

ヘッダーのモデル選択の隣に監査ログトグルを追加。既存の `<header>` 内、`<ModelSelect .../>` の直後に:
```tsx
        <button
          type="button"
          onClick={() => setShowActivity((v) => !v)}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          監査ログ
        </button>
```
(ヘッダーの右側要素が増えるため、`<ModelSelect>` とこのボタンを `<div className="flex items-center gap-2">…</div>` でまとめる。)

コンポーネントの最後、ルート `<div>` の閉じタグ直前に配置:
```tsx
      <ActivityPanel
        conversationId={conversationId}
        open={showActivity}
        refreshKey={activityKey}
        onClose={() => setShowActivity(false)}
      />
```

- [ ] **Step 3: lint/typecheck/test**

Run: `pnpm lint && pnpm typecheck && pnpm test` → すべてグリーン。

- [ ] **Step 4: コミット**

```bash
git add src/components/activity-panel.tsx src/components/chat.tsx
git commit -m "feat: add activity panel with audit-log toggle in chat"
```

---

### Task 5: 検証・PR

**Files:** なし(検証とPRのみ)

- [ ] **Step 1: フル検証**

```bash
rm -rf .next && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: lint/typecheck エラーなし、test 全通過(既存28 + 追加4 = 32)、build 成功。

- [ ] **Step 2: 実行時スモーク(ローカルPostgres)**

Docker で Postgres を起動 → `pnpm db:migrate` → dev 起動。ダミー認証環境で以下を確認:
- 未認証で `GET /api/conversations/<id>/activity` → 401
- 他人/存在しない会話ID → 404

(認証済みでの実データ表示は APIキー + ログインが必要なため、実環境で確認する旨をPRに明記。)

- [ ] **Step 3: プッシュ・PR作成**

```bash
git push -u origin worktree-receipts-viewer
gh pr create --base main --title "会話内アクティビティパネル(レシート/ログ閲覧)" --body "..."
```

---

## Self-Review 結果

- **Spec coverage:** §3 UX→Task4、§4 ActivityRecord/アダプタ→Task1、§5 データフロー/所有者チェック→Task3、§6 構成ファイル→Task1-4、§7 エラー(401/404/取得失敗/0件)→Task3-4、§8 テスト→Task1-2(ルート統合テストは非採用と明記)。
- **Placeholder scan:** なし(「モック方針」はTask3で「統合テスト非採用」と確定済み)。
- **型整合:** `ActivityRecord`(Task1)を Task2/3/4 で一貫使用。`receiptsToActivity`/`sortActivity`/`getConversationActivity`/`getReceipts` の名前は各Taskで一致。`ReceiptRow` は Task1 定義、Task2 の `getReceipts` 戻り値(`receipts.$inferSelect`)と構造的に一致。
