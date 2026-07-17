import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { resolveModel } from "@/lib/ai/providers";
import { auth } from "@/lib/auth";

export const maxDuration = 60;

type ChatRequest = {
  messages: UIMessage[];
  modelId: string;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { messages, modelId }: ChatRequest = await req.json();

  let model;
  try {
    model = resolveModel(modelId);
  } catch {
    return Response.json({ error: "invalid_model" }, { status: 400 });
  }

  const result = streamText({
    model,
    system:
      "You are Polaris, an internal assistant for company members. " +
      "Answer clearly and concisely in the user's language.",
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
