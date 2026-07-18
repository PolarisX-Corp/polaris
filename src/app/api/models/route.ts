import { availableModels, defaultModelId } from "@/lib/ai/providers";

export function GET() {
  return Response.json({
    models: availableModels(),
    defaultModelId: defaultModelId(),
  });
}
