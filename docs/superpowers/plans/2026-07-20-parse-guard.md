# Parse Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MCP検索結果が空のときにモデルへ警告を注入して捏造を防ぎ、ParseGuard記録を残してアクティビティパネルに表示する。

**Architecture:** `/api/chat` で `mcp.tools` を `guardTools()` でラップ。各ツールの `execute` を包み、結果を `evaluateRetrieval()` で評価。空なら警告テキストを返して `onRecord`(→ parse_guard receipt 保存)、非空なら素通し。receipt に `parse_guard` 種別を追加し、既存の receipts-source アダプタでパネルに表示。

**Tech Stack:** Next.js API route / AI SDK v7 `ToolSet` / Drizzle(既存receiptテーブル・text列なのでマイグレーション不要)/ Vitest。

**Branch:** `phase1-parse-guard`(main起点、activity panel含む)。単一PR。

**検証:** `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` グリーン。

---

### Task 1: evaluateRetrieval(充足度判定, TDD)

**Files:**
- Create: `src/lib/parse-guard/evaluate.ts`
- Test: `src/lib/parse-guard/evaluate.test.ts`

- [ ] **Step 1: 失敗するテスト**

`src/lib/parse-guard/evaluate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { evaluateRetrieval } from "./evaluate";

describe("evaluateRetrieval", () => {
  it("treats missing/empty values as empty", () => {
    expect(evaluateRetrieval(null).status).toBe("empty");
    expect(evaluateRetrieval(undefined).status).toBe("empty");
    expect(evaluateRetrieval("").status).toBe("empty");
    expect(evaluateRetrieval("   ").status).toBe("empty");
    expect(evaluateRetrieval([]).status).toBe("empty");
  });

  it("treats an MCP result with empty content as empty", () => {
    expect(evaluateRetrieval({ content: [] }).status).toBe("empty");
    expect(
      evaluateRetrieval({ content: [{ type: "text", text: "  " }] }).status,
    ).toBe("empty");
  });

  it("treats present content as sufficient", () => {
    expect(evaluateRetrieval("見つかった文書").status).toBe("sufficient");
    expect(evaluateRetrieval(["doc1"]).status).toBe("sufficient");
    expect(
      evaluateRetrieval({ content: [{ type: "text", text: "返金ポリシー…" }] })
        .status,
    ).toBe("sufficient");
  });
});
```

Run: `pnpm test src/lib/parse-guard/evaluate.test.ts` → FAIL(モジュール未作成)。

- [ ] **Step 2: 実装**

`src/lib/parse-guard/evaluate.ts`:
```ts
export type ObservationStatus = "sufficient" | "empty";

function isBlank(s: unknown): boolean {
  return typeof s === "string" && s.trim().length === 0;
}

/**
 * Defensively detect an empty retrieval result across the shapes an MCP tool
 * may return (string, array, or a CallToolResult-like { content: [...] }).
 * Only definite emptiness yields "empty" (zero false positives); anything with
 * real content is "sufficient". Future scoring/heuristics slot in here.
 */
export function evaluateRetrieval(result: unknown): { status: ObservationStatus } {
  if (result == null) return { status: "empty" };
  if (typeof result === "string") {
    return { status: isBlank(result) ? "empty" : "sufficient" };
  }
  if (Array.isArray(result)) {
    return { status: result.length === 0 ? "empty" : "sufficient" };
  }
  if (typeof result === "object") {
    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const hasText = content.some((part) => {
        const text = (part as { text?: unknown })?.text;
        return typeof text === "string" ? !isBlank(text) : part != null;
      });
      return { status: hasText ? "sufficient" : "empty" };
    }
  }
  return { status: "sufficient" };
}
```

- [ ] **Step 3: テスト通過**

Run: `pnpm test src/lib/parse-guard/evaluate.test.ts` → PASS(3件)。

- [ ] **Step 4: コミット**

```bash
git add src/lib/parse-guard/evaluate.ts src/lib/parse-guard/evaluate.test.ts
git commit -m "feat: add evaluateRetrieval for parse-guard sufficiency"
```

---

