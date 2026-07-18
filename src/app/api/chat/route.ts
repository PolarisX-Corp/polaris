import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { resolveModel } from "@/lib/ai/providers";
import { generateTitle } from "@/lib/ai/title";
import { auth } from "@/lib/auth";
import { canAccessConversation } from "@/lib/db/access";
import {
  getConversation,
  saveMessages,
  touchConversation,
  upsertConversation,
} from "@/lib/db/queries";

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

  // Ownership check: an existing conversation must belong to this user.
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

  const result = streamText({
    model,
    system:
      "You are Polaris, an internal assistant for company members. " +
      "Answer clearly and concisely in the user's language.",
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ responseMessage }) => {
      await saveMessages([
        {
          id: responseMessage.id,
          conversationId,
          role: "assistant",
          parts: responseMessage.parts,
          modelId,
        },
      ]);
    },
  });
}
