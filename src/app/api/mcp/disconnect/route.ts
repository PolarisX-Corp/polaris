import { auth } from "@/lib/auth";
import { mcpServerUrl } from "@/lib/mcp/config";
import { updateConnection } from "@/lib/mcp/connection";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const serverUrl = mcpServerUrl();
  if (!serverUrl) {
    return Response.json({ error: "mcp_not_configured" }, { status: 400 });
  }

  await updateConnection(session.user.id, serverUrl, {
    status: "disconnected",
    accessTokenEnc: null,
    refreshTokenEnc: null,
    expiresAt: null,
    codeVerifier: null,
  });

  return new Response(null, { status: 204 });
}