### Task 2: parse_guard receipt 種別とビルダー(TDD)

**Files:**
- Modify: `src/lib/db/schema.ts`(`ReceiptType` に `parse_guard`)
- Modify: `src/lib/receipts/receipts.ts`(型拡張 + `buildParseGuardReceipt`)
- Test: `src/lib/receipts/parse-guard-receipt.test.ts`

- [ ] **Step 1: schema.ts の ReceiptType を拡張**

`src/lib/db/schema.ts` の該当行:
```ts
export type ReceiptType = "input" | "retrieval" | "proposal" | "parse_guard";
```
(text列のためDBマイグレーションは不要。)

- [ ] **Step 2: 失敗するテスト**

`src/lib/receipts/parse-guard-receipt.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildParseGuardReceipt } from "./receipts";

describe("buildParseGuardReceipt", () => {
  it("records status/action and hashes args (no raw text)", () => {
    const r = buildParseGuardReceipt({
      conversationId: "c1",
      messageId: "m1",
      toolName: "search_docs",
      args: { query: "秘密のクエリ" },
      observationStatus: "empty",
      action: "annotate",
    });
    expect(r.receiptType).toBe("parse_guard");
    expect(r.boundary).toBe("support-only");
    expect(r.payload.observationStatus).toBe("empty");
    expect(r.payload.action).toBe("annotate");
    expect(r.payload.toolName).toBe("search_docs");
    expect(r.payload.argsHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(r.payload)).not.toContain("秘密のクエリ");
  });
});
```

Run: `pnpm test src/lib/receipts/parse-guard-receipt.test.ts` → FAIL。

- [ ] **Step 3: receipts.ts に型とビルダーを追加**

`src/lib/receipts/receipts.ts`:

(a) `ReceiptType` を拡張:
```ts
export type ReceiptType = "input" | "retrieval" | "proposal" | "parse_guard";
```

(b) payload/receipt 型を追加(既存の `ProposalPayload` 定義の後):
```ts
export type ParseGuardPayload = {
  observationStatus: "sufficient" | "empty";
  toolName: string;
  argsHash: string;
  action: "allow" | "annotate";
};
```

(c) `ParseGuardReceipt` 型と `AnyReceipt` への追加(既存 `ProposalReceipt` 定義の後):
```ts
export type ParseGuardReceipt = BaseReceipt<"parse_guard", ParseGuardPayload>;
export type AnyReceipt =
  | InputReceipt
  | RetrievalReceipt
  | ProposalReceipt
  | ParseGuardReceipt;
```
(既存の `export type AnyReceipt = InputReceipt | RetrievalReceipt | ProposalReceipt;` を上記で置き換える。)

(d) ビルダー(ファイル末尾):
```ts
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
```

- [ ] **Step 4: テスト通過 + 型確認**

Run: `pnpm test src/lib/receipts/parse-guard-receipt.test.ts` → PASS。`pnpm typecheck` → エラーなし。

- [ ] **Step 5: コミット**

```bash
git add src/lib/db/schema.ts src/lib/receipts/receipts.ts src/lib/receipts/parse-guard-receipt.test.ts
git commit -m "feat: add parse_guard receipt type and builder"
```

---

### Task 3: guardTools(ツールラップ, TDD)

**Files:**
- Create: `src/lib/parse-guard/guard-tools.ts`
- Test: `src/lib/parse-guard/guard-tools.test.ts`

- [ ] **Step 1: 失敗するテスト**

