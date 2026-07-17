# Polaris — 社内AIエージェント設計ドキュメント

日付: 2026-07-17
ステータス: 承認済み(アーキテクチャ承認 + 以降の進行を委任)

## 1. 目的

Claude/Gemini のWebチャットのようなUIを持つ社内向けAIエージェント。社内メンバーがGoogleアカウントでログインし、複数のLLMプロバイダを切り替えてチャットでき、会社ドキュメントのMCPサーバー(HTTP + OAuth)に接続してグラウンディングされた回答を得られる。

小さく始めてPRチェーンで機能を追加する。Zennの「AIワークフロー設計シリーズ」のパターンは軽量適用: boundary分類(当面すべて support-only)と最小限のレシート記録をデータモデルに組み込み、将来 effect-bearing なツールを追加する際に実行ゲートを差し込める構造にしておく。

## 2. 技術スタック

| 領域 | 選定 |
|---|---|
| フレームワーク | Next.js 15 (App Router) + React 19 + TypeScript |
| LLM抽象化 | Vercel AI SDK v5 (`ai`, `@ai-sdk/react`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) |
| 認証 | Auth.js v5 (next-auth@beta) + Google OAuth、社内ドメイン制限 |
| DB | Postgres (Neon想定) + Drizzle ORM |
| MCP | `@modelcontextprotocol/sdk` (Streamable HTTP + OAuth) |
| スタイル | Tailwind CSS v4 |
| テスト | Vitest |
| CI | GitHub Actions (lint / typecheck / test) |
| デプロイ | Vercel |

## 3. 全体アーキテクチャ

```
ブラウザ (React / useChat)
    │  ストリーミング (SSE)
    ▼
Next.js App Router (Vercel)
 ├─ 認証: Auth.js v5 + Google OAuth (社内ドメイン制限)
 ├─ /api/chat: streamText + プロバイダレジストリ
 │     ├─ Anthropic / OpenAI / Google を設定で切替
 │     └─ MCPツールを tool use として注入
 ├─ MCPクライアント層 (HTTP + OAuth)
 │     └─ 会社ドキュメントMCPサーバー
 └─ Drizzle ORM
       ▼
   Postgres — ユーザー / 会話 / メッセージ / レシート / MCP接続
```

構成単位と責務:

| ユニット | 責務 | 依存 |
|---|---|---|
| `app/(chat)/` | チャットUI(会話一覧サイドバー、メッセージ表示、入力欄、モデル選択) | `@ai-sdk/react`, API |
| `app/api/chat/route.ts` | ストリーミング応答の生成、ツール実行の仲介、永続化 | AI SDK, `lib/mcp`, `lib/db` |
| `lib/ai/providers.ts` | プロバイダレジストリ。モデルID(例 `anthropic:claude-sonnet-5`)→モデル実体の解決。利用可能モデル一覧 | `@ai-sdk/*` |
| `lib/mcp/` | MCPサーバー接続、ユーザー単位OAuthトークン管理(暗号化保存)、ツール取得 | MCP SDK, `lib/db` |
| `lib/db/` | Drizzleスキーマとクエリ関数 | Postgres |
| `lib/auth/` | Auth.js設定、ドメイン制限、セッション検証ヘルパー | Google OAuth |
| `lib/receipts/` | 軽量レシートの構築・保存 | `lib/db` |

設計原則:

- **boundary**: 現段階の全ツールはドキュメント検索(読み取り)= `support-only`。レシートとツール実行記録に boundary フィールドを必ず持たせ、将来 `review-only` / `effect-bearing` を追加する際は `lib/ai/gate.ts`(実行ゲート)を `/api/chat` のツール実行パスに挿入する
- **MCP OAuthはユーザー単位**: 各ユーザーが自分の権限でMCPサーバーに認可。トークンはユーザーに紐づけて暗号化(AES-256-GCM、`ENCRYPTION_KEY`)してDB保存。AIが読める範囲=そのユーザーの権限範囲
- **LLM APIキーはサーバー側のみ**(環境変数)。クライアントには渡さない

## 4. データモデル (Drizzle / Postgres)

```
users            -- Auth.js Drizzleアダプタ管理 (+ accounts, sessions, verificationTokens)
  id uuid PK / email / name / image / createdAt

conversations
  id uuid PK / userId FK→users / title text / createdAt / updatedAt

messages
  id uuid PK / conversationId FK→conversations
  role: 'user' | 'assistant' | 'system'
  parts jsonb          -- AI SDK v5 UIMessage parts (text, tool call/result, sources)
  modelId text         -- 応答生成に使ったモデル (assistantのみ)
  createdAt

receipts             -- 軽量レシート (Zenn記事04の縮約版)
  id uuid PK / conversationId FK / messageId FK nullable
  receiptType: 'input' | 'retrieval' | 'proposal'
  boundary: 'support-only'          -- 将来 'review-only' | 'effect-bearing' を追加
  payload jsonb        -- 型別: input={contentHash, sourceRefs}
                       --       retrieval={toolName, serverUrl, argsHash, resultRefs, status}
                       --       proposal={modelId, outputHash, inputReceiptRefs}
  createdAt

mcp_connections      -- ユーザーごとのMCP OAuth状態
  id uuid PK / userId FK (unique per server) / serverUrl text
  accessTokenEnc text / refreshTokenEnc text nullable / expiresAt timestamptz nullable
  clientInfo jsonb     -- dynamic client registration の結果
  codeVerifier text nullable  -- PKCE フロー中のみ
  status: 'connected' | 'pending' | 'disconnected'
  createdAt / updatedAt
```

