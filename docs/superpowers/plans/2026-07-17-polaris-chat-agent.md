# Polaris Chat Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GoogleログインとマルチLLMプロバイダ対応のチャットUIを持ち、社内ドキュメントMCPサーバー(HTTP+OAuth)でグラウンディング回答できる社内AIエージェントをPRチェーン(PR1〜PR5)で構築する。

**Architecture:** Next.js 15 App Router フルスタック。Vercel AI SDK v5 の `streamText`/`useChat` でストリーミングチャット、Auth.js v5 + Google OAuth で認証、Drizzle + Postgres で永続化。MCPは `@modelcontextprotocol/sdk` でユーザー単位OAuth接続し、ツールを tool use として注入。boundary(全て support-only)と軽量レシートをデータモデルに組み込む。

**Tech Stack:** Next.js 15 / React 19 / TypeScript / ai@5 / @ai-sdk/react / next-auth@beta / @auth/drizzle-adapter / drizzle-orm / postgres / Tailwind CSS v4 / Vitest / GitHub Actions

**PRチェーン:** `pr1-scaffold`(base: main) → `pr2-chat-core`(base: pr1-scaffold) → `pr3-auth`(base: pr2-chat-core) → `pr4-history`(base: pr3-auth) → `pr5-mcp-receipts`(base: pr4-history)。各PR完了時に push + `gh pr create`。

**検証コマンド(全PR共通):** `pnpm lint` / `pnpm typecheck` / `pnpm test` がグリーンであること。

---

## PR1: スキャフォールド

### Task 1: Next.jsプロジェクト生成とツール設定

**Files:**
- Create: Next.jsスキャフォールド一式(`package.json`, `src/app/*`, `tsconfig.json` 等)
- Create: `vitest.config.ts`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (scripts追加)

- [ ] **Step 1: ブランチ作成**

```bash
git checkout -b pr1-scaffold main
```

- [ ] **Step 2: create-next-appをカレントに展開**

既存ファイル(README, docs)があるため一時ディレクトリに生成して同期する:

```bash
cd /Users/ayumu.abe/Documents/develop/polaris-x/polaris
pnpm dlx create-next-app@15 /tmp/polaris-scaffold --typescript --eslint --tailwind --app --src-dir --turbopack --import-alias "@/*" --use-pnpm --yes
rsync -a --exclude README.md --exclude .git /tmp/polaris-scaffold/ ./
```

- [ ] **Step 3: Vitest導入**

```bash
pnpm add -D vitest
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

`package.json` scripts に追加:
```json
"typecheck": "tsc --noEmit",
"test": "vitest run"
```

- [ ] **Step 4: サニティテストを書いて実行**

`src/lib/sanity.test.ts`:
```ts
import { describe, expect, it } from "vitest";

