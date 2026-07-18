import type { OAuthClientMetadata } from "@ai-sdk/mcp";

export const MCP_STATE_COOKIE = "mcp_oauth_state";

export function mcpServerUrl(): string | null {
  return process.env.MCP_DOCS_SERVER_URL ?? null;
}

export function mcpServerName(): string {
  return process.env.MCP_DOCS_SERVER_NAME ?? "社内ドキュメント";
}

export function encryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY is not set");
  return key;
}

export function appOrigin(): string {
  return process.env.APP_ORIGIN ?? "http://localhost:3000";
}

export function mcpRedirectUrl(): string {
  return `${appOrigin()}/api/mcp/auth/callback`;
}

export function mcpClientMetadata(): OAuthClientMetadata {
  return {
    client_name: "Polaris",
    redirect_uris: [mcpRedirectUrl()],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}
