import { generateText } from "ai";
import { availableModels, resolveModel } from "./providers";

/** Truncate to a short single-line title. */
export function fallbackTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.slice(0, 40) || "新しいチャット";
}

/** Prefer a cheap model (haiku/flash) for title generation. */
function titleModelId(): string | null {
  const models = availableModels();
  const cheap = models.find(
    (m) => m.id.includes("haiku") || m.id.includes("flash"),
  );
  return cheap?.id ?? models[0]?.id ?? null;
}

/** Generate a <=40 char conversation title. Falls back to truncation on error. */
export async function generateTitle(firstUserText: string): Promise<string> {
  const modelId = titleModelId();
  if (!modelId) return fallbackTitle(firstUserText);

  try {
    const { text } = await generateText({
      model: resolveModel(modelId),
      system:
        "Create a concise conversation title (max 40 characters) in the same " +
        "language as the message. Output only the title, no quotes or punctuation at the ends.",
      prompt: firstUserText,
    });
    const title = text.replace(/\s+/g, " ").trim().slice(0, 40);
    return title || fallbackTitle(firstUserText);
  } catch {
    return fallbackTitle(firstUserText);
  }
}