`src/lib/parse-guard/guard-tools.test.ts`:
```ts
import type { ToolSet } from "ai";
import { describe, expect, it } from "vitest";
import { guardTools, type GuardRecord } from "./guard-tools";

function makeTools(execute: unknown): ToolSet {
  return { search: { execute } } as unknown as ToolSet;
}

function runExecute(tools: ToolSet, name: string, args: unknown): Promise<unknown> {
  const exec = (tools[name] as { execute: (a: unknown, o: unknown) => Promise<unknown> })
    .execute;
  return exec(args, {});
}

describe("guardTools", () => {
  it("injects a warning and records annotate on an empty result", async () => {
    const records: GuardRecord[] = [];
    const wrapped = guardTools(
      makeTools(async () => ""),
      { onRecord: (r) => records.push(r) },
    );
    const out = await runExecute(wrapped, "search", { q: "x" });
    expect(String(out)).toContain("PARSE_GUARD");
    expect(records[0]).toMatchObject({
      toolName: "search",
      status: "empty",
      action: "annotate",
    });
  });

  it("passes through and records allow on a non-empty result", async () => {
    const records: GuardRecord[] = [];
    const wrapped = guardTools(
      makeTools(async () => "found docs"),
      { onRecord: (r) => records.push(r) },
    );
    const out = await runExecute(wrapped, "search", {});
    expect(out).toBe("found docs");
    expect(records[0]).toMatchObject({ status: "sufficient", action: "allow" });
  });

  it("leaves tools without execute untouched", () => {
    const wrapped = guardTools(makeTools(undefined), { onRecord: () => {} });
    expect((wrapped.search as { execute?: unknown }).execute).toBeUndefined();
  });
});
```

Run: `pnpm test src/lib/parse-guard/guard-tools.test.ts` → FAIL。

- [ ] **Step 2: 実装**

`src/lib/parse-guard/guard-tools.ts`:
```ts
import type { ToolSet } from "ai";
import { evaluateRetrieval, type ObservationStatus } from "./evaluate";

const INJECTION =
  "PARSE_GUARD: The document search returned no relevant results. " +
  "Tell the user the information was not found in the documents and do not " +
  "fabricate document-grounded claims.";

export type GuardRecord = {
  toolName: string;
  args: unknown;
  status: ObservationStatus;
  action: "allow" | "annotate";
};

export type GuardContext = {
  onRecord: (record: GuardRecord) => void;
};

/**
 * Wrap each MCP tool's execute so an empty retrieval result is replaced with a
 * warning the model must not ignore, and every call is recorded via onRecord.
 * Tools without an execute function are passed through unchanged.
 */
export function guardTools(tools: ToolSet, ctx: GuardContext): ToolSet {
  const wrapped: ToolSet = {};

  for (const [name, tool] of Object.entries(tools)) {
    const original = tool.execute as
      | ((args: unknown, options: unknown) => Promise<unknown>)
      | undefined;

    if (typeof original !== "function") {
      wrapped[name] = tool;
      continue;
    }

    wrapped[name] = {
      ...tool,
      execute: (async (args: unknown, options: unknown) => {
        const result = await original(args, options);
        const { status } = evaluateRetrieval(result);
        if (status === "empty") {
          ctx.onRecord({ toolName: name, args, status, action: "annotate" });
          return INJECTION;
        }
        ctx.onRecord({ toolName: name, args, status, action: "allow" });
        return result;
      }) as typeof tool.execute,
    } as typeof tool;
  }

  return wrapped;
}
```

- [ ] **Step 3: テスト通過 + 型確認**

Run: `pnpm test src/lib/parse-guard/guard-tools.test.ts` → PASS(3件)。`pnpm typecheck` → エラーなし。

- [ ] **Step 4: コミット**

```bash
git add src/lib/parse-guard/guard-tools.ts src/lib/parse-guard/guard-tools.test.ts
git commit -m "feat: add guardTools to wrap MCP tools with parse-guard"
```

---

### Task 4: パネルでの parse_guard 表示(TDD)

**Files:**
- Modify: `src/lib/activity/receipts-source.ts`
- Test: `src/lib/activity/receipts-source.test.ts`(既存に追記)

- [ ] **Step 1: 失敗するテストを追記**

`src/lib/activity/receipts-source.test.ts` の `describe` 内に追加:
```ts
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
```

Run: `pnpm test src/lib/activity/receipts-source.test.ts` → FAIL(型 or 実行時に parse_guard 未対応)。

- [ ] **Step 2: ReceiptRow と switch を拡張**

`src/lib/activity/receipts-source.ts`:

(a) `ReceiptRow.receiptType` を拡張:
```ts
  receiptType: "input" | "retrieval" | "proposal" | "parse_guard";
```

