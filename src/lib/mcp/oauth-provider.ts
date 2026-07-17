import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthTokens,
} from "@ai-sdk/mcp";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { encryptionKey, mcpClientMetadata, mcpRedirectUrl } from "./config";
import { getConnection, updateConnection } from "./connection";

/**
 * OAuthClientProvider backed by the mcp_connection table, scoped to one user.
 * Access/refresh tokens are encrypted at rest via the AES-256-GCM secret box.
 * Redirects are captured on `authorizationUrl` instead of performed inline, so
 * the calling route can issue the HTTP redirect itself.
 */
export class DbOAuthClientProvider implements OAuthClientProvider {
  authorizationUrl: URL | null = null;

  constructor(
    private readonly userId: string,
    private readonly serverUrl: string,
    private readonly stateValue?: string,
  ) {}

  get redirectUrl(): string {
    return mcpRedirectUrl();
  }

  get clientMetadata(): OAuthClientMetadata {
    return mcpClientMetadata();
  }

  state(): string {
    // Only invoked while building the authorization request (start flow),
    // where stateValue is always provided.
    if (!this.stateValue) throw new Error("oauth_state_not_available");
    return this.stateValue;
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    const row = await getConnection(this.userId, this.serverUrl);
    return (row?.clientInfo as OAuthClientInformation | null) ?? undefined;
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    await updateConnection(this.userId, this.serverUrl, { clientInfo: info });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const row = await getConnection(this.userId, this.serverUrl);
    if (!row?.accessTokenEnc) return undefined;
    const key = encryptionKey();
    const expiresIn = row.expiresAt
      ? Math.max(0, Math.floor((row.expiresAt.getTime() - Date.now()) / 1000))
      : undefined;
    return {
      access_token: decryptSecret(row.accessTokenEnc, key),
      token_type: "Bearer",
      ...(expiresIn !== undefined ? { expires_in: expiresIn } : {}),
      ...(row.refreshTokenEnc
        ? { refresh_token: decryptSecret(row.refreshTokenEnc, key) }
        : {}),
    };
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const key = encryptionKey();
    const expiresAt =
      tokens.expires_in != null
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;
    await updateConnection(this.userId, this.serverUrl, {
      accessTokenEnc: encryptSecret(tokens.access_token, key),
      refreshTokenEnc: tokens.refresh_token
        ? encryptSecret(tokens.refresh_token, key)
        : null,
      expiresAt,
      status: "connected",
    });
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.authorizationUrl = authorizationUrl;
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await updateConnection(this.userId, this.serverUrl, { codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const row = await getConnection(this.userId, this.serverUrl);
    if (!row?.codeVerifier) throw new Error("code_verifier_missing");
    return row.codeVerifier;
  }
}
