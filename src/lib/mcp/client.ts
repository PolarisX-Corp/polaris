import { createMCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import { mcpServerUrl } from "./config";
import { getConnection } from "./connection";
import { DbOAuthClientProvider } from "./oauth-provider";

export type McpToolsResult = {
  tools: ToolSet;
  degraded: boolean;
  connected: boolean;
  close: () => Promise<void>;
};

type Loaded = { tools: ToolSet; close: () => Promise<void> };

const NOOP = async () => {};

/**
 * Run an MCP tool loader, degrading to empty tools if it throws.
 * Failure is never fatal to the chat — the request continues without tools.
 */
export async function withMcpDegradation(
  load: () => Promise<Loaded>,
): Promise<{ tools: ToolSet; degraded: boolean; close: () => Promise<void> }> {
  try {
    const { tools, close } = await load();
    return { tools, degraded: false, close };
  } catch {
    return { tools: {}, degraded: true, close: NOOP };
  }
}

/**
 * Load the document MCP server's tools for a user. Returns no tools (and
 * `connected: false`) when MCP is not configured or the user hasn't connected.
 * When the user is connected but the server is unreachable, returns
 * `degraded: true` so the caller can warn the model.
 */
export async function getMcpToolsForUser(
  userId: string,
): Promise<McpToolsResult> {
  const serverUrl = mcpServerUrl();
  if (!serverUrl) {
    return { tools: {}, degraded: false, connected: false, close: NOOP };
  }

  const connection = await getConnection(userId, serverUrl);
  if (!connection || connection.status !== "connected") {
    return { tools: {}, degraded: false, connected: false, close: NOOP };
  }

  const result = await withMcpDegradation(async () => {
    const authProvider = new DbOAuthClientProvider(userId, serverUrl);
    const client = await createMCPClient({
      transport: { type: "http", url: serverUrl, authProvider },
    });
    const tools = await client.tools();
    return { tools, close: () => client.close() };
  });

  return { ...result, connected: true };
}
