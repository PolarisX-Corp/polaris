import { auth } from "@/lib/auth";
import { mcpServerName, mcpServerUrl } from "@/lib/mcp/config";
import { getConnection } from "@/lib/mcp/connection";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const serverUrl = mcpServerUrl();
  if (!serverUrl) {
    return Response.json({ configured: false, status: "disconnected" });
  }

  const connection = await getConnection(session.user.id, serverUrl);
  return Response.json({
    configured: true,
    serverName: mcpServerName(),
    status: connection?.status ?? "disconnected",
  });
}