方針:

- メッセージは AI SDK v5 の `UIMessage.parts` をそのまま jsonb 保存し、ツール呼び出し・結果・引用も1メッセージ内のpartsとして保持する(再描画が忠実になる)
- レシートは append-only。本文そのものではなくハッシュと参照を保存し、個人情報の保持を最小化(記事04)
- 会話タイトルは初回ユーザーメッセージから軽量モデルで自動生成

## 5. チャット/MCPフロー

リクエストフロー (`POST /api/chat`):

1. セッション検証(未認証は401)
2. 会話の所有者チェック(他ユーザーの会話IDは404)
3. InputReceipt保存(ユーザーメッセージのハッシュ)
4. ユーザーのMCP接続があればMCPクライアントを生成しツール一覧を取得。**取得失敗時はツールなしで続行**し、レスポンスに劣化通知を含める(DEGRADEの思想: 失敗ではなく制限モード)
5. プロバイダレジストリでモデル解決 → `streamText`(マルチステップツール実行は `stopWhen: stepCountIs(5)`)
6. ツール実行ごとにRetrievalReceipt保存
7. `onFinish` でassistantメッセージ永続化 + ProposalReceipt保存
8. `toUIMessageStreamResponse()` でストリーム返却

MCP OAuthフロー(MCP仕様のOAuth 2.1 / PKCE / dynamic client registration):

1. 設定画面で「ドキュメントMCPに接続」→ `/api/mcp/auth/start` がサーバーのメタデータを発見し、client登録・PKCE生成 → 認可URLへリダイレクト
2. コールバック `/api/mcp/auth/callback` でcode交換 → トークン暗号化保存 → status=connected
3. チャット時はアクセストークンでStreamable HTTP接続。期限切れはrefresh、refresh不能なら status=disconnected にして再接続を促す(チャット自体は継続)

## 6. エラーハンドリング

| 障害 | 挙動 |
|---|---|
| LLMプロバイダ障害/キー未設定 | ストリームにエラーパート。UIにエラー表示+再試行ボタン。未設定プロバイダはモデル一覧から除外 |
| MCPサーバー不達/トークン失効 | ツールなしで回答を継続し、「ドキュメント検索は現在利用できません」を表示。トークン失効時は再接続導線 |
| 未認証 | ログインページへリダイレクト(middleware) |
| 他ユーザーのリソースアクセス | 404(存在を漏らさない) |
| DB障害 | チャットAPIは5xx。UIはエラー表示(部分保存はしない) |

## 7. テスト戦略

- **ユニット(Vitest)**: プロバイダレジストリの解決/除外、ドメイン制限判定、レシートビルダー(ハッシュ/参照)、トークン暗号化ラウンドトリップ、MCP劣化時のフォールバック分岐
- **ルート**: `/api/chat` を AI SDK のモックモデルで検証(認可、永続化、レシート発行)
- **golden case(記事08の縮約)**: 「MCP不達時にツールなしで劣化応答し、劣化通知が付く」「他人の会話IDで404」を固定ケース化しCIで常時実行
- CI: GitHub Actionsで lint / typecheck / test。E2E(Playwright)は将来PR

## 8. PRロードマップ

mainへ直接コミットするのは初期コミット(本ドキュメント+README)のみ。以降はPRチェーン。

| PR | 内容 | 完了条件 |
|---|---|---|
| PR1 | スキャフォールド: Next.js 15 + TS + Tailwind + Vitest + CI + 基本レイアウト | CIグリーン、トップページ表示 |
| PR2 | チャットコア: プロバイダレジストリ、`/api/chat` ストリーミング、チャットUI、モデル選択(永続化なし) | ブラウザでストリーミングチャット動作 |
| PR3 | 認証: Auth.js + Google、ドメイン制限、Drizzle導入(usersほか認証テーブル)、middleware保護 | ログイン必須化、ドメイン外拒否 |
| PR4 | 履歴: conversations/messages永続化、サイドバー履歴、会話再開、タイトル自動生成、削除 | リロード/別会話切替で履歴保持 |
| PR5 | MCP + レシート: MCPクライアント、OAuth接続フロー、ツール注入、receipts記録、引用ソース表示、劣化フォールバック | MCP接続済みユーザーでドキュメント根拠付き回答 |

スコープ外(将来PR): effect-bearingツールと実行ゲート、Parse Guard本格導入、レビュー用ワークスペースUI、Effect Catalog、E2Eテスト、レート制限、会話共有。

## 9. 環境変数

```
AUTH_SECRET / AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET / ALLOWED_EMAIL_DOMAINS
DATABASE_URL
ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY   (任意: 設定済みのみ有効化)
MCP_DOCS_SERVER_URL / MCP_DOCS_SERVER_NAME
ENCRYPTION_KEY   (32byte hex, MCPトークン暗号化用)
```