(b) `switch (row.receiptType)` に `proposal` の case の後、`}` の前に追加:
```ts
    case "parse_guard":
      return {
        ...base,
        summary: `検索充足チェック: ${str(p.toolName)} (${str(p.observationStatus)})`,
        details: [
          { label: "observationStatus", value: str(p.observationStatus) },
          { label: "action", value: str(p.action) },
          { label: "toolName", value: str(p.toolName) },
          { label: "argsHash", value: str(p.argsHash) },
        ],
      };
```

- [ ] **Step 3: テスト通過**

Run: `pnpm test src/lib/activity/receipts-source.test.ts` → PASS(4件)。

- [ ] **Step 4: コミット**

```bash
git add src/lib/activity/receipts-source.ts src/lib/activity/receipts-source.test.ts
git commit -m "feat: render parse_guard receipts in the activity panel"
```

---

### Task 5: チャットルートへの適用

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: import を追加**

`src/app/api/chat/route.ts` の import 群に追加:
```ts
import { guardTools } from "@/lib/parse-guard/guard-tools";
```
既存の receipts import に `buildParseGuardReceipt` を追加:
```ts
import {
  buildInputReceipt,
  buildParseGuardReceipt,
  buildProposalReceipt,
  buildRetrievalReceipt,
} from "@/lib/receipts/receipts";
```

- [ ] **Step 2: ツールをラップし、プロンプトに常設指示を追加**

`const mcp = await getMcpToolsForUser(userId);` の直後に追加:
```ts
    const guardedTools = guardTools(mcp.tools, {
      onRecord: (r) => {
        const rc = buildParseGuardReceipt({
          conversationId,
          messageId: lastUserMessage.id,
          toolName: r.toolName,
          args: r.args,
          observationStatus: r.status,
          action: r.action,
        });
        void safeSaveReceipts([{ ...rc, payload: rc.payload }]);
      },
    });
```

`streamText` の `tools:` を差し替え:
```ts
      tools: guardedTools,
```

`system:` の文字列に常設指示を追記(`degradedNote` の連結の前に、既存の文末へ):
```ts
      system:
        "You are Polaris, an internal assistant for company members. " +
        "Answer clearly and concisely in the user's language. " +
        "When a document search returns no relevant results, tell the user the " +
        "information was not found in the documents. Never fabricate " +
        "document-grounded claims." +
        degradedNote,
```

- [ ] **Step 3: lint/typecheck/test**

Run: `pnpm lint && pnpm typecheck && pnpm test` → すべてグリーン(既存32 + 追加5 = 37)。

- [ ] **Step 4: コミット**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: apply parse-guard tool wrapping in the chat route"
```

---

### Task 6: 検証・PR

**Files:** なし

- [ ] **Step 1: フル検証**

```bash
rm -rf .next && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: lint/typecheck エラーなし、test 全通過、build 成功。

- [ ] **Step 2: プッシュ・PR**

```bash
git push -u origin phase1-parse-guard
gh pr create --base main --title "フェーズ1: Parse Guard(検索充足ガード)" --body "..."
```

---

## Self-Review 結果

- **Spec coverage:** §3動作/§5 guardTools→Task3+5、§4 evaluateRetrieval→Task1、§6 記録+パネル→Task2+4、§7 プロンプト→Task5、§8 構成→Task1-5、§9 エラー(safeSaveReceipts/execute無し素通し)→Task3+5、§10 テスト→Task1-4。
- **Placeholder scan:** なし。
- **型整合:** `ObservationStatus`("sufficient"|"empty")は evaluate.ts(Task1)定義、guard-tools(Task3)・receipts(Task2, インラインリテラルで同値)・receipts-source(Task4)で一貫。`GuardRecord`/`GuardContext`(Task3)を Task5 の onRecord で使用。`buildParseGuardReceipt` の引数名(observationStatus/action/toolName/args)は Task2 定義と Task5 呼び出しで一致。ReceiptType 拡張は schema.ts(Task2)・receipts.ts(Task2)・receipts-source.ts の ReceiptRow(Task4)の3箇所で揃える。
