import { auth as mcpAuth } from "@ai-sdk/mcp";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { appOrigin, MCP_STATE_COOKIE, mcpServerUrl } from "@/lib/mcp/config";
import { ensureConnection } from "@/lib/mcp/connection";
import { DbOAuthClientProvider } from "@/lib/mcp/oauth-provider";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const serverUrl = mcpServerUrl();
  if (!serverUrl) {
    return NextResponse.json({ error: "mcp_not_configured" }, { status: 400 });
  }

  await ensureConnection(session.user.id, serverUrl);

  const state = randomUUID();
  const provider = new DbOAuthClientProvider(session.user.id, serverUrl, state);

  const result = await mcpAuth(provider, { serverUrl });
  if (result !== "REDIRECT" || !provider.authorizationUrl) {
    // Already authorized (or nothing to do) — return to settings.
    return NextResponse.redirect(new URL("/settings", appOrigin()));
  }

  const res = NextResponse.redirect(provider.authorizationUrl);
  res.cookies.set(MCP_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
