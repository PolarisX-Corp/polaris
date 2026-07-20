import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

// The chat route persists the user message *before* streaming and the assistant
// reply *after*, inside the response stream's onFinish. onFinish only fires once
// that stream is drained. If the server does not drain it independently of the
// client, a reload/navigation during streaming (or serverless suspension after
// the client disconnects) leaves onFinish uncalled and the assistant reply
// unsaved — while the user message survives. That is the exact "the AI's
// replies vanish from history" bug.
//
// These tests run the REAL ai streaming pipeline (only the language model is a
// mock) so they exercise the actual onFinish plumbing, and assert the assistant
// reply is persisted in BOTH cases: when the client reads the whole response and
// — critically — when the client never reads it at all.

// Hoisted so the spy is referenceable inside the (also hoisted) vi.mock factory.
const { saveMessages } = vi.hoisted(() => ({
  saveMessages:
    vi.fn<(rows: Array<{ role: string; id: string }>) => Promise<void>>(
      async () => {},
    ),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

vi.mock("@/lib/ai/title", () => ({
  generateTitle: vi.fn(async () => "タイトル"),
}));

vi.mock("@/lib/db/access", () => ({
  canAccessConversation: vi.fn(() => true),
}));

vi.mock("@/lib/db/queries", () => ({
  getConversation: vi.fn(async () => null),
  saveMessages,
  saveReceipts: vi.fn(async () => {}),
  touchConversation: vi.fn(async () => {}),
  upsertConversation: vi.fn(async () => {}),
}));

vi.mock("@/lib/mcp/client", () => ({
  getMcpToolsForUser: vi.fn(async () => ({
    tools: {},
    degraded: false,
    connected: false,
    close: async () => {},
  })),
}));

// A model that streams a short reply, then finishes. The real ai pipeline turns
// this into a UI-message stream whose onFinish is what the route relies on.
//
// The chunk union is cast to the mock's expected doStream type: the exact
// LanguageModelV4 stream-part/usage shape shifts between SDK patch versions and
// is not worth pinning by hand in a test that only needs a text reply.
type DoStream = NonNullable<
  ConstructorParameters<typeof MockLanguageModelV4>[0]
>["doStream"];

vi.mock("@/lib/ai/providers", () => ({
  resolveModel: vi.fn(
    () =>
      new MockLanguageModelV4({
        doStream: (async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start", id: "t1" },
              { type: "text-delta", id: "t1", delta: "Hello " },
              { type: "text-delta", id: "t1", delta: "world" },
              { type: "text-end", id: "t1" },
              {
                type: "finish",
                finishReason: "stop",
                usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
              },
            ],
          }),
        })) as unknown as DoStream,
      }),
  ),
}));

import { POST } from "./route";

function chatRequest() {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({
      conversationId: "conv-1",
      modelId: "model-1",
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
    }),
  });
}

function savedAssistant() {
  return saveMessages.mock.calls
    .flatMap((call) => call[0])
    .find((row) => row.role === "assistant");
}

async function waitForAssistantSave(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (savedAssistant()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("POST /api/chat persistence", () => {
  beforeEach(() => {
    saveMessages.mockClear();
  });

  it("persists the assistant reply when the client reads the whole stream", async () => {
    const res = await POST(chatRequest());
    // A connected client fully drains the response body.
    await res.text();
    await waitForAssistantSave();
    expect(savedAssistant()).toBeDefined();
  });

  it("persists the assistant reply even if the client never reads the stream", async () => {
    // Simulate a reload/navigation mid-stream: the response body is never read.
    // The server must still drain it so onFinish runs and the reply is saved.
    await POST(chatRequest());
    await waitForAssistantSave();
    expect(savedAssistant()).toBeDefined();
  });
});
