import { availableModels, defaultModelId } from "@/lib/ai/providers";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return Response.json({
    models: availableModels(),
    defaultModelId: defaultModelId(),
  });
}
