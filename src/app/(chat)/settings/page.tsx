import Link from "next/link";
import { McpActions } from "@/components/mcp-actions";
import { auth } from "@/lib/auth";
import { mcpServerName, mcpServerUrl } from "@/lib/mcp/config";
import { getConnection } from "@/lib/mcp/connection";

const STATUS_LABEL: Record<string, string> = {
  connected: "接続済み",
  pending: "未接続",
  disconnected: "未接続",
};

export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const serverUrl = mcpServerUrl();
  const connection =
    userId && serverUrl ? await getConnection(userId, serverUrl) : null;
  const status = connection?.status ?? "disconnected";

  return (
    <div className="mx-auto flex h-screen w-full max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">設定</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← チャットに戻る
        </Link>
      </div>

      <section className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
        <h2 className="text-base font-medium">ドキュメント接続</h2>
        {!serverUrl ? (
          <p className="mt-2 text-sm text-gray-500">
            MCPサーバーが設定されていません(MCP_DOCS_SERVER_URL)。
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {mcpServerName()} に接続すると、あなたの権限の範囲で
              ドキュメントを検索して回答できます。
            </p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm">
                状態:{" "}
                <span
                  className={
                    status === "connected"
                      ? "font-medium text-green-600"
                      : "text-gray-500"
                  }
                >
                  {STATUS_LABEL[status] ?? "未接続"}
                </span>
              </span>
              <McpActions status={status} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
