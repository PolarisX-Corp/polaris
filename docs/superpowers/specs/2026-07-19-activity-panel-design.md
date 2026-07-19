# アクティビティパネル(レシート/ログのUI確認)設計ドキュメント

日付: 2026-07-19
ステータス: 承認済み

## 1. 目的

いま記録しているレシート(監査ログ)をUI上で確認できるようにする。加えて、今後追加するログ系(Parse Guard記録、Effect記録など)も**同じ場所で・同じ仕組みで**見られる拡張可能なパターンを用意する。

現状: `receipt` テーブル(`receiptType`: input/retrieval/proposal、`boundary`、`payload` jsonb、`conversationId`/`messageId`、`createdAt`)に記録済みだが閲覧手段が無い。

## 2. スコープ

- **含む**: 会話内から開くアクティビティパネル、レシートの時系列表示、種別ごとの詳細展開、汎用 `ActivityRecord` 抽象とsourceアダプタ方式、所有者のみのアクセス、`GET /api/conversations/[id]/activity`。
- **含まない(将来)**: 全会話横断の監査ページ、フィルタ/検索、ロール別可視性、レシートのエクスポート。

## 3. UX / 配置

- チャットのヘッダーに「監査ログ」トグルボタンを追加。押すと**右側パネル**が開く。
- パネルは現在の会話のアクティビティを**時系列(createdAt昇順)**で表示。
- 各レコード行: 種別バッジ(input/retrieval/proposal)＋boundaryバッジ＋時刻＋1行要約。クリックで詳細(key/value)を展開。
- 表示は本文を出さず、ハッシュ・参照・ステータスのみ(レシート設計に準拠)。
- パネルは開いた時に取得。回答完了時(既存の `onFinish`)にも再取得してライブ更新。

種別ごとの詳細(payloadから):
- input: contentHash、source参照(あれば)
- retrieval: toolName、status(succeeded/degraded)、argsHash、resultRefs
- proposal: modelId、outputHash、参照した入力レシートID(inputReceiptRefs)

## 4. 拡張パターン(今後のログ系の土台)

汎用ビューモデルを定義し、ログ種別ごとに「sourceアダプタ」で `ActivityRecord[]` に変換する。

```ts
export type ActivityRecord = {
  id: string;
  source: "receipt";              // 将来: "parse_guard" | "effect" …
  kind: string;                   // "input" | "retrieval" | "proposal" …
  boundary?: string;
  messageId?: string | null;
  createdAt: string;              // ISO8601
  summary: string;                // 1行要約
  details: { label: string; value: string }[];
};
```

- **アダプタ**: DB行 → `ActivityRecord[]`。v1はレシート用の1個のみ。
- **アグリゲータ** `getConversationActivity(conversationId)`: 全sourceを集約し `createdAt` でソートして返す。
- 将来 Parse Guard 記録が入るときは「テーブル＋アダプタを1個追加してアグリゲータに登録」するだけ。パネルとAPIは種別非依存なので変更不要。これが再利用パターン。

## 5. データフロー / アクセス

```
ブラウザ(ActivityPanel)
  fetch GET /api/conversations/[id]/activity
        │  auth() → 未認証 401
        │  getConversation + canAccessConversation → 他人/不在は 404
        │  getConversationActivity(id)  ← sources集約・ソート
        ▼
  ActivityRecord[] を返す → パネルが時系列描画
```

- アクセスは**自分の会話のみ**(ロール機構は未導入のため既定)。所有者チェックは既存 `canAccessConversation` を再利用。

## 6. 構成ファイル

| ファイル | 責務 |
|---|---|
| `src/lib/activity/types.ts` | `ActivityRecord` 型 |
| `src/lib/activity/receipts-source.ts` | receipt行 → `ActivityRecord[]`(アダプタ、単体テスト対象) |
| `src/lib/activity/index.ts` | `getConversationActivity()` 集約・ソート |
| `src/lib/db/queries.ts`(既存) | `getReceipts(conversationId)` を追加 |
| `src/app/api/conversations/[id]/activity/route.ts` | GET、認証＋所有者チェック |
| `src/components/activity-panel.tsx` | パネル(client、開いた時＋回答完了時に取得) |
| `src/components/chat.tsx`(既存) | ヘッダーにトグル追加、パネル配置、`onFinish`で再取得トリガ |

## 7. エラーハンドリング

| 状況 | 挙動 |
|---|---|
| 未認証 | 401 |
| 他人/存在しない会話 | 404 |
| 取得失敗(ネットワーク等) | パネルにエラー表示＋再試行。チャット本体には影響しない |
| レコード0件 | 「まだ記録はありません」 |
| 新規会話(まだ送信前) | パネルは空表示(会話未作成のため404になり得る → 空扱い) |

## 8. テスト

- **単体(Vitest)**: `receipts-source` の変換 —
  - input/retrieval/proposal がそれぞれ正しい `kind`/`summary`/`details` になる
  - **本文が含まれない**(ハッシュ/参照のみ)ことの検証
  - `createdAt` 昇順ソート
- **ルート**: 所有者=200かつ配列、他人=404、未認証=401(既存パターンに合わせモック方針を実装計画で確定)

## 9. PR

単一PR。ブランチ `worktree-receipts-viewer`(main起点のworktree)。完了条件: lint/typecheck/test/build グリーン、会話パネルでレシートが時系列表示される。
