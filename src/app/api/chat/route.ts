import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { resolveModel } from "@/lib/ai/providers";
import { generateTitle } from "@/lib/ai/title";
import { auth } from "@/lib/auth";
import { canAccessConversation } from "@/lib/db/access";
import {
  getConversation,
  saveMessages,
  saveReceipts,
  touchConversation,
  upsertConversation,
} from "@/lib/db/queries";
import { getMcpToolsForUser } from "@/lib/mcp/client";
import {
  buildInputReceipt,
  buildProposalReceipt,
  buildRetrievalReceipt,
} from "@/lib/receipts/receipts";

export const maxDuration = 60;

type ChatRequest = {
  conversationId: string;
  messages: UIMessage[];
  modelId: string;
};

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Receipts are audit records, not user-facing — never let them break a chat. */
async function safeSaveReceipts(
  rows: Parameters<typeof saveReceipts>[0],
): Promise<void> {
  try {
    await saveReceipts(rows);
  } catch (error) {
    console.error("[chat] failed to save receipts:", error);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { conversationId, messages, modelId }: ChatRequest = await req.json();

  let model;
  try {
    model = resolveModel(modelId);
  } catch {
    return Response.json({ error: "invalid_model" }, { status: 400 });
  }

  try {
    const existing = await getConversation(conversationId);
    if (existing && !canAccessConversation(existing, userId)) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    const lastUserMessage = messages[messages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== "user") {
      return Response.json({ error: "invalid_messages" }, { status: 400 });
    }

    if (existing) {
      await touchConversation(conversationId);
    } else {
      const title = await generateTitle(textOf(lastUserMessage));
      await upsertConversation({ id: conversationId, userId, title });
    }

    await saveMessages([
      {
        id: lastUserMessage.id,
        conversationId,
        role: "user",
        parts: lastUserMessage.parts,
      },
    ]);

    // Receipt: record the input (hash only, no raw text).
    const inputReceipt = buildInputReceipt({
      conversationId,
      messageId: lastUserMessage.id,
      text: textOf(lastUserMessage),
    });
    await safeSaveReceipts([{ ...inputReceipt, payload: inputReceipt.payload }]);

    const mcp = await getMcpToolsForUser(userId);

    // DEGRADE: connected but the server is unreachable — warn the model rather
    // than letting it fabricate document-grounded answers.
    const degradedNote =
      mcp.degraded && mcp.connected
        ? " Note: the document search tool is currently unavailable. " +
          "Do not claim to have searched documents; tell the user document " +
          "search is temporarily unavailable."
        : "";

    const result = streamText({
      model,
      system:
        "You are Polaris, an internal assistant for company members. " +
        "Answer clearly and concisely in the user's language." +
        degradedNote,
      messages: await convertToModelMessages(messages),
      tools: mcp.tools,
      stopWhen: stepCountIs(5),
      onError: (event) => {
        // Streaming-phase failures (model/provider/tool errors) land here.
        console.error("[chat] stream error:", event.error);
      },
      onStepFinish: async ({ toolCalls, toolResults }) => {
        if (toolCalls.length === 0) return;
        const receipts = toolCalls.map((call) => {
          const hasResult = toolResults.some(
            (r) => r.toolCallId === call.toolCallId,
          );
          const rc = buildRetrievalReceipt({
            conversationId,
            messageId: lastUserMessage.id,
            toolName: call.toolName,
            args: call.input,
            status: hasResult ? "succeeded" : "degraded",
            resultRefs: [],
          });
          return { ...rc, payload: rc.payload };
        });
        await safeSaveReceipts(receipts);
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      // Surface the real reason to the client instead of the default
      // masked "An error occurred." so failures are diagnosable.
      onError: (error) => {
        console.error("[chat] response error:", error);
        return error instanceof Error ? error.message : String(error);
      },
      onFinish: async ({ responseMessage }) => {
        try {
          await saveMessages([
            {
              id: responseMessage.id,
              conversationId,
              role: "assistant",
              parts: responseMessage.parts,
              modelId,
            },
          ]);
          const proposal = buildProposalReceipt({
            conversationId,
            messageId: responseMessage.id,
            modelId,
            outputText: textOf(responseMessage),
            inputReceiptIds: [inputReceipt.id],
          });
          await safeSaveReceipts([
            { ...proposal, payload: proposal.payload },
          ]);
        } catch (error) {
          console.error("[chat] failed to persist assistant message:", error);
        } finally {
          try {
            await mcp.close();
          } catch {
            // ignore MCP close errors
          }
        }
      },
    });
  } catch (error) {
    console.error("[chat] request failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "server_error" },
      { status: 500 },
    );
  }
}
