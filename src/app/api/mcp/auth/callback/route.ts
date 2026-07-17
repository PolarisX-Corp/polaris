import { auth as mcpAuth } from "@ai-sdk/mcp";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { appOrigin, MCP_STATE_COOKIE, mcpServerUrl } from "@/lib/mcp/config";
import { updateConnection } from "@/lib/mcp/connection";
import { DbOAuthClientProvider } from "@/lib/mcp/oauth-provider";

function settingsRedirect(status: string) {
  const url = new URL("/settings", appOrigin());
  url.searchParams.set("mcp", status);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const serverUrl = mcpServerUrl();
  if (!serverUrl) {
    return NextResponse.json({ error: "mcp_not_configured" }, { status: 400 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${MCP_STATE_COOKIE}=`))
    ?.split("=")[1];

  if (!code) return settingsRedirect("error");
  if (!returnedState || returnedState !== cookieState) {
    return settingsRedirect("state_mismatch");
  }

  const provider = new DbOAuthClientProvider(session.user.id, serverUrl);
  try {
    const result = await mcpAuth(provider, {
      serverUrl,
      authorizationCode: code,
    });
    if (result !== "AUTHORIZED") return settingsRedirect("error");
  } catch {
    await updateConnection(session.user.id, serverUrl, {
      status: "disconnected",
    });
    return settingsRedirect("error");
  }

  const res = settingsRedirect("connected");
  res.cookies.delete(MCP_STATE_COOKIE);
  return res;
}
