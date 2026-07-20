# Parse Guard(検索充足ガード)設計ドキュメント

日付: 2026-07-20
ステータス: 承認済み
シリーズ位置: フェーズ1(Zenn「AIワークフロー設計シリーズ」02 Parse Guard の本アプリ向け実装)

## 1. 目的

MCPドキュメント検索の結果が空/不十分なとき、モデルが「ドキュメントに書いてある」と根拠を捏造するのを防ぐ。判定結果を ParseGuard 記録として残し、アクティビティパネルで確認できるようにする。

このアプリは検索が**モデル駆動のツール呼び出し**(pre-fetch RAGではない)なので、ツールの実行結果を評価し、空のときはモデルが受け取る結果に警告を注入して振る舞いを変える。

## 2. スコープ

- **含む**: MCP検索ツールのラップ、結果の充足度評価(空中心・拡張可能)、空時の結果注入、ParseGuard記録(既存receiptに `parse_guard` 種別を追加)、パネル表示、system prompt の常設指示。
- **含まない(将来)**: スコア/ヒューリスティックによる `insufficient` 判定、入力側(ユーザー質問)の充足チェック、limited mode の本格運用、effect-bearing 連携。

## 3. 動作

`/api/chat` の `streamText` に渡す前に、`mcp.tools` を `guardTools()` でラップする。各ツールの `execute` を包み:

```
model → search tool(args)
  1. 元の execute(args) を実行 → result
  2. evaluateRetrieval(result) → status: "sufficient" | "empty"
  3. ParseGuard receipt を保存(status, toolName, argsHash, action)
  4. status === "empty" のとき:
       モデルに返す結果を差し替え:
       "PARSE_GUARD: The document search returned no relevant results.
        Tell the user it was not found in the documents and do not
        fabricate document-grounded claims."
     status === "sufficient" のとき: 元の result をそのまま返す
```

これによりモデルは空検索時に「見つからなかった」と答え、捏造しない。sufficient 時は素通しで従来どおり。

## 4. 充足度判定(`evaluateRetrieval`)

`src/lib/parse-guard/evaluate.ts` の純粋関数。MCP結果の形はサーバー依存なので**防御的に空を検出**する。以下のいずれかを `empty` とする:

- `null` / `undefined`
- 空文字列 / 空白のみの文字列
- 空配列
- `{ content: [] }`(MCP CallToolResult形状)
- `content` 内のテキストがすべて空白
- `{ isError: true }` かつ内容が空

上記に当てはまらなければ `sufficient`。判定はこの関数に集約し、将来スコア閾値やヒューリスティックを差し替え可能にする(誤検知ゼロ方針: 確実に空のときだけ empty)。

戻り値:
```ts
export type ObservationStatus = "sufficient" | "empty"; // 将来: "insufficient"
export function evaluateRetrieval(result: unknown): { status: ObservationStatus };
```

## 5. ツールラップ(`guardTools`)

`src/lib/parse-guard/guard-tools.ts`:

```ts
type GuardContext = {
  onRecord: (params: {
    toolName: string;
    args: unknown;
    status: ObservationStatus;
    action: "allow" | "annotate";
  }) => void;
};

export function guardTools<T extends Record<string, ...>>(
  tools: T,
  ctx: GuardContext,
): T;
```

- 各ツールの `execute` を包む。元の結果を評価 → `onRecord` を呼ぶ → empty なら注入テキストを返し(action="annotate")、sufficient なら元結果を返す(action="allow")。
- `onRecord` は副作用(DB保存)を外から注入 → `guardTools` 自体は純粋寄りでテスト可能。
- ツールが `execute` を持たない場合はそのまま通す(防御的)。

## 6. 記録とパネル表示

新テーブルは作らず既存 `receipt` を再利用する。

- `ReceiptType` に `"parse_guard"` を追加(`src/lib/db/schema.ts` と `src/lib/receipts/receipts.ts` の両方)。
- `buildParseGuardReceipt()` を追加。payload:
  ```ts
  { observationStatus: ObservationStatus; toolName: string; argsHash: string; action: "allow" | "annotate" }
  ```
  boundary は `"support-only"`。本文は保存せず argsHash のみ。
- `src/lib/activity/receipts-source.ts` の種別分岐に `parse_guard` を追加(要約: 例「検索充足チェック: search_docs (empty→注入)」、詳細に status/action/argsHash)。→ 既存パネルに自動で並ぶ。
- チャットルートでは `guardTools` の `onRecord` から `safeSaveReceipts([buildParseGuardReceipt(...)])` を呼ぶ(監査記録なので失敗してもチャットを壊さない)。

## 7. system prompt

既存の `degradedNote`(MCP不達)に加え、常設で以下を追記:

> "When a document search returns no relevant results, tell the user the information was not found in the documents. Never fabricate document-grounded claims."

事前指示(静的)＋空時の結果注入(動的)で二重に効かせる。

## 8. 構成ファイル

| ファイル | 責務 |
|---|---|
| `src/lib/parse-guard/evaluate.ts`(新) | 充足度判定(純粋・テスト対象) |
| `src/lib/parse-guard/guard-tools.ts`(新) | MCPツールのラップ(判定＋注入＋onRecord) |
| `src/lib/receipts/receipts.ts`(改) | `buildParseGuardReceipt` 追加、ReceiptType拡張 |
| `src/lib/db/schema.ts`(改) | ReceiptType に `parse_guard` |
| `src/lib/activity/receipts-source.ts`(改) | `parse_guard` の要約表示 |
| `src/app/api/chat/route.ts`(改) | `guardTools` 適用、プロンプト追記、onRecordでrecord保存 |

## 9. エラーハンドリング

| 状況 | 挙動 |
|---|---|
| ParseGuard record 保存失敗 | `safeSaveReceipts` で握りつぶしログ出力。チャットは継続 |
| ツールが `execute` を持たない/評価不能 | ガードせず素通し(sufficient扱い、記録は action=allow) |
| MCP未接続 | ツール自体が無いのでガードも無し(従来どおり) |

## 10. テスト

- **`evaluateRetrieval`(単体)**: null/undefined/空文字/空白/空配列/`{content:[]}`/空テキストcontent → `empty`。非空文字列/非空配列/テキストありcontent → `sufficient`。
- **`guardTools`(単体)**: モックツールで — 空結果 → 注入テキストを返し `onRecord(action="annotate", status="empty")`。非空結果 → 元結果を返し `onRecord(action="allow", status="sufficient")`。`execute` 無しツール → 素通し。
- **`receipts-source`(単体)**: `parse_guard` receipt が正しい要約/詳細になる。
- 既存テスト(32件)は壊さない。

## 11. PR

単一PR。ブランチ `phase1-parse-guard`(main起点、アクティビティパネル含む)。完了条件: lint/typecheck/test/build グリーン、パネルに parse_guard 記録が出る、空検索時に注入テキストが返ることを単体で確認。
