import { beforeEach, describe, expect, it, vi } from "vitest";

// The chat route persists the user message *before* streaming and the assistant
// reply *after*, inside the stream's onFinish. If the server does not drain the
// stream to completion independently of the client, a reload/navigation during
// streaming (or serverless suspension after the client disconnects) drops the
// assistant reply — while the user message survives. These tests pin the two
// guarantees that prevent that: the server forces the stream to finish, and the
// assistant reply is persisted when it does.

// vi.mock factories are hoisted above these declarations, so the shared spies
// must live in a hoisted block to be referenceable inside them.
type OnFinish = (event: {
  responseMessage: { id: string; parts: unknown[] };
  isAborted: boolean;
}) => Promise<void> | void;

const h = vi.hoisted(() => {
  // Captured from toUIMessageStreamResponse so the test can drive onFinish the
  // way the SDK would once the stream completes on the server.
  const state: { capturedOnFinish?: OnFinish } = {};
  const saveMessages =
    vi.fn<(rows: Array<{ role: string; id: string }>) => Promise<void>>(
      async () => {},
    );
  const consumeStream = vi.fn(() => Promise.resolve());
  const toUIMessageStreamResponse = vi.fn((opts: { onFinish?: OnFinish }) => {
    state.capturedOnFinish = opts.onFinish;
    return new Response("ok");
  });
  return { state, saveMessages, consumeStream, toUIMessageStreamResponse };
});

const { saveMessages, consumeStream, toUIMessageStreamResponse } = h;

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: vi.fn(() => ({
      consumeStream: h.consumeStream,
      toUIMessageStreamResponse: h.toUIMessageStreamResponse,
    })),
  };
});

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

vi.mock("@/lib/ai/providers", () => ({
  resolveModel: vi.fn(() => ({})),
}));

vi.mock("@/lib/ai/title", () => ({
  generateTitle: vi.fn(async () => "タイトル"),
}));

vi.mock("@/lib/db/access", () => ({
  canAccessConversation: vi.fn(() => true),
}));

vi.mock("@/lib/db/queries", () => ({
  getConversation: vi.fn(async () => null),
  saveMessages: h.saveMessages,
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

describe("POST /api/chat persistence", () => {
  beforeEach(() => {
    saveMessages.mockClear();
    consumeStream.mockClear();
    toUIMessageStreamResponse.mockClear();
    h.state.capturedOnFinish = undefined;
  });

  it("drains the stream on the server so onFinish runs even if the client disconnects", async () => {
    await POST(chatRequest());

    // Without this, the stream only advances while the client is reading it;
    // a reload mid-stream leaves the assistant reply unsaved.
    expect(consumeStream).toHaveBeenCalled();
  });

  it("persists the assistant reply when the stream finishes", async () => {
    await POST(chatRequest());
    expect(h.state.capturedOnFinish).toBeDefined();

    await h.state.capturedOnFinish!({
      responseMessage: {
        id: "a1",
        parts: [{ type: "text", text: "hello" }],
      },
      isAborted: false,
    });

    const savedAssistant = saveMessages.mock.calls
      .flatMap((call) => call[0])
      .find((row) => row.role === "assistant");
    expect(savedAssistant?.id).toBe("a1");
  });
});