describe("sanity", () => {
  it("runs tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `pnpm lint && pnpm typecheck && pnpm test` → すべてPASS。`pnpm dev` でトップページ表示確認。

- [ ] **Step 5: CIワークフロー作成**

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
```

- [ ] **Step 6: レイアウト調整とコミット・PR作成**

`src/app/layout.tsx` の metadata を `title: "Polaris"` に変更。`src/app/page.tsx` をプレースホルダ(アプリ名+説明のみ)に差し替え。

```bash
git add -A && git commit -m "chore: scaffold Next.js app with Vitest and CI"
git push -u origin pr1-scaffold
gh pr create --base main --title "PR1: scaffold Next.js app with Vitest and CI" --body "..."
```

---

## PR2: チャットコア(プロバイダレジストリ + ストリーミングチャット)

### Task 2: プロバイダレジストリ (TDD)

**Files:**
- Create: `src/lib/ai/providers.ts`
- Test: `src/lib/ai/providers.test.ts`

- [ ] **Step 1: 依存追加**

```bash
pnpm add ai @ai-sdk/react @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google zod
```

- [ ] **Step 2: 失敗するテストを書く**

`src/lib/ai/providers.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { availableModels, defaultModelId, resolveModel } from "./providers";

const env = (overrides: Record<string, string>) => overrides;

describe("availableModels", () => {
  it("returns only models whose provider API key is set", () => {
    const models = availableModels(env({ ANTHROPIC_API_KEY: "sk-x" }));
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === "anthropic")).toBe(true);
  });

  it("returns empty when no keys are set", () => {
    expect(availableModels(env({}))).toEqual([]);
  });
});

describe("resolveModel", () => {
  it("throws for unknown model id", () => {
    expect(() => resolveModel("nope:x", env({ ANTHROPIC_API_KEY: "k" }))).toThrow(/unknown/i);
  });

  it("throws when provider key is missing", () => {
    expect(() => resolveModel("anthropic:claude-sonnet-5", env({}))).toThrow(/not configured/i);
  });

  it("resolves a configured model", () => {
    const model = resolveModel("anthropic:claude-sonnet-5", env({ ANTHROPIC_API_KEY: "k" }));
    expect(model).toBeDefined();
  });
});

describe("defaultModelId", () => {
  it("prefers claude-sonnet-5 when anthropic is configured", () => {
    expect(defaultModelId(env({ ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "k" }))).toBe(
      "anthropic:claude-sonnet-5",
    );
  });
});
```

Run: `pnpm test` → FAIL (module not found)。

- [ ] **Step 3: 実装**

`src/lib/ai/providers.ts`:
```ts
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type Provider = "anthropic" | "openai" | "google";

export type ChatModel = {
  id: string; // "<provider>:<model>"
  label: string;
  provider: Provider;
  providerModelId: string;
};

export const MODEL_CATALOG: ChatModel[] = [
  { id: "anthropic:claude-sonnet-5", label: "Claude Sonnet 5", provider: "anthropic", providerModelId: "claude-sonnet-5" },
  { id: "anthropic:claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic", providerModelId: "claude-haiku-4-5-20251001" },
  { id: "openai:gpt-5", label: "GPT-5", provider: "openai", providerModelId: "gpt-5" },
  { id: "google:gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google", providerModelId: "gemini-2.5-pro" },
  { id: "google:gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google", providerModelId: "gemini-2.5-flash" },
];

type Env = Record<string, string | undefined>;

const KEY_VARS: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

function configuredProviders(env: Env): Set<Provider> {
  return new Set(
    (Object.keys(KEY_VARS) as Provider[]).filter((p) => Boolean(env[KEY_VARS[p]])),
  );
}

export function availableModels(env: Env = process.env): ChatModel[] {
  const providers = configuredProviders(env);
  return MODEL_CATALOG.filter((m) => providers.has(m.provider));
}

export function defaultModelId(env: Env = process.env): string | null {
  const models = availableModels(env);
  return models.find((m) => m.id === "anthropic:claude-sonnet-5")?.id ?? models[0]?.id ?? null;
}

export function resolveModel(id: string, env: Env = process.env): LanguageModel {
  const entry = MODEL_CATALOG.find((m) => m.id === id);
  if (!entry) throw new Error(`unknown model id: ${id}`);
  const apiKey = env[KEY_VARS[entry.provider]];
  if (!apiKey) throw new Error(`provider not configured: ${entry.provider}`);
  switch (entry.provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(entry.providerModelId);
    case "openai":
      return createOpenAI({ apiKey })(entry.providerModelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(entry.providerModelId);
  }
}
```

- [ ] **Step 4: テスト実行→PASS、コミット**

```bash
pnpm test && git add -A && git commit -m "feat: add LLM provider registry"
```

### Task 3: チャットAPIルート + チャットUI

**Files:**
- Create: `src/app/api/chat/route.ts`
- Create: `src/app/api/models/route.ts`
- Create: `src/components/chat.tsx`, `src/components/message.tsx`, `src/components/model-select.tsx`, `src/components/chat-input.tsx`
- Modify: `src/app/page.tsx`
- Create: `.env.example`

- [ ] **Step 1: チャットAPIルート**

`src/app/api/chat/route.ts`:
```ts
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { resolveModel } from "@/lib/ai/providers";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, modelId }: { messages: UIMessage[]; modelId: string } = await req.json();
  let model;
  try {
    model = resolveModel(modelId);
  } catch {
    return Response.json({ error: "invalid_model" }, { status: 400 });
  }
  const result = streamText({
    model,
    system: "You are Polaris, an internal assistant. Answer in the user's language.",
    messages: await convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}
```

`src/app/api/models/route.ts`:
```ts
import { availableModels, defaultModelId } from "@/lib/ai/providers";

export function GET() {
  return Response.json({ models: availableModels(), defaultModelId: defaultModelId() });
}
```

- [ ] **Step 2: チャットUI**

`src/components/chat.tsx` — `useChat` + `DefaultChatTransport`。`modelId` をbodyに載せる。`status` で送信中表示、`error` でエラー+再試行。`src/components/message.tsx` — parts配列の `text` パートを描画(将来toolパートを追加)。`src/components/model-select.tsx` — `/api/models` から取得した一覧のセレクト。`src/components/chat-input.tsx` — textarea + Enter送信(Shift+Enterで改行)。

`src/app/page.tsx` で `<Chat />` を表示。

- [ ] **Step 3: .env.example**

```
# LLM providers (set at least one)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```

- [ ] **Step 4: 動作確認・コミット・PR**

`pnpm dev` でストリーミング応答とモデル切替を確認(APIキーがある場合)。`pnpm lint && pnpm typecheck && pnpm test`。

```bash
git add -A && git commit -m "feat: add streaming chat with model selection"
git push -u origin pr2-chat-core
gh pr create --base pr1-scaffold --title "PR2: streaming chat core with provider registry" --body "..."
```

---

## PR3: 認証 (Auth.js + Google + Drizzle導入)

### Task 4: ドメイン制限ロジック (TDD)

**Files:**
- Create: `src/lib/auth/allowed.ts`
- Test: `src/lib/auth/allowed.test.ts`

- [ ] **Step 1: 失敗するテスト**

`src/lib/auth/allowed.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "./allowed";

describe("isAllowedEmail", () => {
  it("allows any email when no domains configured", () => {
    expect(isAllowedEmail("a@example.com", undefined)).toBe(true);
    expect(isAllowedEmail("a@example.com", "")).toBe(true);
  });
  it("allows emails in the configured domains (csv, case-insensitive)", () => {
    expect(isAllowedEmail("a@corp.co.jp", "corp.co.jp, other.com")).toBe(true);
    expect(isAllowedEmail("a@Other.COM", "corp.co.jp,other.com")).toBe(true);
  });
  it("rejects emails outside the configured domains", () => {
    expect(isAllowedEmail("a@evil.com", "corp.co.jp")).toBe(false);
  });
  it("rejects missing email", () => {
    expect(isAllowedEmail(null, "corp.co.jp")).toBe(false);
  });
});
```

- [ ] **Step 2: 実装**

`src/lib/auth/allowed.ts`:
```ts
export function isAllowedEmail(
  email: string | null | undefined,
  allowedDomainsCsv: string | undefined,
): boolean {
  const domains = (allowedDomainsCsv ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (domains.length === 0) return true;
  if (!email) return false;
  const domain = email.split("@").at(-1)?.toLowerCase();
  return domain != null && domains.includes(domain);
}
```

Run: `pnpm test` → PASS → commit `feat: add email domain allowlist check`

### Task 5: Drizzleスキーマ(認証テーブル) + Auth.js設定

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/index.ts`, `drizzle.config.ts`
- Create: `src/lib/auth/index.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`
- Create: `src/app/login/page.tsx`
- Modify: `src/app/api/chat/route.ts`, `src/app/api/models/route.ts` (セッション必須化)
- Modify: `.env.example`

- [ ] **Step 1: 依存追加**

```bash
pnpm add next-auth@beta @auth/drizzle-adapter drizzle-orm postgres
pnpm add -D drizzle-kit
```

- [ ] **Step 2: スキーマ(Auth.js標準: users/accounts/sessions/verificationTokens)**

`src/lib/db/schema.ts` に Auth.js Drizzleアダプタ公式スキーマを定義。`src/lib/db/index.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { client?: ReturnType<typeof postgres> };
const client = globalForDb.client ?? postgres(process.env.DATABASE_URL!, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle(client, { schema });
```

`drizzle.config.ts` + scripts `db:generate` / `db:migrate` / `db:studio`。

- [ ] **Step 3: Auth.js設定**

`src/lib/auth/index.ts`:
```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { isAllowedEmail } from "./allowed";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: "jwt" },
  providers: [Google],
  pages: { signIn: "/login" },
  callbacks: {
    signIn({ profile }) {
      return isAllowedEmail(profile?.email, process.env.ALLOWED_EMAIL_DOMAINS);
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
```

`src/middleware.ts` で `/login` と `/api/auth` 以外を保護。`/login` ページにGoogleサインインボタン。`/api/chat` と `/api/models` の先頭で `const session = await auth(); if (!session?.user?.id) return 401`。ヘッダーにユーザーアバター+サインアウト。

- [ ] **Step 4: env追加・確認・コミット・PR**

`.env.example` に `AUTH_SECRET= / AUTH_GOOGLE_ID= / AUTH_GOOGLE_SECRET= / ALLOWED_EMAIL_DOMAINS= / DATABASE_URL=` を追加。

```bash
git add -A && git commit -m "feat: add Google auth with domain allowlist"
git push -u origin pr3-auth
gh pr create --base pr2-chat-core --title "PR3: Google auth with Drizzle and domain allowlist"
```

---

## PR4: チャット履歴永続化

### Task 6: 会話アクセス制御 (TDD)

**Files:**
- Create: `src/lib/db/access.ts`
- Test: `src/lib/db/access.test.ts`

- [ ] **Step 1: 失敗するテスト(golden case: 他人の会話は404)**

`src/lib/db/access.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { canAccessConversation } from "./access";

describe("canAccessConversation", () => {
  it("allows the owner", () => {
    expect(canAccessConversation({ userId: "u1" }, "u1")).toBe(true);
  });
  it("denies another user", () => {
    expect(canAccessConversation({ userId: "u1" }, "u2")).toBe(false);
  });
  it("denies when conversation does not exist", () => {
    expect(canAccessConversation(null, "u1")).toBe(false);
  });
});
```

- [ ] **Step 2: 実装**

`src/lib/db/access.ts`:
```ts
export function canAccessConversation(
  conversation: { userId: string } | null | undefined,
  userId: string,
): boolean {
  return conversation != null && conversation.userId === userId;
}
```

commit `feat: add conversation access check`

### Task 7: conversations/messagesスキーマとクエリ

**Files:**
- Modify: `src/lib/db/schema.ts` (conversations, messages追加)
- Create: `src/lib/db/queries.ts`

conversations: `id uuid PK(client採番可) / userId FK cascade / title text default '新しいチャット' / createdAt / updatedAt`。messages: `id uuid PK / conversationId FK cascade / role text / parts jsonb / modelId text nullable / createdAt`。

`src/lib/db/queries.ts` に `upsertConversation / getConversation / listConversations(userId) / deleteConversation(id, userId) / saveMessages / getMessages(conversationId)` を実装。migration生成 → commit。

### Task 8: チャットルートの永続化対応 + タイトル生成

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Create: `src/lib/ai/title.ts`
- Create: `src/app/api/conversations/[id]/route.ts` (DELETE)

`/api/chat` のボディを `{ conversationId, messages, modelId }` に拡張:
1. `auth()` → 401
2. `getConversation(conversationId)` が存在し他人のもの → 404。未存在 → `upsertConversation`(初回はタイトル生成: `generateText` で軽量モデル(`defaultModelId` の flash/haiku優先)に40字以内の見出しを要求、失敗時は先頭40字切り出し)
3. ユーザーメッセージを `saveMessages`
4. `streamText(...).toUIMessageStreamResponse({ onFinish })` の onFinish でassistantメッセージを `saveMessages`

DELETE `/api/conversations/[id]` は所有者チェック後に削除。

### Task 9: サイドバー履歴UIと会話ページ

**Files:**
- Create: `src/app/(chat)/layout.tsx` (サイドバー付レイアウト)
- Create: `src/app/(chat)/page.tsx` (新規チャット: client側で `crypto.randomUUID()` 採番)
- Create: `src/app/(chat)/chat/[id]/page.tsx` (履歴ロードして `<Chat initialMessages>`)
- Create: `src/components/sidebar.tsx`
- Modify: `src/components/chat.tsx` (conversationId対応、初回送信後 `history.replaceState` で `/chat/[id]` に)
- Delete: `src/app/page.tsx` (route groupへ移動)

会話一覧はサーバーコンポーネントで `listConversations`。削除ボタン→DELETE→`router.refresh()`。確認・コミット:

```bash
git add -A && git commit -m "feat: persist conversations and messages with sidebar history"
git push -u origin pr4-history
gh pr create --base pr3-auth --title "PR4: chat history persistence"
```

---

## PR5: MCP接続 + 軽量レシート

### Task 10: トークン暗号化 (TDD)

**Files:**
- Create: `src/lib/crypto/secret-box.ts`
- Test: `src/lib/crypto/secret-box.test.ts`

- [ ] **Step 1: 失敗するテスト**

```ts
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secret-box";

const KEY = "0".repeat(64); // 32byte hex

describe("secret-box", () => {
  it("round-trips a secret", () => {
    const enc = encryptSecret("token-value", KEY);
    expect(enc).not.toContain("token-value");
    expect(decryptSecret(enc, KEY)).toBe("token-value");
  });
  it("produces different ciphertexts for same input (random IV)", () => {
    expect(encryptSecret("x", KEY)).not.toBe(encryptSecret("x", KEY));
  });
  it("throws on tampered ciphertext", () => {
    const enc = encryptSecret("x", KEY);
    const tampered = enc.slice(0, -4) + "0000";
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });
});
```

- [ ] **Step 2: 実装 (AES-256-GCM, `iv:tag:cipher` hex連結)**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function encryptSecret(plain: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), enc.toString("hex")].join(":");
}

export function decryptSecret(payload: string, keyHex: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
```

commit `feat: add AES-256-GCM secret box for MCP tokens`

### Task 11: レシートビルダー (TDD)

**Files:**
- Create: `src/lib/receipts/receipts.ts`
- Test: `src/lib/receipts/receipts.test.ts`
- Modify: `src/lib/db/schema.ts` (receipts, mcp_connections追加) + migration

- [ ] **Step 1: 失敗するテスト**

```ts
import { describe, expect, it } from "vitest";
import { buildInputReceipt, buildProposalReceipt, buildRetrievalReceipt } from "./receipts";

describe("receipts", () => {
  it("input receipt hashes content and never stores raw text", () => {
    const r = buildInputReceipt({ conversationId: "c1", messageId: "m1", text: "秘密のテキスト" });
    expect(r.receiptType).toBe("input");
    expect(r.boundary).toBe("support-only");
    expect(JSON.stringify(r.payload)).not.toContain("秘密のテキスト");
    expect(r.payload.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
  it("retrieval receipt records tool call with degraded status support", () => {
    const r = buildRetrievalReceipt({
      conversationId: "c1", toolName: "search_docs",
      args: { query: "q" }, status: "succeeded", resultRefs: ["doc:1"],
    });
    expect(r.payload.argsHash).toMatch(/^sha256:/);
    expect(r.payload.status).toBe("succeeded");
  });
  it("proposal receipt links input receipts", () => {
    const r = buildProposalReceipt({
      conversationId: "c1", messageId: "m2", modelId: "anthropic:claude-sonnet-5",
      outputText: "answer", inputReceiptIds: ["r1"],
    });
    expect(r.payload.inputReceiptRefs).toEqual(["r1"]);
    expect(r.payload.outputHash).toMatch(/^sha256:/);
  });
});
```

- [ ] **Step 2: 実装(sha256ヘルパー含む) → PASS → スキーマ追加**

receiptsテーブル: `id uuid PK / conversationId FK / messageId nullable / receiptType text / boundary text / payload jsonb / createdAt`。mcp_connections: spec §4のとおり。`saveReceipts` クエリ追加。migration生成。commit `feat: add lightweight receipts and mcp_connections schema`

### Task 12: MCPクライアントとOAuthフロー

**Files:**
- Create: `src/lib/mcp/oauth-provider.ts` (DB-backed `OAuthClientProvider`)
- Create: `src/lib/mcp/client.ts` (`getMcpToolsForUser`)
- Create: `src/app/api/mcp/auth/start/route.ts`, `src/app/api/mcp/auth/callback/route.ts`, `src/app/api/mcp/status/route.ts`, `src/app/api/mcp/disconnect/route.ts`
- Create: `src/app/(chat)/settings/page.tsx`
- Test: `src/lib/mcp/client.test.ts` (golden case: 接続失敗時の劣化)

- [ ] **Step 1: 依存追加**

```bash
pnpm add @modelcontextprotocol/sdk
```

- [ ] **Step 2: DbOAuthClientProvider実装**

`@modelcontextprotocol/sdk/client/auth.js` の `OAuthClientProvider` を実装。client情報/tokens/codeVerifierを `mcp_connections` 行(トークンは`encryptSecret`)に読み書き。`redirectToAuthorization` は `AuthRedirectError(url)` をthrowし、startルートがcatchして `NextResponse.redirect(url)`。callbackルートは `auth(provider, { serverUrl, authorizationCode })` でcode交換→status=connected→`/settings`へ。

- [ ] **Step 3: getMcpToolsForUser (劣化フォールバック, TDD)**

`src/lib/mcp/client.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { withMcpDegradation } from "./client";

describe("withMcpDegradation", () => {
  it("returns tools when loader succeeds", async () => {
    const r = await withMcpDegradation(async () => ({ search: {} as never }));
    expect(r).toEqual({ tools: { search: {} }, degraded: false });
  });
  it("degrades to empty tools when loader throws (golden case)", async () => {
    const r = await withMcpDegradation(async () => { throw new Error("boom"); });
    expect(r).toEqual({ tools: {}, degraded: true });
  });
});
```

実装: `experimental_createMCPClient` + `StreamableHTTPClientTransport`(authProvider付き)で `tools()` を取得し `withMcpDegradation` で包む。close処理はレスポンス完了時。

- [ ] **Step 4: 設定ページ + statusルート**

`/settings`: 接続状態表示(`/api/mcp/status`)、接続ボタン(→`/api/mcp/auth/start`)、切断ボタン。サイドバーに接続状態バッジ+設定リンク。

### Task 13: チャットルートへのMCP/レシート統合

**Files:**
- Modify: `src/app/api/chat/route.ts`

1. InputReceipt保存(ユーザーメッセージ)
2. `getMcpToolsForUser(userId)` → `{ tools, degraded }`。degraded かつ接続済みユーザーなら system promptに「ドキュメント検索は現在利用できない。検索結果を装った回答をしないこと」を追記
3. `streamText({ tools, stopWhen: stepCountIs(5), onStepFinish })` — onStepFinishで各tool呼び出しのRetrievalReceipt保存
4. onFinishでProposalReceipt保存(inputReceiptRefs紐付け)
5. `src/components/message.tsx` にtoolパート表示(ツール名+折りたたみ結果)を追加

確認・コミット・PR:
```bash
git add -A && git commit -m "feat: integrate MCP docs server with per-user OAuth and receipts"
git push -u origin pr5-mcp-receipts
gh pr create --base pr4-history --title "PR5: MCP integration with per-user OAuth and lightweight receipts"
```

---

## Self-Review結果

- スペック§2〜§9の各要件はTask1〜13でカバー(§6エラーハンドリングはTask3/5/8/12/13に分散、§7テストはTask2/4/6/10/11/12)
- 型整合: `ChatModel`/`resolveModel`はTask2定義をTask3/8で使用、`canAccessConversation`はTask6定義をTask8で使用、`encryptSecret`はTask10定義をTask12で使用
- E2E/デプロイ設定はスコープ外(スペック§8)
