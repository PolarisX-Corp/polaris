import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mcpConnections, type McpConnectionStatus } from "@/lib/db/schema";

export async function getConnection(userId: string, serverUrl: string) {
  const rows = await db
    .select()
    .from(mcpConnections)
    .where(
      and(
        eq(mcpConnections.userId, userId),
        eq(mcpConnections.serverUrl, serverUrl),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Ensure a row exists for (userId, serverUrl); returns nothing. */
export async function ensureConnection(userId: string, serverUrl: string) {
  await db
    .insert(mcpConnections)
    .values({ userId, serverUrl, status: "pending" })
    .onConflictDoNothing({
      target: [mcpConnections.userId, mcpConnections.serverUrl],
    });
}

export async function updateConnection(
  userId: string,
  serverUrl: string,
  patch: Partial<{
    accessTokenEnc: string | null;
    refreshTokenEnc: string | null;
    expiresAt: Date | null;
    clientInfo: unknown;
    codeVerifier: string | null;
    status: McpConnectionStatus;
  }>,
) {
  await db
    .update(mcpConnections)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(mcpConnections.userId, userId),
        eq(mcpConnections.serverUrl, serverUrl),
      ),
    );
}
